/**
 * Translates curriculum from Serbian to English using translation-map.json
 * Reads: original-curriculum.json + translation-map.json
 * Writes: ../src/app/knowledge/data/curriculum.json
 */
const fs = require('fs');
const path = require('path');

const original = JSON.parse(fs.readFileSync(path.join(__dirname, 'original-curriculum.json'), 'utf-8'));
const tMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'translation-map.json'), 'utf-8'));

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[()]/g, '')
    .replace(/['"]/g, '')
    .replace(/[?!:;,./\\]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const idMap = {};   // oldId -> newId
const usedIds = new Set();

// First pass: translate labels and generate new English IDs
const translated = original.map(entry => {
  const englishLabel = tMap[entry.id];
  if (!englishLabel) {
    console.error('MISSING TRANSLATION for old id: ' + entry.id);
    process.exit(1);
  }

  let newId = slugify(englishLabel);

  // Deduplicate IDs
  if (usedIds.has(newId)) {
    let counter = 2;
    let candidate = newId + '-' + counter;
    while (usedIds.has(candidate)) {
      counter++;
      candidate = newId + '-' + counter;
    }
    newId = candidate;
  }

  usedIds.add(newId);
  idMap[entry.id] = newId;

  return {
    oldParentId: entry.parentId,
    id: newId,
    label: englishLabel,
    sortOrder: entry.sortOrder
  };
});

// Second pass: remap parentIds
const result = translated.map(entry => {
  const newParentId = entry.oldParentId ? idMap[entry.oldParentId] : null;
  if (entry.oldParentId && !newParentId) {
    console.error('BROKEN parentId mapping: ' + entry.oldParentId + ' for entry ' + entry.id);
    process.exit(1);
  }
  return {
    id: entry.id,
    parentId: newParentId,
    label: entry.label,
    sortOrder: entry.sortOrder
  };
});

// Write output
const outPath = path.join(__dirname, '..', 'src', 'app', 'knowledge', 'data', 'curriculum.json');
fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
console.log('Written ' + result.length + ' entries to curriculum.json');

// Validation
const ids = new Set(result.map(n => n.id));
const broken = result.filter(n => n.parentId && !ids.has(n.parentId));
const serbianChars = result.filter(n => /[\u010d\u0107\u0161\u017e\u0111]/i.test(n.id + n.label));
const dupes = result.length - ids.size;
console.log('Entries: ' + result.length + ' | Broken: ' + broken.length + ' | Serbian: ' + serbianChars.length + ' | Dupes: ' + dupes);
if (broken.length) console.log('Broken refs:', broken.map(b => b.id + ' -> ' + b.parentId));
if (serbianChars.length) console.log('Serbian chars:', serbianChars.map(s => s.id + ': ' + s.label));
