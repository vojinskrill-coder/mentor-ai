const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const result = await p.processRun.updateMany({
    where: {
      status: { in: ['RUNNING', 'WAITING_APPROVAL'] },
      workflow: { slug: 'lead-discovery' },
    },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
      error: 'Reset for n8n retest',
    },
  });
  console.log('Reset', result.count, 'runs');
}

main().catch(console.error).finally(() => p.$disconnect());
