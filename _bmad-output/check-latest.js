const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const run = await p.processRun.findFirst({
    where: { id: 'prun_a8z3ta4zrylwdp3hzf37gwr7' },
    include: { stepResults: true },
  });

  if (!run) { console.log('Run not found'); return; }

  console.log('Run status:', run.status);
  console.log('Step results:', run.stepResults.length);

  for (const sr of run.stepResults) {
    console.log('\n--- Step Result:', sr.id, '---');
    console.log('Status:', sr.status);
    const o = sr.output;
    if (o) {
      console.log('Output keys:', Object.keys(o));
      if (o.leads) {
        console.log('LEADS FOUND:', o.leads.length);
        console.log('First lead:', JSON.stringify(o.leads[0]).substring(0, 400));
      }
    }
  }
}

main().catch(console.error).finally(() => p.$disconnect());
