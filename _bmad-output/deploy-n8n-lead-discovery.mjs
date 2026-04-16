/**
 * Lead Discovery v5 — ALL HTTP calls via HTTP Request nodes (no Code node HTTP)
 * n8n sandbox blocks this.helpers.httpRequest to external APIs.
 * Solution: HTTP Request nodes with credentials for ALL API calls.
 * Code nodes ONLY parse JSON — zero HTTP calls.
 */

const N8N_BASE = 'http://91.98.231.87:5678';
const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4YzMxMTY1Mi05NTI3LTRmNmQtYTU2YS1kZmQ2YjNhMjI0NDAiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDAxNjI4ZDQtMTNkNC00OTE3LThmY2MtZjdhNDNhMDM0YzIyIiwiaWF0IjoxNzc1MDU4NjU5LCJleHAiOjE4MDY1OTQ2NTk4MDR9.oaXRc-VsQeyMunZYYfbzCiDP6y2A6xS0kpgdJOpM1sY';
// Tailscale IP of the dev box — reachable from the n8n container on Hetzner.
// Do NOT use 172.18.0.1 (Docker bridge) — that only works when the API is on
// the same Hetzner host as n8n, which is not our dev setup.
const CALLBACK_BASE = 'http://100.114.192.85:3000/api/v1/n8n';
const OPENCLAW_RELAY = 'http://host.docker.internal:3100/execute';
const OPENCLAW_CRED_ID = 'ncmLn2pvL3tIx9Gg'; // httpHeaderAuth credential for OpenClaw
const CALLBACK_CRED_ID = ''; // No auth needed for our API in dev mode

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Helper: create an OpenClaw HTTP Request node
function openclawNode(id, name, position, promptExpr) {
  return {
    id, name,
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position,
    parameters: {
      method: 'POST',
      url: OPENCLAW_RELAY,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      specifyHeaders: 'json',
      jsonHeaders: '{ "Content-Type": "application/json" }',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: promptExpr,
      options: { timeout: 3600000 }, // 1 hour — agents run long operations
    },
    credentials: { httpHeaderAuth: { id: OPENCLAW_CRED_ID, name: 'OpenClaw Relay' } },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000, // 5s between retries
  };
}

const JSON_EXTRACT = `function extractJson(text) {
  if (!text || typeof text !== 'string') return [];
  let cleaned = text.replace(/\\\`\\\`\\\`json\\n?/g, '').replace(/\\\`\\\`\\\`\\n?/g, '').trim();
  try { const r = JSON.parse(cleaned); if (Array.isArray(r)) return r; } catch {}
  const match = cleaned.match(/\\[\\s*\\{[\\s\\S]*\\}\\s*\\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
    let fixed = match[0].replace(/,\\s*\\}/g, '}').replace(/,\\s*\\]/g, ']').replace(/([^\\\\\\\\])\\n/g, '$1\\\\n');
    try { return JSON.parse(fixed); } catch {}
  }
  const objects = [];
  const objRegex = /\\{[^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\}/g;
  let m;
  while ((m = objRegex.exec(cleaned)) !== null) {
    try { objects.push(JSON.parse(m[0])); } catch {}
  }
  if (objects.length > 0) return objects;
  throw new Error('Could not parse JSON from: ' + cleaned.substring(0, 200));
}`;

const nodes = [
  // WEBHOOK
  { id: uuid(), name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2,
    position: [0, 300], webhookId: uuid(),
    parameters: { path: 'neuron-lead-discovery', httpMethod: 'POST', responseMode: 'responseNode', options: {} } },

  // ACK
  { id: uuid(), name: 'Ack', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1,
    position: [200, 300],
    parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ started: true, processRunId: $json.body?.processRunId || "unknown" }) }}' } },

  // STEP 1a: OpenClaw Search (HTTP Request)
  openclawNode(uuid(), 'Search', [400, 300],
    '={{ JSON.stringify({ message: "Search the web for " + ($json.body?.searchCriteria?.industry || "luxury architecture") + " firms in " + ($json.body?.searchCriteria?.region || "Serbia") + ". Find " + ($json.body?.searchCriteria?.targetCount || 5) + " REAL companies. Return ONLY a JSON array: [{name, company, website, location, source, industry}]. Exclude: " + ($json.body?.deduplicationContext || "none"), agentId: "lead-discovery", timeoutSeconds: 3600 }) }}'),

  // STEP 1b: Parse search results (Code — NO HTTP)
  { id: uuid(), name: 'Parse Search', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [700, 300],
    parameters: { jsCode: `${JSON_EXTRACT}
const oc = $input.first().json;
const wh = $('Webhook').first().json;
const body = wh.body || wh;
const output = oc.output || oc.result || '[]';
let leads = [];
try { leads = extractJson(output); } catch(e) { leads = [{name:'Parse Error',company:output.substring(0,100),error:e.message}]; }
return [{json:{processRunId:body.processRunId,tenantId:body.tenantId,searchCriteria:body.searchCriteria,deduplicationContext:body.deduplicationContext,leads}}];` } },

  // STEP 2: Enrich (HTTP Request → OpenClaw)
  openclawNode(uuid(), 'Enrich', [1000, 300],
    '={{ JSON.stringify({ message: "Enrich each lead with real details. KEEP ALL existing fields, ADD: email, linkedin, phone, role, companyDescription (2-3 sentences), whyGoodFit (for luxury sculptures), recentProjects (array of 2-3). Mark unavailable as not found. Return ONLY a JSON array with ALL fields.\\n\\nLeads:\\n" + JSON.stringify($json.leads), agentId: "lead-discovery", timeoutSeconds: 3600 }) }}'),

  // STEP 2b: Parse enrichment
  { id: uuid(), name: 'Parse Enrich', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [1300, 300],
    parameters: { jsCode: `${JSON_EXTRACT}
const oc = $input.first().json;
const prev = $('Parse Search').first().json;
const output = oc.output || oc.result || '[]';
let leads = prev.leads;
try { leads = extractJson(output); } catch(e) { leads = prev.leads.map(l=>({...l,enrichmentError:e.message})); }
return [{json:{...prev,leads}}];` } },

  // STEP 3: Score (HTTP Request → OpenClaw)
  openclawNode(uuid(), 'Score', [1600, 300],
    '={{ JSON.stringify({ message: "Score each lead for LSA Sculptures (luxury 180-250cm for hotels/villas). KEEP ALL fields. ADD: score (0-10 total), scoreBreakdown ({fit:0-3,accessibility:0-3,timing:0-2,size:0-2}), scoringRationale. Sort by score desc. Return ONLY JSON array.\\n\\nLeads:\\n" + JSON.stringify($json.leads), agentId: "lead-discovery", timeoutSeconds: 3600 }) }}'),

  // STEP 3b: Parse scores
  { id: uuid(), name: 'Parse Score', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [1900, 300],
    parameters: { jsCode: `${JSON_EXTRACT}
const oc = $input.first().json;
const prev = $('Parse Enrich').first().json;
const output = oc.output || oc.result || '[]';
let leads = prev.leads;
try { leads = extractJson(output); leads.sort((a,b)=>(b.score||0)-(a.score||0)); } catch(e) { leads = prev.leads.map(l=>({...l,score:0,scoringError:e.message})); }
return [{json:{...prev,leads}}];` } },

  // STEP 4: Outreach (HTTP Request → OpenClaw)
  openclawNode(uuid(), 'Outreach', [2200, 300],
    '={{ JSON.stringify({ message: "Write outreach for LSA Sculptures (premium monumental art for hotels and villas, 180-250cm). KEEP ALL existing fields on each lead. For leads with score 6 or higher, ADD an outreach field with email subject, email body, and linkedin message. Return ONLY a JSON array with ALL fields preserved. Leads: " + JSON.stringify($json.leads || []), agentId: "lead-discovery", timeoutSeconds: 3600 }) }}'),

  // STEP 4b: Parse outreach
  { id: uuid(), name: 'Parse Outreach', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [2500, 300],
    parameters: { jsCode: `${JSON_EXTRACT}
const oc = $input.first().json;
const prev = $('Parse Score').first().json;
const output = oc.output || oc.result || '[]';
let leads = prev.leads || [];
try {
  const outreachLeads = extractJson(output);
  leads = leads.map((l, i) => {
    const match = outreachLeads.find(o => o.company === l.company || o.name === l.name) || outreachLeads[i];
    if (!match) return { ...l, outreach: null };
    // Normalize ALL possible outreach formats from OpenClaw
    let outreach = match.outreach;
    if (!outreach || (outreach.email === null && outreach.linkedin === null)) {
      // Try flat formats: email_subject, emailSubject, email_body, emailBody, etc.
      const subj = match.email_subject || match.emailSubject || match.subject || null;
      const body = match.email_body || match.emailBody || match.body || null;
      const liMsg = match.linkedin_message || match.linkedinMessage || match.linkedin_note || match.linkedinNote || null;
      outreach = {
        email: subj ? { subject: subj, body: body || '' } : null,
        linkedin: liMsg ? { message: liMsg } : null,
      };
    }
    // Also normalize if outreach has emailSubject/emailBody instead of nested email
    if (outreach && !outreach.email && (outreach.emailSubject || outreach.emailBody)) {
      outreach = {
        email: { subject: outreach.emailSubject || '', body: outreach.emailBody || '' },
        linkedin: outreach.linkedinMessage ? { message: outreach.linkedinMessage } : (outreach.linkedin || null),
      };
    }
    return { ...l, outreach };
  });
} catch(e) { leads = leads.map(l=>({...l, outreach: null, outreachError: e.message})); }
leads.sort((a,b)=>(b.score||0)-(a.score||0));
return [{json:{...prev,leads}}];` } },

  // FINAL: Callback (HTTP Request → our API)
  { id: uuid(), name: 'Callback', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position: [2800, 300],
    parameters: {
      method: 'POST',
      url: `=${CALLBACK_BASE}/callback/{{ $('Webhook').first().json.body.processRunId || $('Parse Search').first().json.processRunId || "unknown" }}`,
      sendHeaders: true,
      specifyHeaders: 'json',
      jsonHeaders: '{ "Content-Type": "application/json" }',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ stepName: "Lead Discovery Complete", status: "success", data: { leads: $json.leads || [], summary: { total: ($json.leads || []).length } }, executionId: "n8n-" + ($("Webhook").first().json.body?.processRunId || "unknown") }) }}',
      options: { timeout: 10000 },
    },
  },
];

const connections = {
  'Webhook': { main: [[{ node: 'Ack', type: 'main', index: 0 }]] },
  'Ack': { main: [[{ node: 'Search', type: 'main', index: 0 }]] },
  'Search': { main: [[{ node: 'Parse Search', type: 'main', index: 0 }]] },
  'Parse Search': { main: [[{ node: 'Enrich', type: 'main', index: 0 }]] },
  'Enrich': { main: [[{ node: 'Parse Enrich', type: 'main', index: 0 }]] },
  'Parse Enrich': { main: [[{ node: 'Score', type: 'main', index: 0 }]] },
  'Score': { main: [[{ node: 'Parse Score', type: 'main', index: 0 }]] },
  'Parse Score': { main: [[{ node: 'Outreach', type: 'main', index: 0 }]] },
  'Outreach': { main: [[{ node: 'Parse Outreach', type: 'main', index: 0 }]] },
  'Parse Outreach': { main: [[{ node: 'Callback', type: 'main', index: 0 }]] },
};

const workflow = { name: 'Neuron Lead Discovery Pipeline', nodes, connections, settings: { executionOrder: 'v1' } };

async function apiCall(method, path, body = null) {
  const opts = { method, headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${N8N_BASE}/api/v1${path}`, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.substring(0, 200)}`);
  return JSON.parse(text);
}

async function main() {
  console.log('=== Lead Discovery v5 — HTTP Request nodes only ===\n');
  const existing = await apiCall('GET', '/workflows');
  for (const w of (existing.data || []).filter(w => w.name === workflow.name))
    await apiCall('DELETE', `/workflows/${w.id}`).then(() => console.log(`Deleted: ${w.id}`));
  const created = await apiCall('POST', '/workflows', workflow);
  console.log(`Created: ${created.id}`);
  await apiCall('POST', `/workflows/${created.id}/activate`);
  console.log('Active');
  const test = await fetch(`${N8N_BASE}/webhook/neuron-lead-discovery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ processRunId: 'prun_v5_test', tenantId: 'tnt_test', searchCriteria: { industry: 'luxury interior design', region: 'Austria', targetCount: 3 } }),
  });
  console.log(`Test: ${test.status}`);
  console.log(`\nWorkflow: ${created.id}`);
}

main().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
