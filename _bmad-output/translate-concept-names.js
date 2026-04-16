/**
 * Translate concept names from Serbian to English using DeepSeek API.
 * Processes in batches of 50 for efficiency.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEEPSEEK_KEY = 'sk-a297b323b0e94fd3849351acf4c55b6b';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

async function translateBatch(names) {
  const prompt = `Translate these business concept names from Serbian to English. Return ONLY a JSON array of translated names in the same order. Keep proper nouns, acronyms, and already-English terms as-is. For mixed Serbian-English names, translate only the Serbian parts.\n\nNames:\n${JSON.stringify(names)}`;

  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    console.error('DeepSeek error:', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';

  try {
    // Extract JSON array from response
    const match = content.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(content);
  } catch (e) {
    console.error('Parse error for batch, content:', content.slice(0, 200));
    return null;
  }
}

async function main() {
  const concepts = await prisma.concept.findMany({
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });

  console.log(`Translating ${concepts.length} concept names...`);

  const BATCH_SIZE = 50;
  let translated = 0;
  let failed = 0;

  for (let i = 0; i < concepts.length; i += BATCH_SIZE) {
    const batch = concepts.slice(i, i + BATCH_SIZE);
    const names = batch.map((c) => c.name);

    const results = await translateBatch(names);

    if (results && results.length === batch.length) {
      for (let j = 0; j < batch.length; j++) {
        const newName = results[j];
        if (newName && newName !== batch[j].name) {
          try {
            await prisma.concept.update({
              where: { id: batch[j].id },
              data: { name: newName },
            });
            translated++;
          } catch (e) {
            // Unique constraint — append category to disambiguate
            try {
              const concept = await prisma.concept.findUnique({ where: { id: batch[j].id }, select: { category: true } });
              await prisma.concept.update({
                where: { id: batch[j].id },
                data: { name: `${newName} (${concept?.category || 'General'})` },
              });
              translated++;
            } catch { failed++; }
          }
        }
      }
    } else {
      failed += batch.length;
      console.error(`Batch ${i / BATCH_SIZE + 1} failed (got ${results?.length ?? 0} for ${batch.length})`);
    }

    const progress = Math.min(i + BATCH_SIZE, concepts.length);
    process.stdout.write(`\r${progress}/${concepts.length} processed, ${translated} translated, ${failed} failed`);

    // Rate limit: wait 500ms between batches
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone! ${translated} names translated, ${failed} failed.`);
}

main()
  .catch((e) => console.error('FATAL:', e.message))
  .finally(() => prisma.$disconnect());
