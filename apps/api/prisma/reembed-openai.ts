/**
 * Re-embed all concepts using OpenAI text-embedding-3-small (1536-dim).
 *
 * 1. Deletes and recreates the Qdrant 'concepts' collection with 1536 dimensions
 * 2. Generates OpenAI embeddings for all 443 concepts
 * 3. Stores vectors in Qdrant and updates embeddingId in PostgreSQL
 *
 * Usage: npx ts-node prisma/reembed-openai.ts
 */

import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const QDRANT_URL = process.env.QDRANT_URL!;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY!;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const COLLECTION_NAME = 'concepts';
const BATCH_SIZE = 50; // OpenAI supports up to 2048 inputs per request

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

async function qdrantRequest(path: string, method: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${QDRANT_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'api-key': QDRANT_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Qdrant ${method} ${path} failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function openaiEmbed(texts: string[]): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI embedding API failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
    usage: { prompt_tokens: number; total_tokens: number };
  };

  console.log(`  Tokens used: ${data.usage.total_tokens}`);

  // Sort by index to ensure correct order
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

async function main(): Promise<void> {
  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set');
    process.exit(1);
  }
  if (!QDRANT_URL) {
    console.error('QDRANT_URL not set');
    process.exit(1);
  }

  // Step 1: Delete existing collection
  console.log('=== Step 1: Recreate Qdrant collection ===');
  try {
    await qdrantRequest(`/collections/${COLLECTION_NAME}`, 'DELETE');
    console.log(`  Deleted existing '${COLLECTION_NAME}' collection`);
  } catch {
    console.log(`  Collection '${COLLECTION_NAME}' did not exist (ok)`);
  }

  // Create with 1536 dimensions
  await qdrantRequest(`/collections/${COLLECTION_NAME}`, 'PUT', {
    vectors: {
      size: EMBEDDING_DIMENSIONS,
      distance: 'Cosine',
    },
  });
  console.log(`  Created '${COLLECTION_NAME}' collection (${EMBEDDING_DIMENSIONS} dims, Cosine)`);

  // Step 2: Load all concepts
  console.log('\n=== Step 2: Load concepts from DB ===');
  const concepts = await prisma.concept.findMany({
    select: {
      id: true,
      name: true,
      definition: true,
      category: true,
    },
    orderBy: { name: 'asc' },
  });
  console.log(`  Found ${concepts.length} concepts`);

  // Step 3: Embed in batches
  console.log(`\n=== Step 3: Generate embeddings (batch size: ${BATCH_SIZE}) ===`);
  const totalTokens = 0;
  let embedded = 0;

  for (let i = 0; i < concepts.length; i += BATCH_SIZE) {
    const batch = concepts.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => {
      const def = c.definition ? `: ${c.definition}` : '';
      return `${c.name}${def}`;
    });

    console.log(`\n  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(concepts.length / BATCH_SIZE)} (${batch.length} concepts)`);

    const vectors = await openaiEmbed(texts);

    // Upsert to Qdrant
    const points = batch.map((concept, idx) => ({
      id: conceptIdToUuid(concept.id),
      vector: vectors[idx],
      payload: {
        conceptId: concept.id,
        name: concept.name,
        category: concept.category ?? '',
        departmentTags: [],
      },
    }));

    await qdrantRequest(`/collections/${COLLECTION_NAME}/points`, 'PUT', {
      points,
    });

    // Update embeddingId in PostgreSQL
    for (const concept of batch) {
      await prisma.concept.update({
        where: { id: concept.id },
        data: { embeddingId: conceptIdToUuid(concept.id) },
      });
    }

    embedded += batch.length;
    console.log(`  Stored ${embedded}/${concepts.length} embeddings in Qdrant + DB`);

    // Small delay to respect rate limits
    if (i + BATCH_SIZE < concepts.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // Step 4: Verify
  console.log('\n=== Step 4: Verify ===');
  const collectionInfo = (await qdrantRequest(`/collections/${COLLECTION_NAME}`, 'GET')) as {
    result: { points_count: number; vectors_count: number };
  };
  console.log(`  Qdrant points: ${collectionInfo.result.points_count}`);

  const dbCount = await prisma.concept.count({
    where: { embeddingId: { not: null } },
  });
  console.log(`  DB concepts with embeddingId: ${dbCount}`);

  console.log(`\n=== DONE! ${embedded} concepts re-embedded with OpenAI ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS}-dim) ===`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('Re-embedding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
