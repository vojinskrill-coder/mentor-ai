// Direct flow: call OpenClaw via Tailscale (same as NestJS does), then check fixFakeImageUrls
const { PrismaClient } = require('@prisma/client');
const { fetch } = require('undici');
const p = new PrismaClient();

const RELAY = 'https://ubuntu-8gb-nbg1-1.tailb04872.ts.net/execute';
const AUTH = '9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d';
const FAL_KEY = 'ddfafd89-421c-4a0e-9a03-cae38d5151da:eef741f5e8a6c330d401d904a4585ffd';

(async () => {
  console.log('=== DIRECT FLOW TEST ===\n');

  // Step 1: Call OpenClaw content agent with search data (same as NestJS executeJobPipeline)
  const prompt = `--- REZULTATI WEB ISTRAZIVANJA ---
**[AI BPM Market](https://marketsandmarkets.com/ai-bpm)** - AI in BPM market $16.2B by 2027, 28.4% CAGR
**[Process Mining](https://grandviewresearch.com/process-mining)** - $1.9B in 2024, $12.1B by 2030
**[Gartner AI](https://gartner.com/ai-2024)** - 75% enterprises operationalize AI by 2026
--- KRAJ WEB ISTRAZIVANJA ---

--- TVOJ ZADATAK ---
Kreiraj marketing kampanju za AI dijagnostiku procesa. Sadrzi:
1. Pozicioniranje i SWOT
2. Ciljne grupe (3 persone)
3. Content plan za 3 meseca sa tabelom
4. KPI tabelu
5. 2 vizuala (koristi ![opis](https://placeholder.img) format)

Srpski, markdown, tabele. Minimum 1000 reci.`;

  console.log('Step 1: Calling content agent via Tailscale...');
  const start = Date.now();
  let agentOutput = '';
  try {
    const res = await fetch(RELAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AUTH}` },
      body: JSON.stringify({ message: prompt, agentId: 'content', sessionId: 'flow-test-' + Date.now(), timeoutSeconds: 180 }),
      signal: AbortSignal.timeout(240000),
    });
    const d = await res.json();
    agentOutput = d.output || '';
    console.log(`  Success: ${d.success} | ${agentOutput.length}ch | ${((Date.now()-start)/1000).toFixed(0)}s`);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
    await p.$disconnect();
    return;
  }

  // Step 2: Check agent output
  console.log('\n--- Step 2: Agent Output Analysis ---');
  const ending = agentOutput.substring(agentOutput.length - 100);
  console.log(`  Length: ${agentOutput.length}ch`);
  console.log(`  Ending: ${ending}`);

  const allImgs = agentOutput.match(/!\[[^\]]*\]\([^)]+\)/g) || [];
  console.log(`  Images: ${allImgs.length}`);
  for (const img of allImgs) console.log(`    ${img.substring(0, 80)}`);

  const citations = agentOutput.match(/\([^\)]*https?:\/\/[^\)]+\)/g) || [];
  console.log(`  Citations: ${citations.length}`);

  const istraziti = (agentOutput.match(/POTREBNO ISTRAZITI|POTREBNO DODATNO/g) || []).length;
  console.log(`  [ISTRAZITI] markers: ${istraziti}`);

  // Step 3: Fix fake images (same as fixFakeImageUrls)
  console.log('\n--- Step 3: Fix Images ---');
  let fixedOutput = agentOutput;
  const imgPattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const matches = [...agentOutput.matchAll(imgPattern)];
  let fixedCount = 0;

  for (const match of matches) {
    const url = match[2] || '';
    let isFake = !url.startsWith('https://') || url.includes('placeholder');
    if (!isFake) {
      try {
        const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        isFake = !r.ok;
      } catch { isFake = true; }
    }

    if (isFake) {
      const falPrompt = match[1] + ', professional photography, high quality';
      try {
        const r = await fetch('https://fal.run/fal-ai/flux/schnell', {
          method: 'POST',
          headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: falPrompt, image_size: 'landscape_16_9', num_images: 1 }),
          signal: AbortSignal.timeout(30000),
        });
        if (r.ok) {
          const d = await r.json();
          const realUrl = d.images?.[0]?.url;
          if (realUrl) {
            fixedOutput = fixedOutput.replace(match[0], `![${match[1]}](${realUrl})`);
            fixedCount++;
            const check = await fetch(realUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
            console.log(`  Fixed ${fixedCount}: ${check.ok ? 'ACCESSIBLE' : 'BROKEN'} ${realUrl.substring(0, 60)}`);
          }
        }
      } catch (e) { console.log(`  FAL error: ${e.message}`); }
    }
  }
  console.log(`  Total fixed: ${fixedCount}/${matches.length}`);

  // Step 4: Simulate DB save
  console.log('\n--- Step 4: DB Save ---');
  console.log(`  Fixed output: ${fixedOutput.length}ch`);
  const falInFinal = (fixedOutput.match(/fal\.media/g) || []).length;
  console.log(`  FAL URLs in final: ${falInFinal}`);

  // Step 5: Save to a test field and read back
  try {
    await p.$executeRawUnsafe("UPDATE notes SET user_report = $1 WHERE id = 'nonexistent_test'", fixedOutput);
    console.log(`  DB write: OK (${fixedOutput.length}ch)`);
  } catch (e) {
    console.log(`  DB write test: ${e.message?.substring(0, 100)}`);
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Agent output: ${agentOutput.length}ch`);
  console.log(`After image fix: ${fixedOutput.length}ch`);
  console.log(`Images: ${fixedCount} real FAL / ${matches.length} total`);
  console.log(`Truncated: ${ending.endsWith('.') || ending.endsWith('\n') || ending.endsWith('---') ? 'NO' : 'POSSIBLY'}`);
  console.log(`[ISTRAZITI]: ${istraziti}`);
  console.log(`Citations: ${citations.length}`);

  await p.$disconnect();
})();
