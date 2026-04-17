import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { QdrantClientService } from '../../qdrant/qdrant-client.service';

/**
 * Embedding vector result.
 */
export interface EmbeddingResult {
  /** Unique ID for the embedding */
  embeddingId: string;
  /** The embedding vector (1536 dimensions for OpenAI text-embedding-3-small) */
  vector: number[];
  /** True if the embedding was generated from an error fallback (zero-vector) */
  error?: boolean;
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

/** OpenAI API endpoint for embeddings */
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

/** HTTP status codes that are transient and worth retrying */
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** Network error codes that are transient */
const TRANSIENT_ERROR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT']);

/** Cache entry with TTL */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Determines if an error is transient (worth retrying).
 */
function isTransientError(error: unknown, httpStatus?: number): boolean {
  if (httpStatus && TRANSIENT_STATUS_CODES.has(httpStatus)) return true;
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && TRANSIENT_ERROR_CODES.has(code)) return true;
    // fetch network errors
    if (error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT')) return true;
  }
  return false;
}

/**
 * Exponential backoff: min(baseMs * 2^attempt, maxMs) ± 25% jitter
 */
function exponentialBackoff(attempt: number, baseMs = 1000, maxMs = 8000): number {
  const delay = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = delay * 0.25 * (Math.random() * 2 - 1); // ±25%
  return Math.max(0, delay + jitter);
}

/**
 * Sleeps for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Embedding service using OpenAI text-embedding-3-small (1536-dim) + Qdrant Cloud.
 *
 * - embed(): Calls OpenAI API to generate 1536-dim embeddings
 * - store(): Upserts embedding vector to Qdrant 'concepts' collection
 * - search(): Cosine similarity search via Qdrant
 * - delete(): Removes point from Qdrant collection
 */
@Injectable()
export class EmbeddingService implements IEmbeddingService, OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly EMBEDDING_MODEL = 'text-embedding-3-small';
  private readonly EMBEDDING_DIMENSIONS = 1536;
  private readonly COLLECTION_NAME = 'concepts';
  private readonly EMBED_MAX_RETRIES = 2;
  private readonly EMBED_BASE_BACKOFF_MS = 1000;
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  /** Cache for search results to avoid redundant embedding API calls */
  private readonly searchCache = new Map<string, CacheEntry<SemanticMatch[]>>();

  constructor(
    private readonly prisma: PlatformPrismaService,
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
   * Generates an embedding for text content using OpenAI API.
   * Retries transient errors (429, 500-504, ECONNRESET, ETIMEDOUT) with exponential backoff.
   * Returns error: true on failure so callers can distinguish real embeddings from fallbacks.
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY not set — cannot generate embeddings');
      return {
        embeddingId: `emb_error_${Date.now()}`,
        vector: new Array(this.EMBEDDING_DIMENSIONS).fill(0),
        error: true,
      };
    }

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= this.EMBED_MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(OPENAI_EMBEDDINGS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: this.EMBEDDING_MODEL,
            input: text,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          const status = response.status;

          // Retry transient HTTP errors
          if (isTransientError(null, status) && attempt < this.EMBED_MAX_RETRIES) {
            const backoff = exponentialBackoff(attempt, this.EMBED_BASE_BACKOFF_MS);
            this.logger.warn({
              message: `OpenAI embedding API transient error, retrying (attempt ${attempt + 1}/${this.EMBED_MAX_RETRIES})`,
              status,
              backoffMs: Math.round(backoff),
            });
            await sleep(backoff);
            continue;
          }

          // Fatal HTTP error or retries exhausted
          this.logger.error({
            message: 'OpenAI embedding API error (non-retryable or retries exhausted)',
            status,
            error: errorText,
            attempt,
          });
          return {
            embeddingId: `emb_error_${Date.now()}`,
            vector: new Array(this.EMBEDDING_DIMENSIONS).fill(0),
            error: true,
          };
        }

        const data = (await response.json()) as EmbeddingResponse;
        const first = data.data[0];
        if (!first) {
          this.logger.error('OpenAI embedding response contained no data entries');
          return {
            embeddingId: `emb_error_${Date.now()}`,
            vector: new Array(this.EMBEDDING_DIMENSIONS).fill(0),
            error: true,
          };
        }
        const vector = first.embedding;

        this.logger.debug({
          message: 'Embedding generated via OpenAI',
          model: data.model,
          dimensions: vector.length,
          tokensUsed: data.usage?.total_tokens,
          attempt,
        });

        return {
          embeddingId: `emb_${Date.now()}`,
          vector,
        };
      } catch (error) {
        lastError = error;

        // Retry transient network errors
        if (isTransientError(error) && attempt < this.EMBED_MAX_RETRIES) {
          const backoff = exponentialBackoff(attempt, this.EMBED_BASE_BACKOFF_MS);
          this.logger.warn({
            message: `OpenAI embedding network error, retrying (attempt ${attempt + 1}/${this.EMBED_MAX_RETRIES})`,
            error: error instanceof Error ? error.message : 'Unknown error',
            backoffMs: Math.round(backoff),
          });
          await sleep(backoff);
          continue;
        }

        // Fatal or retries exhausted
        break;
      }
    }

    this.logger.error({
      message: 'Failed to generate embedding via OpenAI after all retries',
      error: lastError instanceof Error ? lastError.message : 'Unknown error',
      maxRetries: this.EMBED_MAX_RETRIES,
    });
    return {
      embeddingId: `emb_error_${Date.now()}`,
      vector: new Array(this.EMBEDDING_DIMENSIONS).fill(0),
      error: true,
    };
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
              tenantId: (payload['tenantId'] as string) ?? '',
              name: (payload['name'] as string) ?? '',
              category: (payload['category'] as string) ?? '',
              departmentTags: (payload['departmentTags'] as string[]) ?? [],
              tier: (payload['tier'] as string) ?? '',
              confidence: (payload['confidence'] as number) ?? 0,
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
   * Caches results for string queries (10-minute TTL) to avoid redundant embedding calls.
   */
  async search(
    query: string | number[],
    limit: number,
    filter?: Record<string, unknown>
  ): Promise<SemanticMatch[]> {
    if (!this.qdrantClient.isAvailable()) {
      return [];
    }

    // Check cache for string queries
    const cacheKey = typeof query === 'string'
      ? `${query}|${limit}|${JSON.stringify(filter ?? {})}`
      : null;

    if (cacheKey) {
      const cached = this.searchCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        this.logger.debug({ message: 'Search cache hit', cacheKey: cacheKey.substring(0, 80) });
        return cached.value;
      }
      // Clean expired entry
      if (cached) this.searchCache.delete(cacheKey);
    }

    let queryVector: number[];

    if (typeof query === 'string') {
      const embeddingResult = await this.embed(query);
      if (embeddingResult.error) {
        this.logger.warn('Embedding generation failed (error flag set), returning empty search results');
        return [];
      }
      queryVector = embeddingResult.vector;
    } else {
      queryVector = query;
    }

    try {
      const client = this.qdrantClient.getClient();

      // Use per-tenant collection if tenantId provided, else shared collection
      const collectionName = filter?.tenantId
        ? `concepts-${filter.tenantId}`
        : this.COLLECTION_NAME;

      // Build Qdrant filter using proper JS client format
      const mustConditions: Array<{ key: string; match: { value: string } | { any: string[] } }> = [];

      if (filter?.tenantId) {
        mustConditions.push({
          key: 'tenantId',
          match: { value: String(filter.tenantId) },
        });
      }

      if (filter?.department) {
        mustConditions.push({
          key: 'departmentTags',
          match: { any: [String(filter.department)] },
        });
      }

      const qdrantFilter = mustConditions.length > 0
        ? { must: mustConditions }
        : undefined;

      // Try per-tenant collection first, fall back to shared if not found
      let results;
      try {
        results = await client.search(collectionName, {
          vector: queryVector,
          limit,
          filter: qdrantFilter,
          with_payload: true,
        });
      } catch (collErr) {
        // Per-tenant collection may not exist yet — fall back to shared
        if (collectionName !== this.COLLECTION_NAME) {
          results = await client.search(this.COLLECTION_NAME, {
            vector: queryVector,
            limit,
            filter: qdrantFilter,
            with_payload: true,
          });
        } else {
          throw collErr;
        }
      }

      this.logger.debug({
        message: 'Semantic search completed via Qdrant',
        resultCount: results.length,
        topScore: results.length > 0 ? (results[0]?.score ?? null) : null,
        hasDepartmentFilter: !!filter?.department,
      });

      const mapped = results.map((r) => ({
        conceptId: (r.payload?.['conceptId'] as string) ?? '',
        score: r.score,
        name: (r.payload?.['name'] as string) ?? '',
      }));

      // Cache the result
      if (cacheKey) {
        this.searchCache.set(cacheKey, {
          value: mapped,
          expiresAt: Date.now() + this.CACHE_TTL_MS,
        });
        // Evict old entries periodically (keep cache bounded)
        if (this.searchCache.size > 100) {
          this.evictExpiredCacheEntries();
        }
      }

      return mapped;
    } catch (error) {
      this.logger.error({
        message: 'Qdrant semantic search failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Removes expired entries from the search cache.
   */
  private evictExpiredCacheEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.searchCache) {
      if (entry.expiresAt <= now) {
        this.searchCache.delete(key);
      }
    }
  }

  /**
   * Batch-embeds an array of concepts into Qdrant.
   * Uses OpenAI batch embedding (up to 50 texts per API call) for efficiency.
   * Returns the number of successfully embedded concepts.
   */
  async embedBatch(
    concepts: Array<{ id: string; name: string; category: string; definition: string | null; departmentTags: string[]; tenantId?: string }>,
    batchSize = 50,
  ): Promise<number> {
    if (!this.qdrantClient.isAvailable()) {
      this.logger.warn('Qdrant not available — skipping batch embedding');
      return 0;
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY not set — cannot batch embed');
      return 0;
    }

    let embedded = 0;

    for (let i = 0; i < concepts.length; i += batchSize) {
      const batch = concepts.slice(i, i + batchSize);
      const texts = batch.map((c) => `${c.name} (${c.category}): ${c.definition ?? c.name}`);

      try {
        const response = await fetch(OPENAI_EMBEDDINGS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: this.EMBEDDING_MODEL,
            input: texts,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          this.logger.error({ message: 'OpenAI batch embed failed', status: response.status, error: errText.slice(0, 200) });
          continue;
        }

        const data = (await response.json()) as {
          data: Array<{ embedding: number[]; index: number }>;
        };

        // Build Qdrant points
        const points = data.data.map((item) => {
          const concept = batch[item.index]!;
          return {
            id: this.conceptIdToUuid(concept.id),
            vector: item.embedding,
            payload: {
              conceptId: concept.id,
              tenantId: concept.tenantId ?? '',
              name: concept.name,
              category: concept.category,
              departmentTags: concept.departmentTags,
            },
          };
        });

        // Upsert all points in one call
        const client = this.qdrantClient.getClient();
        await client.upsert(this.COLLECTION_NAME, { wait: true, points });

        // Update embeddingId in PostgreSQL
        await this.prisma.$transaction(
          points.map((p) =>
            this.prisma.concept.update({
              where: { id: (p.payload as { conceptId: string }).conceptId },
              data: { embeddingId: p.id },
            }),
          ),
        );

        embedded += batch.length;
        if (embedded % 100 === 0 || i + batchSize >= concepts.length) {
          this.logger.log(`Batch embedding progress: ${embedded}/${concepts.length}`);
        }
      } catch (err) {
        this.logger.error({
          message: 'Batch embedding error',
          batchStart: i,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    return embedded;
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
