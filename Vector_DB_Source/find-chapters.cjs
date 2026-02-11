const fs = require('fs');
const text = fs.readFileSync(__dirname + '/raw-text.txt', 'utf-8');
const lines = text.split('\n');
const chapters = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (/^#[A-Za-z\u00C0-\u017E]/.test(line)) {
    chapters.push({ line: i + 1, name: line.substring(1) });
  }
}
console.log('Total chapter markers:', chapters.length);
const unique = [...new Set(chapters.map(c => c.name))];
console.log('Unique chapters:', unique.length);
unique.forEach((n, i) => console.log((i+1) + '. ' + n));
