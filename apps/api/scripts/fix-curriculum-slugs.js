/**
 * Fix curriculum.json: Replace Serbian/malformed IDs with clean English slugs.
 *
 * Strategy:
 * 1. Root nodes (parentId=null) get priority for clean slugs
 * 2. Children with same label get disambiguated with parent context
 * 3. All parentId references are updated to match new IDs
 *
 * This script is idempotent — it always regenerates IDs from labels.
 *
 * Usage: node apps/api/scripts/fix-curriculum-slugs.js
 */

const fs = require('fs');
const path = require('path');

const currPath = path.join(__dirname, '..', 'src', 'app', 'knowledge', 'data', 'curriculum.json');

function slugify(label) {
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

function main() {
  const curriculum = JSON.parse(fs.readFileSync(currPath, 'utf-8'));
  console.log('Loaded', curriculum.length, 'curriculum nodes');

  // Build current ID → node lookup (for parentId resolution)
  const nodeByCurrentId = {};
  for (const node of curriculum) {
    nodeByCurrentId[node.id] = node;
  }

  // Phase 1: Process root nodes first (they get priority for clean slugs)
  const roots = curriculum.filter(n => n.parentId === null);
  const children = curriculum.filter(n => n.parentId !== null);

  const oldToNew = {};
  const usedSlugs = new Set();

  // Assign clean slugs to roots first
  for (const node of roots) {
    let newId = slugify(node.label);

    if (usedSlugs.has(newId)) {
      // Root collision — very rare, use sortOrder
      newId = newId + '-root-' + node.sortOrder;
    }

    usedSlugs.add(newId);
    oldToNew[node.id] = newId;
  }

  // Phase 2: Process children — disambiguate with parent label when needed
  // Sort children so that we process parents before their descendants
  // (multi-level: a child can also be a parent to deeper nodes)
  // Process in waves until all are resolved
  const pending = [...children];
  let maxIterations = 10;

  while (pending.length > 0 && maxIterations-- > 0) {
    const stillPending = [];

    for (const node of pending) {
      // Check if parent has been resolved yet
      const parentNewId = oldToNew[node.parentId];
      if (parentNewId === undefined) {
        stillPending.push(node);
        continue;
      }

      let newId = slugify(node.label);

      if (usedSlugs.has(newId)) {
        // Disambiguate with parent label
        const parent = nodeByCurrentId[node.parentId];
        if (parent) {
          const parentSlug = slugify(parent.label);
          newId = newId + '-' + parentSlug;
        }

        if (usedSlugs.has(newId)) {
          // Still colliding — add sortOrder
          newId = newId + '-' + node.sortOrder;
        }

        if (usedSlugs.has(newId)) {
          // Last resort — use old ID hash
          newId = slugify(node.label) + '-' + node.id.replace(/[^a-z0-9]/g, '').slice(0, 8);
        }
      }

      usedSlugs.add(newId);
      oldToNew[node.id] = newId;
    }

    pending.length = 0;
    pending.push(...stillPending);
  }

  if (pending.length > 0) {
    console.error('UNRESOLVED nodes (parent not found):', pending.map(n => n.id));
    process.exit(1);
  }

  // Phase 3: Apply mapping
  let changed = 0;
  for (const node of curriculum) {
    const newId = oldToNew[node.id];
    if (newId !== node.id) changed++;
    node.id = newId;

    if (node.parentId) {
      const newParentId = oldToNew[node.parentId];
      if (!newParentId) {
        console.error('WARNING: parentId not in mapping:', node.parentId, 'for:', node.label);
      } else {
        node.parentId = newParentId;
      }
    }
  }

  // Verify: no broken references
  const allIds = new Set(curriculum.map(n => n.id));
  const broken = curriculum.filter(n => n.parentId && !allIds.has(n.parentId));
  if (broken.length > 0) {
    console.error('BROKEN references:');
    for (const b of broken) {
      console.error('  ', b.id, '→ parentId:', b.parentId);
    }
    process.exit(1);
  }

  // Verify: no duplicate IDs
  const idSet = new Set();
  const dupes = [];
  for (const node of curriculum) {
    if (idSet.has(node.id)) dupes.push(node.id);
    idSet.add(node.id);
  }
  if (dupes.length > 0) {
    console.error('DUPLICATE IDs:', dupes);
    process.exit(1);
  }

  // Verify: no Serbian characters remain in IDs
  const serbianPattern = /[čćžšđ]/i;
  const serbianIds = curriculum.filter(n => serbianPattern.test(n.id));
  if (serbianIds.length > 0) {
    console.error('Serbian characters in IDs:', serbianIds.map(n => n.id));
  }

  // Write back
  fs.writeFileSync(currPath, JSON.stringify(curriculum, null, 2) + '\n');
  console.log(`\nUpdated ${changed} IDs out of ${curriculum.length} nodes`);
  console.log('No broken references, no duplicate IDs');

  // Show root nodes
  console.log('\nRoot nodes:');
  for (const node of curriculum.filter(n => !n.parentId)) {
    console.log('  ', node.id, '|', node.label);
  }

  // Show sample child changes
  const childChanges = Object.entries(oldToNew).filter(([o, n]) => o !== n).slice(0, 15);
  if (childChanges.length > 0) {
    console.log('\nSample changes (first 15):');
    for (const [old, newId] of childChanges) {
      console.log('  ', old, '→', newId);
    }
  }
}

main();
