// Full flow test: trigger task via API, wait, check every step
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const p = new PrismaClient();

(async () => {
  console.log('=== FULL FLOW TEST ===\n');

  // Find real tenant/user/task
  const task = await p.note.findFirst({
    where: { status: 'PENDING', noteType: 'TASK' },
    select: { id: true, title: true, tenantId: true, userId: true, content: true },
  });
  if (!task) { console.log('No PENDING task'); await p.$disconnect(); return; }
  console.log('Task:', task.title.substring(0, 50));
  console.log('NoteId:', task.id);

  // Trigger via API
  const token = jwt.sign(
    { sub: task.userId, userId: task.userId, tenantId: task.tenantId },
    'mentor-ai-dev-jwt-secret-change-in-production', { expiresIn: '1h' }
  );

  console.log('\nTriggering headless executor...');
  const triggerRes = await fetch(`http://localhost:3000/api/v1/maturity/execute-task`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: task.id }),
  });
  console.log('Trigger status:', triggerRes.status);
  if (!triggerRes.ok) {
    const err = await triggerRes.text();
    console.log('Trigger error:', err.substring(0, 200));
    // Try alternate endpoint
    const triggerRes2 = await fetch(`http://localhost:3000/api/v1/agent-execution/execute-task/${task.id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    console.log('Alt trigger:', triggerRes2.status);
    if (!triggerRes2.ok) console.log('Alt error:', (await triggerRes2.text()).substring(0, 200));
  }

  // Poll for completion
  console.log('\nPolling...');
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10000));

    const note = await p.note.findUnique({
      where: { id: task.id },
      select: { status: true, userReport: true },
    });
    const jobs = await p.agentJob.findMany({
      where: { noteId: task.id },
      select: { agentType: true, status: true, agentOutput: true },
    });

    const completed = jobs.filter(j => j.status === 'COMPLETED').length;
    const running = jobs.filter(j => ['RUNNING', 'PLANNED'].includes(j.status)).length;
    const failed = jobs.filter(j => j.status === 'FAILED').length;
    console.log(`  ${(i+1)*10}s | note:${note?.status} | jobs:${completed}ok ${running}run ${failed}fail of ${jobs.length}`);

    if (note?.status === 'COMPLETED' || (jobs.length > 0 && running === 0)) {
      console.log('\n=== RESULTS ===');

      // CHECK 1: Agent outputs
      console.log('\n--- Agent Outputs ---');
      for (const j of jobs) {
        const out = j.agentOutput || '';
        const ending = out.substring(out.length - 60);
        const imgs = (out.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
        const falImgs = (out.match(/fal\.media/g) || []).length;
        const truncMarkers = ['...', '[POTREBNO', '[Generisati'].filter(m => out.includes(m)).length;
        console.log(`  ${j.agentType}: ${out.length}ch | imgs:${imgs} fal:${falImgs} | status:${j.status}`);
        console.log(`    END: ${ending}`);
        if (truncMarkers > 0) console.log(`    WARN: has truncation markers`);
      }

      // CHECK 2: Consolidated user_report
      console.log('\n--- User Report (consolidated) ---');
      const report = note?.userReport || '';
      console.log(`  Length: ${report.length}ch`);
      const reportImgs = (report.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
      const reportFal = (report.match(/fal\.media/g) || []).length;
      console.log(`  Images: ${reportImgs} (FAL: ${reportFal})`);
      console.log(`  END: ${report.substring(report.length - 100)}`);

      // CHECK 3: Messages
      const msgs = await p.message.findMany({
        where: { conversationId: task.id },
        select: { content: true, role: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
      console.log(`\n--- Messages: ${msgs.length} ---`);
      for (const m of msgs) {
        const imgs = (m.content.match(/!\[/g) || []).length;
        console.log(`  ${m.role}: ${m.content.length}ch | imgs:${imgs}`);
      }

      break;
    }
  }

  await p.$disconnect();
})();
