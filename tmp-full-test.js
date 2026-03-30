const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function testFixImages(output, falKey) {
  const imgPattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const matches = [...output.matchAll(imgPattern)];
  if (matches.length === 0) return { output, fixed: 0 };

  const fakeImages = [];
  for (const match of matches) {
    const url = match[2] || '';
    if (!url.startsWith('https://') || url.includes('placeholder')) {
      fakeImages.push({ fullMatch: match[0], altText: match[1] || '' });
      continue;
    }
    try {
      const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (r.ok) continue;
    } catch {}
    fakeImages.push({ fullMatch: match[0], altText: match[1] || '' });
  }

  if (fakeImages.length === 0) return { output, fixed: 0 };

  let fixed = output;
  let count = 0;
  for (const img of fakeImages) {
    const prompt = img.altText + ', professional photography, high quality';
    try {
      const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: { 'Authorization': 'Key ' + falKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, image_size: 'landscape_16_9', num_images: 1 }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = await res.json();
        const realUrl = data.images?.[0]?.url;
        if (realUrl) {
          fixed = fixed.replace(img.fullMatch, `![${img.altText}](${realUrl})`);
          count++;
        }
      }
    } catch (e) {
      console.log('FAL error:', e.message);
    }
  }
  return { output: fixed, fixed: count };
}

(async () => {
  const FAL_KEY = 'ddfafd89-421c-4a0e-9a03-cae38d5151da:eef741f5e8a6c330d401d904a4585ffd';

  // TEST 1: Check output truncation
  console.log('=== TEST 1: Output truncation check ===');
  const jobs = await p.$queryRawUnsafe("SELECT agent_type, LENGTH(agent_output) as len, RIGHT(agent_output, 100) as ending FROM agent_jobs WHERE status = 'COMPLETED' ORDER BY created_at DESC LIMIT 4");
  for (const j of jobs) {
    const ending = j.ending || '';
    const truncated = !ending.endsWith('.') && !ending.endsWith('\n') && !ending.endsWith('---') && !ending.endsWith('|') && !ending.endsWith('*');
    console.log(j.agent_type, '| len:', j.len, '| truncated:', truncated);
    console.log('  END:', ending.substring(ending.length - 60));
  }

  // TEST 2: Fix images on real content output
  console.log('\n=== TEST 2: Image fix ===');
  const contentJob = await p.$queryRawUnsafe("SELECT agent_output FROM agent_jobs WHERE agent_type = 'content' AND status = 'COMPLETED' AND agent_output LIKE '%![%' ORDER BY created_at DESC LIMIT 1");
  if (contentJob[0]) {
    const original = contentJob[0].agent_output;
    console.log('Original:', original.length, 'ch');

    const result = await testFixImages(original, FAL_KEY);
    console.log('After fix:', result.output.length, 'ch | Fixed:', result.fixed, 'images');

    // Verify FAL URLs work
    const falUrls = result.output.match(/https:\/\/v3b\.fal\.media[^)]+/g) || [];
    console.log('FAL URLs:', falUrls.length);
    for (const url of falUrls.slice(0, 2)) {
      const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      console.log('  ', r.ok ? 'ACCESSIBLE' : 'BROKEN', r.headers.get('content-type'), url.substring(0, 60));
    }
  } else {
    console.log('No content job with images found');
  }

  // TEST 3: Simulate DB save with fixed output
  console.log('\n=== TEST 3: DB save simulation ===');
  const testStr = 'A'.repeat(50000); // 50K chars
  try {
    await p.$executeRawUnsafe("UPDATE agent_jobs SET agent_output = $1 WHERE id = 'nonexistent'", testStr);
    console.log('DB accepts 50K chars: YES');
  } catch (e) {
    console.log('DB error:', e.message?.substring(0, 100));
  }

  console.log('\n=== DONE ===');
  await p.$disconnect();
})();
