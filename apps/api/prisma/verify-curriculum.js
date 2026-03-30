const d = JSON.parse(require('fs').readFileSync('C:/Users/tanjav/Downloads/BMAD-METHOD-main/mentor-ai/apps/api/src/app/knowledge/data/curriculum.json', 'utf8'));
const m = new Map(d.map(function(n) { return [n.id, n]; }));

function chain(id) {
  const c = [];
  let n = m.get(id);
  while (n) {
    c.unshift(n.label);
    n = n.parentId ? m.get(n.parentId) : null;
  }
  return c.join(' > ');
}

// Find Proizvod by label
const proizvod = d.find(function(n) { return n.label === 'Proizvod'; });
if (proizvod) console.log('Proizvod chain:', chain(proizvod.id));
else console.log('Proizvod NOT FOUND');

const swot = d.find(function(n) { return n.label === 'SWOT Analiza'; });
if (swot) console.log('SWOT chain:', chain(swot.id));
else console.log('SWOT NOT FOUND');

const benefiti = d.find(function(n) { return n.label === 'Benefiti Analize Konkurencije'; });
if (benefiti) console.log('Benefiti chain:', chain(benefiti.id));
else console.log('Benefiti NOT FOUND');

const orphans = d.filter(function(n) { return n.parentId !== null && !m.has(n.parentId); });
console.log('\nOrphans:', orphans.length);
if (orphans.length > 0) orphans.slice(0, 5).forEach(function(o) { console.log('  ', o.id, '->', o.parentId); });

// Count nodes at each depth
const depths = {};
d.forEach(function(n) {
  let depth = 1;
  let curr = n;
  while (curr.parentId) {
    const parent = m.get(curr.parentId);
    if (!parent) break;
    curr = parent;
    depth++;
  }
  depths[depth] = (depths[depth] || 0) + 1;
});
console.log('\nNodes per depth:', JSON.stringify(depths));
