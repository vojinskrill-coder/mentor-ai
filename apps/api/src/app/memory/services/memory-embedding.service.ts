import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemoryService } from './memory.service';
import { QdrantClientService } from '../../qdrant/qdrant-client.service';
import { LlmConfigService } from '../../llm-config/llm-config.service';
import { LlmProviderType } from '@mentor-ai/shared/types';
import type { MemoryType } from '@mentor-ai/shared/types';

/**
 * Semantic search result for memory.
 */
export interface MemorySearchResult {
  memoryId: string;
  score: number;
  content: string;
  subject?: string;
  type: MemoryType;
}

/** Default LM Studio endpoint when not configured in DB */
const DEFAULT_LM_STUDIO_ENDPOINT = 'http://127.0.0.1:1234';

/**
 * Service for generating and managing memory embeddings.
 * Integrates with Qdrant Cloud for vector storage and semantic search.
 *
 * Collections are per-tenant: `memories_${tenantId}`
 * Dimensions: 768 (nomic-embed-text-v1.5)
 *
 * Story 2.7: Persistent Memory Across Conversations
 */
@Injectable()
export class MemoryEmbeddingService {
  private readonly logger = new Logger(MemoryEmbeddingService.name);

  /** Default similarity threshold for semantic search */
  private readonly DEFAULT_THRESHOLD = 0.7;

  /** Embedding dimension (768 for nomic-embed-text-v1.5) */
  private readonly EMBEDDING_DIMENSION = 768;

  /** LM Studio model for embedding generation */
  private readonly EMBEDDING_MODEL = 'text-embedding-nomic-embed-text-v1.5';

  constructor(
    private readonly memoryService: MemoryService,
    private readonly configService: ConfigService,
    private readonly qdrantClient: QdrantClientService,
    private readonly llmConfigService: LlmConfigService
  ) {}

  /**
   * Returns the Qdrant collection name for a tenant's memories.
   */
  private collectionName(tenantId: string): string {
    return `memories_${tenantId}`;
  }

  /**
   * Ensures the tenant's memory collection exists in Qdrant.
   */
  async ensureCollection(tenantId: string): Promise<void> {
    if (!this.qdrantClient.isAvailable()) return;
    await this.qdrantClient.ensureCollection(
      this.collectionName(tenantId),
      this.EMBEDDING_DIMENSION
    );
  }

  /**
   * Generates an embedding for memory content and stores it in Qdrant.
   *
   * @param tenantId - Tenant ID for collection scoping
   * @param memoryId - Memory ID to associate
   * @param content - Text content to embed
   * @param metadata - Additional metadata for the vector
   * @returns Embedding ID (Qdrant point UUID)
   */
  async generateAndStoreEmbedding(
    tenantId: string,
    memoryId: string,
    content: string,
    metadata: {
      userId: string;
      type: MemoryType;
      subject?: string;
    }
  ): Promise<string> {
    this.logger.debug({
      message: 'Generating embedding for memory',
      memoryId,
      tenantId,
      contentLength: content.length,
    });

    if (!this.qdrantClient.isAvailable()) {
      this.logger.warn('Qdrant not available — skipping memory embedding');
      const fallbackId = `emb_${memoryId}_${Date.now()}`;
      await this.memoryService.updateEmbeddingId(tenantId, memoryId, fallbackId);
      return fallbackId;
    }

    const vector = await this.embedText(content);
    if (!vector) {
      this.logger.warn({ message: 'Embedding generation failed, skipping', memoryId });
      const fallbackId = `emb_failed_${memoryId}`;
      await this.memoryService.updateEmbeddingId(tenantId, memoryId, fallbackId);
      return fallbackId;
    }

    await this.ensureCollection(tenantId);

    const pointId = crypto.randomUUID();
    const client = this.qdrantClient.getClient();

    await client.upsert(this.collectionName(tenantId), {
      wait: true,
      points: [
        {
          id: pointId,
          vector,
          payload: {
            memoryId,
            userId: metadata.userId,
            type: metadata.type,
            subject: metadata.subject ?? null,
            content,
            createdAt: new Date().toISOString(),
          },
        },
      ],
    });

    // Store Qdrant point UUID in the database
    await this.memoryService.updateEmbeddingId(tenantId, memoryId, pointId);

    this.logger.log({
      message: 'Memory embedding generated and stored',
      memoryId,
      tenantId,
      pointId,
    });

    return pointId;
  }

  /**
   * Searches for similar memories using semantic similarity via Qdrant.
   */
  async semanticSearch(
    tenantId: string,
    userId: string,
    query: string,
    limit = 10,
    threshold: number = this.DEFAULT_THRESHOLD
  ): Promise<MemorySearchResult[]> {
    this.logger.debug({
      message: 'Performing semantic search for memories',
      tenantId,
      userId,
      queryLength: query.length,
      limit,
      threshold,
    });

    if (!this.qdrantClient.isAvailable()) {
      return this.keywordFallback(tenantId, userId, query, limit);
    }

    const vector = await this.embedText(query);
    if (!vector) {
      this.logger.warn({ message: 'Query embedding failed, using keyword fallback' });
      return this.keywordFallback(tenantId, userId, query, limit);
    }

    try {
      const client = this.qdrantClient.getClient();
      const results = await client.search(this.collectionName(tenantId), {
        vector,
        limit,
        filter: {
          must: [{ key: 'userId', match: { value: userId } }],
        },
        with_payload: true,
        score_threshold: threshold,
      });

      return results.map((r) => ({
        memoryId: (r.payload?.['memoryId'] as string) ?? '',
        score: r.score,
        content: (r.payload?.['content'] as string) ?? '',
        subject: (r.payload?.['subject'] as string) ?? undefined,
        type: (r.payload?.['type'] as MemoryType) ?? ('FACTUAL_STATEMENT' as MemoryType),
      }));
    } catch (error) {
      this.logger.warn({
        message: 'Qdrant memory search failed, using keyword fallback',
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return this.keywordFallback(tenantId, userId, query, limit);
    }
  }

  /**
   * Performs hybrid search combining vector and keyword matching.
   * Useful for finding client names mentioned exactly.
   */
  async hybridSearch(
    tenantId: string,
    userId: string,
    query: string,
    limit = 10
  ): Promise<MemorySearchResult[]> {
    this.logger.debug({
      message: 'Performing hybrid search for memories',
      tenantId,
      userId,
      query: query.substring(0, 50),
      limit,
    });

    // Extract potential client/project names (capitalized words)
    const potentialNames = query.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];

    // Get semantic search results
    const semanticResults = await this.semanticSearch(tenantId, userId, query, limit);

    // Get keyword matches for extracted names
    const keywordResults: MemorySearchResult[] = [];
    for (const name of potentialNames.slice(0, 3)) {
      const memories = await this.memoryService.findRelevantMemories(tenantId, userId, name, 5);

      for (const memory of memories) {
        if (memory.subject?.toLowerCase().includes(name.toLowerCase())) {
          keywordResults.push({
            memoryId: memory.id,
            score: 0.95,
            content: memory.content,
            subject: memory.subject,
            type: memory.type,
          });
        }
      }
    }

    // Combine and deduplicate results
    const combined = [...keywordResults, ...semanticResults];
    const seen = new Set<string>();
    const deduplicated: MemorySearchResult[] = [];

    for (const result of combined) {
      if (!seen.has(result.memoryId)) {
        seen.add(result.memoryId);
        deduplicated.push(result);
      }
    }

    return deduplicated.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Deletes an embedding from Qdrant.
   */
  async deleteEmbedding(tenantId: string, embeddingId: string): Promise<void> {
    if (!this.qdrantClient.isAvailable()) return;

    try {
      const client = this.qdrantClient.getClient();
      await client.delete(this.collectionName(tenantId), {
        wait: true,
        points: [embeddingId],
      });
      this.logger.debug({ message: 'Memory embedding deleted', tenantId, embeddingId });
    } catch (error) {
      this.logger.error({
        message: 'Failed to delete memory embedding',
        tenantId,
        embeddingId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Generates an embedding vector using LM Studio nomic-embed-text (768-dim).
   */
  private async embedText(text: string): Promise<number[] | null> {
    const endpoint =
      (await this.llmConfigService.getProviderEndpoint(LlmProviderType.LM_STUDIO)) ??
      DEFAULT_LM_STUDIO_ENDPOINT;

    try {
      const response = await fetch(`${endpoint}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.EMBEDDING_MODEL,
          input: text,
        }),
      });

      if (!response.ok) {
        this.logger.error({
          message: 'LM Studio embedding API error',
          status: response.status,
        });
        return null;
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
      };
      return data.data[0]?.embedding ?? null;
    } catch (error) {
      this.logger.error({
        message: 'Failed to generate embedding via LM Studio',
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return null;
    }
  }

  /**
   * Keyword-based fallback when Qdrant is unavailable.
   */
  private async keywordFallback(
    tenantId: string,
    userId: string,
    query: string,
    limit: number
  ): Promise<MemorySearchResult[]> {
    const memories = await this.memoryService.findRelevantMemories(tenantId, userId, query, limit);
    return memories.map((memory, index) => ({
      memoryId: memory.id,
      score: 0.9 - index * 0.05,
      content: memory.content,
      subject: memory.subject,
      type: memory.type,
    }));
  }
}
