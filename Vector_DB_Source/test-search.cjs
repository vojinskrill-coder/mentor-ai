/**
 * Test semantic search against Qdrant to verify embeddings work.
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'apps', 'api', '.env');

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
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(envPath);

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  // Get OpenAI key
  const llmConfig = await prisma.llmProviderConfig.findFirst({
    where: { providerType: 'OPENAI', isActive: true },
    select: { apiKey: true },
  });

  const keyHex = process.env.LLM_CONFIG_ENCRYPTION_KEY;
  const keyBuffer = keyHex ? Buffer.from(keyHex, 'hex') : Buffer.from('0'.repeat(64), 'hex');
  const parts = llmConfig.apiKey.split(':');
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(authTag);
  const openaiApiKey = decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8');

  const qdrantUrl = process.env.QDRANT_URL;
  const qdrantApiKey = process.env.QDRANT_API_KEY;

  // Test queries
  const queries = [
    'Kako odrediti cenu proizvoda?',
    'Šta je marketing i kako privući klijente?',
    'Kako upravljati finansijama u kompaniji?',
    'startup finansiranje',
    'leadership and team management',
  ];

  for (const query of queries) {
    console.log(`\n--- Query: "${query}" ---`);

    // Generate embedding for query
    const embResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: query,
        dimensions: 1024,
      }),
    });

    const embData = await embResponse.json();
    const vector = embData.data[0].embedding;

    // Search Qdrant
    const searchResponse = await fetch(`${qdrantUrl}/collections/concepts/points/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': qdrantApiKey,
      },
      body: JSON.stringify({
        vector,
        limit: 5,
        with_payload: true,
      }),
    });

    const searchData = await searchResponse.json();
    const results = searchData.result || [];

    for (const r of results) {
      const score = r.score.toFixed(4);
      const name = r.payload?.name || 'unknown';
      const category = r.payload?.category || '';
      console.log(`  [${score}] ${name} (${category})`);
    }
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
