const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const user = await p.user.findFirst({ where: { email: { contains: 'nafata' } }, select: { id: true, tenantId: true } });
  if (!user) { console.log('No user found - already clean'); return; }
  const tid = user.tenantId;
  const uid = user.id;
  console.log('Tenant:', tid, 'User:', uid);

  // FK-safe deletion order
  await p.$executeRawUnsafe(`DELETE FROM brain_proposals WHERE tenant_id = '${tid}'`).catch(() => {});
  await p.$executeRawUnsafe(`DELETE FROM agent_daily_budgets WHERE tenant_id = '${tid}'`).catch(() => {});
  await p.$executeRawUnsafe(`DELETE FROM agent_jobs WHERE tenant_id = '${tid}'`).catch(() => {});
  await p.vaultOperationLog.deleteMany({ where: { tenantId: tid } });
  await p.conceptRelationship.deleteMany({ where: { sourceConcept: { tenantId: tid } } });
  await p.stageConceptAssignment.deleteMany({ where: { tenantId: tid } });

  // Collect Qdrant IDs before deleting concepts
  const concepts = await p.concept.findMany({ where: { tenantId: tid }, select: { id: true, embeddingId: true } });
  const embeddingIds = concepts.filter(c => c.embeddingId).map(c => c.embeddingId);
  console.log('Concepts:', concepts.length, '| Qdrant points:', embeddingIds.length);

  await p.concept.deleteMany({ where: { tenantId: tid } });
  await p.tenantVault.deleteMany({ where: { tenantId: tid } });

  const convIds = await p.conversation.findMany({ where: { userId: uid }, select: { id: true } });
  if (convIds.length > 0) {
    await p.message.deleteMany({ where: { conversationId: { in: convIds.map(c => c.id) } } });
  }
  await p.conversation.deleteMany({ where: { userId: uid } });
  await p.note.deleteMany({ where: { tenantId: tid } });
  await p.memory.deleteMany({ where: { tenantId: tid } });
  await p.tokenUsage.deleteMany({ where: { tenantId: tid } });
  await p.dataExport.deleteMany({ where: { tenantId: tid } });
  await p.invitation.deleteMany({ where: { tenantId: tid } });
  await p.agentExecution.deleteMany({ where: { tenantId: tid } });
  await p.user.deleteMany({ where: { id: uid } });
  await p.tenantRegistry.deleteMany({ where: { id: tid } });
  await p.tenant.deleteMany({ where: { id: tid } });
  console.log('PostgreSQL cleaned');

  // Delete from Qdrant
  if (embeddingIds.length > 0) {
    const qdrantUrl = process.env.QDRANT_URL;
    const qdrantKey = process.env.QDRANT_API_KEY;
    if (qdrantUrl) {
      try {
        const resp = await fetch(qdrantUrl + '/collections/concepts/points/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(qdrantKey ? { 'api-key': qdrantKey } : {}) },
          body: JSON.stringify({ points: embeddingIds }),
        });
        const result = await resp.json();
        console.log('Qdrant:', result.status || JSON.stringify(result));
      } catch (e) {
        console.log('Qdrant error:', e.message);
      }
    }
  }

  console.log('Full cleanup done - PG + Qdrant');
}

main().catch(console.error).finally(() => p.$disconnect());
