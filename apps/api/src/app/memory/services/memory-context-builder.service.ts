import { Injectable, Logger } from '@nestjs/common';
import { MemoryEmbeddingService } from './memory-embedding.service';
import type { MemoryType, MemoryAttribution } from '@mentor-ai/shared/types';

/**
 * Result of building memory context for a prompt.
 */
export interface MemoryContext {
  /** Formatted context string to inject into prompt */
  context: string;
  /** Attributions for memories used */
  attributions: MemoryAttribution[];
  /** Token estimate for the context */
  estimatedTokens: number;
}

/**
 * Service for building memory context for AI prompts.
 * Formats relevant memories for RAG injection.
 *
 * Story 2.7: Persistent Memory Across Conversations
 */
@Injectable()
export class MemoryContextBuilderService {
  private readonly logger = new Logger(MemoryContextBuilderService.name);

  /** Maximum tokens for memory context to preserve response quality.
   *  Reduced from 2000 to 800 to fit within 8K context window models. */
  private readonly MAX_MEMORY_TOKENS = 800;

  /** Approximate characters per token */
  private readonly CHARS_PER_TOKEN = 4;

  constructor(private readonly memoryEmbeddingService: MemoryEmbeddingService) {}

  /**
   * Builds memory context for a user query.
   * Retrieves relevant memories and formats them for prompt injection.
   *
   * @param query - User's query to match against memories
   * @param userId - User ID for memory retrieval
   * @param tenantId - Tenant ID for isolation
   * @returns Formatted context with attributions
   */
  async buildContext(query: string, userId: string, tenantId: string): Promise<MemoryContext> {
    this.logger.debug({
      message: 'Building memory context',
      userId,
      tenantId,
      queryLength: query.length,
    });

    // Retrieve relevant memories via hybrid search
    const searchResults = await this.memoryEmbeddingService.hybridSearch(
      tenantId,
      userId,
      query,
      10 // Top 10 most relevant
    );

    if (searchResults.length === 0) {
      this.logger.debug({
        message: 'No relevant memories found',
        userId,
        tenantId,
      });

      return {
        context: '',
        attributions: [],
        estimatedTokens: 0,
      };
    }

    // Build context string with token limit
    const attributions: MemoryAttribution[] = [];
    let context = '\n\n--- PREVIOUS CONTEXT ABOUT THIS USER ---\n';
    let tokenCount = this.estimateTokens(context);
    const maxContentTokens = this.MAX_MEMORY_TOKENS - 100; // Reserve for header/footer

    for (const result of searchResults) {
      const memoryText = this.formatMemory(result);
      const memoryTokens = this.estimateTokens(memoryText);

      if (tokenCount + memoryTokens > maxContentTokens) {
        this.logger.debug({
          message: 'Token limit reached, stopping memory inclusion',
          includedCount: attributions.length,
          remainingCount: searchResults.length - attributions.length,
        });
        break;
      }

      context += memoryText + '\n';
      tokenCount += memoryTokens;

      attributions.push({
        memoryId: result.memoryId,
        subject: result.subject || 'general context',
        summary: result.content.slice(0, 100),
        type: result.type,
      });
    }

    context += '--- END PREVIOUS CONTEXT ---\n\n';
    context +=
      'When using this context, indicate it with: "Based on our previous discussion about [subject]..."\n';

    const finalTokens = this.estimateTokens(context);

    this.logger.log({
      message: 'Memory context built',
      userId,
      tenantId,
      memoriesIncluded: attributions.length,
      estimatedTokens: finalTokens,
    });

    return {
      context,
      attributions,
      estimatedTokens: finalTokens,
    };
  }

  /**
   * Formats a single memory for inclusion in context.
   */
  private formatMemory(result: {
    type: MemoryType;
    subject?: string;
    content: string;
    score: number;
  }): string {
    const typeLabel = this.getTypeLabel(result.type);
    const subjectPart = result.subject ? `: ${result.subject}` : '';

    return `[${typeLabel}${subjectPart}] ${result.content}`;
  }

  /**
   * Gets human-readable label for memory type.
   */
  private getTypeLabel(type: MemoryType): string {
    const labels: Record<MemoryType, string> = {
      CLIENT_CONTEXT: 'Client',
      PROJECT_CONTEXT: 'Project',
      USER_PREFERENCE: 'Preference',
      FACTUAL_STATEMENT: 'Fact',
    };
    return labels[type] || 'Note';
  }

  /**
   * Estimates token count for text.
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }

  /**
   * Injects memory context into existing system prompt.
   *
   * @param systemPrompt - Original system prompt
   * @param memoryContext - Memory context to inject
   * @returns Modified system prompt with memory context
   */
  injectIntoSystemPrompt(systemPrompt: string, memoryContext: MemoryContext): string {
    if (!memoryContext.context) {
      return systemPrompt;
    }

    // Inject memory context after the main system prompt
    return `${systemPrompt}\n${memoryContext.context}`;
  }

  /**
   * Parses memory attributions from AI response.
   * Looks for patterns like "Based on our previous discussion about [X]..."
   *
   * @param response - AI response text
   * @param providedAttributions - Attributions that were provided in context
   * @returns Matched attributions
   */
  parseAttributionsFromResponse(
    response: string,
    providedAttributions: MemoryAttribution[]
  ): MemoryAttribution[] {
    const matched: MemoryAttribution[] = [];

    // Look for "Based on our previous discussion about [subject]" patterns
    const patterns = [
      /Based on our previous discussion about ([^,.]+)/gi,
      /As we discussed regarding ([^,.]+)/gi,
      /From our earlier conversation about ([^,.]+)/gi,
      /You mentioned that ([^,.]+)/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(response)) !== null) {
        const mentionedSubject = match[1]?.trim().toLowerCase();

        // Skip if no subject captured
        if (!mentionedSubject) {
          continue;
        }

        // Find matching attribution
        const found = providedAttributions.find(
          (attr) =>
            attr.subject.toLowerCase().includes(mentionedSubject) ||
            mentionedSubject.includes(attr.subject.toLowerCase())
        );

        if (found && !matched.some((m) => m.memoryId === found.memoryId)) {
          matched.push(found);
        }
      }
    }

    return matched;
  }
}
