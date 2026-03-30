const http = require('http');
const crypto = require('crypto');

const RELAY_URL = 'http://127.0.0.1:3100/execute';
const AUTH_TOKEN = '9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d';

async function callAgent(tenantProfile, agentId, message, sessionId) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ message, agentId, sessionId, tenantProfile, timeoutSeconds: 120 });
    const start = Date.now();
    const req = http.request(RELAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AUTH_TOKEN}` },
      timeout: 180000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const ms = Date.now() - start;
        try {
          const d = JSON.parse(data);
          resolve({ success: d.success, output: d.output || '', ms, error: d.error });
        } catch {
          resolve({ success: false, output: data.substring(0, 200), ms, error: 'JSON parse failed' });
        }
      });
    });
    req.on('error', e => resolve({ success: false, output: '', ms: Date.now() - start, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, output: '', ms: 120000, error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

function checkIsolation(output, shouldContain, shouldNotContain) {
  const lower = output.toLowerCase();
  const has = shouldContain.filter(k => lower.includes(k.toLowerCase()));
  const leak = shouldNotContain.filter(k => lower.includes(k.toLowerCase()));
  return { has, leak };
}

async function main() {
  console.log('============================================');
  console.log('TENANT ISOLATION TEST: LSA vs TubeIQ');
  console.log('3 jobs per tenant, checking data isolation');
  console.log('============================================');

  const totalStart = Date.now();

  // LSA keywords (should appear) vs TubeIQ keywords (should NOT appear)
  const LSA_WORDS = ['Luxury Statues', 'skulptur', 'bronze', 'marble', 'HNW', 'gallery'];
  const TUBEIQ_WORDS = ['TubeIQ', 'BPM', 'low-code', 'process management', 'digitalization'];

  // === LSA JOBS ===
  console.log('\n>>> LSA Tenant (tnt_lsa) — 3 jobs');

  const lsa1 = await callAgent('tnt_lsa', 'financial', 'Analiziraj finansijski profil kompanije za koju radis. ROI analiza, break-even, cashflow. Srpski, markdown, tabele.', 'iso-lsa-fin');
  console.log(`  financial: ${lsa1.ms}ms | ${lsa1.output.length}ch | success:${lsa1.success}`);
  const lsa1check = checkIsolation(lsa1.output, LSA_WORDS, TUBEIQ_WORDS);
  console.log(`    LSA refs: ${lsa1check.has.join(', ') || 'NONE'} | TubeIQ leaks: ${lsa1check.leak.join(', ') || 'NONE'}`);

  const lsa2 = await callAgent('tnt_lsa', 'marketing', 'Marketing strategija za kompaniju za koju radis. SWOT, pozicioniranje, KPI. Srpski, markdown.', 'iso-lsa-mkt');
  console.log(`  marketing: ${lsa2.ms}ms | ${lsa2.output.length}ch | success:${lsa2.success}`);
  const lsa2check = checkIsolation(lsa2.output, LSA_WORDS, TUBEIQ_WORDS);
  console.log(`    LSA refs: ${lsa2check.has.join(', ') || 'NONE'} | TubeIQ leaks: ${lsa2check.leak.join(', ') || 'NONE'}`);

  const lsa3 = await callAgent('tnt_lsa', 'sales', 'Prodajna strategija za kompaniju za koju radis. Talk tracks, objection handling. Srpski, markdown.', 'iso-lsa-sales');
  console.log(`  sales: ${lsa3.ms}ms | ${lsa3.output.length}ch | success:${lsa3.success}`);
  const lsa3check = checkIsolation(lsa3.output, LSA_WORDS, TUBEIQ_WORDS);
  console.log(`    LSA refs: ${lsa3check.has.join(', ') || 'NONE'} | TubeIQ leaks: ${lsa3check.leak.join(', ') || 'NONE'}`);

  // === TUBEIQ JOBS ===
  console.log('\n>>> TubeIQ Tenant (tnt_tubeiq) — 3 jobs');

  const tiq1 = await callAgent('tnt_tubeiq', 'financial', 'Analiziraj finansijski profil kompanije za koju radis. ROI analiza, pricing model, SaaS metrike. Srpski, markdown, tabele.', 'iso-tiq-fin');
  console.log(`  financial: ${tiq1.ms}ms | ${tiq1.output.length}ch | success:${tiq1.success}`);
  const tiq1check = checkIsolation(tiq1.output, TUBEIQ_WORDS, LSA_WORDS);
  console.log(`    TubeIQ refs: ${tiq1check.has.join(', ') || 'NONE'} | LSA leaks: ${tiq1check.leak.join(', ') || 'NONE'}`);

  const tiq2 = await callAgent('tnt_tubeiq', 'marketing', 'Marketing strategija za kompaniju za koju radis. B2B SaaS pozicioniranje, content strategy. Srpski, markdown.', 'iso-tiq-mkt');
  console.log(`  marketing: ${tiq2.ms}ms | ${tiq2.output.length}ch | success:${tiq2.success}`);
  const tiq2check = checkIsolation(tiq2.output, TUBEIQ_WORDS, LSA_WORDS);
  console.log(`    TubeIQ refs: ${tiq2check.has.join(', ') || 'NONE'} | LSA leaks: ${tiq2check.leak.join(', ') || 'NONE'}`);

  const tiq3 = await callAgent('tnt_tubeiq', 'sales', 'Prodajna strategija za kompaniju za koju radis. Enterprise sales, demo flow, pricing. Srpski, markdown.', 'iso-tiq-sales');
  console.log(`  sales: ${tiq3.ms}ms | ${tiq3.output.length}ch | success:${tiq3.success}`);
  const tiq3check = checkIsolation(tiq3.output, TUBEIQ_WORDS, LSA_WORDS);
  console.log(`    TubeIQ refs: ${tiq3check.has.join(', ') || 'NONE'} | LSA leaks: ${tiq3check.leak.join(', ') || 'NONE'}`);

  // === SUMMARY ===
  const totalMs = Date.now() - totalStart;
  const allLeaks = [
    ...lsa1check.leak, ...lsa2check.leak, ...lsa3check.leak,
    ...tiq1check.leak, ...tiq2check.leak, ...tiq3check.leak
  ];
  const allSuccess = [lsa1, lsa2, lsa3, tiq1, tiq2, tiq3].filter(r => r.success).length;

  console.log('\n============================================');
  console.log(`TOTAL: ${(totalMs/1000).toFixed(0)}s | Success: ${allSuccess}/6`);
  console.log(`DATA LEAKS: ${allLeaks.length === 0 ? 'NONE — ISOLATION CONFIRMED' : allLeaks.join(', ')}`);
  console.log('============================================');
}

main().catch(e => console.error('FATAL:', e));
