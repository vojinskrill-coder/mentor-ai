/**
 * Switch LLM Provider Script
 *
 * Updates the active LLM provider configuration WITHOUT deleting user data.
 * Deactivates all existing configs and creates a new active primary config.
 *
 * Usage:
 *   npx ts-node prisma/switch-llm-provider.ts                    # Interactive: reads from env
 *   npx ts-node prisma/switch-llm-provider.ts --dry-run           # Preview only
 *   npx ts-node prisma/switch-llm-provider.ts --provider OPENAI   # Switch to OpenAI
 *   npx ts-node prisma/switch-llm-provider.ts --provider LM_STUDIO --endpoint https://xxx.proxy.runpod.net/v1
 *
 * Environment variables (for LM_STUDIO/RunPod):
 *   RUNPOD_ENDPOINT  - RunPod endpoint URL
 *   RUNPOD_API_KEY   - RunPod API key (optional for pod proxies)
 *   RUNPOD_MODEL_ID  - Model ID (default: deepseek-ai/DeepSeek-V3-0324)
 */
import { PrismaClient } from '@prisma/client';
import * as crypto from 'node:crypto';

const prisma = new PrismaClient();

// ── Parse CLI args ──
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const providerArg = getArg('--provider');
const endpointArg = getArg('--endpoint');
const modelArg = getArg('--model');
const apiKeyArg = getArg('--api-key');

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

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

type ProviderType =
  | 'OPENAI'
  | 'LM_STUDIO'
  | 'OPENROUTER'
  | 'LOCAL_LLAMA'
  | 'ANTHROPIC'
  | 'DEEPSEEK';

async function main(): Promise<void> {
  // ── Determine provider config ──
  const provider = (providerArg as ProviderType) ?? 'LM_STUDIO';

  let endpoint: string | undefined;
  let apiKey: string | undefined;
  let modelId: string;

  switch (provider) {
    case 'LM_STUDIO': {
      endpoint = endpointArg ?? process.env.RUNPOD_ENDPOINT ?? '';
      apiKey = apiKeyArg ?? process.env.RUNPOD_API_KEY ?? '';
      modelId = modelArg ?? process.env.RUNPOD_MODEL_ID ?? 'deepseek-ai/DeepSeek-V3-0324';
      break;
    }
    case 'OPENAI': {
      apiKey = apiKeyArg ?? process.env.OPENAI_API_KEY ?? '';
      modelId = modelArg ?? 'gpt-4o';
      break;
    }
    case 'OPENROUTER': {
      apiKey = apiKeyArg ?? process.env.OPENROUTER_API_KEY ?? '';
      modelId = modelArg ?? 'meta-llama/llama-3.1-8b-instruct';
      break;
    }
    case 'LOCAL_LLAMA': {
      endpoint = endpointArg ?? 'http://localhost:8000';
      modelId = modelArg ?? 'default';
      break;
    }
    case 'DEEPSEEK': {
      apiKey = apiKeyArg ?? process.env.DEEPSEEK_API_KEY ?? '';
      modelId = modelArg ?? process.env.DEEPSEEK_MODEL_ID ?? 'deepseek-chat';
      break;
    }
    default: {
      console.error(`Unsupported provider: ${provider}`);
      process.exit(1);
    }
  }

  // ── Show current config ──
  const activeConfigs = await prisma.llmProviderConfig.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  console.log('=== Current Active LLM Config ===');
  if (activeConfigs.length === 0) {
    console.log('  (none)');
  }
  for (const c of activeConfigs) {
    console.log(
      `  ${c.providerType} | ${c.modelId} | ${c.endpoint ?? 'default'} | primary=${c.isPrimary}`
    );
  }

  // ── Show planned change ──
  console.log('\n=== Switching To ===');
  console.log(`  Provider: ${provider}`);
  console.log(`  Model:    ${modelId}`);
  console.log(`  Endpoint: ${endpoint ?? '(default/cloud)'}`);
  console.log(`  API Key:  ${apiKey ? '***set***' : '(none)'}`);

  if (!endpoint && provider === 'LM_STUDIO') {
    console.log('\n  ⚠️  WARNING: No RUNPOD_ENDPOINT set.');
    console.log('  Set it in .env or pass --endpoint before using chat.');
    console.log('  You can also update via admin UI at /platform-admin/llm-config');
  }

  if (dryRun) {
    console.log('\n[DRY RUN] No changes made. Remove --dry-run to apply.');
    return;
  }

  // ── Deactivate all existing configs ──
  const deactivated = await prisma.llmProviderConfig.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });
  console.log(`\nDeactivated ${deactivated.count} existing config(s)`);

  // ── Create new primary config ──
  const configData: {
    providerType: ProviderType;
    endpoint?: string;
    modelId: string;
    isPrimary: boolean;
    isFallback: boolean;
    isActive: boolean;
    apiKey?: string;
  } = {
    providerType: provider,
    modelId,
    isPrimary: true,
    isFallback: false,
    isActive: true,
  };

  if (endpoint) {
    configData.endpoint = endpoint;
  }
  if (apiKey) {
    configData.apiKey = encrypt(apiKey);
  }

  const newConfig = await prisma.llmProviderConfig.create({ data: configData });
  console.log(`Created new config: ${newConfig.id}`);

  // ── Audit log ──
  await prisma.llmConfigAuditLog.create({
    data: {
      action: 'UPDATE',
      changedBy: 'switch-llm-provider-script',
      newVal: {
        providerType: provider,
        endpoint: endpoint ?? null,
        modelId,
        note: 'Switched via switch-llm-provider.ts script',
      },
    },
  });

  console.log('\n=== DONE ===');
  console.log(`Active provider: ${provider} (${modelId})`);
  if (!endpoint && provider === 'LM_STUDIO') {
    console.log('\nNext step: Set RUNPOD_ENDPOINT in .env and restart the server,');
    console.log('or update endpoint via admin UI at /platform-admin/llm-config');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('Switch failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
