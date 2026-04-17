/**
 * Restore curriculumId for ALL platform concepts that match a curriculum entry.
 * Match by: exact name match OR fuzzy slug match to curriculum label.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  const curr = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'knowledge', 'data', 'curriculum.json'), 'utf-8'));

  // Build lookup maps
  const byExactLabel = new Map();
  const bySlug = new Map();
  for (const n of curr) {
    const key = n.label.toLowerCase().trim();
    if (!byExactLabel.has(key)) byExactLabel.set(key, n.id);
    const slug = slugify(n.label);
    if (!bySlug.has(slug)) bySlug.set(slug, n.id);
  }

  const concepts = await p.concept.findMany({
    where: { tenantId: null },
    select: { id: true, name: true, curriculumId: true }
  });

  let linked = 0;
  let alreadyLinked = 0;
  let noMatch = 0;

  for (const c of concepts) {
    // Already has valid curriculumId?
    if (c.curriculumId && curr.some(n => n.id === c.curriculumId)) {
      alreadyLinked++;
      continue;
    }

    // Try exact name match
    const nameKey = c.name.toLowerCase().trim();
    let match = byExactLabel.get(nameKey);

    // Try slug match
    if (!match) {
      const slug = slugify(c.name);
      match = bySlug.get(slug);
    }

    // Try with question mark removed
    if (!match) {
      const cleaned = nameKey.replace(/\?/g, '').trim();
      match = byExactLabel.get(cleaned);
    }

    if (match) {
      await p.concept.update({ where: { id: c.id }, data: { curriculumId: match } });
      linked++;
      if (linked <= 15) console.log('  Linked:', c.name, '->', match);
    } else {
      noMatch++;
    }
  }

  console.log('\nAlready linked:', alreadyLinked);
  console.log('Newly linked:', linked);
  console.log('No match (AI-discovered, expected):', noMatch);

  // Final count
  const final = await p.concept.count({ where: { tenantId: null, curriculumId: { not: null } } });
  console.log('Total with curriculumId:', final);
}

main().catch(console.error).finally(() => p.$disconnect());
