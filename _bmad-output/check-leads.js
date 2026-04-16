const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Find latest pending step result for lead-discovery
  const results = await p.processStepResult.findMany({
    where: { run: { workflow: { slug: 'lead-discovery' } }, status: 'PENDING' },
    select: { id: true, status: true, output: true },
    orderBy: { startedAt: 'desc' },
    take: 1,
  });

  if (results.length === 0) {
    console.log('No pending results found');
    // Check any recent results
    const any = await p.processStepResult.findMany({
      where: { run: { workflow: { slug: 'lead-discovery' } } },
      select: { id: true, status: true },
      orderBy: { startedAt: 'desc' },
      take: 5,
    });
    console.log('Recent results:', any);
    return;
  }

  const r = results[0];
  const o = r.output;
  console.log('Step result ID:', r.id);
  console.log('Status:', r.status);
  console.log('Output keys:', o ? Object.keys(o) : 'null');
  if (o && o.leads) {
    console.log('Leads count:', o.leads.length);
    console.log('First lead:', JSON.stringify(o.leads[0]).substring(0, 500));
  }
}

main().catch(console.error).finally(() => p.$disconnect());
