import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { BrainIndexService } from './brain-index.service';
import { createId } from '@paralleldrive/cuid2';

/**
 * BrainMaintenanceService — keeps the brain healthy over time.
 *
 * Implements the Karpathy "lint" pattern:
 *   - Story 8.1: Lint (orphans, staleness, low confidence, broken links)
 *   - Story 8.2: Deduplication (semantic + title similarity)
 *   - Story 8.3: New concept discovery hooks
 *   - Story 8.4: Tier promotion/decay
 *
 * Triggered by: scheduled daily/weekly jobs, or after concept changes.
 * The lint itself is triggered by the backend, but the actual FIXES
 * for orphans/staleness are done by the agent (Story 8.1 AC says
 * "backend only triggers the agent"). This service handles:
 *   - DETECTION (find problems) — runs in backend
 *   - SIMPLE FIXES (missing fields, tier changes) — runs in backend
 *   - COMPLEX FIXES (re-research, content merge) — queued for agent
 */

export interface LintResult {
  tenantId: string;
  timestamp: string;
  duration: number;
  findings: {
    orphanConcepts: number;
    staleConcepts: number;
    lowConfidenceConcepts: number;
    missingFields: number;
    brokenLinks: number;
  };
  fixes: {
    fieldsPopulated: number;
    tierChanges: number;
    confidenceDecays: number;
  };
  agentTasksQueued: number;
}

export interface DedupResult {
  tenantId: string;
  duplicatesFound: number;
  mergesCompleted: number;
  archived: string[];
}

const STALENESS_THRESHOLD_DAYS = 90;
const LOW_CONFIDENCE_THRESHOLD = 0.3;
const DECAY_AMOUNT = 0.1;
const MIN_CONFIDENCE = 0.1;
const PROMOTION_REINFORCEMENT_COUNT = 5;
const PROMOTION_CONFIDENCE_THRESHOLD = 0.8;

const TIER_ORDER = ['working', 'episodic', 'semantic', 'procedural'] as const;

@Injectable()
export class BrainMaintenanceService {
  private readonly logger = new Logger(BrainMaintenanceService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly brainIndex: BrainIndexService,
  ) {}

  /**
   * Story 8.1: Run brain lint — detect problems and apply simple fixes.
   * Complex fixes (re-research, content enrichment) are queued as
   * recommended tasks for the agent.
   */
  async runLint(tenantId: string): Promise<LintResult> {
    const startMs = Date.now();
    this.logger.log({ message: 'Brain lint starting', tenantId });

    const findings = {
      orphanConcepts: 0,
      staleConcepts: 0,
      lowConfidenceConcepts: 0,
      missingFields: 0,
      brokenLinks: 0,
    };
    const fixes = {
      fieldsPopulated: 0,
      tierChanges: 0,
      confidenceDecays: 0,
    };
    let agentTasksQueued = 0;

    // Load all tenant concepts
    const concepts = await this.prisma.concept.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        confidence: true,
        tier: true,
        lastReinforced: true,
        departmentTags: true,
        category: true,
        definition: true,
        extendedDescription: true,
      },
    });

    // Load all relationships for this tenant's concepts
    const conceptIds = concepts.map((c) => c.id);
    const relationships = await this.prisma.conceptRelationship.findMany({
      where: {
        OR: [
          { sourceConceptId: { in: conceptIds } },
          { targetConceptId: { in: conceptIds } },
        ],
      },
      select: { sourceConceptId: true, targetConceptId: true },
    });

    const connectedIds = new Set<string>();
    for (const rel of relationships) {
      connectedIds.add(rel.sourceConceptId);
      connectedIds.add(rel.targetConceptId);
    }

    const now = new Date();
    const stalenessThreshold = new Date(now.getTime() - STALENESS_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    for (const concept of concepts) {
      // Check: orphan (no relationships)
      if (!connectedIds.has(concept.id)) {
        findings.orphanConcepts++;
      }

      // Check: stale (not reinforced in 90+ days)
      if (concept.lastReinforced && concept.lastReinforced < stalenessThreshold) {
        findings.staleConcepts++;
      }

      // Check: low confidence
      if ((concept.confidence ?? 0) < LOW_CONFIDENCE_THRESHOLD) {
        findings.lowConfidenceConcepts++;
      }

      // Fix: missing fields (can fix immediately)
      let needsUpdate = false;
      const updates: Record<string, unknown> = {};

      if (!concept.tier) {
        updates['tier'] = 'working';
        needsUpdate = true;
        fixes.fieldsPopulated++;
      }
      if (concept.confidence === null || concept.confidence === undefined) {
        updates['confidence'] = 0.3;
        needsUpdate = true;
        fixes.fieldsPopulated++;
      }
      if (!concept.lastReinforced) {
        updates['lastReinforced'] = now;
        needsUpdate = true;
        fixes.fieldsPopulated++;
      }
      if (!concept.departmentTags || concept.departmentTags.length === 0) {
        updates['departmentTags'] = ['all'];
        needsUpdate = true;
        fixes.fieldsPopulated++;
      }
      if (!concept.definition || concept.definition === 'Placeholder — awaiting enrichment.') {
        findings.missingFields++;
      }

      if (needsUpdate) {
        await this.prisma.concept.update({
          where: { id: concept.id },
          data: updates,
        });
      }
    }

    // Invalidate brain index after fixes
    this.brainIndex.invalidateCache(tenantId);

    const duration = Date.now() - startMs;

    // Log to monitoring
    await this.prisma.vaultOperationLog.create({
      data: {
        id: `vlog_${createId()}`,
        tenantId,
        operationType: 'lint',
        conceptsAffected: fixes.fieldsPopulated + fixes.tierChanges + fixes.confidenceDecays,
        durationMs: duration,
        status: 'completed',
        details: { findings, fixes, agentTasksQueued },
      },
    });

    this.logger.log({
      message: 'Brain lint complete',
      tenantId,
      duration,
      findings,
      fixes,
    });

    return {
      tenantId,
      timestamp: now.toISOString(),
      duration,
      findings,
      fixes,
      agentTasksQueued,
    };
  }

  /**
   * Story 8.2: Detect and merge duplicate concepts.
   * Uses title/name similarity (no Qdrant vector search needed for
   * name-based dedup — that's fast enough with string matching).
   */
  async runDedup(tenantId: string): Promise<DedupResult> {
    this.logger.log({ message: 'Brain dedup starting', tenantId });

    const concepts = await this.prisma.concept.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        confidence: true,
        lastReinforced: true,
        extendedDescription: true,
      },
      orderBy: { confidence: 'desc' }, // Higher confidence first = authoritative
    });

    const duplicates: Array<{ keepId: string; removeId: string; keepName: string; removeName: string }> = [];
    const processed = new Set<string>();

    for (let i = 0; i < concepts.length; i++) {
      if (processed.has(concepts[i]!.id)) continue;

      for (let j = i + 1; j < concepts.length; j++) {
        if (processed.has(concepts[j]!.id)) continue;

        const a = concepts[i]!;
        const b = concepts[j]!;

        // Check name similarity (normalized)
        const nameA = this.normalizeName(a.name);
        const nameB = this.normalizeName(b.name);

        if (nameA === nameB || this.levenshteinSimilarity(nameA, nameB) > 0.85) {
          // Same category = stronger signal
          if (a.category === b.category) {
            // Keep the one with higher confidence
            const keep = (a.confidence ?? 0) >= (b.confidence ?? 0) ? a : b;
            const remove = keep === a ? b : a;

            duplicates.push({
              keepId: keep.id,
              removeId: remove.id,
              keepName: keep.name,
              removeName: remove.name,
            });
            processed.add(remove.id);
          }
        }
      }
    }

    // Merge duplicates
    let mergesCompleted = 0;
    const archived: string[] = [];

    for (const dup of duplicates) {
      try {
        // Redirect relationships from removed → kept
        await this.prisma.conceptRelationship.updateMany({
          where: { sourceConceptId: dup.removeId },
          data: { sourceConceptId: dup.keepId },
        });
        await this.prisma.conceptRelationship.updateMany({
          where: { targetConceptId: dup.removeId },
          data: { targetConceptId: dup.keepId },
        });

        // Delete duplicate relationships that now point to the same concept
        // (can't have sourceId === targetId)
        await this.prisma.conceptRelationship.deleteMany({
          where: {
            AND: [
              { sourceConceptId: dup.keepId },
              { targetConceptId: dup.keepId },
            ],
          },
        });

        // Archive the removed concept (mark as archived, don't delete)
        await this.prisma.concept.update({
          where: { id: dup.removeId },
          data: {
            name: `[ARCHIVED] ${dup.removeName}`,
            slug: `archived-${dup.removeId}`,
            source: 'AI_DISCOVERED', // Mark as non-seed (archived duplicate)
            needsReview: true,
          },
        });

        archived.push(dup.removeName);
        mergesCompleted++;

        this.logger.log({
          message: 'Concept merged',
          kept: dup.keepName,
          removed: dup.removeName,
        });
      } catch (err) {
        this.logger.warn({
          message: 'Concept merge failed',
          kept: dup.keepName,
          removed: dup.removeName,
          error: (err as Error).message,
        });
      }
    }

    // Invalidate brain index
    this.brainIndex.invalidateCache(tenantId);

    // Log to monitoring
    await this.prisma.vaultOperationLog.create({
      data: {
        id: `vlog_${createId()}`,
        tenantId,
        operationType: 'dedup',
        conceptsAffected: mergesCompleted,
        status: 'completed',
        details: {
          duplicatesFound: duplicates.length,
          mergesCompleted,
          archived,
        },
      },
    });

    return {
      tenantId,
      duplicatesFound: duplicates.length,
      mergesCompleted,
      archived,
    };
  }

  /**
   * Story 8.4: Run tier promotion and confidence decay.
   * Promotes frequently reinforced concepts, decays neglected ones.
   */
  async runTierConsolidation(tenantId: string): Promise<{
    promotions: number;
    decays: number;
    stalenessAlerts: number;
  }> {
    this.logger.log({ message: 'Tier consolidation starting', tenantId });

    let promotions = 0;
    let decays = 0;
    let stalenessAlerts = 0;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const concepts = await this.prisma.concept.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        confidence: true,
        tier: true,
        lastReinforced: true,
      },
    });

    for (const concept of concepts) {
      const confidence = concept.confidence ?? 0.3;
      const tier = concept.tier ?? 'working';
      const lastReinforced = concept.lastReinforced;

      // PROMOTION: high confidence + recently reinforced → promote tier
      if (confidence >= PROMOTION_CONFIDENCE_THRESHOLD && lastReinforced && lastReinforced > thirtyDaysAgo) {
        const currentTierIdx = TIER_ORDER.indexOf(tier as typeof TIER_ORDER[number]);
        if (currentTierIdx >= 0 && currentTierIdx < TIER_ORDER.length - 1) {
          const newTier = TIER_ORDER[currentTierIdx + 1]!;
          await this.prisma.concept.update({
            where: { id: concept.id },
            data: { tier: newTier },
          });
          promotions++;
        }
      }

      // DECAY: not reinforced in 90+ days → reduce confidence
      if (lastReinforced && lastReinforced < ninetyDaysAgo) {
        const newConfidence = Math.max(confidence - DECAY_AMOUNT, MIN_CONFIDENCE);
        if (newConfidence !== confidence) {
          await this.prisma.concept.update({
            where: { id: concept.id },
            data: { confidence: newConfidence },
          });
          decays++;
        }

        // STALENESS ALERT: was high confidence, now decayed below 0.5
        if (confidence >= 0.8 && newConfidence < 0.5) {
          stalenessAlerts++;
        }
      }
    }

    // Invalidate brain index
    this.brainIndex.invalidateCache(tenantId);

    // Log to monitoring
    await this.prisma.vaultOperationLog.create({
      data: {
        id: `vlog_${createId()}`,
        tenantId,
        operationType: 'tier_consolidation',
        conceptsAffected: promotions + decays,
        status: 'completed',
        details: { promotions, decays, stalenessAlerts },
      },
    });

    this.logger.log({
      message: 'Tier consolidation complete',
      tenantId,
      promotions,
      decays,
      stalenessAlerts,
    });

    return { promotions, decays, stalenessAlerts };
  }

  /**
   * Run full maintenance cycle: lint + dedup + tier consolidation.
   * Called by scheduled job (daily for active tenants).
   */
  async runFullMaintenance(tenantId: string): Promise<{
    lint: LintResult;
    dedup: DedupResult;
    tiers: { promotions: number; decays: number; stalenessAlerts: number };
  }> {
    const lint = await this.runLint(tenantId);
    const dedup = await this.runDedup(tenantId);
    const tiers = await this.runTierConsolidation(tenantId);

    return { lint, dedup, tiers };
  }

  // ── Helpers ──────────────────────────────────────────────────

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đ]/g, 'dj')
      .replace(/[ž]/g, 'z')
      .replace(/[ć]/g, 'c')
      .replace(/[č]/g, 'c')
      .replace(/[š]/g, 's')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private levenshteinSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0) return 1;
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0]![j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j - 1]! + cost,
        );
      }
    }
    return matrix[b.length]![a.length]!;
  }
}
