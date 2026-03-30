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
        try { const d = JSON.parse(data); resolve({ success: d.success, output: d.output || '', ms }); }
        catch { resolve({ success: false, output: '', ms, error: 'parse' }); }
      });
    });
    req.on('error', e => resolve({ success: false, output: '', ms: Date.now() - start, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, output: '', ms: 240000, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function main() {
  console.log('=== QUALITY TEST: 2 jobs ===');

  console.log('\n>>> Job 1: Financial');
  const j1 = await callAgent('financial',
    'Analiziraj finansijski model za SaaS platformu. ROI, pricing (subscription vs outcome-based), break-even, 3 scenarija. Srpski, markdown, tabele. Minimum 1000 reci, budi detaljan.',
    'qual-fin');
  console.log(`  ${(j1.ms/1000).toFixed(0)}s | ${j1.output.length}ch | success:${j1.success}`);

  const hasTable = j1.output.includes('|') && j1.output.includes('---');
  const hasBold = j1.output.includes('**');
  const hasHeaders = j1.output.includes('##');
  console.log(`  Tables: ${hasTable} | Bold: ${hasBold} | Headers: ${hasHeaders}`);
  console.log(`  Preview: ${j1.output.substring(0, 300)}`);

  console.log('\n>>> Job 2: Marketing (with J1 context)');
  const j2 = await callAgent('marketing',
    `Marketing strategija za SaaS platformu. SWOT, pozicioniranje, content plan, KPI. Srpski, markdown. Minimum 1000 reci.\n\n--- Prethodni: Finansijska analiza ---\n${j1.output.substring(0, 3000)}`,
    'qual-mkt');
  console.log(`  ${(j2.ms/1000).toFixed(0)}s | ${j2.output.length}ch | success:${j2.success}`);

  const hasTable2 = j2.output.includes('|') && j2.output.includes('---');
  const crossRef = j2.output.toLowerCase().includes('roi') || j2.output.toLowerCase().includes('finansij');
  console.log(`  Tables: ${hasTable2} | Cross-collab (refs financial): ${crossRef}`);
  console.log(`  Preview: ${j2.output.substring(0, 300)}`);

  console.log('\n=== SUMMARY ===');
  console.log(`J1: ${j1.success ? 'OK' : 'FAIL'} ${j1.output.length}ch ${(j1.ms/1000).toFixed(0)}s`);
  console.log(`J2: ${j2.success ? 'OK' : 'FAIL'} ${j2.output.length}ch ${(j2.ms/1000).toFixed(0)}s`);
  console.log(`Cross-collaboration: ${crossRef}`);
}
main().catch(e => console.error('FATAL:', e));
