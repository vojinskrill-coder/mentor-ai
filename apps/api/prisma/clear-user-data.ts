/**
 * Clears all user data while preserving:
 * - concepts + concept_relationships (knowledge base)
 * - concept_workflows (cached LLM-generated workflows — expensive to regenerate)
 * - platform + tenant_registry (infrastructure)
 * - llm_provider_configs + llm_config_audit_logs (LLM settings)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearUserData() {
  // Order matters due to foreign keys — delete children first
  const tables = [
    'execution_events',
    'executions',
    'attachments',
    'token_usage',
    'concept_citations',
    'onboarding_metrics',
    'messages',
    'memories',
    'notes',
    'conversations',
    'data_exports',
    'invitation',
    'user',
    'tenant',
  ];

  for (const table of tables) {
    try {
      const result = await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
      console.log(`Cleared ${table}: ${result} rows`);
    } catch (e: any) {
      console.log(`Skip ${table}: ${e.message?.substring(0, 80)}`);
    }
  }

  await prisma.$disconnect();
  console.log('\nDone. Preserved: concepts, concept_relationships, concept_workflows, platform, tenant_registry, llm configs.');
}

clearUserData().catch(console.error);
