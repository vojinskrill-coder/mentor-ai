const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const tid = 'tnt_qfcq5w88e6keqlohqv4o6iyi';

  const totalRels = await p.conceptRelationship.count();
  console.log('Total platform relationships:', totalRels);

  const tenantRels = await p.conceptRelationship.count({
    where: { sourceConcept: { tenantId: tid } }
  });
  console.log('Tenant relationships:', tenantRels);

  const tenantConcepts = await p.concept.count({ where: { tenantId: tid } });
  console.log('Tenant concepts:', tenantConcepts);

  // Show relationship types
  const relTypes = await p.conceptRelationship.groupBy({
    by: ['type'],
    _count: true
  });
  console.log('Relationship types:', JSON.stringify(relTypes));

  // Sample relationships for tenant
  const samples = await p.conceptRelationship.findMany({
    where: { sourceConcept: { tenantId: tid } },
    take: 10,
    include: {
      sourceConcept: { select: { name: true } },
      targetConcept: { select: { name: true } }
    }
  });
  console.log('\nSample tenant relationships:');
  samples.forEach(r => console.log(' ', r.sourceConcept.name, '-[' + r.type + ']->', r.targetConcept.name));
}

main().catch(console.error).finally(() => p.$disconnect());
