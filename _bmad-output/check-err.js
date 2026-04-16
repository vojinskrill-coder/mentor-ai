const http = require('http');
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4YzMxMTY1Mi05NTI3LTRmNmQtYTU2YS1kZmQ2YjNhMjI0NDAiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDAxNjI4ZDQtMTNkNC00OTE3LThmY2MtZjdhNDNhMDM0YzIyIiwiaWF0IjoxNzc1MDU4NjU5LCJleHAiOjE4MDY1OTQ2NTk4MDR9.oaXRc-VsQeyMunZYYfbzCiDP6y2A6xS0kpgdJOpM1sY';

http.get(`http://91.98.231.87:5678/api/v1/executions/58?includeData=true`, { headers: { 'X-N8N-API-KEY': KEY } }, r => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => {
    const j = JSON.parse(d);
    const rd = j.data?.resultData?.runData || {};
    for (const [n, v] of Object.entries(rd)) {
      const s = v[0];
      console.log(n + ':', s.executionStatus, s.executionTime + 'ms', s.error?.message?.substring(0, 200) || '');
    }
  });
});
