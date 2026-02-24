/**
 * Switch LLM provider to OpenAI
 *
 * Deactivates all existing LLM configs and creates a new OPENAI config
 * with encrypted API key from OPENAI_API_KEY env var.
 *
 * Usage: npx ts-node prisma/switch-to-openai.ts
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'node:crypto';
import * as dotenv from 'dotenv';

// Load .env from the api app directory
dotenv.config();

const prisma = new PrismaClient();

// ── Encryption (same as llm-config.service.ts) ──
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
function getEncryptionKey(): Buffer {
  const keyHex = process.env.LLM_CONFIG_ENCRYPTION_KEY;
  if (!keyHex) {
    return Buffer.from('0'.repeat(64), 'hex');
  }
  return Buffer.from(keyHex, 'hex');
}

function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: OPENAI_API_KEY not found in environment. Set it in .env first.');
    process.exit(1);
  }

  console.log('=== Switching LLM provider to OpenAI ===\n');

  // Show current config
  const currentConfigs = await prisma.llmProviderConfig.findMany({
    where: { isActive: true },
  });
  console.log(`Current active configs: ${currentConfigs.length}`);
  for (const c of currentConfigs) {
    console.log(`  - ${c.providerType} | model: ${c.modelId} | primary: ${c.isPrimary}`);
  }

  // Deactivate all existing configs
  const deactivated = await prisma.llmProviderConfig.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });
  console.log(`\nDeactivated ${deactivated.count} existing config(s)`);

  // Create new OPENAI config
  const modelId = 'gpt-4o';
  await prisma.llmProviderConfig.create({
    data: {
      providerType: 'OPENAI',
      apiKey: encrypt(apiKey),
      endpoint: null,
      modelId,
      isPrimary: true,
      isFallback: false,
      isActive: true,
    },
  });
  console.log(`\nCreated OPENAI config:`);
  console.log(`  Model: ${modelId}`);
  console.log(
    `  API key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)} (encrypted in DB)`
  );

  // Audit log
  await prisma.llmConfigAuditLog.create({
    data: {
      action: 'CREATE',
      changedBy: 'switch-to-openai-script',
      newVal: {
        providerType: 'OPENAI',
        modelId,
        note: 'Switched from LM_STUDIO to OpenAI via script',
      },
    },
  });

  console.log('\n=== Done! OpenAI is now the active LLM provider ===');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
