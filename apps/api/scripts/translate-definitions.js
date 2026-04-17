/**
 * Translates platform concept definitions from Serbian to English.
 * Uses OpenAI API for batch translation (50 at a time).
 */
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const p = new PrismaClient();
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const BATCH_SIZE = 30;

async function translateBatch(definitions) {
  const numbered = definitions.map((d, i) => `${i + 1}. ${d}`).join('\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a translator. Translate each numbered business concept definition from Serbian to English. Keep the same numbering. Return ONLY the translated definitions, one per line, with the same number prefix. Keep business terms accurate.'
        },
        {
          role: 'user',
          content: `Translate these Serbian business concept definitions to English:\n\n${numbered}`
        }
      ],
      temperature: 0.2,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${err.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices[0]?.message?.content ?? '';

  // Parse numbered results
  const lines = text.split('\n').filter(l => /^\d+\./.test(l.trim()));
  return lines.map(l => l.replace(/^\d+\.\s*/, '').trim());
}

async function main() {
  if (!OPENAI_KEY) {
    console.error('OPENAI_API_KEY not set');
    process.exit(1);
  }

  // Load platform concepts with Serbian definitions
  const concepts = await p.concept.findMany({
    where: { tenantId: null, source: 'SEED_DATA' },
    select: { id: true, name: true, definition: true },
    orderBy: { id: 'asc' },
  });

  // Filter to only Serbian definitions (contain Serbian chars or common Serbian words)
  const serbianConcepts = concepts.filter(c => {
    const def = c.definition || '';
    return /[čćšžđ]/i.test(def) || /\b(je|su|koji|koja|koje|ovaj|ova|ovo|može|biti|kako|sve|ali|ili|ima|nije|već|ovo|kada|što|zato|kroz|prema|između|njihov|poslov|kompanij|proizvod|tržišt|vrednost|kupac|prodaj)\b/i.test(def);
  });

  console.log('Total platform concepts:', concepts.length);
  console.log('Serbian definitions to translate:', serbianConcepts.length);

  let translated = 0;
  let failed = 0;

  for (let i = 0; i < serbianConcepts.length; i += BATCH_SIZE) {
    const batch = serbianConcepts.slice(i, i + BATCH_SIZE);
    const definitions = batch.map(c => c.definition);

    try {
      const results = await translateBatch(definitions);

      if (results.length !== batch.length) {
        console.warn(`Batch ${i}: expected ${batch.length} results, got ${results.length}`);
      }

      // Update each concept
      for (let j = 0; j < Math.min(batch.length, results.length); j++) {
        const newDef = results[j];
        if (newDef && newDef.length > 10) {
          await p.concept.update({
            where: { id: batch[j].id },
            data: { definition: newDef },
          });
          translated++;
        }
      }

      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: translated ${results.length} definitions (total: ${translated})`);
    } catch (err) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err.message);
      failed += batch.length;
    }

    // Rate limit pause
    if (i + BATCH_SIZE < serbianConcepts.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log('\nDone. Translated:', translated, '| Failed:', failed);
}

main().catch(console.error).finally(() => p.$disconnect());
