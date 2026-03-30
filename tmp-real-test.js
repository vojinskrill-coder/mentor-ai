const http = require('http');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const RELAY = 'http://127.0.0.1:3100/execute';
const AUTH = '9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d';
const FAL_KEY = 'ddfafd89-421c-4a0e-9a03-cae38d5151da:eef741f5e8a6c330d401d904a4585ffd';

function callRelay(agentId, message, sessionId) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ message, agentId, sessionId, timeoutSeconds: 180 });
    const start = Date.now();
    const req = http.request(RELAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AUTH}` },
      timeout: 240000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { const d = JSON.parse(data); resolve({ success: d.success, output: d.output || '', ms: Date.now() - start }); }
        catch { resolve({ success: false, output: '', ms: Date.now() - start }); }
      });
    });
    req.on('error', e => resolve({ success: false, output: '', ms: Date.now() - start }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, output: '', ms: 240000 }); });
    req.write(body); req.end();
  });
}

(async () => {
  console.log('=== REAL E2E TEST ===\n');

  // Step 1: Call content agent with search results + instruction (like NestJS does)
  const prompt = `--- REZULTATI WEB ISTRAZIVANJA ---
### Pretraga: "AI process diagnostics SaaS market size 2024"
**[AI in Business Process Management Market](https://www.marketsandmarkets.com/ai-bpm)** - Global AI in BPM market projected to reach $16.2B by 2027, growing at 28.4% CAGR.
**[Process Mining Market Report](https://www.grandviewresearch.com/process-mining)** - Process mining market valued at $1.9B in 2024, expected $12.1B by 2030.
**[Gartner AI Automation](https://www.gartner.com/ai-automation-2024)** - 75% of enterprises will shift from piloting to operationalizing AI by 2026.
--- KRAJ WEB ISTRAZIVANJA ---

KRITICNO: Koristi SAMO podatke iz izvora iznad. Svaku cinjenicu citiraj sa izvorom.

--- TVOJ ZADATAK ---
Kreiraj kompletnu marketing kampanju za lansiranje AI modula za automatsku dijagnostiku poslovnih procesa. Kampanja treba da sadrzi:
1. Pozicioniranje na trzistu
2. SWOT analiza
3. Ciljne grupe sa personama
4. Kljucne poruke po segmentu
5. Content plan za 3 meseca
6. KPI-jevi i metrike uspeha
7. 2 vizuala za drustvene mreze (generisi slike koristeci ![opis](url) format)

Srpski jezik, markdown, tabele. Minimum 1000 reci.`;

  console.log('Step 1: Calling content agent...');
  const result = await callRelay('content', prompt, 'real-e2e-content');
  console.log(`Output: ${result.output.length}ch | ${(result.ms/1000).toFixed(0)}s | success:${result.success}`);

  // Check truncation
  const ending = result.output.substring(result.output.length - 80);
  const truncated = result.output.length > 100 && !ending.endsWith('.') && !ending.endsWith('\n') && !ending.endsWith('---') && !ending.endsWith('*') && !ending.endsWith('|') && !ending.endsWith(')');
  console.log(`Truncated: ${truncated}`);
  console.log(`Last 80ch: ${ending}`);

  // Check images
  const imgPattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const imgs = [...result.output.matchAll(imgPattern)];
  console.log(`Images found: ${imgs.length}`);
  for (const img of imgs) {
    console.log(`  ALT: ${img[1]?.substring(0, 60)}`);
    console.log(`  URL: ${img[2]?.substring(0, 60)}`);
  }

  // Check sources cited
  const citations = result.output.match(/\([^)]*https?:\/\/[^)]+\)/g) || [];
  console.log(`Citations: ${citations.length}`);

  // Step 2: Fix fake images (like NestJS fixFakeImageUrls does)
  if (imgs.length > 0) {
    console.log('\nStep 2: Fixing fake images via FAL...');
    let fixed = result.output;
    let fixCount = 0;
    for (const img of imgs) {
      const url = img[2] || '';
      if (url.startsWith('https://') && !url.includes('placeholder')) {
        try {
          const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
          if (r.ok) { console.log(`  Already real: ${url.substring(0, 50)}`); continue; }
        } catch {}
      }
      const falPrompt = img[1] + ', professional photography, high quality';
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
            fixed = fixed.replace(img[0], `![${img[1]}](${realUrl})`);
            fixCount++;
            // Verify accessible
            const check = await fetch(realUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
            console.log(`  Fixed: ${check.ok ? 'ACCESSIBLE' : 'BROKEN'} ${realUrl.substring(0, 60)}`);
          }
        }
      } catch (e) { console.log(`  FAL error: ${e.message}`); }
    }
    console.log(`Fixed ${fixCount}/${imgs.length} images`);

    // Step 3: Save to DB (simulated)
    console.log(`\nStep 3: Final output: ${fixed.length}ch`);
    const finalImgs = fixed.match(/fal\.media/g) || [];
    console.log(`FAL images in final: ${finalImgs.length}`);
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Output: ${result.output.length}ch | Truncated: ${truncated} | Images: ${imgs.length} | Citations: ${citations.length}`);

  await p.$disconnect();
})();
