const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const results = await p.processStepResult.findMany({
    where: { run: { workflow: { slug: 'lead-discovery' } }, status: 'PENDING' },
    select: { output: true },
    orderBy: { startedAt: 'desc' },
    take: 1,
  });

  if (!results.length) { console.log('No results'); return; }
  const leads = results[0].output?.leads || [];
  console.log('Total leads:', leads.length);

  for (const l of leads) {
    console.log('\n---', l.company, '---');
    console.log('  score:', l.score);
    console.log('  email:', l.email);
    console.log('  linkedin:', l.linkedin);
    console.log('  phone:', l.phone);
    console.log('  companyDescription:', (l.companyDescription || 'MISSING').substring(0, 80));
    console.log('  whyGoodFit:', (l.whyGoodFit || 'MISSING').substring(0, 80));
    console.log('  outreach:', l.outreach ? 'HAS DATA' : 'NULL');
    console.log('  recentProjects:', l.recentProjects ? l.recentProjects.length + ' items' : 'MISSING');
  }
}

main().catch(console.error).finally(() => p.$disconnect());
