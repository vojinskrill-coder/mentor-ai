const fs = require('fs');
const file = 'apps/api/src/app/conversation/conversation.gateway.ts';
const lines = fs.readFileSync(file, 'utf8').split('\n');
// Delete lines 3782-4369 (0-indexed: 3781-4368)
const before = lines.slice(0, 3781);
const after = lines.slice(4369);
const result = [...before, '', ...after];
fs.writeFileSync(file, result.join('\n'));
console.log('Deleted lines 3782-4369. Before:', before.length, 'After:', after.length, 'Total:', result.length);
