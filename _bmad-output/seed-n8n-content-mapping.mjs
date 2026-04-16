/**
 * Seed ProcessN8nWorkflow mapping for instagram-content → n8n workflow.
 * Links the instagram-content ProcessWorkflow to the n8n Content Creation Pipeline.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'dev-tenant-001';
const N8N_WORKFLOW_ID = 'S47HffxsNWH6FVsf';
const WEBHOOK_PATH = 'neuron-content-creation';

async function main() {
  // Find the instagram-content ProcessWorkflow
  const workflow = await prisma.processWorkflow.findFirst({
    where: { slug: 'instagram-content' },
  });

  if (!workflow) {
    console.error('instagram-content workflow not found! Run seed-processes.ts first.');
    process.exit(1);
  }

  console.log(`Found workflow: ${workflow.id} (${workflow.name})`);

  // Upsert the n8n mapping
  const mapping = await prisma.processN8nWorkflow.upsert({
    where: {
      processWorkflowId_tenantId: {
        processWorkflowId: workflow.id,
        tenantId: TENANT_ID,
      },
    },
    update: {
      n8nWorkflowId: N8N_WORKFLOW_ID,
      webhookPath: WEBHOOK_PATH,
      isActive: true,
      syncedAt: new Date(),
    },
    create: {
      processWorkflowId: workflow.id,
      tenantId: TENANT_ID,
      n8nWorkflowId: N8N_WORKFLOW_ID,
      webhookPath: WEBHOOK_PATH,
      isActive: true,
    },
  });

  console.log(`Mapping created: ${mapping.id}`);
  console.log(`  ProcessWorkflow: ${workflow.slug} (${workflow.id})`);
  console.log(`  n8n Workflow: ${N8N_WORKFLOW_ID}`);
  console.log(`  Webhook: ${WEBHOOK_PATH}`);
  console.log(`  Tenant: ${TENANT_ID}`);
}

main()
  .catch((e) => { console.error('Failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
