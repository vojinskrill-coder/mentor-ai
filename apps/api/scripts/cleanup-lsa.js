/**
 * FULL LSA CLEANUP
 * Remove the Luxury Statues Adria tenant and ALL its data from every system.
 */
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');
const p = new PrismaClient();

const LSA_TENANT_ID = 'tnt_rljn1gj4cgxoph0hxfohv6l4';

async function main() {
  console.log('=== REMOVING LSA TENANT: ' + LSA_TENANT_ID + ' ===\n');

  // 1. PG cleanup
  console.log('--- PostgreSQL ---');

  const tables = [
    { name: 'brain_proposals', sql: `DELETE FROM brain_proposals WHERE tenant_id = '${LSA_TENANT_ID}'` },
    { name: 'agent_daily_budgets', sql: `DELETE FROM agent_daily_budgets WHERE tenant_id = '${LSA_TENANT_ID}'` },
    { name: 'agent_jobs', sql: `DELETE FROM agent_jobs WHERE tenant_id = '${LSA_TENANT_ID}'` },
    { name: 'vault_operation_logs', sql: `DELETE FROM vault_operation_logs WHERE tenant_id = '${LSA_TENANT_ID}'` },
  ];

  for (const t of tables) {
    try {
      const r = await p.$executeRawUnsafe(t.sql);
      console.log('  ' + t.name + ':', r, 'deleted');
    } catch (e) {
      console.log('  ' + t.name + ': skipped (' + e.message.substring(0, 50) + ')');
    }
  }

  // Relationships
  const rels = await p.conceptRelationship.deleteMany({ where: { sourceConcept: { tenantId: LSA_TENANT_ID } } });
  console.log('  concept_relationships:', rels.count, 'deleted');

  const rels2 = await p.conceptRelationship.deleteMany({ where: { targetConcept: { tenantId: LSA_TENANT_ID } } });
  console.log('  concept_relationships (target):', rels2.count, 'deleted');

  await p.stageConceptAssignment.deleteMany({ where: { tenantId: LSA_TENANT_ID } });
  console.log('  stage_concept_assignments: deleted');

  const concepts = await p.concept.findMany({ where: { tenantId: LSA_TENANT_ID }, select: { id: true, embeddingId: true } });
  const embeddingIds = concepts.filter(c => c.embeddingId).map(c => c.embeddingId);
  await p.concept.deleteMany({ where: { tenantId: LSA_TENANT_ID } });
  console.log('  concepts:', concepts.length, 'deleted');

  await p.tenantVault.deleteMany({ where: { tenantId: LSA_TENANT_ID } }).catch(() => {});

  // Find users for this tenant
  const users = await p.user.findMany({ where: { tenantId: LSA_TENANT_ID }, select: { id: true } });
  for (const u of users) {
    const convs = await p.conversation.findMany({ where: { userId: u.id }, select: { id: true } });
    if (convs.length > 0) {
      await p.message.deleteMany({ where: { conversationId: { in: convs.map(c => c.id) } } });
    }
    await p.conversation.deleteMany({ where: { userId: u.id } });
  }
  console.log('  conversations: deleted for', users.length, 'users');

  await p.note.deleteMany({ where: { tenantId: LSA_TENANT_ID } });
  console.log('  notes: deleted');

  await p.memory.deleteMany({ where: { tenantId: LSA_TENANT_ID } });
  await p.tokenUsage.deleteMany({ where: { tenantId: LSA_TENANT_ID } });
  await p.dataExport.deleteMany({ where: { tenantId: LSA_TENANT_ID } });
  await p.invitation.deleteMany({ where: { tenantId: LSA_TENANT_ID } });
  await p.agentExecution.deleteMany({ where: { tenantId: LSA_TENANT_ID } });
  console.log('  memory, tokens, exports, invitations, executions: deleted');

  await p.user.deleteMany({ where: { tenantId: LSA_TENANT_ID } });
  console.log('  users:', users.length, 'deleted');

  await p.tenantRegistry.deleteMany({ where: { id: LSA_TENANT_ID } }).catch(() => {});
  await p.tenant.deleteMany({ where: { id: LSA_TENANT_ID } });
  console.log('  tenant: deleted');

  // 2. Qdrant cleanup
  console.log('\n--- Qdrant ---');
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
        console.log('  Deleted', embeddingIds.length, 'Qdrant points');
      } catch (e) {
        console.log('  Qdrant error:', e.message);
      }
    }
  } else {
    console.log('  No Qdrant points to delete');
  }

  // 3. Vault cleanup on relay
  console.log('\n--- Relay Vault ---');
  try {
    const sshKey = process.env.HETZNER_SSH_KEY;
    const host = process.env.HETZNER_HOST || '91.98.231.87';
    if (sshKey) {
      execSync(`ssh -i "${sshKey}" -o StrictHostKeyChecking=no root@${host} "rm -rf /root/.openclaw-${LSA_TENANT_ID} && rm -f /root/.openclaw/workspace/${LSA_TENANT_ID}-vault && echo CLEANED"`, {
        encoding: 'utf-8', shell: 'bash', timeout: 15000
      });
      console.log('  Vault cleaned on relay');
    }
  } catch (e) {
    console.log('  Vault cleanup skipped:', (e.message || '').substring(0, 60));
  }

  // 4. Verify
  console.log('\n--- Verification ---');
  const remaining = await p.tenant.findUnique({ where: { id: LSA_TENANT_ID } });
  console.log('  LSA tenant exists:', !!remaining);
  const remainingConcepts = await p.concept.count({ where: { tenantId: LSA_TENANT_ID } });
  console.log('  LSA concepts:', remainingConcepts);

  console.log('\n=== LSA CLEANUP COMPLETE ===');
}

main().catch(console.error).finally(() => p.$disconnect());
