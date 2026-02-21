/**
 * Standalone script: Generates embeddings for all concepts via LM Studio
 * and stores them in Qdrant Cloud.
 *
 * Usage: npx ts-node apps/api/prisma/seed-embeddings-local.ts
 *
 * Prerequisites:
 *   - LM Studio running locally with nomic-embed-text model loaded
 *   - QDRANT_URL and QDRANT_API_KEY in apps/api/.env
 *   - Concepts seeded in the database
 */

import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from apps/api/ (one level up from prisma/)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const LM_STUDIO_ENDPOINT = process.env.LM_STUDIO_ENDPOINT ?? 'http://127.0.0.1:1234';
const EMBEDDING_MODEL = 'text-embedding-nomic-embed-text-v1.5';
const QDRANT_URL = process.env.QDRANT_URL!;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY!;
const COLLECTION_NAME = 'concepts';
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 500;

interface EmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage?: { prompt_tokens: number; total_tokens: number };
}

function conceptIdToUuid(conceptId: string): string {
  const hash = createHash('md5').update(conceptId).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

async function main() {
  console.log('=== LM Studio Embedding Seeder ===');
  console.log(`LM Studio: ${LM_STUDIO_ENDPOINT}`);
  console.log(`Qdrant: ${QDRANT_URL}`);
  console.log(`Model: ${EMBEDDING_MODEL}`);
  console.log();

  if (!QDRANT_URL || !QDRANT_API_KEY) {
    console.error('ERROR: QDRANT_URL and QDRANT_API_KEY must be set in .env');
    process.exit(1);
  }

  // Test LM Studio connectivity
  try {
    const testResp = await fetch(`${LM_STUDIO_ENDPOINT}/v1/models`);
    if (!testResp.ok) throw new Error(`Status ${testResp.status}`);
    console.log('LM Studio connection: OK');
  } catch {
    console.error(`ERROR: Cannot connect to LM Studio at ${LM_STUDIO_ENDPOINT}`);
    console.error('Make sure LM Studio is running with the embedding model loaded.');
    process.exit(1);
  }

  // Find all concepts without embeddings
  const concepts = await prisma.concept.findMany({
    where: { embeddingId: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, definition: true, category: true, departmentTags: true },
  });

  const total = concepts.length;
  console.log(`Found ${total} concepts without embeddings`);

  if (total === 0) {
    console.log('All concepts already have embeddings. Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = concepts.slice(i, i + BATCH_SIZE);

    // Build texts for batch embedding
    const texts = batch.map((c) => `${c.name} (${c.category}): ${c.definition}`);

    try {
      // Call LM Studio embedding API
      const response = await fetch(`${LM_STUDIO_ENDPOINT}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: texts,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`LM Studio API error: ${response.status} ${errorText}`);
        failed += batch.length;
        continue;
      }

      const data = (await response.json()) as EmbeddingResponse;

      // Store each embedding in Qdrant
      for (let j = 0; j < batch.length; j++) {
        const concept = batch[j];
        const embeddingData = data.data[j];
        if (!concept || !embeddingData) {
          failed++;
          continue;
        }
        const vector = embeddingData.embedding;
        if (!vector || vector.length === 0) {
          console.warn(`Skipping ${concept.name} — empty embedding`);
          failed++;
          continue;
        }

        const pointId = conceptIdToUuid(concept.id);

        try {
          // Upsert to Qdrant
          const qdrantResp = await fetch(
            `${QDRANT_URL}/collections/${COLLECTION_NAME}/points?wait=true`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'api-key': QDRANT_API_KEY,
              },
              body: JSON.stringify({
                points: [
                  {
                    id: pointId,
                    vector,
                    payload: {
                      conceptId: concept.id,
                      name: concept.name,
                      category: concept.category,
                      departmentTags: concept.departmentTags,
                    },
                  },
                ],
              }),
            }
          );

          if (!qdrantResp.ok) {
            const errText = await qdrantResp.text();
            console.error(`Qdrant error for ${concept.name}: ${errText}`);
            failed++;
            continue;
          }

          // Update embeddingId in DB
          await prisma.concept.update({
            where: { id: concept.id },
            data: { embeddingId: pointId },
          });

          processed++;
        } catch (err) {
          console.error(
            `Failed to store ${concept.name}: ${err instanceof Error ? err.message : 'Unknown'}`
          );
          failed++;
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Batch failed: ${errMsg}`);
      failed += batch.length;
    }

    console.log(
      `Progress: ${Math.min(i + BATCH_SIZE, total)}/${total} (embedded: ${processed}, failed: ${failed})`
    );

    // Small delay between batches
    if (i + BATCH_SIZE < total) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  console.log();
  console.log('=== Seed complete! ===');
  console.log(`  Embedded: ${processed}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Total:    ${total}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(`Script failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  process.exit(1);
});
