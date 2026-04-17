/**
 * PROPER curriculum.json translation v2:
 * - Start from ORIGINAL Serbian curriculum (436 entries from git)
 * - Use a hardcoded Serbian->English translation map for labels
 * - Generate English IDs from English labels
 * - Map old parentId -> new parentId to preserve EXACT hierarchy
 * - Add the extra 71 entries from current file that don't exist in original
 */
const fs = require('fs');
const path = require('path');

const originalPath = path.join(__dirname, 'original-curriculum.json');
const outputPath = path.join(__dirname, '..', 'src', 'app', 'knowledge', 'data', 'curriculum.json');

const original = JSON.parse(fs.readFileSync(originalPath, 'utf-8'));
console.log('Original entries:', original.length);

// Load the "b199d20" version which has English labels matched to Serbian structure
// We need the English labels. Let's get them from the SECOND git commit
// But actually, the current file's labels at positions matching original ARE correct English
// The problem was just index-based matching when sizes differ.
// Let's use a different approach: load the version BEFORE our changes that had correct English labels

// Actually, the simplest correct approach:
// The original has Serbian labels. We need to translate each one.
// The publish.obsidian.md/hadzi-vojin has the exact Serbian -> English mapping.
// Since we can't fetch it, let's use the b199d20 commit which translated labels.

const { execSync } = require('child_process');
let translatedVersion;
try {
  const raw = execSync('git show b199d20:apps/api/src/app/knowledge/data/curriculum.json', {
    cwd: path.join(__dirname, '..', '..', '..'),
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024
  });
  translatedVersion = JSON.parse(raw);
  console.log('Translated version entries:', translatedVersion.length);
} catch (e) {
  console.error('Cannot load translated version from git:', e.message);
  process.exit(1);
}

// The b199d20 version has English labels but kept Serbian IDs
// Build a map: Serbian ID -> English label
const serbianIdToEnglishLabel = new Map();
for (const entry of translatedVersion) {
  serbianIdToEnglishLabel.set(entry.id, entry.label);
}

// For entries in original not in translated, keep original label
for (const entry of original) {
  if (!serbianIdToEnglishLabel.has(entry.id)) {
    console.log('  WARNING: no translation for', entry.id, '- keeping:', entry.label);
    serbianIdToEnglishLabel.set(entry.id, entry.label);
  }
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

// Step 1: Generate English IDs, maintain hierarchy
const oldIdToNewId = new Map();
const usedIds = new Set();

for (const entry of original) {
  const englishLabel = serbianIdToEnglishLabel.get(entry.id);
  let newId = englishSlugify(englishLabel);

  // Handle duplicates
  if (usedIds.has(newId)) {
    if (entry.parentId) {
      const parentLabel = serbianIdToEnglishLabel.get(entry.parentId) || entry.parentId;
      newId = newId + '-' + englishSlugify(parentLabel).split('-').slice(0, 2).join('-');
    }
    if (usedIds.has(newId)) {
      newId = newId + '-' + entry.sortOrder;
    }
    if (usedIds.has(newId)) {
      newId = newId + '-' + entry.id.substring(0, 6);
    }
  }

  usedIds.add(newId);
  oldIdToNewId.set(entry.id, newId);
}

// Step 2: Build translated entries
const translated = [];
for (const entry of original) {
  const englishLabel = serbianIdToEnglishLabel.get(entry.id);
  const newId = oldIdToNewId.get(entry.id);
  const newParentId = entry.parentId ? (oldIdToNewId.get(entry.parentId) || null) : null;

  translated.push({
    id: newId,
    parentId: newParentId,
    label: englishLabel,
    sortOrder: entry.sortOrder
  });
}

// Step 3: Add extra entries from translated version that weren't in original
// (entries added in b199d20 that aren't in the a7ed946 baseline)
const originalIds = new Set(original.map(n => n.id));
const extras = translatedVersion.filter(n => !originalIds.has(n.id));
console.log('Extra entries from translated version:', extras.length);

for (const entry of extras) {
  const englishLabel = entry.label; // already English in b199d20
  let newId = englishSlugify(englishLabel);

  if (usedIds.has(newId)) {
    newId = newId + '-extra';
    if (usedIds.has(newId)) newId = newId + '-' + entry.sortOrder;
  }
  usedIds.add(newId);

  // Map parent
  let newParentId = null;
  if (entry.parentId) {
    newParentId = oldIdToNewId.get(entry.parentId) || null;
    // If parent was also an extra, try to find it
    if (!newParentId) {
      const parentExtra = extras.find(e => e.id === entry.parentId);
      if (parentExtra) {
        newParentId = englishSlugify(parentExtra.label);
      }
    }
  }

  translated.push({
    id: newId,
    parentId: newParentId,
    label: englishLabel,
    sortOrder: entry.sortOrder
  });
}

// Step 4: Validate
const allIds = new Set(translated.map(n => n.id));
const brokenParents = translated.filter(n => n.parentId && !allIds.has(n.parentId));
const duplicates = translated.length - allIds.size;
const serbianCharsInIds = translated.filter(n => /[čćšžđ]/.test(n.id));
const serbianCharsInLabels = translated.filter(n => /[čćšžđ]/.test(n.label));

console.log('\n=== VALIDATION ===');
console.log('Total entries:', translated.length);
console.log('Unique IDs:', allIds.size);
console.log('Duplicate IDs:', duplicates);
console.log('Broken parentIds:', brokenParents.length);
if (brokenParents.length > 0) brokenParents.slice(0, 5).forEach(b => console.log('  BROKEN:', b.id, '->', b.parentId));
console.log('Serbian chars in IDs:', serbianCharsInIds.length);
console.log('Serbian chars in labels:', serbianCharsInLabels.length);
if (serbianCharsInLabels.length > 0) serbianCharsInLabels.slice(0, 10).forEach(n => console.log('  SERBIAN:', n.label));

// Show tree
const roots = translated.filter(n => !n.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
console.log('\n=== TREE (' + roots.length + ' roots) ===');
for (const r of roots) {
  const children = translated.filter(n => n.parentId === r.id).sort((a, b) => a.sortOrder - b.sortOrder);
  console.log(r.sortOrder + '. ' + r.label + ' (' + children.length + ' children)');
  for (const c of children.slice(0, 5)) {
    const gc = translated.filter(n => n.parentId === c.id);
    console.log('   ' + c.sortOrder + '. ' + c.label + (gc.length > 0 ? ' (' + gc.length + ')' : ''));
  }
  if (children.length > 5) console.log('   ... +' + (children.length - 5) + ' more');
}

// Write if valid
if (brokenParents.length === 0 && duplicates === 0 && serbianCharsInIds.length === 0) {
  fs.writeFileSync(outputPath, JSON.stringify(translated, null, 2) + '\n');
  console.log('\n✓ Written', translated.length, 'entries to curriculum.json');
} else {
  console.log('\n✗ NOT writing — fix errors first');
}
