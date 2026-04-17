const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const tid = 'tnt_qfcq5w88e6keqlohqv4o6iyi';
  const notes = await p.note.findMany({
    where: { tenantId: tid, status: 'FAILED' },
    select: { id: true, title: true, status: true }
  });
  console.log('Failed notes:', notes.length);
  notes.forEach(n => console.log(' ', n.title));

  // Check completed
  const completed = await p.note.findMany({
    where: { tenantId: tid, status: 'COMPLETED' },
    select: { title: true }
  });
  console.log('\nCompleted notes:', completed.length);
  completed.forEach(n => console.log(' ', n.title));

  // Check assignments
  const stats = await p.stageConceptAssignment.groupBy({
    by: ['status'],
    where: { tenantId: tid },
    _count: true
  });
  console.log('\nAssignment stats:', JSON.stringify(stats));
}
main().catch(console.error).finally(() => p.$disconnect());
