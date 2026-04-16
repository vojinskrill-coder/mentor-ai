const http = require('http');
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4YzMxMTY1Mi05NTI3LTRmNmQtYTU2YS1kZmQ2YjNhMjI0NDAiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDAxNjI4ZDQtMTNkNC00OTE3LThmY2MtZjdhNDNhMDM0YzIyIiwiaWF0IjoxNzc1MDU4NjU5LCJleHAiOjE4MDY1OTQ2NTk4MDR9.oaXRc-VsQeyMunZYYfbzCiDP6y2A6xS0kpgdJOpM1sY';

http.get('http://91.98.231.87:5678/api/v1/executions/52?includeData=true', { headers: { 'X-N8N-API-KEY': KEY } }, r => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => {
    const j = JSON.parse(d);
    const rd = j.data?.resultData?.runData || {};

    // Check Outreach node raw output
    const outreachNode = rd['Outreach']?.[0]?.data?.main?.[0]?.[0]?.json;
    console.log('=== Outreach node raw output ===');
    console.log('Keys:', outreachNode ? Object.keys(outreachNode) : 'MISSING');
    const output = outreachNode?.output || outreachNode?.result || '';
    console.log('Output length:', output.length);
    console.log('Output preview:', output.substring(0, 500));

    // Check Parse Outreach result
    const parseNode = rd['Parse Outreach']?.[0]?.data?.main?.[0]?.[0]?.json;
    console.log('\n=== Parse Outreach result ===');
    if (parseNode?.leads) {
      parseNode.leads.forEach(l => {
        console.log(l.company + ': outreach=' + (l.outreach ? JSON.stringify(l.outreach).substring(0, 150) : 'NULL'));
      });
    }

    // Check Callback result
    const callbackNode = rd['Callback']?.[0]?.data?.main?.[0]?.[0]?.json;
    console.log('\n=== Callback result ===');
    if (callbackNode?.leads) {
      callbackNode.leads.forEach(l => {
        console.log(l.company + ': outreach=' + (l.outreach ? 'HAS' : 'NULL'));
      });
    }
  });
});
