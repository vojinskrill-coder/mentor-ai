/**
 * Fix curriculumId references:
 * 1. Load curriculum.json (new English IDs)
 * 2. Load old curriculum from git (Serbian IDs)
 * 3. Build map: old Serbian ID -> new English ID
 * 4. Update all concepts whose curriculumId matches an old Serbian ID
 */
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

async function main() {
  // Load new curriculum (English IDs)
  const newCurr = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'knowledge', 'data', 'curriculum.json'), 'utf-8'));

  // Load original curriculum (Serbian IDs) from git
  const oldCurrRaw = execSync(
    'git show a7ed946:apps/api/src/app/knowledge/data/curriculum.json',
    { cwd: path.join(__dirname, '..', '..', '..'), encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  const oldCurr = JSON.parse(oldCurrRaw);

  // Also load the b199d20 version which had English labels + Serbian IDs
  const midCurrRaw = execSync(
    'git show b199d20:apps/api/src/app/knowledge/data/curriculum.json',
    { cwd: path.join(__dirname, '..', '..', '..'), encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  const midCurr = JSON.parse(midCurrRaw);

  console.log('Old curriculum:', oldCurr.length, 'entries');
  console.log('Mid curriculum:', midCurr.length, 'entries');
  console.log('New curriculum:', newCurr.length, 'entries');

  // Build map: old ID -> new ID (match by sortOrder + parentId position in tree)
  // Strategy: old and new have same tree structure, same sortOrder, same position
  // Match by index (both sorted same way since tree is preserved)
  const oldIdToNewId = new Map();
  for (let i = 0; i < Math.min(oldCurr.length, newCurr.length); i++) {
    oldIdToNewId.set(oldCurr[i].id, newCurr[i].id);
  }

  // Also map mid curriculum IDs (b199d20 had some extra entries with Serbian IDs)
  // Build by label matching since mid has English labels
  const newByLabel = new Map();
  for (const n of newCurr) {
    newByLabel.set(n.label.toLowerCase(), n.id);
  }
  for (const m of midCurr) {
    if (!oldIdToNewId.has(m.id)) {
      const match = newByLabel.get(m.label.toLowerCase());
      if (match) oldIdToNewId.set(m.id, match);
    }
  }

  console.log('Mapping entries:', oldIdToNewId.size);

  // Get new curriculum IDs set
  const validNewIds = new Set(newCurr.map(n => n.id));

  // Update concepts
  const concepts = await p.concept.findMany({
    select: { id: true, curriculumId: true, name: true }
  });

  let fixed = 0;
  let alreadyGood = 0;
  let noMatch = 0;
  let cleared = 0;

  for (const c of concepts) {
    if (!c.curriculumId) continue;

    // Already valid?
    if (validNewIds.has(c.curriculumId)) {
      alreadyGood++;
      continue;
    }

    // Try mapping from old ID
    const newId = oldIdToNewId.get(c.curriculumId);
    if (newId && validNewIds.has(newId)) {
      await p.concept.update({ where: { id: c.id }, data: { curriculumId: newId } });
      fixed++;
      if (fixed <= 10) console.log('  Fixed:', c.curriculumId, '->', newId, '(' + c.name + ')');
    } else {
      // Try matching by concept name to curriculum label
      const nameMatch = newByLabel.get(c.name.toLowerCase());
      if (nameMatch) {
        await p.concept.update({ where: { id: c.id }, data: { curriculumId: nameMatch } });
        fixed++;
        if (fixed <= 10) console.log('  Matched by name:', c.name, '->', nameMatch);
      } else {
        // Clear broken reference
        await p.concept.update({ where: { id: c.id }, data: { curriculumId: null } });
        cleared++;
        if (cleared <= 5) console.log('  Cleared:', c.curriculumId, '(' + c.name + ')');
      }
    }
  }

  console.log('\nAlready valid:', alreadyGood);
  console.log('Fixed:', fixed);
  console.log('Cleared (no match):', cleared);

  // Verify
  const afterConcepts = await p.concept.findMany({ select: { curriculumId: true } });
  const withCurr = afterConcepts.filter(c => c.curriculumId);
  const brokenAfter = withCurr.filter(c => !validNewIds.has(c.curriculumId));
  console.log('\nAfter fix: concepts with curriculumId:', withCurr.length, '| broken refs:', brokenAfter.length);
}

main().catch(console.error).finally(() => p.$disconnect());
