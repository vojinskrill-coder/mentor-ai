import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemoryService } from './memory.service';
import { MemoryEmbeddingService } from './memory-embedding.service';
import type { Message, MemoryType, MemorySource } from '@mentor-ai/shared/types';
import { LlmConfigService } from '../../llm-config/llm-config.service';
import { LlmProviderType } from '@mentor-ai/shared/types';

/**
 * Extracted memory from conversation.
 */
export interface ExtractedMemory {
  type: MemoryType;
  content: string;
  subject?: string;
  confidence: number;
}

/**
 * Service for extracting memorable facts from conversations.
 * Uses LLM to identify client mentions, preferences, and facts.
 *
 * Story 2.7: Persistent Memory Across Conversations
 */
@Injectable()
export class MemoryExtractionService {
  private readonly logger = new Logger(MemoryExtractionService.name);

  /** Deduplication similarity threshold */
  private readonly DEDUP_THRESHOLD = 0.9;

  /** Extraction prompt template */
  private readonly EXTRACTION_PROMPT = `Analyze the following conversation and extract memorable facts.
Return a JSON array of extracted memories with this structure:
{ "type": "CLIENT_CONTEXT" | "PROJECT_CONTEXT" | "USER_PREFERENCE" | "FACTUAL_STATEMENT",
  "content": "the specific fact",
  "subject": "client/project name if applicable",
  "confidence": 0.0-1.0 }

Focus on:
- Client names and their characteristics (industry, size, constraints, budget)
- Project details (timeline, budget, requirements, deadlines)
- User preferences (communication style, priorities, working hours)
- Business facts explicitly stated by the user

Rules:
- Only extract factual information, not opinions or speculation
- Be specific and concise
- Subject should be the client/project name when applicable
- Confidence should be high (0.8+) for explicit statements, lower for inferred

Conversation:
{messages}

Extracted memories (JSON array only, no other text):`;

  constructor(
    private readonly memoryService: MemoryService,
    private readonly memoryEmbeddingService: MemoryEmbeddingService,
    private readonly llmConfigService: LlmConfigService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Extracts memories from conversation messages.
   * Called asynchronously after conversation turns.
   *
   * @param messages - Conversation messages to analyze
   * @param userId - User who owns the conversation
   * @param tenantId - Tenant for isolation
   * @returns Array of extracted and saved memories
   */
  async extractMemories(
    messages: Message[],
    userId: string,
    tenantId: string,
    options?: { conceptName?: string }
  ): Promise<ExtractedMemory[]> {
    if (messages.length < 2) {
      this.logger.debug({
        message: 'Skipping extraction - insufficient messages',
        userId,
        tenantId,
        messageCount: messages.length,
      });
      return [];
    }

    try {
      // Format messages for the prompt
      const formattedMessages = this.formatMessages(messages);
      let prompt = this.EXTRACTION_PROMPT.replace('{messages}', formattedMessages);

      // Story 3.3: Add concept context for better tagging
      if (options?.conceptName) {
        prompt += `\n\nContext: This conversation is about the business concept "${options.conceptName}". Use this as the subject for extracted memories when relevant.`;
      }

      // Call LLM for extraction
      const extractedRaw = await this.callLlmForExtraction(prompt, tenantId, userId);

      if (!extractedRaw || extractedRaw.length === 0) {
        this.logger.debug({
          message: 'No memories extracted',
          userId,
          tenantId,
        });
        return [];
      }

      // Deduplicate against existing memories
      const deduplicated = await this.deduplicateMemories(extractedRaw, userId, tenantId);

      // Save new memories and generate embeddings
      const savedMemories: ExtractedMemory[] = [];
      for (const memory of deduplicated) {
        try {
          // Story 3.3: Default subject to concept name for concept-tagged memories
          const effectiveSubject = memory.subject || options?.conceptName || undefined;

          const saved = await this.memoryService.createMemory(tenantId, userId, {
            type: memory.type as MemoryType,
            source: 'AI_EXTRACTED' as MemorySource,
            content: memory.content,
            subject: effectiveSubject,
            confidence: memory.confidence,
            sourceMessageId: messages[messages.length - 1]?.id,
          });

          // Generate embedding for semantic search (async, non-blocking)
          this.memoryEmbeddingService
            .generateAndStoreEmbedding(tenantId, saved.id, saved.content, {
              userId,
              type: saved.type,
              subject: saved.subject,
            })
            .catch((error) => {
              this.logger.warn({
                message: 'Failed to generate embedding for memory',
                memoryId: saved.id,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            });

          savedMemories.push(memory);
        } catch (error) {
          this.logger.warn({
            message: 'Failed to save extracted memory',
            content: memory.content.substring(0, 50),
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      this.logger.log({
        message: 'Memories extracted and saved',
        userId,
        tenantId,
        extractedCount: extractedRaw.length,
        savedCount: savedMemories.length,
        deduplicatedCount: extractedRaw.length - deduplicated.length,
      });

      return savedMemories;
    } catch (error) {
      this.logger.error({
        message: 'Memory extraction failed',
        userId,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Calls LLM to extract memories from the prompt.
   */
  private async callLlmForExtraction(
    prompt: string,
    _tenantId: string,
    _userId: string
  ): Promise<ExtractedMemory[]> {
    try {
      const config = await this.llmConfigService.getConfig();
      if (!config.primaryProvider) {
        this.logger.warn({
          message: 'No LLM provider configured for extraction',
        });
        return [];
      }

      const apiKey = await this.llmConfigService.getDecryptedApiKey(
        config.primaryProvider.providerType as LlmProviderType
      );

      if (!apiKey) {
        this.logger.warn({
          message: 'No API key available for extraction',
        });
        return [];
      }

      // Use non-streaming completion for extraction
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': this.configService.get<string>('APP_URL') ?? 'http://localhost:4200',
          'X-Title': 'Mentor AI - Memory Extraction',
        },
        body: JSON.stringify({
          model: config.primaryProvider.modelId,
          messages: [
            {
              role: 'system',
              content:
                'You are a memory extraction assistant. Extract factual information from conversations and return JSON only.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1, // Low temperature for consistent extraction
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API returned ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        return [];
      }

      // Parse JSON response
      const extracted = this.parseExtractionResponse(content);
      return extracted;
    } catch (error) {
      this.logger.error({
        message: 'LLM extraction call failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Parses the LLM extraction response.
   */
  private parseExtractionResponse(content: string): ExtractedMemory[] {
    try {
      // Try to extract JSON array from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        type?: string;
        content?: string;
        subject?: string;
        confidence?: number;
      }>;

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((item) => item.type && item.content)
        .map((item) => ({
          type: this.normalizeMemoryType(item.type!),
          content: item.content!,
          subject: item.subject,
          confidence: Math.min(Math.max(item.confidence ?? 0.8, 0), 1),
        }));
    } catch (error) {
      this.logger.warn({
        message: 'Failed to parse extraction response',
        contentPreview: content.substring(0, 100),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Normalizes memory type string to enum value.
   */
  private normalizeMemoryType(type: string): MemoryType {
    const typeMap: Record<string, MemoryType> = {
      CLIENT_CONTEXT: 'CLIENT_CONTEXT' as MemoryType,
      PROJECT_CONTEXT: 'PROJECT_CONTEXT' as MemoryType,
      USER_PREFERENCE: 'USER_PREFERENCE' as MemoryType,
      FACTUAL_STATEMENT: 'FACTUAL_STATEMENT' as MemoryType,
    };
    return typeMap[type.toUpperCase()] ?? ('FACTUAL_STATEMENT' as MemoryType);
  }

  /**
   * Deduplicates new memories against existing ones.
   * Uses semantic similarity to avoid storing duplicate facts.
   */
  private async deduplicateMemories(
    newMemories: ExtractedMemory[],
    userId: string,
    tenantId: string
  ): Promise<ExtractedMemory[]> {
    if (newMemories.length === 0) {
      return [];
    }

    try {
      // Get existing memories for comparison
      const { data: existing } = await this.memoryService.findMemories(tenantId, userId, {
        limit: 100,
      });

      if (existing.length === 0) {
        return newMemories;
      }

      // Filter out duplicates using simple text similarity
      return newMemories.filter((newMem) => {
        const isDuplicate = existing.some((existingMem) => {
          const similarity = this.calculateTextSimilarity(
            newMem.content.toLowerCase(),
            existingMem.content.toLowerCase()
          );
          return similarity > this.DEDUP_THRESHOLD;
        });
        return !isDuplicate;
      });
    } catch (error) {
      this.logger.warn({
        message: 'Deduplication failed, proceeding with all memories',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return newMemories;
    }
  }

  /**
   * Calculates simple text similarity using Jaccard index.
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(/\s+/).filter((w) => w.length > 2));
    const words2 = new Set(text2.split(/\s+/).filter((w) => w.length > 2));

    if (words1.size === 0 && words2.size === 0) {
      return 1;
    }

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Formats messages for the extraction prompt.
   */
  private formatMessages(messages: Message[]): string {
    return messages
      .map((m) => `${m.role === 'USER' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
  }
}
