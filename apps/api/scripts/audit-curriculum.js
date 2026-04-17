const data = require('../src/app/knowledge/data/curriculum.json');
console.log('Total entries:', data.length);

// Root nodes
const roots = data.filter(e => e.parentId === null);
console.log('Root nodes:', roots.length);
roots.forEach(r => console.log('  ROOT:', r.id, '-', r.label, '(sort:', r.sortOrder + ')'));

// Serbian character check in IDs and labels
const serbianRegex = /[\u010d\u0107\u0161\u017e\u0111\u010c\u0106\u0160\u017d\u0110]/;
const serbianIds = data.filter(e => serbianRegex.test(e.id));
const serbianLabels = data.filter(e => serbianRegex.test(e.label));
console.log('\nSerbian chars in IDs:', serbianIds.length);
console.log('Serbian chars in labels:', serbianLabels.length);
if (serbianIds.length > 0) serbianIds.slice(0,5).forEach(e => console.log('  ID:', e.id));
if (serbianLabels.length > 0) serbianLabels.slice(0,5).forEach(e => console.log('  LABEL:', e.label));

// Broken parentIds
const idSet = new Set(data.map(e => e.id));
const broken = data.filter(e => e.parentId !== null && !idSet.has(e.parentId));
console.log('\nBroken parentId refs:', broken.length);
if (broken.length > 0) broken.slice(0,5).forEach(e => console.log('  BROKEN:', e.id, '-> parent:', e.parentId));

// Duplicate IDs
const seen = new Set();
const dupes = [];
data.forEach(e => { if (seen.has(e.id)) dupes.push(e.id); seen.add(e.id); });
console.log('Duplicate IDs:', dupes.length);
if (dupes.length > 0) dupes.slice(0,5).forEach(d => console.log('  DUPE:', d));
