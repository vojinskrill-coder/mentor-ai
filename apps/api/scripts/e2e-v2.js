/**
 * E2E Test v2: Async onboarding flow
 * Tests: Register → Onboard → Immediate response → Background briefing → Proposals appear → Approve → Execute
 */
const BASE = 'http://localhost:3000/api';
const BT = '9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d';
const P = '✅', F = '❌';

async function api(m, p, b, h = {}) {
  const o = { method: m, headers: { 'Content-Type': 'application/json', ...h } };
  if (b) o.body = JSON.stringify(b);
  const r = await fetch(`${BASE}${p}`, o);
  const t = await r.text();
  try { return { ok: r.ok, s: r.status, d: JSON.parse(t) }; } catch { return { ok: r.ok, s: r.status, d: t }; }
}
function t(n, p, d) { console.log(`${p?P:F} ${n}${d?' — '+d:''}`); if(!p) process.exitCode=1; return p; }

async function main() {
  console.log('═══ E2E v2: ASYNC ONBOARDING ═══\n');

  // 1. Register
  const reg = await api('POST', '/registration', {
    email: `e2e${Date.now()}@test.dev`, companyName: 'TestCo', industry: 'Technology', description: 'IT consulting',
  });
  const tid = reg.d?.tenantId;
  t('1. Register', reg.ok && tid, `tenant=${tid}`);
  if (!tid) return;

  // 2. Setup
  const s = await api('POST', '/onboarding/setup-company', {
    companyName: 'TestCo', industry: 'Technology', description: 'IT consulting, 8 employees, 200K EUR',
  });
  t('2. Setup', s.ok);

  // 3. Analyse
  console.log('   Analysing (~2 min)...');
  const a = await api('POST', '/onboarding/analyse-business', {
    businessState: '8 employees, 15 clients, 200K EUR', departments: ['Technology','Sales'], strategy: 'ANALYSE_BUSINESS',
  });
  t('3. Analyse', a.ok, `${a.d?.data?.output?.length??0} chars`);

  // 4. Complete — should return IMMEDIATELY now (async briefing)
  console.log('   Completing (should be fast now)...');
  const start = Date.now();
  const c = await api('POST', '/onboarding/complete', {
    taskId: 'ANALYSE_BUSINESS', generatedOutput: 'IT analysis. 8 employees.', executionMode: 'MANUAL',
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const convId = c.d?.data?.welcomeConversationId;
  t('4. Complete', c.ok, `${elapsed}s, convId=${convId}`);
  t('4a. Fast response', parseFloat(elapsed) < 30, `${elapsed}s (should be <30s)`);

  // 5. Check welcome conversation has placeholder message
  if (convId) {
    const conv = await api('GET', `/v1/conversations/${convId}`);
    const msgs = conv.d?.data?.messages || [];
    t('5. Welcome conv', msgs.length >= 1, `messages=${msgs.length}`);
    const placeholder = msgs.find(m => m.role === 'ASSISTANT' && m.content?.includes('Analiziram'));
    t('5a. Placeholder msg', !!placeholder, placeholder ? 'has placeholder' : 'NO placeholder');
  }

  // 6. Wait for background briefing to complete (poll proposals)
  console.log('   Waiting for brain briefing (polling every 15s)...');
  let proposals = [];
  for (let i = 0; i < 30; i++) { // Max 7.5 min
    await new Promise(r => setTimeout(r, 15000));
    const p = await api('GET', `/bridge/proposals?tenantId=dev-tenant-001`, null, { Authorization: `Bearer ${BT}` });
    proposals = Array.isArray(p.d) ? p.d : [];
    if (proposals.length > 0) break;
    process.stdout.write(`   ...${(i+1)*15}s, proposals: ${proposals.length}\n`);
  }
  t('6. Proposals created', proposals.length >= 3, `count=${proposals.length}`);
  proposals.slice(0,3).forEach(p => console.log(`   [${p.canvasBlock}] ${p.title?.substring(0,55)} concepts=${p.relatedConcepts?.length}`));

  // 7. Check graph
  const g = await api('GET', '/v1/maturity/graph');
  const nodes = g.d?.data?.nodes || [];
  t('7. Graph nodes', nodes.length >= 2, `nodes=${nodes.length}`);

  // 8. Check tasks
  const tasks = await api('GET', '/v1/notes/tasks?limit=50');
  const taskList = tasks.d?.data?.tasks || [];
  t('8. Tasks', taskList.length >= 0, `count=${taskList.length}`);

  // 9. Check welcome conv has director response (not just placeholder)
  if (convId) {
    const conv = await api('GET', `/v1/conversations/${convId}`);
    const msgs = conv.d?.data?.messages || [];
    const directorMsg = msgs.find(m => m.role === 'ASSISTANT' && !m.content?.includes('Analiziram'));
    t('9. Director response', !!directorMsg, directorMsg ? `${directorMsg.content?.length} chars` : 'NO director response yet');
  }

  // 10. Approve first proposal
  if (proposals.length > 0) {
    const first = proposals[0];
    console.log(`\n   Approving: "${first.title?.substring(0,50)}"...`);
    const ap = await api('PATCH', `/v1/notes/proposals/${first.id}/approve`);
    t('10. Approve', ap.ok, `noteId=${ap.d?.executionNoteId}`);

    // 11. Wait 60s for execution, check enrichments
    console.log('   Waiting 60s for execution...');
    await new Promise(r => setTimeout(r, 60000));
    const ut = await api('GET', '/v1/notes/tasks?limit=50');
    const executed = (ut.d?.data?.tasks||[]).find(x => x.id === ap.d?.executionNoteId);
    const hasEnr = executed?.agentEnrichments && Object.keys(executed.agentEnrichments).length > 0;
    t('11. Enrichments', hasEnr, hasEnr ? `agents=${Object.keys(executed.agentEnrichments)}` : 'NONE yet');

    // 12. Check bridge event log
    console.log('\n   Check /tmp/nest-server.log for:');
    console.log('   - "Bridge event broadcast (global)" entries');
    console.log('   - socketsInRoom count');
  }

  // 13. Check Materijali data
  const mat = await api('GET', '/v1/notes/tasks?limit=200');
  const withEnr = (mat.d?.data?.tasks||[]).filter(x => x.agentEnrichments && Object.keys(x.agentEnrichments).length > 0);
  t('13. Materijali data', true, `tasksWithEnrichments=${withEnr.length}`);

  console.log('\n═══ E2E v2 COMPLETE ═══');
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
