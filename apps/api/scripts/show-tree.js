const fs = require('fs');
const path = require('path');
const curr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'knowledge', 'data', 'curriculum.json'), 'utf-8'));

const roots = curr.filter(n => !n.parentId).sort((a, b) => a.sortOrder - b.sortOrder);

console.log('=== CURRICULUM TREE ===');
console.log('Roots:', roots.length, '| Total nodes:', curr.length);
console.log('');

for (const r of roots) {
  const ch = curr.filter(n => n.parentId === r.id).sort((a, b) => a.sortOrder - b.sortOrder);
  console.log(r.sortOrder + '. ' + r.label + ' [' + r.id + '] (' + ch.length + ' children)');
  for (const c of ch) {
    const gc = curr.filter(n => n.parentId === c.id).sort((a, b) => a.sortOrder - b.sortOrder);
    console.log('  ' + c.label + (gc.length > 0 ? ' (' + gc.length + ')' : ''));
    for (const g of gc.slice(0, 3)) {
      console.log('    - ' + g.label);
    }
    if (gc.length > 3) console.log('    ... +' + (gc.length - 3) + ' more');
  }
  console.log('');
}
