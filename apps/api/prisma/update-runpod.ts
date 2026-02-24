import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Deactivate old configs
  const deactivated = await prisma.llmProviderConfig.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });
  console.log(`Deactivated ${deactivated.count} old configs`);

  // Create RunPod config with correct pod proxy endpoint
  const config = await prisma.llmProviderConfig.create({
    data: {
      providerType: 'LM_STUDIO',
      endpoint: 'http://localhost:8000',
      modelId: 'Qwen/Qwen2.5-32B-Instruct-AWQ',
      isPrimary: true,
      isFallback: false,
      isActive: true,
    },
  });
  console.log('Created RunPod config:');
  console.log(`  Endpoint: ${config.endpoint}`);
  console.log(`  Model: ${config.modelId}`);

  // Audit log
  await prisma.llmConfigAuditLog.create({
    data: {
      action: 'UPDATE',
      changedBy: 'system',
      newVal: {
        endpoint: config.endpoint,
        modelId: config.modelId,
        providerType: config.providerType,
      },
    },
  });

  console.log('Done!');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
