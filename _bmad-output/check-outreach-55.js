const http = require('http');
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4YzMxMTY1Mi05NTI3LTRmNmQtYTU2YS1kZmQ2YjNhMjI0NDAiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDAxNjI4ZDQtMTNkNC00OTE3LThmY2MtZjdhNDNhMDM0YzIyIiwiaWF0IjoxNzc1MDU4NjU5LCJleHAiOjE4MDY1OTQ2NTk4MDR9.oaXRc-VsQeyMunZYYfbzCiDP6y2A6xS0kpgdJOpM1sY';

http.get('http://91.98.231.87:5678/api/v1/executions/55?includeData=true', { headers: { 'X-N8N-API-KEY': KEY } }, r => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => {
    const j = JSON.parse(d);
    const rd = j.data?.resultData?.runData || {};

    for (const [name, results] of Object.entries(rd)) {
      const r = results[0];
      const output = r.data?.main?.[0]?.[0]?.json;
      console.log('\n=== ' + name + ' === status:', r.executionStatus, 'time:', r.executionTime + 'ms');

      if (name === 'Outreach') {
        const raw = output?.output || output?.result || '';
        console.log('Raw output length:', raw.length);
        console.log('Raw preview:', raw.substring(0, 300));
      }

      if (name === 'Parse Outreach') {
        const leads = output?.leads || [];
        leads.forEach(l => {
          console.log('  ' + l.company + ': outreach=' + (l.outreach ? JSON.stringify(l.outreach).substring(0, 100) : 'NULL'));
        });
      }

      if (name === 'Callback') {
        console.log('Status:', r.executionStatus);
        if (r.error) console.log('Error:', r.error.message);
        const leads = output?.data?.leads || output?.leads || [];
        if (leads.length) {
          console.log('Leads in callback:', leads.length);
          leads.forEach(l => console.log('  ' + l.company + ': outreach=' + (l.outreach ? 'HAS' : 'NULL')));
        }
      }
    }
  });
});
