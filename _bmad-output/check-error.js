const fs = require('fs');
const https = require('http');

const url = 'http://91.98.231.87:5678/api/v1/executions/28?includeData=true';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4YzMxMTY1Mi05NTI3LTRmNmQtYTU2YS1kZmQ2YjNhMjI0NDAiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDAxNjI4ZDQtMTNkNC00OTE3LThmY2MtZjdhNDNhMDM0YzIyIiwiaWF0IjoxNzc1MDU4NjU5LCJleHAiOjE4MDY1OTQ2NTk4MDR9.oaXRc-VsQeyMunZYYfbzCiDP6y2A6xS0kpgdJOpM1sY';

https.get(url, { headers: { 'X-N8N-API-KEY': key } }, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const d = JSON.parse(data);
    const err = d.data?.resultData?.error;
    console.log('=== EXECUTION ERROR ===');
    console.log(JSON.stringify(err, null, 2)?.substring(0, 1000));
    console.log('\n=== STEP RESULTS ===');
    const rd = d.data?.resultData?.runData || {};
    for (const [n, r] of Object.entries(rd)) {
      console.log(n + ': ' + r[0].executionStatus + (r[0].error ? ' ERROR: ' + JSON.stringify(r[0].error).substring(0, 300) : ''));
    }
  });
});
