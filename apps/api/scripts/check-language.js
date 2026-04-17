const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const user = await p.user.findFirst({ where: { email: { contains: 'nafata' } }, select: { tenantId: true } });
  if (!user) { console.log('No user'); return; }
  const tid = user.tenantId;
  console.log('Tenant:', tid);

  // Check enriched content language
  const enriched = await p.concept.findMany({
    where: { tenantId: tid, confidence: { gte: 0.7 } },
    select: { name: true, extendedDescription: true },
  });
  console.log('\nEnriched concepts:', enriched.length);
  for (const c of enriched) {
    const content = (c.extendedDescription || '').substring(0, 300);
    const serbian = /[čćšžđ]/i.test(content) || /\bkoji|koja|koje|može|biti|kako|ali|ili|nije|već|kada|što\b/i.test(content);
    console.log('  ' + c.name + ': ' + (serbian ? 'SERBIAN' : 'ENGLISH'));
    console.log('    ' + content.substring(0, 120));
  }

  // Check non-enriched definitions
  const nonEnriched = await p.concept.findMany({
    where: { tenantId: tid, confidence: { lt: 0.7 } },
    select: { name: true, definition: true },
    take: 3,
  });
  console.log('\nNon-enriched definitions:');
  for (const c of nonEnriched) {
    const def = (c.definition || '').substring(0, 120);
    const serbian = /[čćšžđ]/i.test(def) || /\bkoji|koja|koje|može|biti|kako|ali|ili|nije|već|kada|što\b/i.test(def);
    console.log('  ' + c.name + ': ' + (serbian ? 'SERBIAN' : 'ENGLISH'));
    console.log('    ' + def);
  }

  // Check stage assignments
  const sa = await p.stageConceptAssignment.groupBy({ by: ['status'], where: { tenantId: tid }, _count: true });
  console.log('\nStage assignments:', JSON.stringify(sa));
}

main().catch(console.error).finally(() => p.$disconnect());
