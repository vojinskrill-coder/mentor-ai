const fs = require('fs');
const data = JSON.parse(fs.readFileSync('C:/Users/tanjav/AppData/Local/Temp/n8n-exec-17.json', 'utf8'));
const runData = data.data?.resultData?.runData || {};

console.log('=== EXECUTION 17 — Full Trace ===');
console.log('Status:', data.status);
console.log('Started:', data.startedAt);
console.log('Stopped:', data.stoppedAt);
console.log('');

for (const [nodeName, results] of Object.entries(runData)) {
  const r = results[0];
  console.log('--- ' + nodeName + ' ---');
  console.log('  Status:', r.executionStatus);
  console.log('  Duration:', r.executionTime + 'ms');

  const output = r.data?.main?.[0]?.[0]?.json;
  if (output) {
    if (output.leads) {
      console.log('  Leads:', output.leads.length);
      output.leads.slice(0, 3).forEach((l, i) => {
        console.log('    ' + (i+1) + '. ' + (l.name || 'N/A') + ' @ ' + (l.company || 'N/A') + ' | score:' + (l.scores?.total || l.score || 'N/A'));
      });
    } else if (output.started !== undefined) {
      console.log('  Output: started=' + output.started);
    } else if (output.notified !== undefined) {
      console.log('  Output: notified=' + output.notified);
    } else {
      console.log('  Output keys:', Object.keys(output).join(', '));
    }
  }

  if (r.error) console.log('  ERROR:', JSON.stringify(r.error).substring(0, 300));
  console.log('');
}
