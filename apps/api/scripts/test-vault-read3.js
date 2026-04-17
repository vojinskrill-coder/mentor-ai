const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const user = await p.user.findFirst({ where: { email: { contains: 'nafata' } }, select: { tenantId: true } });
  const tid = user.tenantId;
  const concept = await p.concept.findFirst({
    where: { tenantId: tid, slug: 'osiguranje' },
    select: { id: true },
  });

  const url = `http://localhost:3000/api/v1/vault/concept/${concept.id}?tenantId=${tid}`;
  console.log('Calling:', url);

  const resp = await fetch(url, {
    headers: { 'x-user-id': 'dev-user-001', 'x-tenant-id': tid },
  });
  console.log('Status:', resp.status);
  const text = await resp.text();
  console.log('Response length:', text.length);
  console.log('Response preview:', text.substring(0, 300));
}

main().catch(console.error).finally(() => p.$disconnect());
