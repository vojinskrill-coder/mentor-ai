import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

/**
 * Shared Qdrant client service.
 * Provides a singleton QdrantClient instance and collection management utilities.
 * Used by EmbeddingService (concepts) and MemoryEmbeddingService (memories).
 */
@Injectable()
export class QdrantClientService implements OnModuleInit {
  private readonly logger = new Logger(QdrantClientService.name);
  private client: QdrantClient | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.configService.get<string>('QDRANT_URL');
    const apiKey = this.configService.get<string>('QDRANT_API_KEY');

    if (!url) {
      this.logger.warn('QDRANT_URL not configured — vector operations will be unavailable');
      return;
    }

    this.client = new QdrantClient({ url, apiKey: apiKey || undefined });
    this.logger.log({ message: 'Qdrant client initialized', url });
  }

  /**
   * Returns the Qdrant client instance.
   * @throws Error if QDRANT_URL was not configured
   */
  getClient(): QdrantClient {
    if (!this.client) {
      throw new Error('Qdrant client not initialized. Check QDRANT_URL env var.');
    }
    return this.client;
  }

  /**
   * Returns true if Qdrant is configured and available.
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Ensures a collection exists with the specified vector configuration.
   * Idempotent — no-ops if the collection already exists.
   *
   * @param name - Collection name
   * @param size - Vector dimension size
   * @param distance - Distance metric (default: Cosine)
   */
  /**
   * Deletes and recreates a collection with new vector configuration.
   * Use when vector dimensions change (e.g. switching embedding models).
   */
  async recreateCollection(
    name: string,
    size: number,
    distance: 'Cosine' | 'Euclid' | 'Dot' = 'Cosine'
  ): Promise<void> {
    const client = this.getClient();

    try {
      await client.deleteCollection(name);
      this.logger.log({ message: 'Deleted Qdrant collection', name });
    } catch {
      // Collection doesn't exist — that's fine
    }

    await client.createCollection(name, {
      vectors: { size, distance },
    });
    this.logger.log({ message: 'Created Qdrant collection', name, size, distance });
  }

  async ensureCollection(
    name: string,
    size: number,
    distance: 'Cosine' | 'Euclid' | 'Dot' = 'Cosine'
  ): Promise<void> {
    const client = this.getClient();

    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === name);

    if (!exists) {
      await client.createCollection(name, {
        vectors: { size, distance },
      });
      this.logger.log({ message: 'Qdrant collection created', name, size, distance });
    } else {
      this.logger.debug({ message: 'Qdrant collection already exists', name });
    }
  }
}
