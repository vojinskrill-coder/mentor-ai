const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  console.log('=== E2E TASK TEST ===\n');

  // Find a real tenant and user
  const tenant = await p.tenant.findFirst({ select: { id: true, name: true } });
  const user = await p.user.findFirst({ select: { id: true } });
  if (!tenant || !user) { console.log('No tenant/user'); return; }
  console.log('Tenant:', tenant.name, tenant.id);
  console.log('User:', user.id);

  // Create a test task note
  const noteId = 'note_e2e_test_' + Date.now();
  const concept = await p.concept.findFirst({ select: { id: true, name: true } });

  await p.note.create({
    data: {
      id: noteId,
      title: 'E2E Test: Kreirajte marketing kampanju za lansiranje novog AI modula',
      content: 'Kreirajte kompletnu marketing kampanju za lansiranje novog AI modula za automatsku dijagnostiku poslovnih procesa. Kampanja treba da sadrzi: pozicioniranje, ciljnu grupu, kljucne poruke, vizuale za drustvene mreze, i metrke uspeha.',
      noteType: 'TASK',
      status: 'PENDING',
      source: 'AI',
      userId: user.id,
      tenantId: tenant.id,
      conceptId: concept?.id || null,
    },
  });
  console.log('Task created:', noteId);

  // Trigger headless executor via HTTP (same as task panel does)
  console.log('\nTriggering execution...');
  const triggerStart = Date.now();

  // Call the trigger endpoint - simulate what frontend does
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ sub: user.id, userId: user.id, tenantId: tenant.id }, 'mentor-ai-dev-jwt-secret-change-in-production', { expiresIn: '1h' });

  const res = await fetch(`http://localhost:3000/api/v1/agent-execution/trigger/${noteId}/content`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  console.log('Trigger response:', res.status);

  // Wait for execution to complete (poll every 10s, max 5 min)
  console.log('Waiting for completion...');
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const jobs = await p.agentJob.findMany({
      where: { noteId },
      select: { agentType: true, status: true, agentOutput: true },
    });
    const completed = jobs.filter(j => j.status === 'COMPLETED').length;
    const failed = jobs.filter(j => j.status === 'FAILED').length;
    const running = jobs.filter(j => j.status === 'RUNNING').length;
    console.log(`  ${i * 10}s: ${completed} completed, ${running} running, ${failed} failed of ${jobs.length} total`);

    if (jobs.length > 0 && running === 0 && jobs.every(j => ['COMPLETED', 'FAILED'].includes(j.status))) {
      const elapsed = Date.now() - triggerStart;
      console.log(`\nExecution finished in ${(elapsed / 1000).toFixed(0)}s`);

      // CHECK 1: Output sizes
      console.log('\n=== CHECK 1: Output sizes ===');
      for (const j of jobs) {
        const len = j.agentOutput?.length || 0;
        const ending = (j.agentOutput || '').substring((j.agentOutput || '').length - 80);
        const truncated = len > 100 && !ending.endsWith('.') && !ending.endsWith('\n') && !ending.endsWith('---') && !ending.endsWith('*') && !ending.endsWith('|');
        console.log(`  ${j.agentType}: ${len}ch | truncated: ${truncated} | status: ${j.status}`);
        if (truncated) console.log(`    END: ${ending.substring(ending.length - 60)}`);
      }

      // CHECK 2: Images
      console.log('\n=== CHECK 2: Images ===');
      for (const j of jobs) {
        const out = j.agentOutput || '';
        const imgs = out.match(/!\[[^\]]*\]\([^)]+\)/g) || [];
        const falImgs = out.match(/fal\.media/g) || [];
        const fakeImgs = out.match(/POTREBNO GENERISATI|placeholder/g) || [];
        console.log(`  ${j.agentType}: ${imgs.length} imgs | ${falImgs.length} FAL | ${fakeImgs.length} fake`);
      }

      // CHECK 3: Verify FAL URLs accessible
      console.log('\n=== CHECK 3: Image accessibility ===');
      for (const j of jobs) {
        const urls = (j.agentOutput || '').match(/https:\/\/v3b\.fal\.media[^)]+/g) || [];
        for (const url of urls.slice(0, 2)) {
          try {
            const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
            console.log(`  ${r.ok ? 'OK' : 'BROKEN'} ${r.headers.get('content-type')} ${url.substring(0, 60)}`);
          } catch (e) {
            console.log(`  ERROR ${url.substring(0, 60)}`);
          }
        }
      }

      // CHECK 4: Note user_report (consolidation)
      console.log('\n=== CHECK 4: Consolidated user_report ===');
      const note = await p.note.findUnique({ where: { id: noteId }, select: { userReport: true, status: true } });
      console.log(`  Status: ${note?.status} | Report: ${(note?.userReport || '').length}ch`);
      if (note?.userReport) {
        const reportImgs = (note.userReport.match(/!\[/g) || []).length;
        console.log(`  Images in report: ${reportImgs}`);
      }

      // CLEANUP
      await p.agentJob.deleteMany({ where: { noteId } });
      await p.agentExecution.deleteMany({ where: { noteId } });
      await p.note.delete({ where: { id: noteId } });
      console.log('\nTest task cleaned up.');

      break;
    }
  }

  await p.$disconnect();
})();
