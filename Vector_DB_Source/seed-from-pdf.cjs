/**
 * Comprehensive seed script: Maps PDF-extracted concepts to curriculum.json hierarchy,
 * upserts into PostgreSQL via Prisma, generates embeddings, and stores in Qdrant.
 *
 * Usage:
 *   node Vector_DB_Source/seed-from-pdf.cjs
 *
 * Prerequisites:
 *   - extracted-concepts.json (from extract-concepts.cjs)
 *   - QDRANT_URL and QDRANT_API_KEY in apps/api/.env
 *   - OpenAI API key configured in LLM provider config
 *   - DATABASE_URL configured in apps/api/.env
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

// ── Configuration ──
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1024;
const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 500;
const QDRANT_COLLECTION = 'concepts';

// ── Load data files ──
const conceptsPath = path.join(__dirname, 'extracted-concepts.json');
const curriculumPath = path.join(__dirname, '..', 'apps', 'api', 'src', 'app', 'knowledge', 'data', 'curriculum.json');
const envPath = path.join(__dirname, '..', 'apps', 'api', '.env');

// Load env vars manually (dotenv style)
function loadEnv(envFile) {
  if (!fs.existsSync(envFile)) return;
  const content = fs.readFileSync(envFile, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv(envPath);

// ── Utility functions ──

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/[šś]/g, 's')
    .replace(/[žź]/g, 'z')
    .replace(/đ/g, 'dj')
    .replace(/[àáâãä]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateConceptId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'cpt_';
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function determinisiticUuid(conceptId) {
  const hash = crypto.createHash('md5').update(conceptId).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

// Normalize text for matching: lowercase, remove diacritics, simplify
function normalizeForMatch(text) {
  return text
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/[šś]/g, 's')
    .replace(/[žź]/g, 'z')
    .replace(/đ/g, 'dj')
    .replace(/[àáâãä]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strip null bytes and other invalid characters from text
function sanitizeText(text) {
  if (!text) return text;
  // Remove null bytes and other control characters (except newlines and tabs)
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

// Generate a short definition from the full content (first 2-3 sentences)
function extractDefinition(content, maxLength = 500) {
  // Split by sentence endings
  const sentences = content.split(/(?<=[.!?])\s+/);
  let definition = '';
  for (const sentence of sentences) {
    if (definition.length + sentence.length > maxLength && definition.length > 50) break;
    definition += (definition ? ' ' : '') + sentence;
  }
  return definition || content.substring(0, maxLength);
}

// Map category from curriculum top-level sections to department
function mapCategoryToDepartmentTags(category) {
  const mapping = {
    'Poslovanje': ['Finance', 'Operations'],
    'Vrednost': ['Marketing', 'Operations'],
    'Marketing': ['Marketing'],
    'Kognitivne Sklonosti': ['Marketing', 'Creative'],
    'Određivanje Cene': ['Finance', 'Marketing'],
    'Prodaja': ['Marketing', 'Finance'],
    'Razvoj Poslovanja': ['Marketing', 'Operations'],
    'Finansije': ['Finance'],
    'Operacije i Proizvodnja': ['Operations'],
    'Menadžment': ['Operations'],
    'Ljudski Resursi': ['Operations'],
    'Rad sa Ljudima': ['Operations'],
    'Upravljanje Svojim Radom': ['Operations'],
    'Isporuka Vrednosti': ['Operations'],
    'Razumevanje Sistema': ['Operations', 'Technology'],
    'Poslovni Modeli': ['Finance', 'Marketing', 'Operations'],
    'Kompanijska Struktura': ['Operations'],
    'Modeli Vlasništva': ['Finance', 'Operations'],
    'Spajanja i Akvizicije (M&A)': ['Finance'],
    'Startup': ['Finance', 'Marketing', 'Operations'],
  };
  return mapping[category] || ['Operations'];
}

async function main() {
  console.log('=== BMAD Mentor AI: PDF → DB + Qdrant Seed Script ===\n');

  // 1. Load extracted concepts
  if (!fs.existsSync(conceptsPath)) {
    console.error('extracted-concepts.json not found. Run extract-concepts.cjs first.');
    process.exit(1);
  }
  const pdfConcepts = JSON.parse(fs.readFileSync(conceptsPath, 'utf-8'));
  console.log(`Loaded ${pdfConcepts.length} concepts from PDF`);

  // 2. Load curriculum.json
  const curriculum = JSON.parse(fs.readFileSync(curriculumPath, 'utf-8'));
  console.log(`Loaded ${curriculum.length} curriculum nodes`);

  // 3. Build curriculum lookup by normalized label
  const curriculumByLabel = new Map();
  const curriculumById = new Map();
  for (const node of curriculum) {
    curriculumById.set(node.id, node);
    const normalized = normalizeForMatch(node.label);
    if (!curriculumByLabel.has(normalized)) {
      curriculumByLabel.set(normalized, node);
    }
  }

  // Build top-level category map (id → root label)
  function getRootCategory(nodeId) {
    let node = curriculumById.get(nodeId);
    while (node && node.parentId) {
      node = curriculumById.get(node.parentId);
    }
    return node ? node.label : 'Poslovanje';
  }

  // 4. Match PDF concepts to curriculum nodes
  console.log('\nMatching PDF concepts to curriculum...');
  const matched = [];
  const unmatched = [];

  for (const pdf of pdfConcepts) {
    const normalizedName = normalizeForMatch(pdf.name);
    const currNode = curriculumByLabel.get(normalizedName);

    if (currNode) {
      matched.push({
        ...pdf,
        curriculumId: currNode.id,
        curriculumLabel: currNode.label,
        parentId: currNode.parentId,
        sortOrder: currNode.sortOrder,
        category: getRootCategory(currNode.id),
      });
    } else {
      unmatched.push(pdf);
    }
  }

  console.log(`  Matched: ${matched.length}`);
  console.log(`  Unmatched: ${unmatched.length}`);

  if (unmatched.length > 0 && unmatched.length < 30) {
    console.log('  Unmatched concepts:');
    for (const u of unmatched) {
      console.log(`    ${u.numbering} ${u.name}`);
    }
  }

  // 5. Also add curriculum-only nodes (top-level categories that don't have PDF content)
  const matchedCurriculumIds = new Set(matched.map(m => m.curriculumId));
  const curriculumOnly = curriculum.filter(n => !matchedCurriculumIds.has(n.id));
  console.log(`  Curriculum-only nodes (no PDF content): ${curriculumOnly.length}`);

  // 6. Initialize Prisma
  const prisma = new PrismaClient();
  await prisma.$connect();
  console.log('\nConnected to database');

  // 7. Get OpenAI API key
  const llmConfig = await prisma.llmProviderConfig.findFirst({
    where: { providerType: 'OPENAI', isActive: true },
    select: { apiKey: true },
  });

  let openaiApiKey = null;
  if (llmConfig && llmConfig.apiKey) {
    // Decrypt the API key (AES-256-GCM)
    // Format: iv:authTag:encryptedText
    // Key: LLM_CONFIG_ENCRYPTION_KEY env var (hex) or 32 zero bytes (dev default)
    try {
      const keyHex = process.env.LLM_CONFIG_ENCRYPTION_KEY;
      const keyBuffer = keyHex
        ? Buffer.from(keyHex, 'hex')
        : Buffer.from('0'.repeat(64), 'hex');
      const parts = llmConfig.apiKey.split(':');
      if (parts.length === 3) {
        const [ivHex, authTagHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
        decipher.setAuthTag(authTag);
        openaiApiKey = decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8');
        console.log('OpenAI API key decrypted from DB');
      }
    } catch (err) {
      console.warn('Failed to decrypt API key:', err.message);
    }
  }

  if (!openaiApiKey) {
    console.error('OpenAI API key not found in DB. Please configure it in LLM settings first.');
    await prisma.$disconnect();
    process.exit(1);
  }

  // 8. Initialize Qdrant
  const qdrantUrl = process.env.QDRANT_URL;
  const qdrantApiKey = process.env.QDRANT_API_KEY;

  if (!qdrantUrl) {
    console.error('QDRANT_URL not set. Cannot store embeddings.');
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`Qdrant URL: ${qdrantUrl}`);

  // Ensure collection exists
  console.log('Ensuring Qdrant collection exists...');
  try {
    const checkResp = await fetch(`${qdrantUrl}/collections/${QDRANT_COLLECTION}`, {
      headers: { 'api-key': qdrantApiKey },
    });
    if (checkResp.status === 404) {
      console.log('Creating collection...');
      const createResp = await fetch(`${qdrantUrl}/collections/${QDRANT_COLLECTION}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'api-key': qdrantApiKey,
        },
        body: JSON.stringify({
          vectors: {
            size: EMBEDDING_DIMENSIONS,
            distance: 'Cosine',
          },
        }),
      });
      if (!createResp.ok) {
        const errText = await createResp.text();
        throw new Error(`Failed to create collection: ${createResp.status} ${errText}`);
      }
      console.log('Collection created');
    } else {
      console.log('Collection already exists');
    }
  } catch (err) {
    console.error('Qdrant error:', err.message);
    await prisma.$disconnect();
    process.exit(1);
  }

  // 9. Clear existing concepts and related data
  console.log('\nClearing existing concept data...');
  await prisma.conceptCitation.deleteMany({});
  await prisma.conceptRelationship.deleteMany({});
  await prisma.concept.deleteMany({});
  console.log('Cleared concepts, citations, and relationships');

  // 10. Create all concepts (curriculum-only first for parent references, then matched)
  console.log('\nCreating concepts in database...');

  // Build concept ID map (curriculumId → conceptId)
  const conceptIdMap = new Map();

  // First pass: create all curriculum nodes (top-level categories + unmatched curriculum nodes)
  // These need to exist first for parentId references
  for (const node of curriculum) {
    const conceptId = generateConceptId();
    conceptIdMap.set(node.id, conceptId);
  }

  // Second pass: create all concepts
  let created = 0;
  const allConceptsToCreate = [];

  // Create all curriculum nodes
  for (const node of curriculum) {
    const conceptId = conceptIdMap.get(node.id);
    const parentConceptId = node.parentId ? conceptIdMap.get(node.parentId) : null;
    const category = getRootCategory(node.id);

    // Find matching PDF content
    const normalizedLabel = normalizeForMatch(node.label);
    const matchedPdf = matched.find(m => m.curriculumId === node.id);

    const name = node.label;
    const slug = node.id; // Use curriculum ID as slug
    const definition = matchedPdf
      ? sanitizeText(extractDefinition(matchedPdf.content))
      : name; // Fallback to label if no PDF content
    const extendedDescription = matchedPdf ? sanitizeText(matchedPdf.content) : null;
    const departmentTags = mapCategoryToDepartmentTags(category);

    allConceptsToCreate.push({
      id: conceptId,
      name,
      slug,
      category,
      definition,
      extendedDescription,
      departmentTags,
      parentId: parentConceptId,
      sortOrder: node.sortOrder,
      curriculumId: node.id,
      version: 1,
    });
  }

  // Also add unmatched PDF concepts that have no curriculum mapping
  for (const pdf of unmatched) {
    const conceptId = generateConceptId();
    const slug = slugify(pdf.name);

    // Determine category from numbering context (look at what came before)
    const category = 'Poslovanje'; // Default fallback

    allConceptsToCreate.push({
      id: conceptId,
      name: pdf.name,
      slug: slug + '-pdf',
      category,
      definition: sanitizeText(extractDefinition(pdf.content)),
      extendedDescription: sanitizeText(pdf.content),
      departmentTags: mapCategoryToDepartmentTags(category),
      parentId: null,
      sortOrder: 999,
      curriculumId: null,
      version: 1,
    });
  }

  // Create in batches to avoid Prisma timeout
  const CREATE_BATCH = 50;
  for (let i = 0; i < allConceptsToCreate.length; i += CREATE_BATCH) {
    const batch = allConceptsToCreate.slice(i, i + CREATE_BATCH);
    for (const concept of batch) {
      try {
        await prisma.concept.create({ data: concept });
        created++;
      } catch (err) {
        // Skip duplicates
        if (err.code === 'P2002') {
          console.warn(`  Duplicate: ${concept.name} (slug: ${concept.slug})`);
        } else {
          console.error(`  Error creating ${concept.name}: ${err.message}`);
        }
      }
    }
    if (i + CREATE_BATCH < allConceptsToCreate.length) {
      process.stdout.write(`  Created ${Math.min(i + CREATE_BATCH, allConceptsToCreate.length)}/${allConceptsToCreate.length}\r`);
    }
  }
  console.log(`\nCreated ${created} concepts in database`);

  // 11. Generate embeddings and store in Qdrant
  console.log('\nGenerating embeddings...');

  // Only embed concepts with actual content (definition > just a label)
  const conceptsToEmbed = await prisma.concept.findMany({
    where: {
      embeddingId: null,
      NOT: { definition: '' },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      definition: true,
      extendedDescription: true,
      category: true,
      departmentTags: true,
    },
  });

  // Filter: only embed concepts with meaningful definitions (not just labels)
  const toEmbed = conceptsToEmbed.filter(c => c.definition.length > 30);
  console.log(`  ${toEmbed.length} concepts with embeddings to generate`);

  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE);

    // Build embedding text: use definition + category for context
    // For better semantic search, include extended content (truncated)
    const texts = batch.map(c => {
      const baseText = `${c.name} (${c.category}): ${c.definition}`;
      // Include start of extended description for richer embeddings
      if (c.extendedDescription && c.extendedDescription.length > c.definition.length) {
        const extra = c.extendedDescription.substring(0, 1000);
        return `${baseText}\n\n${extra}`;
      }
      return baseText;
    });

    try {
      // Batch embedding call to OpenAI
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: texts,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`  OpenAI API error: ${response.status} ${errorText}`);
        failed += batch.length;
        continue;
      }

      const data = await response.json();

      // Store each embedding in Qdrant
      const points = [];
      for (let j = 0; j < batch.length; j++) {
        const concept = batch[j];
        const embeddingData = data.data[j];
        if (!concept || !embeddingData) {
          failed++;
          continue;
        }

        const vector = embeddingData.embedding;
        if (!vector || vector.every(v => v === 0)) {
          console.warn(`  Skipping ${concept.name} — empty embedding`);
          failed++;
          continue;
        }

        const pointId = determinisiticUuid(concept.id);
        points.push({
          id: pointId,
          vector,
          payload: {
            conceptId: concept.id,
            name: concept.name,
            category: concept.category,
            departmentTags: concept.departmentTags,
          },
        });

        // Update DB with embedding ID
        await prisma.concept.update({
          where: { id: concept.id },
          data: { embeddingId: pointId },
        });
        embedded++;
      }

      // Batch upsert to Qdrant
      if (points.length > 0) {
        const upsertResp = await fetch(`${qdrantUrl}/collections/${QDRANT_COLLECTION}/points`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'api-key': qdrantApiKey,
          },
          body: JSON.stringify({ points }),
        });

        if (!upsertResp.ok) {
          const errText = await upsertResp.text();
          console.error(`  Qdrant upsert error: ${upsertResp.status} ${errText}`);
        }
      }
    } catch (error) {
      console.error(`  Batch embedding failed: ${error.message}`);
      failed += batch.length;
    }

    process.stdout.write(`  Progress: ${Math.min(i + BATCH_SIZE, toEmbed.length)}/${toEmbed.length} (embedded: ${embedded}, failed: ${failed})\r`);

    // Rate limit safety delay
    if (i + BATCH_SIZE < toEmbed.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  console.log(`\n\n=== Seed Complete! ===`);
  console.log(`  Concepts created: ${created}`);
  console.log(`  Embeddings generated: ${embedded}`);
  console.log(`  Embeddings failed: ${failed}`);
  console.log(`  Total curriculum nodes: ${curriculum.length}`);
  console.log(`  PDF concepts matched: ${matched.length}`);
  console.log(`  PDF concepts unmatched: ${unmatched.length}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Seed script failed:', err.message || err);
  process.exit(1);
});
