const fs = require('fs');
const file = 'apps/api/src/app/conversation/conversation.gateway.ts';
const lines = fs.readFileSync(file, 'utf8').split('\n');
const before = lines.slice(0, 2310);
const after = lines.slice(2778);
const result = [...before, '', '  // Legacy autoPopuniSingleTask body removed - now uses HeadlessExecutor', '', ...after];
fs.writeFileSync(file, result.join('\n'));
console.log('Deleted lines 2311-2778. Before:', before.length, 'After:', after.length, 'Total:', result.length);
