/**
 * SYNC PLATFORM CONCEPTS TO CURRICULUM — EXACT 1:1
 *
 * curriculum.json IS the source of truth.
 * Every platform concept's name and slug must match its curriculum entry EXACTLY.
 * No fuzzy matching. No translation. Just make them identical.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

async function main() {
  const curr = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'knowledge', 'data', 'curriculum.json'), 'utf-8'));

  const concepts = await p.concept.findMany({
    where: { tenantId: null, curriculumId: { not: null } },
    select: { id: true, name: true, slug: true, curriculumId: true }
  });

  let nameFixed = 0;
  let slugFixed = 0;

  for (const c of concepts) {
    const node = curr.find(n => n.id === c.curriculumId);
    if (!node) continue;

    const updates = {};
    if (c.name !== node.label) {
      updates.name = node.label;
      nameFixed++;
    }
    if (c.slug !== node.id) {
      updates.slug = node.id;
      slugFixed++;
    }

    if (Object.keys(updates).length > 0) {
      try {
        await p.concept.update({ where: { id: c.id }, data: updates });
      } catch (e) {
        // Duplicate slug — append concept id fragment
        if (updates.slug) {
          updates.slug = updates.slug + '-' + c.id.substring(4, 12);
          await p.concept.update({ where: { id: c.id }, data: updates });
        }
      }
    }
  }

  console.log('Names synced:', nameFixed);
  console.log('Slugs synced:', slugFixed);

  // Verify: zero mismatches
  const after = await p.concept.findMany({
    where: { tenantId: null, curriculumId: { not: null } },
    select: { name: true, slug: true, curriculumId: true }
  });

  let mismatches = 0;
  for (const c of after) {
    const node = curr.find(n => n.id === c.curriculumId);
    if (!node) continue;
    if (c.name !== node.label || c.slug !== node.id) {
      mismatches++;
      console.log('STILL WRONG:', c.name, '!=', node.label, '|', c.slug, '!=', node.id);
    }
  }
  console.log('Remaining mismatches:', mismatches);
}

main().catch(console.error).finally(() => p.$disconnect());
