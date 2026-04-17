const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const user = await p.user.findFirst({ where: { email: { contains: 'nafata' } }, select: { tenantId: true } });
  const tid = user.tenantId;

  // Find the enriched concept
  const concept = await p.concept.findFirst({
    where: { tenantId: tid, slug: 'osiguranje' },
    select: { id: true, name: true, slug: true, extendedDescription: true, confidence: true },
  });

  console.log('Concept:', concept?.name, '| slug:', concept?.slug);
  console.log('PG content:', concept?.extendedDescription?.length ?? 0, 'chars');
  console.log('Confidence:', concept?.confidence);

  // Call the vault endpoint
  const resp = await fetch(`http://localhost:3000/api/v1/vault/concept/${concept.id}?tenantId=${tid}`, {
    headers: { 'x-user-id': 'test', 'x-tenant-id': tid },
  });
  const data = await resp.json();

  const content = data.data?.extendedDescription || 'NO CONTENT FIELD';
  console.log('\nVault endpoint response:');
  console.log('  Content length:', content.length);
  console.log('  First 200 chars:', content.substring(0, 200));
  console.log('  From vault:', content.length > 5000 ? 'YES (vault)' : 'NO (PG or empty)');
}

main().catch(console.error).finally(() => p.$disconnect());
