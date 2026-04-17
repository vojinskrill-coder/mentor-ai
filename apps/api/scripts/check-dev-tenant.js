const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const t = await p.tenant.findFirst({ where: { name: { contains: 'TestCorp' } } });
  if (!t) { console.log('Tenant not created yet'); return; }
  console.log('Tenant:', t.id, t.name, 'status:', t.status, 'stage:', t.maturityStage);

  const c = await p.concept.count({ where: { tenantId: t.id } });
  console.log('Concepts:', c);

  const a = await p.$queryRaw`SELECT status, count(*)::int as cnt FROM stage_concept_assignments WHERE tenant_id=${t.id} GROUP BY status`;
  console.log('Assignments:', JSON.stringify(a));

  const concepts = await p.concept.findMany({ where: { tenantId: t.id }, select: { name: true, slug: true, category: true }, take: 10 });
  console.log('\nSample concepts:');
  concepts.forEach(cc => console.log(' ', cc.category, '-', cc.name, '[' + cc.slug + ']'));

  // Check enrichment status
  const execStatus = await fetch('http://localhost:3000/api/v1/maturity/execution-status', {
    headers: { 'x-tenant-id': t.id, 'x-user-id': 'dev-user-001' }
  }).then(r => r.json()).catch(() => null);
  if (execStatus) console.log('\nEnrichment:', JSON.stringify(execStatus.data));
}

main().catch(console.error).finally(() => p.$disconnect());
