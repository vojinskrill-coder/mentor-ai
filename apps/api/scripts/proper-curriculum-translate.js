/**
 * PROPER curriculum.json translation:
 * 1. Start from the ORIGINAL Serbian curriculum.json (git baseline)
 * 2. Translate labels Serbian -> English (using the already-translated labels from current version)
 * 3. Generate English IDs from English labels
 * 4. Maintain EXACT parent-child hierarchy by mapping old parentId -> new parentId
 * 5. Preserve sortOrder exactly
 */
const fs = require('fs');
const path = require('path');

// Load ORIGINAL Serbian curriculum (from git)
const originalPath = path.join(__dirname, 'original-curriculum.json');
const original = JSON.parse(fs.readFileSync(originalPath, 'utf-8'));

// Load CURRENT curriculum which has English labels but may have broken IDs
const currentPath = path.join(__dirname, '..', 'src', 'app', 'knowledge', 'data', 'curriculum.json');
const current = JSON.parse(fs.readFileSync(currentPath, 'utf-8'));

// Build label translation map from current (Serbian label was already translated)
// We match by sortOrder + parentId position since IDs may have changed
const currentByOldId = new Map();
// The current file should have same number of entries
console.log('Original entries:', original.length);
console.log('Current entries:', current.length);

// Build a map: original Serbian label -> English label from current
// Match by index since both files should be in same order
const serbianToEnglish = new Map();
for (let i = 0; i < original.length && i < current.length; i++) {
  serbianToEnglish.set(original[i].label, current[i].label);
  // Also map by original ID for cross-reference
  serbianToEnglish.set('id:' + original[i].id, current[i].label);
}

function englishSlugify(label) {
  return label
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[''"""]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

// Step 1: Generate new IDs for each original entry
const oldIdToNewId = new Map();
const usedIds = new Set();

for (const entry of original) {
  const englishLabel = serbianToEnglish.get(entry.label) || serbianToEnglish.get('id:' + entry.id) || entry.label;
  let newId = englishSlugify(englishLabel);

  // Handle duplicates
  if (usedIds.has(newId)) {
    // Try with parent context
    if (entry.parentId) {
      const parentEnglish = serbianToEnglish.get('id:' + entry.parentId) || entry.parentId;
      const parentSlug = englishSlugify(parentEnglish);
      newId = newId + '-' + parentSlug.split('-')[0];
    }
    // Still duplicate? Add sortOrder
    if (usedIds.has(newId)) {
      newId = newId + '-' + entry.sortOrder;
    }
  }

  usedIds.add(newId);
  oldIdToNewId.set(entry.id, newId);
}

// Step 2: Build translated curriculum with correct hierarchy
const translated = [];

for (const entry of original) {
  const englishLabel = serbianToEnglish.get(entry.label) || serbianToEnglish.get('id:' + entry.id) || entry.label;
  const newId = oldIdToNewId.get(entry.id);
  const newParentId = entry.parentId ? oldIdToNewId.get(entry.parentId) : null;

  translated.push({
    id: newId,
    parentId: newParentId || null,
    label: englishLabel,
    sortOrder: entry.sortOrder
  });
}

// Step 3: Validate
const ids = new Set(translated.map(n => n.id));
const brokenParents = translated.filter(n => n.parentId && !ids.has(n.parentId));
const duplicateIds = translated.length - ids.size;

console.log('\n=== VALIDATION ===');
console.log('Entries:', translated.length);
console.log('Unique IDs:', ids.size);
console.log('Duplicate IDs:', duplicateIds);
console.log('Broken parentIds:', brokenParents.length);
if (brokenParents.length > 0) {
  brokenParents.forEach(b => console.log('  BROKEN:', b.id, '->', b.parentId));
}

// Check for Serbian characters in IDs
const serbianIds = translated.filter(n => /[čćšžđ]/.test(n.id));
console.log('Serbian chars in IDs:', serbianIds.length);

// Check for Serbian characters in labels
const serbianLabels = translated.filter(n => /[čćšžđ]/.test(n.label));
console.log('Serbian chars in labels:', serbianLabels.length);
if (serbianLabels.length > 0) {
  serbianLabels.slice(0, 5).forEach(n => console.log('  SERBIAN LABEL:', n.label));
}

// Show tree structure sample
const roots = translated.filter(n => !n.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
console.log('\n=== TREE STRUCTURE (first 5 roots) ===');
for (const r of roots.slice(0, 5)) {
  const children = translated.filter(n => n.parentId === r.id).sort((a, b) => a.sortOrder - b.sortOrder);
  console.log(r.sortOrder + '. ' + r.label + ' [' + r.id + '] (' + children.length + ' children)');
  for (const c of children.slice(0, 5)) {
    const gc = translated.filter(n => n.parentId === c.id);
    console.log('   ' + c.sortOrder + '. ' + c.label + (gc.length > 0 ? ' (' + gc.length + ' sub)' : ''));
  }
  if (children.length > 5) console.log('   ... +' + (children.length - 5) + ' more');
}

// Step 4: Write
if (brokenParents.length === 0 && duplicateIds === 0 && serbianIds.length === 0) {
  fs.writeFileSync(currentPath, JSON.stringify(translated, null, 2) + '\n');
  console.log('\n✓ curriculum.json written successfully');
} else {
  console.log('\n✗ NOT writing — fix errors above first');
}
