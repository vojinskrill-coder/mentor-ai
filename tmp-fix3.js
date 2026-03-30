const fs = require('fs');
const file = 'apps/api/src/app/conversation/conversation.gateway.ts';
const lines = fs.readFileSync(file, 'utf8').split('\n');
// Delete lines 2988-3307 (0-indexed: 2987-3306)
const before = lines.slice(0, 2987);
const after = lines.slice(3307);
const result = [...before, '', ...after];
fs.writeFileSync(file, result.join('\n'));
console.log('Deleted lines 2988-3307. Before:', before.length, 'After:', after.length, 'Total:', result.length);
