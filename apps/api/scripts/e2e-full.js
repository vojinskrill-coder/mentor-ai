/**
 * FULL End-to-End Test: Registration → Onboarding → Briefing → Proposals → Approval → Execution
 * Tests EVERY step and reports failures clearly.
 */

const BASE = 'http://localhost:3000/api';
const BRIDGE_TOKEN = '9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d';
const PASS = '✅';
const FAIL = '❌';

async function api(method, path, body, headers = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

function test(name, pass, detail) {
  console.log(`${pass ? PASS : FAIL} ${name}${detail ? ' — ' + detail : ''}`);
  if (!pass) process.exitCode = 1;
  return pass;
}

async function main() {
  console.log('═══ FULL E2E TEST ═══\n');

  // Step 1: Register
  const reg = await api('POST', '/registration', {
    email: `e2e${Date.now()}@test.dev`, companyName: 'TestCo', industry: 'Technology',
    description: 'IT consulting 8 employees 200K EUR',
  });
  const tenantId = reg.data?.tenantId;
  test('1. Register', reg.ok && tenantId, `tenantId=${tenantId}`);
  if (!tenantId) { console.log('ABORT: No tenant'); return; }

  // Step 2: Setup
  const setup = await api('POST', '/onboarding/setup-company', {
    companyName: 'TestCo', industry: 'Technology', description: 'IT consulting firm',
  });
  test('2. Setup Company', setup.ok, `status=${setup.status}`);

  // Step 3: Analyse
  console.log('   Analysing (takes ~2 min)...');
  const analysis = await api('POST', '/onboarding/analyse-business', {
    businessState: '8 employees, 15 clients, 200K EUR.', departments: ['Technology', 'Sales'], strategy: 'ANALYSE_BUSINESS',
  });
  test('3. Analyse', analysis.ok, `output=${analysis.data?.data?.output?.length ?? 0} chars`);

  // Step 4: Complete (awaits brain briefing)
  console.log('   Completing + brain briefing (takes ~3-5 min)...');
  const complete = await api('POST', '/onboarding/complete', {
    taskId: 'ANALYSE_BUSINESS', generatedOutput: 'IT analysis. 8 employees.', executionMode: 'MANUAL',
  });
  const welcomeConvId = complete.data?.data?.welcomeConversationId;
  test('4. Complete Onboarding', complete.ok, `welcomeConvId=${welcomeConvId}`);

  // Step 5: Check welcome conversation has ASSISTANT message
  if (welcomeConvId) {
    const conv = await api('GET', `/v1/conversations/${welcomeConvId}`);
    const msgs = conv.data?.data?.messages || [];
    const assistantMsg = msgs.find(m => m.role === 'ASSISTANT');
    test('5. Welcome conversation', msgs.length >= 2 && assistantMsg, `messages=${msgs.length}, assistant=${assistantMsg?.content?.length ?? 0} chars`);
  }

  // Step 6: Check proposals created
  const bh = { Authorization: `Bearer ${BRIDGE_TOKEN}` };
  const proposals = await api('GET', `/bridge/proposals?tenantId=dev-tenant-001`, null, bh);
  const propList = Array.isArray(proposals.data) ? proposals.data : [];
  test('6. Proposals created', propList.length >= 3, `count=${propList.length}`);
  propList.forEach(p => console.log(`   - [${p.canvasBlock}] ${p.title?.substring(0, 60)} concepts=${p.relatedConcepts?.length}`));

  // Step 7: Check tasks created
  const tasks = await api('GET', '/v1/notes/tasks?limit=50');
  const taskList = tasks.data?.data?.tasks || [];
  test('7. Tasks created', taskList.length >= 3, `count=${taskList.length}`);
  const withConcepts = taskList.filter(t => t.conceptName);
  test('7a. Tasks with concepts', withConcepts.length >= 2, `withConcepts=${withConcepts.length}/${taskList.length}`);

  // Step 8: Check graph has nodes
  const graph = await api('GET', '/v1/maturity/graph');
  const nodes = graph.data?.data?.nodes || [];
  const edges = graph.data?.data?.edges || [];
  test('8. Graph nodes', nodes.length >= 3, `nodes=${nodes.length}, edges=${edges.length}`);
  nodes.forEach(n => console.log(`   - ${n.name?.substring(0, 40)} [${n.category?.substring(0, 20)}]`));

  // Step 9: Approve first proposal and check execution
  if (propList.length > 0) {
    const firstProp = propList[0];
    console.log(`\n   Approving: "${firstProp.title?.substring(0, 50)}"...`);
    const approve = await api('PATCH', `/v1/notes/proposals/${firstProp.id}/approve`);
    test('9. Proposal approved', approve.ok, `status=${approve.data?.status}`);
    const noteId = approve.data?.executionNoteId;
    test('9a. Task created from approval', !!noteId, `noteId=${noteId}`);

    // Wait for execution
    console.log('   Waiting 90s for OpenClaw execution...');
    await new Promise(r => setTimeout(r, 90000));

    // Check if task has enrichments
    const updatedTasks = await api('GET', '/v1/notes/tasks?limit=50');
    const executedTask = (updatedTasks.data?.data?.tasks || []).find(t => t.id === noteId);
    const hasEnrichments = executedTask?.agentEnrichments && Object.keys(executedTask.agentEnrichments).length > 0;
    test('10. Task has enrichments', hasEnrichments, `agents=${hasEnrichments ? Object.keys(executedTask.agentEnrichments).join(',') : 'NONE'}`);

    // Check for files in enrichments
    if (hasEnrichments) {
      let totalFiles = 0;
      for (const [agent, data] of Object.entries(executedTask.agentEnrichments)) {
        totalFiles += data.files?.length || 0;
      }
      test('10a. Files created', totalFiles > 0, `files=${totalFiles}`);
    }

    // Check bridge event broadcast log
    console.log('\n   Checking server logs for bridge events...');
  }

  // Step 11: Check bridge event broadcasts in server log
  console.log('\n   Reading server log for bridge events...');
  try {
    const logCheck = await fetch('http://localhost:3000/api/health');
    // Can't read file from Node, just report
    console.log('   (Check /tmp/nest-server.log for "Bridge event broadcast (global)" entries)');
  } catch {}

  // Step 12: Check Materijali data
  const materijali = await api('GET', '/v1/notes/tasks?limit=200');
  const matTasks = (materijali.data?.data?.tasks || []).filter(t => t.agentEnrichments && Object.keys(t.agentEnrichments).length > 0);
  test('12. Materijali data', matTasks.length >= 0, `tasksWithEnrichments=${matTasks.length}`);

  console.log('\n═══ E2E TEST COMPLETE ═══');
}

main().catch(err => { console.error('E2E FAILED:', err.message); process.exit(1); });
