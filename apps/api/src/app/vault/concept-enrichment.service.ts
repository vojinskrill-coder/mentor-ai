import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { OpenClawClientService } from '../agent-execution/openclaw-client.service';
import { EmbeddingService } from '../knowledge/services/embedding.service';
import { AppEventBus } from '../events/app-event-bus.service';
import { BRIDGE_EVENTS } from '../bridge/bridge.service';
import { generateEnrichmentSoulMd } from './enrichment-soul.template';
import type { BusinessContext } from './concept-priority.service';
import { createId } from '@paralleldrive/cuid2';

/**
 * ConceptEnrichmentService — sequentially enriches concepts using a
 * MiniMax agent via the OpenClaw relay.
 *
 * Processes concepts ONE AT A TIME to avoid duplicate content.
 * Each concept gets a fresh SOUL.md with the business profile and
 * original content, then the agent researches and rewrites it.
 *
 * This is a LONG-RUNNING process (100 concepts × ~3-5 min each = 5-8 hours).
 * It runs in the background and emits WebSocket events for progress tracking.
 */

const ENRICHER_AGENT_ID = 'concept-enricher';

@Injectable()
export class ConceptEnrichmentService {
  private readonly logger = new Logger(ConceptEnrichmentService.name);
  private readonly relayUrl: string;
  private readonly relayToken: string;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly openclaw: OpenClawClientService,
    private readonly eventBus: AppEventBus,
    private readonly config: ConfigService,
    @Optional()
    @Inject(EmbeddingService)
    private readonly embeddingService: EmbeddingService | undefined,
  ) {
    const rawUrl = this.config.get<string>('OPENCLAW_RELAY_URL') ?? 'http://91.98.231.87:3100';
    this.relayUrl = rawUrl.replace(/\/execute\/?$/, '').replace(/\/stream\/?$/, '');
    this.relayToken = this.config.get<string>('OPENCLAW_RELAY_TOKEN') ??
      '9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d';
  }

  /**
   * Enrich a list of concepts SEQUENTIALLY.
   * Each concept is processed one at a time — the agent rewrites it
   * with business-specific content, research, and real data.
   */
  async enrichConceptsSequentially(
    tenantId: string,
    conceptIds: string[],
    businessContext: BusinessContext,
  ): Promise<{ enriched: number; failed: number; errors: string[] }> {
    const startMs = Date.now();
    const logId = `vlog_${createId()}`;
    let enriched = 0;
    let failed = 0;
    const errors: string[] = [];

    // Create operation log
    await this.prisma.vaultOperationLog.create({
      data: {
        id: logId,
        tenantId,
        operationType: 'enrich',
        status: 'running',
        details: {
          totalConcepts: conceptIds.length,
          businessName: businessContext.companyName,
        },
      },
    });

    // Load all concept names in vault for [[wikilink]] resolution
    const allConcepts = await this.prisma.concept.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    const allConceptNames = allConcepts.map((c) => c.name);

    // Track previously enriched summaries (to avoid duplication)
    const previousSummaries: string[] = [];

    // Register the enricher agent on the relay
    await this.registerEnricherAgent();

    for (let i = 0; i < conceptIds.length; i++) {
      const conceptId = conceptIds[i]!;
      const conceptStartMs = Date.now();

      try {
        // Load the concept
        const concept = await this.prisma.concept.findUnique({
          where: { id: conceptId },
          select: {
            id: true,
            name: true,
            category: true,
            definition: true,
            extendedDescription: true,
            departmentTags: true,
          },
        });

        if (!concept) {
          this.logger.warn(`Concept not found: ${conceptId}`);
          failed++;
          errors.push(`Concept ${conceptId} not found`);
          continue;
        }

        this.logger.log({
          message: `Enriching concept ${i + 1}/${conceptIds.length}`,
          conceptName: concept.name,
          tenantId,
        });

        // Generate enrichment instructions for this specific concept.
        // Instead of deploying a new SOUL.md per concept (which restarts
        // the gateway 100 times), we pass the full instructions as the
        // agent message. The base SOUL.md was deployed once during init.
        const enrichmentInstructions = generateEnrichmentSoulMd({
          business: businessContext,
          conceptName: concept.name,
          conceptCategory: concept.category,
          departmentTags: concept.departmentTags,
          originalContent: concept.extendedDescription ?? concept.definition ?? '',
          allConceptNames,
          previousConceptSummaries: previousSummaries,
        });

        // Call the agent with the full enrichment instructions as the message.
        // The base SOUL.md tells the agent to follow the instructions in the message.
        const result = await this.openclaw.executeAgent(
          enrichmentInstructions,
          {
            agentId: ENRICHER_AGENT_ID,
            tenantProfile: tenantId,
            timeoutSeconds: 600,
            thinking: 'high',
          },
        );

        if (!result.success || !result.output) {
          this.logger.warn({
            message: `Enrichment failed for concept ${concept.name}`,
            error: result.error,
          });
          failed++;
          errors.push(`${concept.name}: ${result.error ?? 'empty output'}`);
          continue;
        }

        // Parse the enriched content
        const enrichedContent = result.output;
        const wordCount = enrichedContent.split(/\s+/).length;

        // Extract frontmatter sectionTags if present
        const sectionTags = this.extractSectionTags(enrichedContent);

        // Extract definition (first meaningful paragraph)
        const definition = this.extractDefinition(enrichedContent);

        // Update the concept in the database
        await this.prisma.concept.update({
          where: { id: conceptId },
          data: {
            extendedDescription: enrichedContent,
            definition,
            confidence: 0.7,
            tier: 'semantic',
            lastReinforced: new Date(),
            sectionTags: sectionTags as unknown as object,
            updatedAt: new Date(),
          },
        });

        // Re-embed with FULL enriched content to Qdrant
        if (this.embeddingService) {
          try {
            const fullContent = (enrichedContent || '')
              .replace(/^---[\s\S]*?---\n*/m, '')
              .replace(/<!--[^>]*-->/g, '')
              .substring(0, 28000);
            const embedResult = await this.embeddingService.embed(
              `${concept.name} (${concept.category}): ${fullContent}`,
            );
            if (!embedResult.error) {
              await this.embeddingService.store(conceptId, embedResult.vector, {
                tenantId,
                name: concept.name,
                category: concept.category,
                departmentTags: concept.departmentTags ?? [],
                tier: 'semantic',
                confidence: 0.7,
              });
            }
          } catch {
            this.logger.warn({ message: 'Re-embedding after enrichment failed (non-blocking)', conceptId });
          }
        }

        enriched++;
        const conceptDurationMs = Date.now() - conceptStartMs;

        // Add summary for context in next concepts (avoid duplication)
        previousSummaries.push(
          `${concept.name} (${concept.category}): ${definition.substring(0, 200)}`,
        );

        // Log per-concept enrichment
        await this.prisma.vaultOperationLog.create({
          data: {
            id: `vlog_${createId()}`,
            tenantId,
            operationType: 'enrich',
            conceptsAffected: 1,
            durationMs: conceptDurationMs,
            status: 'completed',
            details: {
              conceptName: concept.name,
              conceptCategory: concept.category,
              wordCount,
              index: i + 1,
              total: conceptIds.length,
            },
          },
        });

        // Emit WebSocket event for live progress
        this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
          tenantId,
          taskId: `enrichment-${tenantId}`,
          agent: 'concept-enricher',
          status: 'running',
          message: `Enriched ${enriched}/${conceptIds.length}: ${concept.name} (${wordCount} words, ${Math.round(conceptDurationMs / 1000)}s)`,
          timestamp: new Date().toISOString(),
        });

        this.logger.log({
          message: `Concept enriched: ${concept.name}`,
          wordCount,
          durationMs: conceptDurationMs,
          progress: `${enriched}/${conceptIds.length}`,
        });
      } catch (err) {
        failed++;
        const errorMsg = (err as Error).message;
        errors.push(`${conceptId}: ${errorMsg}`);
        this.logger.error(`Enrichment error for concept ${conceptId}: ${errorMsg}`);
        // Continue to next concept — don't abort the entire queue
      }
    }

    // Update the batch operation log
    const totalDurationMs = Date.now() - startMs;
    await this.prisma.vaultOperationLog.update({
      where: { id: logId },
      data: {
        status: failed === conceptIds.length ? 'failed' : 'completed',
        conceptsAffected: enriched,
        durationMs: totalDurationMs,
        details: {
          totalConcepts: conceptIds.length,
          enriched,
          failed,
          errors: errors.slice(0, 10), // Keep first 10 errors
          businessName: businessContext.companyName,
        },
      },
    });

    // Emit completion event
    this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
      tenantId,
      taskId: `enrichment-${tenantId}`,
      agent: 'concept-enricher',
      status: 'completed',
      message: `Enrichment complete: ${enriched} concepts enriched, ${failed} failed`,
      timestamp: new Date().toISOString(),
    });

    this.logger.log({
      message: 'Sequential enrichment batch complete',
      tenantId,
      enriched,
      failed,
      totalDurationMs,
    });

    return { enriched, failed, errors };
  }

  /**
   * Get enrichment progress for a tenant.
   */
  async getEnrichmentProgress(tenantId: string) {
    const vault = await this.prisma.tenantVault.findUnique({
      where: { tenantId },
      select: { id: true, conceptCount: true },
    });
    if (!vault) return null;

    const totalConcepts = await this.prisma.concept.count({
      where: { tenantId },
    });

    const enrichedConcepts = await this.prisma.concept.count({
      where: {
        tenantId,
        confidence: { gte: 0.7 },
        extendedDescription: { not: null },
        tier: 'semantic',
      },
    });

    // Check for active enrichment operation
    const activeOp = await this.prisma.vaultOperationLog.findFirst({
      where: { tenantId, operationType: 'enrich', status: 'running' },
      orderBy: { createdAt: 'desc' },
      select: { details: true, createdAt: true },
    });

    const details = (activeOp?.details as Record<string, unknown>) ?? {};

    return {
      totalConcepts,
      enrichedConcepts,
      progressPercent: totalConcepts > 0
        ? Math.round((enrichedConcepts / totalConcepts) * 100)
        : 0,
      isRunning: !!activeOp,
      currentConcept: details['conceptName'] as string | undefined,
      startedAt: activeOp?.createdAt ?? null,
    };
  }

  // ── Internal helpers ──────────────────────────────────────────

  /**
   * Register the concept-enricher agent on the OpenClaw relay ONCE.
   * The base SOUL.md tells the agent to follow the enrichment
   * instructions passed in each message — no per-concept re-registration.
   */
  private async registerEnricherAgent(): Promise<void> {
    try {
      const baseSoulMd = `# SOUL.md — Concept Enricher Agent

You are a **Business Knowledge Writer**. You receive detailed enrichment instructions in each message. Follow them EXACTLY.

Your job: rewrite ONE business concept into a comprehensive 5000+ word article specific to the company described in the instructions.

## Rules
1. Follow ALL instructions in the message — they contain the business profile, original content, output format, and research requirements.
2. Use web_search for research — include REAL URLs and data.
3. Return the COMPLETE markdown document with YAML frontmatter.
4. MINIMUM 5000 words. Count your words.
5. Tag each H2 section with department comments: \`<!-- dept:tag1,tag2 -->\`
6. Preserve [[wikilinks]] to other concepts as instructed.
7. No prose before or after the document. Start with --- and end with the Sources section.
`;

      const res = await fetch(`${this.relayUrl}/register-agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.relayToken}`,
        },
        body: JSON.stringify({
          agentId: ENRICHER_AGENT_ID,
          slug: 'concept-enricher',
          soulMd: baseSoulMd,
          skillMd: '',
          openclawEntry: {
            id: ENRICHER_AGENT_ID,
            name: 'Concept Enricher',
            model: 'deepseek/MiniMax-M2.7',
          },
          modelsJson: {
            providers: {
              deepseek: {
                baseUrl: 'https://api.minimax.io/v1',
                api: 'openai-completions',
                apiKey: 'DEEPSEEK_API_KEY',
                models: [{
                  id: 'MiniMax-M2.7',
                  name: 'MiniMax M2.7 (Reasoning)',
                  api: 'openai-completions',
                  reasoning: true,
                  input: ['text'],
                  cost: { input: 0.27, output: 1.1, cacheRead: 0, cacheWrite: 0 },
                  contextWindow: 192000,
                  maxTokens: 32768,
                }],
              },
            },
          },
        }),
      });

      if (!res.ok) {
        this.logger.warn(`register-agent failed: ${res.status} ${await res.text()}`);
      } else {
        this.logger.log('Enricher agent registered on relay');
      }
    } catch (err) {
      this.logger.warn(`register-agent error: ${(err as Error).message}`);
    }
  }

  /**
   * Extract section tags from enriched markdown content.
   * Looks for `<!-- dept:tag1,tag2 -->` comments after H2 headings.
   */
  private extractSectionTags(content: string): Record<string, string[]> {
    const tags: Record<string, string[]> = {};
    const sectionPattern = /^## (.+)\n<!-- dept:(.+) -->/gm;
    let match: RegExpExecArray | null;

    while ((match = sectionPattern.exec(content)) !== null) {
      const sectionName = match[1]!.trim().toLowerCase().replace(/\s+/g, '_');
      const deptList = match[2]!.split(',').map((t) => t.trim());
      tags[sectionName] = deptList;
    }

    return tags;
  }

  /**
   * Extract a concise definition from enriched content.
   */
  private extractDefinition(content: string): string {
    // Skip frontmatter
    const bodyStart = content.indexOf('---', content.indexOf('---') + 3);
    const body = bodyStart > 0 ? content.substring(bodyStart + 3) : content;

    // Find first meaningful paragraph
    const paragraphs = body
      .split('\n\n')
      .map((p) => p.trim())
      .filter((p) => p.length >= 50 && !p.startsWith('#') && !p.startsWith('<!--') && !p.startsWith('---'));

    return paragraphs[0]?.substring(0, 500) ?? 'Enriched concept — see full content.';
  }
}
