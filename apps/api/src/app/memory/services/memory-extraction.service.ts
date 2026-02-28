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
  private readonly EXTRACTION_PROMPT = `Analiziraj sledeći razgovor i ekstrahuj ključne poslovne činjenice koje treba zapamtiti.
Vrati JSON niz ekstrahovanih memorija sa sledećom strukturom:
{ "type": "CLIENT_CONTEXT" | "PROJECT_CONTEXT" | "USER_PREFERENCE" | "FACTUAL_STATEMENT",
  "content": "konkretna činjenica na srpskom jeziku",
  "subject": "naziv klijenta/projekta/koncepta ako je primenjivo",
  "confidence": 0.0-1.0 }

Fokusiraj se na:
- Poslovne odluke i strateške pravce (investicije, ekspanzija, pivotiranje)
- Tržišne podatke (konkurencija, ciljno tržište, cene, trendovi)
- Klijente i partnere (imena, industrija, veličina, budžet, specifični zahtevi)
- Projekte i rokove (timeline, budžet, zahtevi, milestones, KPI)
- Prioritete i preferencije vlasnika (stil komunikacije, fokus oblasti, radni model)
- Finansijske podatke (prihodi, troškovi, marže, targeti)
- Probleme i izazove koje je korisnik eksplicitno naveo
- Resurse i kapacitete (tim, tehnologija, infrastruktura)

Pravila:
- Ekstrahuj SAMO činjenične informacije, ne mišljenja ili spekulacije AI-a
- Budi specifičan i koncizan — svaka memorija max 2 rečenice
- Subject treba da bude naziv klijenta, projekta ili poslovnog koncepta
- Confidence 0.9+ za eksplicitne izjave korisnika, 0.7-0.8 za implicirane činjenice
- NE ekstrahuj generičke poslovne savete — samo činjenice specifične za OVO poslovanje
- Piši content na srpskom jeziku

Razgovor:
{messages}

Ekstrahovane memorije (SAMO JSON niz, bez dodatnog teksta):`;

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
        prompt += `\n\nKontekst: Ovaj razgovor se odnosi na poslovni koncept "${options.conceptName}". Koristi ovo kao subject za ekstrahovane memorije kada je relevantno.`;
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

      // Route to correct provider endpoint
      const providerType = config.primaryProvider.providerType as LlmProviderType;
      const endpointMap: Record<string, string> = {
        [LlmProviderType.OPENROUTER]: 'https://openrouter.ai/api/v1/chat/completions',
        [LlmProviderType.DEEPSEEK]: 'https://api.deepseek.com/v1/chat/completions',
        [LlmProviderType.OPENAI]: 'https://api.openai.com/v1/chat/completions',
        [LlmProviderType.ANTHROPIC]: 'https://api.anthropic.com/v1/messages',
        [LlmProviderType.LM_STUDIO]: `${config.primaryProvider.endpoint || 'http://localhost:1234'}/v1/chat/completions`,
        [LlmProviderType.LOCAL_LLAMA]: `${config.primaryProvider.endpoint || 'http://localhost:11434'}/v1/chat/completions`,
      };
      const url = endpointMap[providerType];
      if (!url) {
        this.logger.warn({ message: `Unsupported provider for extraction: ${providerType}` });
        return [];
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      };
      // OpenRouter requires extra headers
      if (providerType === LlmProviderType.OPENROUTER) {
        headers['HTTP-Referer'] =
          this.configService.get<string>('APP_URL') ?? 'http://localhost:4200';
        headers['X-Title'] = 'Mentor AI - Memory Extraction';
      }

      // Use non-streaming completion for extraction
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.primaryProvider.modelId,
          messages: [
            {
              role: 'system',
              content:
                'Ti si asistent za ekstrakciju poslovnih memorija. Ekstrahuj činjenične informacije iz razgovora i vrati ISKLJUČIVO JSON.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1,
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
      .map((m) => `${m.role === 'USER' ? 'KORISNIK' : 'AI'}: ${m.content}`)
      .join('\n\n');
  }
}
