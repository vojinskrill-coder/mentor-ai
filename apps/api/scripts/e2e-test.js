/**
 * End-to-End Test: Registration → Onboarding → OpenClaw Briefing → Chat
 * Run: node scripts/e2e-test.js
 */

const BASE = 'http://localhost:3000/api';
const BRIDGE_TOKEN = '9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d';

async function api(method, path, body, headers = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  E2E Test: OpenClaw Business Brain');
  console.log('═══════════════════════════════════════════');
  console.log('');

  // Step 1: Register
  console.log('▶ Step 1: Register');
  const reg = await api('POST', '/registration', {
    email: `test${Date.now()}@mentorbrain.dev`,
    companyName: 'TechNova Solutions',
    industry: 'Technology',
    description: 'IT konsalting firma za digitalizaciju MSP u Srbiji',
  });
  console.log(`  Status: ${reg.status}`);
  if (reg.status !== 201 && reg.status !== 200) {
    console.log('  ERROR:', JSON.stringify(reg.data).substring(0, 200));
    return;
  }
  const { tenantId, userId } = reg.data;
  console.log(`  TenantId: ${tenantId}`);
  console.log(`  UserId: ${userId}`);
  console.log('');

  // Step 2: Setup Company
  console.log('▶ Step 2: Setup Company');
  const setup = await api('POST', '/onboarding/setup-company', {
    companyName: 'TechNova Solutions',
    industry: 'Technology',
    description: 'IT konsalting firma specijalizovana za digitalizaciju malih i srednjih preduzeca. 8 zaposlenih, 15 klijenata, 200K EUR godisnje.',
  });
  console.log(`  Status: ${setup.status}`);
  console.log(`  Data: ${JSON.stringify(setup.data).substring(0, 100)}`);
  console.log('');

  // Step 3: Analyse Business
  console.log('▶ Step 3: Analyse Business (this takes ~2 min)...');
  const start = Date.now();
  const analysis = await api('POST', '/onboarding/analyse-business', {
    businessState: 'Imamo 8 zaposlenih, 15 klijenata. Godisnji prihod 200K EUR. Fokus: cloud migracije, custom softver.',
    departments: ['Technology', 'Sales', 'Marketing'],
    strategy: 'ANALYSE_BUSINESS',
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  Status: ${analysis.status} (${elapsed}s)`);
  const output = analysis.data?.data?.output ?? '';
  console.log(`  Output length: ${output.length} chars`);
  console.log(`  First 200: ${output.substring(0, 200)}...`);
  console.log('');

  // Step 4: Complete Onboarding (this triggers OpenClaw briefing!)
  console.log('▶ Step 4: Complete Onboarding (triggers OpenClaw briefing)...');
  const startComplete = Date.now();
  const complete = await api('POST', '/onboarding/complete', {
    taskId: 'ANALYSE_BUSINESS',
    generatedOutput: output.substring(0, 3000) || 'Analiza biznisa za TechNova Solutions.',
    executionMode: 'MANUAL',
  });
  const elapsedComplete = ((Date.now() - startComplete) / 1000).toFixed(1);
  console.log(`  Status: ${complete.status} (${elapsedComplete}s)`);
  if (complete.data?.data) {
    const d = complete.data.data;
    console.log(`  TaskIds: ${d.taskIds?.length ?? 0} tasks created`);
    console.log(`  WelcomeConversation: ${d.welcomeConversationId}`);
    console.log(`  PlanId: ${d.planId}`);
    console.log(`  ExecutionMode: ${d.executionMode}`);
  } else {
    console.log(`  Data: ${JSON.stringify(complete.data).substring(0, 300)}`);
  }
  console.log('');

  // Step 5: Verify Bridge API works
  console.log('▶ Step 5: Verify Bridge API');
  const bridgeHeaders = { Authorization: `Bearer ${BRIDGE_TOKEN}` };

  const categories = await api('GET', '/bridge/categories', null, bridgeHeaders);
  console.log(`  Categories: ${categories.status} (${Array.isArray(categories.data) ? categories.data.length : '?'} items)`);

  const brainState = await api('GET', `/bridge/brain-state?tenantId=${tenantId}`, null, bridgeHeaders);
  console.log(`  Brain State: ${brainState.status}`);
  if (brainState.data?.canvasBlocks) {
    console.log(`    Canvas blocks: ${brainState.data.canvasBlocks.length}`);
    console.log(`    Pending proposals: ${brainState.data.pendingProposals}`);
    console.log(`    Pending concepts: ${brainState.data.pendingConcepts}`);
    console.log(`    Budget remaining: €${brainState.data.budgetRemaining}`);
  }

  const pending = await api('GET', `/bridge/concepts/pending?tenantId=${tenantId}`, null, bridgeHeaders);
  console.log(`  Pending concepts: ${pending.status} (${Array.isArray(pending.data) ? pending.data.length : '?'} items)`);

  const search = await api('GET', `/bridge/concepts/search?q=prodaja&tenantId=${tenantId}`, null, bridgeHeaders);
  console.log(`  Search "prodaja": ${search.status} (${Array.isArray(search.data) ? search.data.length : '?'} results)`);
  console.log('');

  // Step 6: Check if USER.md was deployed to Hetzner
  console.log('▶ Step 6: Check Hetzner deployment');
  console.log('  (Check server logs for "USER.md deployed" and "OpenClaw director briefed")');
  console.log('  Run: tail -50 /tmp/nest-server.log | grep -i "openclaw\\|user.md\\|agents.md\\|briefed"');
  console.log('');

  console.log('═══════════════════════════════════════════');
  console.log('  E2E Test Complete');
  console.log('═══════════════════════════════════════════');
}

main().catch(err => {
  console.error('E2E Test failed:', err.message);
  process.exit(1);
});
