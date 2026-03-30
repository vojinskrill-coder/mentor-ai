const http = require('http');

const RELAY_URL = 'http://127.0.0.1:3100/execute';
const AUTH_TOKEN = '9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d';

async function callAgent(agentId, message, sessionId) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ message, agentId, sessionId, timeoutSeconds: 180 });
    const start = Date.now();
    const req = http.request(RELAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AUTH_TOKEN}` },
      timeout: 240000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const ms = Date.now() - start;
        try {
          const d = JSON.parse(data);
          resolve({ success: d.success, output: d.output || '', ms });
        } catch {
          resolve({ success: false, output: '', ms, error: 'JSON parse' });
        }
      });
    });
    req.on('error', e => resolve({ success: false, output: '', ms: Date.now() - start, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, output: '', ms: 240000, error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== SPEED & QUALITY TEST: 3 jobs ===');
  const totalStart = Date.now();

  console.log('\n>>> C1: Financial');
  const c1 = await callAgent('financial',
    'Analiziraj finansijski model za TubeIQ SaaS platformu. ROI analiza, pricing model (subscription vs outcome-based), break-even za enterprise klijente. Srpski, markdown, tabele. Minimum 1000 reci.',
    'speed-fin');
  console.log(`  ${c1.ms}ms | ${c1.output.length}ch | success:${c1.success}`);
  console.log(`  Preview: ${c1.output.substring(0, 200)}`);

  console.log('\n>>> C2: Marketing');
  const c2 = await callAgent('marketing',
    `Marketing strategija za TubeIQ Cortex AI platformu. SWOT, pozicioniranje vs Miro/Creately, content plan. Srpski, markdown, tabele. Minimum 1000 reci.\n\n--- Prethodni: Finansijska analiza ---\n${c1.output.substring(0, 2000)}`,
    'speed-mkt');
  console.log(`  ${c2.ms}ms | ${c2.output.length}ch | success:${c2.success}`);
  console.log(`  Preview: ${c2.output.substring(0, 200)}`);

  console.log('\n>>> C3: Sales');
  const c3 = await callAgent('sales',
    `Prodajna strategija za TubeIQ - enterprise B2B. Talk tracks, objection handling, pilot program. Srpski, markdown, tabele. Minimum 1000 reci.\n\n--- Prethodni ---\n${c1.output.substring(0, 1500)}\n${c2.output.substring(0, 1500)}`,
    'speed-sales');
  console.log(`  ${c3.ms}ms | ${c3.output.length}ch | success:${c3.success}`);
  console.log(`  Preview: ${c3.output.substring(0, 200)}`);

  const totalMs = Date.now() - totalStart;
  console.log('\n=== RESULTS ===');
  console.log(`Total: ${(totalMs/1000).toFixed(0)}s`);
  console.log(`C1: ${(c1.ms/1000).toFixed(0)}s ${c1.output.length}ch ${c1.success ? 'OK' : 'FAIL'}`);
  console.log(`C2: ${(c2.ms/1000).toFixed(0)}s ${c2.output.length}ch ${c2.success ? 'OK' : 'FAIL'}`);
  console.log(`C3: ${(c3.ms/1000).toFixed(0)}s ${c3.output.length}ch ${c3.success ? 'OK' : 'FAIL'}`);
  console.log(`Avg per job: ${(totalMs/3000).toFixed(0)}s`);
}

main().catch(e => console.error('FATAL:', e));
