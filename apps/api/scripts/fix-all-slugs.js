/**
 * Fix ALL concept slugs + curriculumIds in the database.
 *
 * For platform concepts (tenantId=null):
 *   - Generates English slugs from concept name
 *   - Updates curriculumId to match the new English curriculum.json IDs
 *
 * For tenant concepts:
 *   - Generates English slugs from concept name
 *   - Updates curriculumId to match the new English curriculum.json IDs
 *
 * Usage: node apps/api/scripts/fix-all-slugs.js [--dry-run]
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

function englishSlugify(label) {
  return label
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('=== DRY RUN ===\n');

  // Load curriculum.json for curriculumId mapping
  const currPath = path.join(__dirname, '..', 'src', 'app', 'knowledge', 'data', 'curriculum.json');
  const curriculum = JSON.parse(fs.readFileSync(currPath, 'utf-8'));

  // Build label → curriculum ID lookup
  const labelToNewCurrId = new Map();
  for (const node of curriculum) {
    const key = node.label.toLowerCase();
    if (!labelToNewCurrId.has(key)) {
      labelToNewCurrId.set(key, node.id);
    }
  }

  // Fix ALL concepts in the platform
  const concepts = await p.concept.findMany({
    select: { id: true, name: true, slug: true, curriculumId: true, tenantId: true }
  });
  console.log('Total concepts:', concepts.length);

  let slugsUpdated = 0;
  let currIdsUpdated = 0;

  for (const c of concepts) {
    const updates = {};

    // Fix slug: generate from English name
    const newSlug = englishSlugify(c.name);
    if (newSlug && c.slug !== newSlug) {
      updates.slug = newSlug;
    }

    // Fix curriculumId: match by concept name to curriculum label
    if (c.curriculumId) {
      const newCurrId = labelToNewCurrId.get(c.name.toLowerCase());
      if (newCurrId && c.curriculumId !== newCurrId) {
        updates.curriculumId = newCurrId;
      }
    }

    if (Object.keys(updates).length === 0) continue;

    if (dryRun) {
      if (updates.slug) { console.log('  slug:', c.slug, '->', updates.slug); slugsUpdated++; }
      if (updates.curriculumId) { console.log('  currId:', c.curriculumId, '->', updates.curriculumId); currIdsUpdated++; }
      continue;
    }

    try {
      await p.concept.update({ where: { id: c.id }, data: updates });
      if (updates.slug) {
        slugsUpdated++;
        if (slugsUpdated <= 20) console.log('  slug:', c.slug, '->', updates.slug);
      }
      if (updates.curriculumId) {
        currIdsUpdated++;
        if (currIdsUpdated <= 10) console.log('  currId:', c.curriculumId, '->', updates.curriculumId);
      }
    } catch (e) {
      // Duplicate slug — append concept ID
      if (updates.slug) {
        const uniqueSlug = updates.slug + '-' + c.id.substring(4, 12);
        try {
          updates.slug = uniqueSlug;
          await p.concept.update({ where: { id: c.id }, data: updates });
          slugsUpdated++;
          console.log('  slug:', c.slug, '->', uniqueSlug, '(deduped)');
        } catch (e2) {
          console.log('  FAILED:', c.slug, e2.message.substring(0, 100));
        }
      }
    }
  }

  console.log('\nSlugs updated:', slugsUpdated);
  console.log('CurriculumIds updated:', currIdsUpdated);
  if (dryRun) console.log('\n(dry run — no changes made)');
}

main().catch(console.error).finally(() => p.$disconnect());
