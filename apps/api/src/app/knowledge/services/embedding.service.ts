import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { LlmConfigService } from '../../llm-config/llm-config.service';
import { QdrantClientService } from '../../qdrant/qdrant-client.service';
import { LlmProviderType } from '@mentor-ai/shared/types';

/**
 * Embedding vector result.
 */
export interface EmbeddingResult {
  /** Unique ID for the embedding */
  embeddingId: string;
  /** The embedding vector (768 dimensions) */
  vector: number[];
}

/**
 * Semantic search match result.
 */
export interface SemanticMatch {
  /** Concept ID */
  conceptId: string;
  /** Similarity score (0.0-1.0) */
  score: number;
  /** Concept name from payload */
  name: string;
}

/**
 * Interface for embedding service operations.
 */
export interface IEmbeddingService {
  embed(text: string): Promise<EmbeddingResult>;
  store(conceptId: string, vector: number[], payload: Record<string, unknown>): Promise<string>;
  search(
    query: string | number[],
    limit: number,
    filter?: Record<string, unknown>
  ): Promise<SemanticMatch[]>;
  delete(embeddingId: string): Promise<void>;
}

/**
 * Embedding API response shape (OpenAI-compatible, used by LM Studio).
 */
interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/** Default LM Studio endpoint when not configured in DB */
const DEFAULT_LM_STUDIO_ENDPOINT = 'http://127.0.0.1:1234';

/**
 * Embedding service using LM Studio nomic-embed-text (768-dim) + Qdrant Cloud.
 *
 * - embed(): Calls LM Studio local API to generate 768-dim embeddings
 * - store(): Upserts embedding vector to Qdrant 'concepts' collection
 * - search(): Cosine similarity search via Qdrant
 * - delete(): Removes point from Qdrant collection
 */
@Injectable()
export class EmbeddingService implements IEmbeddingService, OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly EMBEDDING_MODEL = 'text-embedding-nomic-embed-text-v1.5';
  private readonly EMBEDDING_DIMENSIONS = 768;
  private readonly COLLECTION_NAME = 'concepts';

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly llmConfigService: LlmConfigService,
    private readonly qdrantClient: QdrantClientService
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.qdrantClient.isAvailable()) {
      this.logger.warn('Qdrant not available — concept embeddings disabled');
      return;
    }
    try {
      await this.qdrantClient.ensureCollection(this.COLLECTION_NAME, this.EMBEDDING_DIMENSIONS);
    } catch (error) {
      this.logger.warn({
        message: 'Failed to ensure Qdrant concepts collection (non-fatal)',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Generates an embedding for text content using LM Studio local API.
   */
  async embed(text: string): Promise<EmbeddingResult> {
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
        const errorText = await response.text();
        this.logger.error({
          message: 'LM Studio embedding API error',
          status: response.status,
          error: errorText,
        });
        return {
          embeddingId: `emb_error_${Date.now()}`,
          vector: new Array(this.EMBEDDING_DIMENSIONS).fill(0),
        };
      }

      const data = (await response.json()) as EmbeddingResponse;
      const first = data.data[0];
      if (!first) {
        return {
          embeddingId: `emb_error_${Date.now()}`,
          vector: new Array(this.EMBEDDING_DIMENSIONS).fill(0),
        };
      }
      const vector = first.embedding;

      this.logger.debug({
        message: 'Embedding generated via LM Studio',
        model: data.model,
        dimensions: vector.length,
        tokensUsed: data.usage?.total_tokens,
      });

      return {
        embeddingId: `emb_${Date.now()}`,
        vector,
      };
    } catch (error) {
      this.logger.error({
        message: 'Failed to generate embedding via LM Studio',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        embeddingId: `emb_error_${Date.now()}`,
        vector: new Array(this.EMBEDDING_DIMENSIONS).fill(0),
      };
    }
  }

  /**
   * Stores an embedding in the Qdrant 'concepts' collection.
   * Uses a deterministic UUID from the conceptId for idempotent upserts.
   */
  async store(
    conceptId: string,
    vector: number[],
    payload: Record<string, unknown>
  ): Promise<string> {
    const pointId = this.conceptIdToUuid(conceptId);

    try {
      const client = this.qdrantClient.getClient();
      await client.upsert(this.COLLECTION_NAME, {
        wait: true,
        points: [
          {
            id: pointId,
            vector,
            payload: {
              conceptId,
              name: (payload['name'] as string) ?? '',
              category: (payload['category'] as string) ?? '',
              departmentTags: (payload['departmentTags'] as string[]) ?? [],
            },
          },
        ],
      });

      // Store the Qdrant point UUID in the database
      await this.prisma.concept.update({
        where: { id: conceptId },
        data: { embeddingId: pointId },
      });

      this.logger.debug({
        message: 'Embedding stored in Qdrant',
        conceptId,
        pointId,
        dimensions: vector.length,
      });

      return pointId;
    } catch (error) {
      this.logger.error({
        message: 'Failed to store embedding in Qdrant',
        conceptId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Searches for similar concepts using cosine similarity via Qdrant.
   */
  async search(
    query: string | number[],
    limit: number,
    filter?: Record<string, unknown>
  ): Promise<SemanticMatch[]> {
    if (!this.qdrantClient.isAvailable()) {
      return [];
    }

    let queryVector: number[];

    if (typeof query === 'string') {
      const embeddingResult = await this.embed(query);
      if (embeddingResult.vector.every((v) => v === 0)) {
        this.logger.warn('Embedding generation failed, returning empty search results');
        return [];
      }
      queryVector = embeddingResult.vector;
    } else {
      queryVector = query;
    }

    try {
      const client = this.qdrantClient.getClient();

      // Build Qdrant filter for department tags if provided
      const qdrantFilter = filter?.department
        ? {
            must: [
              {
                key: 'departmentTags' as const,
                match: { any: [String(filter.department)] },
              },
            ],
          }
        : undefined;

      const results = await client.search(this.COLLECTION_NAME, {
        vector: queryVector,
        limit,
        filter: qdrantFilter,
        with_payload: true,
      });

      this.logger.debug({
        message: 'Semantic search completed via Qdrant',
        resultCount: results.length,
        topScore: results.length > 0 ? (results[0]?.score ?? null) : null,
        hasDepartmentFilter: !!filter?.department,
      });

      return results.map((r) => ({
        conceptId: (r.payload?.['conceptId'] as string) ?? '',
        score: r.score,
        name: (r.payload?.['name'] as string) ?? '',
      }));
    } catch (error) {
      this.logger.error({
        message: 'Qdrant semantic search failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Removes an embedding from the Qdrant collection.
   */
  async delete(embeddingId: string): Promise<void> {
    if (!this.qdrantClient.isAvailable()) return;

    try {
      const client = this.qdrantClient.getClient();
      await client.delete(this.COLLECTION_NAME, {
        wait: true,
        points: [embeddingId],
      });

      this.logger.debug({
        message: 'Embedding deleted from Qdrant',
        pointId: embeddingId,
      });
    } catch (error) {
      this.logger.error({
        message: 'Failed to delete embedding from Qdrant',
        pointId: embeddingId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Deterministic UUID from conceptId using MD5 hash.
   * Ensures re-seeding overwrites the same point rather than creating duplicates.
   */
  private conceptIdToUuid(conceptId: string): string {
    const hash = createHash('md5').update(conceptId).digest('hex');
    return [
      hash.slice(0, 8),
      hash.slice(8, 12),
      hash.slice(12, 16),
      hash.slice(16, 20),
      hash.slice(20, 32),
    ].join('-');
  }
}
