/**
 * Fuzzy-match curriculum entries to DB concepts, rename to match exactly,
 * then delete AI junk. Result: platform DB mirrors Obsidian 1:1.
 */
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

function normalize(s) {
  return s.toLowerCase()
    .replace(/[?!.,:;'"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // Load curriculum
  const curr = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'knowledge', 'data', 'curriculum.json'), 'utf-8'));

  // Load original Serbian curriculum for cross-reference
  let oldCurr;
  try {
    oldCurr = JSON.parse(execSync('git show a7ed946:apps/api/src/app/knowledge/data/curriculum.json', {
      cwd: path.join(__dirname, '..', '..', '..'), encoding: 'utf-8', maxBuffer: 10*1024*1024
    }));
  } catch { oldCurr = []; }

  // Build Serbian label -> English label map
  const serbToEng = new Map();
  for (let i = 0; i < Math.min(oldCurr.length, curr.length); i++) {
    serbToEng.set(normalize(oldCurr[i].label), curr[i]);
  }

  // Load all platform concepts
  const concepts = await p.concept.findMany({
    where: { tenantId: null },
    select: { id: true, name: true, slug: true, curriculumId: true, category: true }
  });
  console.log('Platform concepts:', concepts.length);
  console.log('Curriculum entries:', curr.length);

  // Build concept lookup maps
  const byNorm = new Map();
  const bySlug = new Map();
  const byId = new Map();
  for (const c of concepts) {
    const key = normalize(c.name);
    if (!byNorm.has(key)) byNorm.set(key, c);
    if (c.slug && !bySlug.has(c.slug)) bySlug.set(c.slug, c);
    byId.set(c.id, c);
  }

  // Phase 1: Link every curriculum entry to a concept
  let linked = 0;
  let alreadyLinked = 0;
  let created = 0;
  const linkedConceptIds = new Set();

  for (const node of curr) {
    // Already linked?
    const existing = concepts.find(c => c.curriculumId === node.id);
    if (existing) {
      alreadyLinked++;
      linkedConceptIds.add(existing.id);
      continue;
    }

    // Try exact normalized name match
    let match = byNorm.get(normalize(node.label));

    // Try slug match
    if (!match) match = bySlug.get(node.id);
    if (!match) match = bySlug.get(slugify(node.label));

    // Try without parenthetical
    if (!match) {
      const noParens = normalize(node.label.replace(/\([^)]*\)/g, ''));
      match = byNorm.get(noParens);
    }

    // Try matching via Serbian original
    if (!match) {
      const serbEntry = [...serbToEng.entries()].find(([_, eng]) => eng.id === node.id);
      if (serbEntry) {
        match = byNorm.get(serbEntry[0]);
      }
    }

    // Try substring match (concept name contains curriculum label or vice versa)
    if (!match) {
      const normLabel = normalize(node.label);
      match = concepts.find(c => {
        const normName = normalize(c.name);
        return normName.includes(normLabel) || normLabel.includes(normName);
      });
    }

    if (match && !linkedConceptIds.has(match.id)) {
      linkedConceptIds.add(match.id);
      if (!dryRun) {
        await p.concept.update({
          where: { id: match.id },
          data: { curriculumId: node.id, name: node.label, slug: node.id }
        });
      }
      linked++;
      if (linked <= 15) console.log('  LINK:', match.name, '->', node.label, '[' + node.id + ']');
    } else if (!match) {
      // No match found — create the concept
      if (!dryRun) {
        const newId = 'cpt_' + require('crypto').randomBytes(12).toString('hex').slice(0, 24);
        // Determine category from parent
        let category = 'General';
        if (node.parentId) {
          const parent = curr.find(n => n.id === node.parentId);
          if (parent && !parent.parentId) category = parent.label; // Root parent is category
          else if (parent) {
            const grandparent = curr.find(n => n.id === parent.parentId);
            if (grandparent && !grandparent.parentId) category = grandparent.label;
            else category = parent.label;
          }
        } else {
          category = node.label; // Root nodes are their own category
        }

        await p.concept.create({
          data: {
            id: newId,
            name: node.label,
            slug: node.id,
            category: category,
            curriculumId: node.id,
            definition: '',
            tier: 'foundational',
          }
        });
        linkedConceptIds.add(newId);
      }
      created++;
      if (created <= 10) console.log('  CREATE:', node.label, '[' + node.id + ']');
    }
  }

  console.log('\nAlready linked:', alreadyLinked);
  console.log('Newly linked:', linked);
  console.log('Created:', created);
  console.log('Total linked:', alreadyLinked + linked + created, '/ curriculum:', curr.length);

  // Phase 2: Delete junk
  if (!dryRun) {
    const junk = await p.concept.findMany({
      where: { tenantId: null, curriculumId: null },
      select: { id: true }
    });
    const junkIds = junk.map(c => c.id);

    if (junkIds.length > 0) {
      console.log('\nDeleting', junkIds.length, 'AI junk concepts...');
      const delRels = await p.conceptRelationship.deleteMany({
        where: { OR: [{ sourceConceptId: { in: junkIds } }, { targetConceptId: { in: junkIds } }] }
      });
      console.log('Deleted relationships:', delRels.count);
      const delConcepts = await p.concept.deleteMany({ where: { id: { in: junkIds } } });
      console.log('Deleted concepts:', delConcepts.count);
    }
  }

  // Phase 3: Verify
  const finalConcepts = dryRun ? concepts.length : await p.concept.count({ where: { tenantId: null } });
  const finalWithCurr = dryRun ? (alreadyLinked + linked) : await p.concept.count({ where: { tenantId: null, curriculumId: { not: null } } });
  const finalRels = dryRun ? '?' : await p.conceptRelationship.count();

  console.log('\n=== FINAL STATE ===');
  console.log('Platform concepts:', finalConcepts);
  console.log('With curriculumId:', finalWithCurr);
  console.log('Relationships:', finalRels);
  if (dryRun) console.log('(dry run — no changes)');
}

main().catch(console.error).finally(() => p.$disconnect());
