var d = JSON.parse(require('fs').readFileSync('C:/Users/tanjav/Downloads/BMAD-METHOD-main/mentor-ai/apps/api/src/app/knowledge/data/curriculum.json', 'utf8'));
var m = new Map(d.map(function(n) { return [n.id, n]; }));

function chain(id) {
  var c = [];
  var n = m.get(id);
  while (n) {
    c.unshift(n.label);
    n = n.parentId ? m.get(n.parentId) : null;
  }
  return c.join(' > ');
}

// Find Proizvod by label
var proizvod = d.find(function(n) { return n.label === 'Proizvod'; });
if (proizvod) console.log('Proizvod chain:', chain(proizvod.id));
else console.log('Proizvod NOT FOUND');

var swot = d.find(function(n) { return n.label === 'SWOT Analiza'; });
if (swot) console.log('SWOT chain:', chain(swot.id));
else console.log('SWOT NOT FOUND');

var benefiti = d.find(function(n) { return n.label === 'Benefiti Analize Konkurencije'; });
if (benefiti) console.log('Benefiti chain:', chain(benefiti.id));
else console.log('Benefiti NOT FOUND');

var orphans = d.filter(function(n) { return n.parentId !== null && !m.has(n.parentId); });
console.log('\nOrphans:', orphans.length);
if (orphans.length > 0) orphans.slice(0, 5).forEach(function(o) { console.log('  ', o.id, '->', o.parentId); });

// Count nodes at each depth
var depths = {};
d.forEach(function(n) {
  var depth = 1;
  var curr = n;
  while (curr.parentId) {
    var parent = m.get(curr.parentId);
    if (!parent) break;
    curr = parent;
    depth++;
  }
  depths[depth] = (depths[depth] || 0) + 1;
});
console.log('\nNodes per depth:', JSON.stringify(depths));
