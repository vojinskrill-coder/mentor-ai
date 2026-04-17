import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { EmbeddingService } from '../knowledge/services/embedding.service';
import { BrainIndexService } from './brain-index.service';
import { createId } from '@paralleldrive/cuid2';

/**
 * InsightCrystallizationService — files valuable conversation insights
 * back into the tenant's Obsidian vault.
 *
 * Follows the Karpathy "file answer back" pattern: when a conversation
 * produces substantive analysis, the key insights are crystallized into
 * the relevant concept note, reinforcing the brain's knowledge.
 *
 * Runs ASYNCHRONOUSLY — never blocks the chat experience.
 */

interface ConversationInsight {
  tenantId: string;
  conversationId: string;
  conceptName: string | null; // Which concept this relates to (null = auto-detect)
  content: string; // The valuable insight text
  wordCount: number;
  timestamp: Date;
}

/** Minimum quality thresholds for crystallization */
const MIN_INSIGHT_WORDS = 100; // Skip trivial Q&A
const MIN_SPECIFICITY_INDICATORS = 2; // Must have specific terms

/** Specificity indicators — content that suggests real analysis, not generic chat */
const SPECIFICITY_KEYWORDS = [
  'strategy', 'analysis', 'recommend', 'plan', 'budget', 'revenue',
  'competitor', 'market', 'growth', 'risk', 'opportunity', 'metric',
  'KPI', 'timeline', 'implementation', 'benchmark', 'pricing',
  'campaign', 'conversion', 'retention', 'acquisition',
  '%', '$', '€', 'increase', 'decrease', 'target', 'goal',
];

@Injectable()
export class InsightCrystallizationService {
  private readonly logger = new Logger(InsightCrystallizationService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly brainIndex: BrainIndexService,
    @Optional()
    @Inject(EmbeddingService)
    private readonly embeddingService: EmbeddingService | undefined,
  ) {}

  /**
   * Evaluate a conversation message for crystallization potential.
   * Returns true if the message qualifies as a valuable insight.
   */
  qualifiesForCrystallization(content: string): boolean {
    const wordCount = content.split(/\s+/).length;
    if (wordCount < MIN_INSIGHT_WORDS) return false;

    const contentLower = content.toLowerCase();
    const matchedIndicators = SPECIFICITY_KEYWORDS.filter((kw) =>
      contentLower.includes(kw.toLowerCase()),
    );

    return matchedIndicators.length >= MIN_SPECIFICITY_INDICATORS;
  }

  /**
   * Crystallize an insight from a conversation into the vault.
   * Runs asynchronously — fire-and-forget from the conversation handler.
   */
  async crystallizeInsight(insight: ConversationInsight): Promise<void> {
    try {
      // 1. Find the relevant concept
      let conceptId: string | null = null;

      if (insight.conceptName) {
        // Direct concept match
        const concept = await this.prisma.concept.findFirst({
          where: { tenantId: insight.tenantId, name: insight.conceptName },
          select: { id: true },
        });
        conceptId = concept?.id ?? null;
      }

      if (!conceptId) {
        // Auto-detect from brain index
        const matches = await this.brainIndex.findRelevantConcepts(
          insight.tenantId,
          insight.content.substring(0, 500),
          1, // Top 1 match
        );
        conceptId = matches[0]?.id ?? null;
      }

      if (!conceptId) {
        this.logger.warn({
          message: 'No matching concept found for crystallization',
          tenantId: insight.tenantId,
          conversationId: insight.conversationId,
        });
        return;
      }

      // 2. Load existing concept content
      const concept = await this.prisma.concept.findUnique({
        where: { id: conceptId },
        select: {
          id: true,
          name: true,
          extendedDescription: true,
          confidence: true,
          lastReinforced: true,
        },
      });

      if (!concept) return;

      // 3. Append insight as a new section
      const dateStr = insight.timestamp.toISOString().split('T')[0];
      const insightSection = `\n\n## Insights from Conversation (${dateStr})\n<!-- dept:all -->\n\n${insight.content}\n\n*Source: Conversation ${insight.conversationId}*\n`;

      const updatedContent = (concept.extendedDescription ?? '') + insightSection;

      // 4. Update concept with new content + reinforcement
      // Scale confidence increment by insight quality (word count)
      const confidenceIncrement = insight.wordCount >= 500 ? 0.10 : insight.wordCount >= 200 ? 0.05 : 0.02;
      const newConfidence = Math.min((concept.confidence ?? 0.5) + confidenceIncrement, 1.0);

      await this.prisma.concept.update({
        where: { id: conceptId },
        data: {
          extendedDescription: updatedContent,
          confidence: newConfidence,
          lastReinforced: new Date(),
          updatedAt: new Date(),
        },
      });

      // 5. Re-embed full content to keep Qdrant in sync
      if (this.embeddingService) {
        try {
          const fullContent = (updatedContent || '')
            .replace(/^---[\s\S]*?---\n*/m, '')
            .replace(/<!--[^>]*-->/g, '')
            .substring(0, 28000);
          const embedResult = await this.embeddingService.embed(
            `${concept.name}: ${fullContent}`,
          );
          if (!embedResult.error) {
            await this.embeddingService.store(conceptId, embedResult.vector, {
              tenantId: insight.tenantId, name: concept.name, category: '', departmentTags: [],
            });
          }
        } catch {
          this.logger.warn({ message: 'Re-embedding after crystallization failed (non-blocking)', conceptId });
        }
      }

      // 6. Invalidate brain index cache
      this.brainIndex.invalidateCache(insight.tenantId);

      // 7. Log the crystallization
      await this.prisma.vaultOperationLog.create({
        data: {
          id: `vlog_${createId()}`,
          tenantId: insight.tenantId,
          operationType: 'crystallize',
          conceptsAffected: 1,
          status: 'completed',
          details: {
            conceptName: concept.name,
            conversationId: insight.conversationId,
            insightWordCount: insight.wordCount,
            newConfidence,
          },
        },
      });

      this.logger.log({
        message: 'Insight crystallized into vault',
        tenantId: insight.tenantId,
        conceptName: concept.name,
        insightWords: insight.wordCount,
        newConfidence,
      });
    } catch (err) {
      // Non-fatal — crystallization should never break the chat
      this.logger.error({
        message: 'Insight crystallization failed',
        tenantId: insight.tenantId,
        error: (err as Error).message,
      });
    }
  }
}
