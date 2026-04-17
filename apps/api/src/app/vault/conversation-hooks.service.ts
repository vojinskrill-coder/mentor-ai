import { Injectable, Logger } from '@nestjs/common';
import { PromptEnrichmentService, EnrichedPrompt } from './prompt-enrichment.service';
import { InsightCrystallizationService } from './insight-crystallization.service';

/**
 * ConversationHooksService — integration layer between the conversation
 * gateway and the vault enrichment/crystallization services.
 *
 * Provides two hooks:
 *   1. beforeMessage() — enriches user message before LLM call
 *   2. afterMessage() — evaluates assistant response for crystallization
 *
 * The conversation gateway calls these hooks. If the VaultModule is
 * not loaded (e.g., during tests), the hooks are no-ops.
 *
 * Usage in conversation.gateway.ts:
 *   // Before LLM call:
 *   const enriched = await this.conversationHooks?.beforeMessage(ctx);
 *   // Use enriched.systemContext and enriched.enrichedMessage
 *
 *   // After assistant response:
 *   this.conversationHooks?.afterMessage(tenantId, conversationId, response).catch(() => {});
 */
@Injectable()
export class ConversationHooksService {
  private readonly logger = new Logger(ConversationHooksService.name);

  constructor(
    private readonly enrichment: PromptEnrichmentService,
    private readonly crystallization: InsightCrystallizationService,
  ) {}

  /**
   * Hook: called BEFORE the user's message is sent to the LLM.
   * Returns enriched prompt with business context, concepts, and role perspective.
   *
   * Returns null if enrichment fails (caller should proceed with original message).
   */
  async beforeMessage(params: {
    tenantId: string;
    userId: string;
    userDepartment: string | null;
    userRole: string;
    originalMessage: string;
  }): Promise<EnrichedPrompt | null> {
    try {
      const enriched = await this.enrichment.enrichMessage({
        tenantId: params.tenantId,
        userId: params.userId,
        userDepartment: params.userDepartment,
        userRole: params.userRole,
        originalMessage: params.originalMessage,
      });

      this.logger.debug({
        message: 'Message enriched',
        tenantId: params.tenantId,
        conceptsMatched: enriched.conceptsMatched,
        durationMs: enriched.enrichmentDurationMs,
      });

      return enriched;
    } catch (err) {
      // Non-fatal — if enrichment fails, the original message still works
      this.logger.warn({
        message: 'Prompt enrichment failed (proceeding with original message)',
        tenantId: params.tenantId,
        error: (err as Error).message,
      });
      return null;
    }
  }

  /**
   * Hook: called AFTER the assistant's response is generated.
   * Evaluates the response for crystallization potential.
   * Fire-and-forget — never blocks the chat response.
   */
  async afterMessage(params: {
    tenantId: string;
    conversationId: string;
    conceptName?: string | null;
    assistantResponse: string;
  }): Promise<void> {
    try {
      // Check if the response qualifies for crystallization
      if (!this.crystallization.qualifiesForCrystallization(params.assistantResponse)) {
        return;
      }

      const wordCount = params.assistantResponse.split(/\s+/).length;

      // Fire-and-forget crystallization
      this.crystallization.crystallizeInsight({
        tenantId: params.tenantId,
        conversationId: params.conversationId,
        conceptName: params.conceptName ?? null,
        content: params.assistantResponse,
        wordCount,
        timestamp: new Date(),
      }).catch((err) => {
        this.logger.warn({
          message: 'Crystallization failed (non-fatal)',
          tenantId: params.tenantId,
          error: (err as Error).message,
        });
      });
    } catch (err) {
      // Absolutely non-fatal
      this.logger.warn({
        message: 'afterMessage hook failed',
        error: (err as Error).message,
      });
    }
  }
}
