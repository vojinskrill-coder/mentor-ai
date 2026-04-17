import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { SourceVaultService } from './source-vault.service';
import { EmbeddingService } from '../knowledge/services/embedding.service';
import { createId } from '@paralleldrive/cuid2';

/**
 * VaultService — creates and manages per-tenant Obsidian-style knowledge vaults.
 *
 * Each tenant gets a vault during onboarding that mirrors the source
 * curriculum (publish.obsidian.md/hadzi-vojin) with 445 concept
 * placeholders ready for enrichment by MiniMax agents (Story 1.2).
 *
 * The vault follows the Karpathy LLM Wiki pattern:
 *   - raw/ (immutable sources, hidden)
 *   - wiki/concepts/ (visible to users)
 *   - skills/, instructions/ (hidden infrastructure)
 *   - index.md, log.md, SCHEMA.md (hidden)
 */
@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly sourceVault: SourceVaultService,
    @Optional()
    @Inject(EmbeddingService)
    private readonly embeddingService: EmbeddingService | undefined,
  ) {}

  /**
   * Create a complete tenant vault with placeholder concepts
   * mirroring the source Obsidian curriculum.
   */
  async createTenantVault(
    tenantId: string,
    tenantName: string,
    industry?: string,
  ): Promise<{ vaultId: string; conceptCount: number; categoryCount: number }> {
    const startMs = Date.now();
    const vaultId = `vault_${createId()}`;
    const logId = `vlog_${createId()}`;

    try {
      // Create operation log entry (inside try so failures are caught)
      await this.prisma.vaultOperationLog.create({
        data: {
          id: logId,
          tenantId,
          operationType: 'create',
          status: 'running',
          details: { tenantName, industry: industry ?? 'general' },
        },
      });
      // Check if vault already exists for this tenant
      const existing = await this.prisma.tenantVault.findUnique({
        where: { tenantId },
        select: { id: true, status: true },
      });

      if (existing?.status === 'ready') {
        this.logger.log(`Vault already exists for tenant ${tenantId}, skipping creation`);
        return {
          vaultId: existing.id,
          conceptCount: 0,
          categoryCount: 0,
        };
      }

      // Create or update vault record
      const vault = await this.prisma.tenantVault.upsert({
        where: { tenantId },
        create: {
          id: vaultId,
          tenantId,
          name: `${tenantName} Knowledge Base`,
          description: `Business knowledge vault for ${tenantName}${industry ? ` (${industry})` : ''}`,
          sourceVaultUrl: 'https://publish.obsidian.md/hadzi-vojin',
          status: 'creating',
        },
        update: {
          status: 'creating',
          errorMessage: null,
        },
      });

      // Load source concepts
      const sourceConcepts = await this.sourceVault.loadSourceConcepts();
      const categories = await this.sourceVault.getCategories();

      this.logger.log({
        message: 'Creating tenant vault',
        tenantId,
        vaultId: vault.id,
        sourceConceptCount: sourceConcepts.length,
        categoryCount: categories.length,
      });

      // Create placeholder concepts in batches
      let createdCount = 0;
      const batchSize = 50;

      for (let i = 0; i < sourceConcepts.length; i += batchSize) {
        const batch = sourceConcepts.slice(i, i + batchSize);
        const operations = batch.map((sc) => {
          const conceptId = `cpt_${createId()}`;
          return this.prisma.concept.create({
            data: {
              id: conceptId,
              name: sc.name,
              slug: sc.slug,
              category: sc.category,
              definition: sc.definition,
              extendedDescription: sc.originalContent || null,
              departmentTags: sc.departmentTags,
              source: 'SEED_DATA',
              tenantId,
              vaultId: vault.id,
              sortOrder: sc.sortOrder,
              categorySortOrder: sc.categorySortOrder,
              curriculumId: sc.curriculumId,
              confidence: 0.3, // Low confidence — placeholder, not yet enriched
              tier: 'working', // Working tier until enriched
              lastReinforced: new Date(),
            },
          });
        });

        await this.prisma.$transaction(operations);
        createdCount += batch.length;

        if (createdCount % 100 === 0) {
          this.logger.log(`Vault creation progress: ${createdCount}/${sourceConcepts.length} concepts`);
        }
      }

      // Embed all concepts into Qdrant so AI has same knowledge as tree view
      let embeddedCount = 0;
      if (this.embeddingService) {
        const tenantConcepts = await this.prisma.concept.findMany({
          where: { tenantId, vaultId: vault.id },
          select: { id: true, name: true, category: true, definition: true, departmentTags: true },
        });
        this.logger.log({ message: 'Embedding concepts into Qdrant', tenantId, count: tenantConcepts.length });
        embeddedCount = await this.embeddingService.embedBatch(
          tenantConcepts.map((c) => ({
            id: c.id,
            name: c.name,
            category: c.category,
            definition: c.definition,
            departmentTags: c.departmentTags,
            tenantId,
          })),
        );
        this.logger.log({ message: 'Qdrant embedding complete', tenantId, embeddedCount });
      } else {
        this.logger.warn('EmbeddingService not available — skipping Qdrant sync');
      }

      // Create relationships from source vault
      const relationshipsCreated = await this.createTenantRelationships(tenantId, vault.id, sourceConcepts);

      // Update vault status to ready
      await this.prisma.tenantVault.update({
        where: { id: vault.id },
        data: {
          status: 'ready',
          conceptCount: createdCount,
          categoryCount: categories.length,
        },
      });

      const durationMs = Date.now() - startMs;

      // Update operation log
      await this.prisma.vaultOperationLog.update({
        where: { id: logId },
        data: {
          status: 'completed',
          conceptsAffected: createdCount,
          durationMs,
          details: {
            tenantName,
            industry: industry ?? 'general',
            conceptsCreated: createdCount,
            categoriesCreated: categories.length,
            relationshipsCreated,
          },
        },
      });

      this.logger.log({
        message: 'Tenant vault created successfully',
        tenantId,
        vaultId: vault.id,
        conceptCount: createdCount,
        categoryCount: categories.length,
        relationshipsCreated,
        durationMs,
      });

      return {
        vaultId: vault.id,
        conceptCount: createdCount,
        categoryCount: categories.length,
      };
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const errorMsg = (err as Error).message;

      // Update vault status to error
      await this.prisma.tenantVault.updateMany({
        where: { tenantId },
        data: { status: 'error', errorMessage: errorMsg },
      });

      // Update operation log
      await this.prisma.vaultOperationLog.update({
        where: { id: logId },
        data: { status: 'failed', durationMs, error: errorMsg },
      });

      this.logger.error(`Vault creation failed for tenant ${tenantId}: ${errorMsg}`);
      throw err;
    }
  }

  /**
   * Get vault status for a tenant.
   */
  async getVaultStatus(tenantId: string) {
    const vault = await this.prisma.tenantVault.findUnique({
      where: { tenantId },
      select: {
        id: true,
        status: true,
        conceptCount: true,
        categoryCount: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return vault;
  }

  /**
   * Get vault statistics including enrichment progress.
   */
  async getVaultStats(tenantId: string) {
    const vault = await this.prisma.tenantVault.findUnique({
      where: { tenantId },
    });
    if (!vault) return null;

    const totalConcepts = await this.prisma.concept.count({
      where: { tenantId, vaultId: vault.id },
    });

    const enrichedConcepts = await this.prisma.concept.count({
      where: {
        tenantId,
        vaultId: vault.id,
        confidence: { gte: 0.7 },
        tier: { not: 'working' },
      },
    });

    const categories = await this.prisma.concept.groupBy({
      by: ['category'],
      where: { tenantId, vaultId: vault.id },
      _count: true,
    });

    return {
      vaultId: vault.id,
      status: vault.status,
      totalConcepts,
      enrichedConcepts,
      enrichmentProgress: totalConcepts > 0 ? Math.round((enrichedConcepts / totalConcepts) * 100) : 0,
      categories: categories.map((c) => ({
        name: c.category,
        count: c._count,
      })),
    };
  }

  // ── Public: Selective Concept Creation ─────────────────────────

  /**
   * Create a single concept for a tenant from the platform curriculum,
   * with English name + all relationships from the platform graph.
   * Used by: onboarding (step 2), maturity engine (step 5).
   *
   * Returns the created concept ID, or null if the slug doesn't match any platform concept.
   */
  async createConceptFromCurriculum(
    tenantId: string,
    slug: string,
    overrides?: { tier?: string; confidence?: number; departmentTags?: string[] },
  ): Promise<string | null> {
    // Find the platform concept by slug or curriculumId
    const platform = await this.prisma.concept.findFirst({
      where: {
        tenantId: null,
        source: 'SEED_DATA',
        OR: [{ slug }, { curriculumId: slug }],
      },
      select: {
        id: true, name: true, slug: true, category: true, definition: true,
        extendedDescription: true, departmentTags: true, sortOrder: true,
        categorySortOrder: true, curriculumId: true,
      },
    });

    if (!platform) {
      this.logger.warn({ message: 'No platform concept found for slug', slug });
      return null;
    }

    // Check if already exists for this tenant
    const existing = await this.prisma.concept.findFirst({
      where: { tenantId, slug: platform.slug },
      select: { id: true },
    });
    if (existing) return existing.id;

    // Map category to proper department tags
    const categoryToDept: Record<string, string[]> = {
      'Marketing': ['Marketing'], '3. Marketing': ['Marketing'],
      'Sales': ['Sales'], '6. Sales': ['Sales'],
      'Finance': ['Finance'], '8. Finance': ['Finance'],
      'Operations': ['Operations'], '9. Operations & Production': ['Operations'],
      'Strategy': ['Strategy'], '10. Strategy': ['Strategy'],
      'Value': ['all'], '2. Value': ['all'],
      'Pricing': ['Finance', 'Sales'], '5. Pricing': ['Finance', 'Sales'],
      'Business Models': ['Strategy'], '4. Cognitive Biases': ['Marketing', 'Sales'],
      'Value Delivery': ['Operations'], 'Introduction to Business': ['all'],
      '11. Human Resources': ['HR'], '12. Working with People': ['HR'],
      '13. Self-Management': ['all'], '7. Business Development': ['Sales', 'Marketing'],
      '21. Data Management': ['Technology'], 'Value Stream': ['Operations'],
    };
    const deptTags = overrides?.departmentTags ?? categoryToDept[platform.category] ?? ['all'];

    // Create tenant concept with English name — NO Serbian content
    // extendedDescription stays empty until the enrichment agent fills it
    const conceptId = `cpt_${createId()}`;
    await this.prisma.concept.create({
      data: {
        id: conceptId,
        name: platform.name, // English from Obsidian
        slug: platform.slug,
        category: platform.category,
        definition: platform.definition, // Short English definition
        extendedDescription: null, // Empty — agent will enrich this
        departmentTags: deptTags,
        source: 'SEED_DATA',
        tenantId,
        sortOrder: platform.sortOrder,
        categorySortOrder: platform.categorySortOrder,
        curriculumId: platform.curriculumId ?? platform.slug,
        confidence: overrides?.confidence ?? 0.3,
        tier: overrides?.tier ?? 'working',
        lastReinforced: new Date(),
      },
    });

    // Link relationships from platform graph
    await this.linkRelationshipsFromPlatform(tenantId, conceptId, platform.slug);

    // Embed into Qdrant
    if (this.embeddingService) {
      try {
        const text = `${platform.name} (${platform.category}): ${platform.definition ?? platform.name}`;
        const result = await this.embeddingService.embed(text);
        if (!result.error) {
          await this.embeddingService.store(conceptId, result.vector, {
            tenantId, name: platform.name, category: platform.category,
            departmentTags: deptTags,
          });
        }
      } catch {
        this.logger.warn({ message: 'Embedding failed for concept (non-blocking)', conceptId });
      }
    }

    return conceptId;
  }

  /**
   * Batch-create multiple concepts from curriculum slugs.
   * Returns map of slug → conceptId for successfully created concepts.
   */
  async createConceptsFromCurriculum(
    tenantId: string,
    slugs: string[],
    overrides?: { tier?: string; confidence?: number },
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const slug of slugs) {
      const id = await this.createConceptFromCurriculum(tenantId, slug, overrides);
      if (id) result.set(slug, id);
    }
    this.logger.log({ message: 'Batch concept creation complete', tenantId, requested: slugs.length, created: result.size });
    return result;
  }

  /**
   * Get the full list of available curriculum concept slugs (for AI to select from).
   */
  async getAvailableCurriculumSlugs(): Promise<Array<{ slug: string; name: string; category: string; definition: string | null }>> {
    const concepts = await this.prisma.concept.findMany({
      where: {
        tenantId: null,
        source: 'SEED_DATA',
        // Only concepts with actual content — filter out empty category headers
        definition: { not: { equals: '' } },
        extendedDescription: { not: { equals: '' } },
      },
      select: { slug: true, name: true, category: true, definition: true },
      orderBy: [{ categorySortOrder: 'asc' }, { sortOrder: 'asc' }],
    });
    return concepts.map(c => ({
      slug: c.slug,
      name: c.name,
      category: c.category,
      definition: c.definition,
    }));
  }

  /**
   * Link a newly created tenant concept to other tenant concepts
   * based on the platform relationship graph.
   */
  private async linkRelationshipsFromPlatform(
    tenantId: string,
    newConceptId: string,
    slug: string,
  ): Promise<number> {
    // Find the platform concept ID
    const platformConcept = await this.prisma.concept.findFirst({
      where: { tenantId: null, OR: [{ slug }, { curriculumId: slug }] },
      select: { id: true },
    });
    if (!platformConcept) return 0;

    // Get all platform relationships involving this concept
    const platformRels = await this.prisma.conceptRelationship.findMany({
      where: {
        OR: [
          { sourceConceptId: platformConcept.id },
          { targetConceptId: platformConcept.id },
        ],
      },
      select: {
        sourceConceptId: true, targetConceptId: true, relationshipType: true,
        sourceConcept: { select: { slug: true, curriculumId: true } },
        targetConcept: { select: { slug: true, curriculumId: true } },
      },
    });

    // Find matching tenant concepts for the other end of each relationship
    const tenantConcepts = await this.prisma.concept.findMany({
      where: { tenantId },
      select: { id: true, slug: true, curriculumId: true },
    });
    const tenantBySlug = new Map<string, string>();
    for (const tc of tenantConcepts) {
      tenantBySlug.set(tc.slug, tc.id);
      if (tc.curriculumId) tenantBySlug.set(tc.curriculumId, tc.id);
    }

    const edges: Array<{ id: string; sourceConceptId: string; targetConceptId: string; relationshipType: 'RELATED' | 'PREREQUISITE' | 'ADVANCED' }> = [];
    const edgeSet = new Set<string>();

    for (const rel of platformRels) {
      const isSource = rel.sourceConceptId === platformConcept.id;
      const otherSlug = isSource
        ? (rel.targetConcept.curriculumId ?? rel.targetConcept.slug)
        : (rel.sourceConcept.curriculumId ?? rel.sourceConcept.slug);
      const otherTenantId = tenantBySlug.get(otherSlug);
      if (!otherTenantId) continue;

      const sourceId = isSource ? newConceptId : otherTenantId;
      const targetId = isSource ? otherTenantId : newConceptId;
      const key = `${sourceId}→${targetId}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);

      edges.push({
        id: `crel_${createId()}`,
        sourceConceptId: sourceId,
        targetConceptId: targetId,
        relationshipType: rel.relationshipType,
      });
    }

    if (edges.length > 0) {
      await this.prisma.conceptRelationship.createMany({
        data: edges,
        skipDuplicates: true,
      });
    }

    return edges.length;
  }

  // ── Internal helpers ──────────────────────────────────────────

  /**
   * Create concept relationships for a tenant vault based on the
   * source vault's relationship structure (curriculum hierarchy).
   */
  private async createTenantRelationships(
    tenantId: string,
    vaultId: string,
    sourceConcepts: Array<{
      name: string;
      curriculumId: string | null;
      parentCurriculumId: string | null;
      categorySortOrder: number;
      originalContent: string;
    }>,
  ): Promise<number> {
    // Load all tenant concepts with their metadata
    const tenantConcepts = await this.prisma.concept.findMany({
      where: { tenantId, vaultId },
      select: { id: true, name: true, curriculumId: true, categorySortOrder: true, sortOrder: true },
    });

    const curriculumToId = new Map<string, string>();
    const nameToId = new Map<string, string>();
    const conceptMeta = new Map<string, { categorySortOrder: number; sortOrder: number }>();

    for (const tc of tenantConcepts) {
      if (tc.curriculumId) {
        curriculumToId.set(tc.curriculumId, tc.id);
      }
      nameToId.set(tc.name.toLowerCase(), tc.id);
      conceptMeta.set(tc.id, { categorySortOrder: tc.categorySortOrder, sortOrder: tc.sortOrder });
    }

    // Track existing edges to prevent duplicates
    const edgeSet = new Set<string>();
    const addEdge = (sourceId: string, targetId: string, type: 'RELATED' | 'PREREQUISITE' | 'ADVANCED') => {
      const key = `${sourceId}→${targetId}`;
      if (edgeSet.has(key) || sourceId === targetId) return;
      edgeSet.add(key);
      relationships.push({
        id: `crel_${createId()}`,
        sourceConceptId: sourceId,
        targetConceptId: targetId,
        relationshipType: type,
      });
    };

    const relationships: Array<{
      id: string;
      sourceConceptId: string;
      targetConceptId: string;
      relationshipType: 'RELATED' | 'PREREQUISITE' | 'ADVANCED';
    }> = [];

    // 1. Parent → child = PREREQUISITE
    for (const sc of sourceConcepts) {
      if (!sc.curriculumId || !sc.parentCurriculumId) continue;
      const childId = curriculumToId.get(sc.curriculumId);
      const parentId = curriculumToId.get(sc.parentCurriculumId);
      if (childId && parentId) {
        addEdge(parentId, childId, 'PREREQUISITE');
      }
    }

    // 2. Sibling RELATED (same parent, adjacent)
    const parentGroups = new Map<string, string[]>();
    for (const sc of sourceConcepts) {
      if (!sc.parentCurriculumId || !sc.curriculumId) continue;
      const childId = curriculumToId.get(sc.curriculumId);
      if (!childId) continue;
      const existing = parentGroups.get(sc.parentCurriculumId) ?? [];
      existing.push(childId);
      parentGroups.set(sc.parentCurriculumId, existing);
    }
    for (const siblings of parentGroups.values()) {
      if (siblings.length < 2) continue;
      for (let i = 0; i < siblings.length - 1; i++) {
        addEdge(siblings[i]!, siblings[i + 1]!, 'RELATED');
      }
    }

    // 3. Clone relationships from platform concepts (tenantId=null) using curriculumId mapping.
    //    Both platform and tenant concepts now use English names and English curriculumIds.
    const platformConcepts = await this.prisma.concept.findMany({
      where: { tenantId: null },
      select: { id: true, curriculumId: true, slug: true },
    });
    // Map platform conceptId → curriculumId (or slug as fallback)
    const platformIdToCurrId = new Map<string, string>();
    for (const pc of platformConcepts) {
      const key = pc.curriculumId ?? pc.slug;
      if (key) platformIdToCurrId.set(pc.id, key);
    }

    const platformRels = await this.prisma.conceptRelationship.findMany({
      where: { sourceConcept: { tenantId: null } },
      select: { sourceConceptId: true, targetConceptId: true, relationshipType: true },
    });

    let clonedCount = 0;
    for (const rel of platformRels) {
      const sourceCurrId = platformIdToCurrId.get(rel.sourceConceptId);
      const targetCurrId = platformIdToCurrId.get(rel.targetConceptId);
      if (!sourceCurrId || !targetCurrId) continue;

      const tenantSourceId = curriculumToId.get(sourceCurrId);
      const tenantTargetId = curriculumToId.get(targetCurrId);
      if (!tenantSourceId || !tenantTargetId) continue;

      addEdge(tenantSourceId, tenantTargetId, rel.relationshipType as 'RELATED' | 'PREREQUISITE' | 'ADVANCED');
      clonedCount++;
    }
    this.logger.log({ message: 'Cloned platform relationships', platformRelsChecked: platformRels.length, clonedFromPlatform: clonedCount, tenantEdgesTotal: relationships.length });

    // Batch insert relationships using createMany with skipDuplicates
    let insertedCount = 0;
    if (relationships.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < relationships.length; i += batchSize) {
        const batch = relationships.slice(i, i + batchSize);
        try {
          const result = await this.prisma.conceptRelationship.createMany({
            data: batch,
            skipDuplicates: true,
          });
          insertedCount += result.count;
        } catch (err) {
          this.logger.error({
            message: 'Relationship batch insert failed',
            batchStart: i,
            batchSize: batch.length,
            error: (err as Error).message,
          });
        }
      }
    }

    this.logger.log({ message: 'Relationships created', tenantId, attempted: relationships.length, inserted: insertedCount });
    return insertedCount;
  }
}
