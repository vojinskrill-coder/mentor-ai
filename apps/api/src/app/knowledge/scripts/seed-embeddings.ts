/**
 * Seed script: Generates and stores embeddings for all curriculum concepts in Qdrant
 * using LM Studio's local nomic-embed-text model.
 *
 * Usage:
 *   npx ts-node -P apps/api/tsconfig.json apps/api/src/app/knowledge/scripts/seed-embeddings.ts
 *
 * Or via nx:
 *   npx nx run api:seed-embeddings
 *
 * Prerequisites:
 *   - LM Studio running locally with nomic-embed-text model loaded
 *   - LM Studio configured as active provider (or defaults to http://127.0.0.1:1234)
 *   - Qdrant Cloud URL and API key in .env (QDRANT_URL, QDRANT_API_KEY)
 *   - Concepts seeded in the database
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { EmbeddingService } from '../services/embedding.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { LlmConfigService } from '../../llm-config/llm-config.service';
import { LlmProviderType } from '@mentor-ai/shared/types';
import { Logger } from '@nestjs/common';

const logger = new Logger('SeedEmbeddings');

const DEFAULT_LM_STUDIO_ENDPOINT = 'http://127.0.0.1:1234';

interface EmbeddingBatchResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

async function main() {
  logger.log('Bootstrapping application context...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const embeddingService = app.get(EmbeddingService);
  const prisma = app.get(PlatformPrismaService);
  const llmConfigService = app.get(LlmConfigService);

  // Find all concepts that don't have embeddings in Qdrant yet
  const conceptsWithoutEmbeddings = await prisma.concept.findMany({
    where: { embeddingId: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, definition: true, category: true, departmentTags: true },
  });

  const total = conceptsWithoutEmbeddings.length;
  logger.log(`Found ${total} concepts without embeddings`);

  if (total === 0) {
    logger.log('All concepts already have embeddings. Nothing to do.');
    await app.close();
    return;
  }

  // Get LM Studio endpoint from config or use default
  const endpoint =
    (await llmConfigService.getProviderEndpoint(LlmProviderType.LM_STUDIO)) ??
    DEFAULT_LM_STUDIO_ENDPOINT;
  logger.log(`Using LM Studio endpoint: ${endpoint}`);

  // Process in batches with batch embedding API calls
  const BATCH_SIZE = 20;
  const BATCH_DELAY_MS = 200;
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = conceptsWithoutEmbeddings.slice(i, i + BATCH_SIZE);

    // Build texts for batch embedding
    const texts = batch.map((c) => `${c.name} (${c.category}): ${c.definition}`);

    try {
      // Call LM Studio with batch input (single API call for up to 20 texts)
      const response = await fetch(`${endpoint}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-nomic-embed-text-v1.5',
          input: texts,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`LM Studio API error: ${response.status} ${errorText}`);
        failed += batch.length;
        continue;
      }

      const data = (await response.json()) as EmbeddingBatchResponse;

      // Store each embedding in Qdrant via EmbeddingService
      for (let j = 0; j < batch.length; j++) {
        const concept = batch[j];
        const embeddingData = data.data[j];
        if (!concept || !embeddingData) {
          failed++;
          continue;
        }
        const vector = embeddingData.embedding;
        if (!vector || vector.every((v: number) => v === 0)) {
          logger.warn(`Skipping ${concept.name} — empty embedding`);
          failed++;
          continue;
        }

        try {
          await embeddingService.store(concept.id, vector, {
            name: concept.name,
            category: concept.category,
            departmentTags: concept.departmentTags,
          });
          processed++;
        } catch (err) {
          logger.error(
            `Failed to store embedding for ${concept.name}: ${err instanceof Error ? err.message : 'Unknown'}`
          );
          failed++;
        }
      }
    } catch (error) {
      logger.error(
        `Batch embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      failed += batch.length;
    }

    logger.log(`Progress: ${Math.min(i + BATCH_SIZE, total)}/${total} concepts processed`);

    // Rate limit safety delay between batches
    if (i + BATCH_SIZE < total) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  logger.log(`\nSeed complete!`);
  logger.log(`  Embedded: ${processed}`);
  logger.log(`  Failed: ${failed}`);
  logger.log(`  Total: ${total}`);

  await app.close();
}

main().catch((error) => {
  logger.error(`Seed script failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  process.exit(1);
});
