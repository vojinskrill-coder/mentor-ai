/**
 * Quick script to query current LLM provider configs.
 * Usage: npx ts-node prisma/query-llm-config.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const configs = await prisma.llmProviderConfig.findMany({
    orderBy: { createdAt: 'desc' },
  });
  console.log('=== LLM Provider Configs ===');
  for (const c of configs) {
    console.log(JSON.stringify({
      id: c.id,
      providerType: c.providerType,
      endpoint: c.endpoint,
      modelId: c.modelId,
      isPrimary: c.isPrimary,
      isFallback: c.isFallback,
      isActive: c.isActive,
      hasApiKey: !!c.apiKey,
      createdAt: c.createdAt,
    }, null, 2));
  }
  console.log(`\nTotal: ${configs.length} configs`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
