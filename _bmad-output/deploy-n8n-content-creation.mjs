/**
 * Instagram Content Creation — n8n workflow deployment
 * Same pattern as lead discovery: OpenClaw does AI work through HTTP Request nodes,
 * Code nodes only parse JSON, callback sends results to our API.
 *
 * Steps:
 * 1. Content Research — OpenClaw researches trending topics
 * 2. Post Creation — OpenClaw creates full posts with captions, hashtags, image prompts
 * 3. Callback — sends all posts to our API for UI display + user approval
 */

const N8N_BASE = 'http://91.98.231.87:5678';
const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4YzMxMTY1Mi05NTI3LTRmNmQtYTU2YS1kZmQ2YjNhMjI0NDAiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDAxNjI4ZDQtMTNkNC00OTE3LThmY2MtZjdhNDNhMDM0YzIyIiwiaWF0IjoxNzc1MDU4NjU5LCJleHAiOjE4MDY1OTQ2NTk4MDR9.oaXRc-VsQeyMunZYYfbzCiDP6y2A6xS0kpgdJOpM1sY';
// Tailscale IP of the dev box — reachable from the n8n container on Hetzner.
// Do NOT use 172.18.0.1 (Docker bridge) — that only works when the API is on
// the same Hetzner host as n8n, which is not our dev setup.
const CALLBACK_BASE = 'http://100.114.192.85:3000/api/v1/n8n';
const OPENCLAW_RELAY = 'http://host.docker.internal:3100/execute';
const OPENCLAW_CRED_ID = 'ncmLn2pvL3tIx9Gg';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

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
      options: { timeout: 3600000 },
    },
    credentials: { httpHeaderAuth: { id: OPENCLAW_CRED_ID, name: 'OpenClaw Relay' } },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
  };
}

const JSON_EXTRACT = `function extractJson(text) {
  if (!text || typeof text !== 'string') return [];
  // Strip markdown code fences
  let cleaned = text.replace(/\\\`\\\`\\\`json\\n?/g, '').replace(/\\\`\\\`\\\`\\n?/g, '').trim();
  // Try direct parse first
  try { const r = JSON.parse(cleaned); if (Array.isArray(r)) return r; } catch {}
  // Try to extract JSON array
  const match = cleaned.match(/\\[\\s*\\{[\\s\\S]*\\}\\s*\\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
    // Fix common JSON issues: trailing commas, unescaped newlines in strings
    let fixed = match[0]
      .replace(/,\\s*\\}/g, '}')
      .replace(/,\\s*\\]/g, ']')
      .replace(/([^\\\\\\\\])\\n/g, '$1\\\\n');
    try { return JSON.parse(fixed); } catch {}
  }
  // Last resort: try to find individual objects and build array
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
  // WEBHOOK — receives trigger from our API
  { id: uuid(), name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2,
    position: [0, 300], webhookId: uuid(),
    parameters: { path: 'neuron-content-creation', httpMethod: 'POST', responseMode: 'responseNode', options: {} } },

  // ACK — respond immediately
  { id: uuid(), name: 'Ack', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1,
    position: [200, 300],
    parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ started: true, processRunId: $json.body?.processRunId || "unknown" }) }}' } },

  // STEP 1: Content Research — OpenClaw researches trending topics
  openclawNode(uuid(), 'Research', [400, 300],
    `={{ JSON.stringify({
      message: "You are creating Instagram content for " + ($json.body?.businessContext?.company?.name || "LSA Sculptures") + " (" + ($json.body?.businessContext?.company?.industry || "luxury monumental art") + "). " +
      "Research trending topics and content ideas for Instagram in this industry. " +
      ($json.body?.productImages || "") + " " +
      "Find exactly 3 content ideas. For each idea, return: topic, whyItWorks (why it resonates with audience), visualStyle (description of visual aesthetic), suggestedDay (best day/time to post), contentType (one of: single-image, carousel, reel-cover, story), score (1-10 priority), scoreBreakdown ({relevance:0-2, engagement:0-2, uniqueness:0-2, brandFit:0-2, timeliness:0-2}), reasoning (detailed explanation). " +
      "Return ONLY a JSON array of 3 items. No markdown, no explanation.",
      agentId: "content-creation",
      timeoutSeconds: 3600
    }) }}`),

  // STEP 1b: Parse research results
  { id: uuid(), name: 'Parse Research', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [700, 300],
    parameters: { jsCode: `${JSON_EXTRACT}
const oc = $input.first().json;
const wh = $('Webhook').first().json;
const body = wh.body || wh;
const output = oc.output || oc.result || '[]';
let ideas = [];
try { ideas = extractJson(output); } catch(e) { ideas = [{topic:'Parse Error',error:e.message}]; }
return [{json:{processRunId:body.processRunId,tenantId:body.tenantId,businessContext:body.businessContext,productImages:body.productImages||'',ideas}}];` } },

  // STEP 2: Post Creation — OpenClaw creates full posts with captions, hashtags, image prompts
  openclawNode(uuid(), 'Create Posts', [1000, 300],
    `={{ JSON.stringify({
      message: "Create 3 Instagram posts based on these content ideas. For each post, KEEP all existing fields from the idea and ADD: " +
      "caption (100-200 words in Serbian, engaging Instagram caption), " +
      "hookLine (first line that shows before 'more' — must grab attention), " +
      "hashtags (array of 15-20 hashtags WITHOUT # prefix), " +
      "imageType ('real' if using existing product photo, 'composite' if AI-generated scene), " +
      "imageReference (product/sculpture name from available images, or 'custom'), " +
      "imagePrompt (2-3 sentence scene description for AI image generation — describe the setting, lighting, mood), " +
      "callToAction (CTA text like 'DM za konsultaciju' or 'Link in bio'). " +
      ($json.productImages ? "Available product images for reference: " + $json.productImages + " " : "") +
      "Return ONLY a JSON array with ALL fields (original + new). No markdown.\\n\\nContent Ideas:\\n" + JSON.stringify($json.ideas || []),
      agentId: "content-creation",
      timeoutSeconds: 3600
    }) }}`),

  // STEP 2b: Parse posts
  { id: uuid(), name: 'Parse Posts', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [1300, 300],
    parameters: { jsCode: `${JSON_EXTRACT}
const oc = $input.first().json;
const prev = $('Parse Research').first().json;
const output = oc.output || oc.result || '[]';
let posts = [];
try {
  posts = extractJson(output);
  // Ensure all posts have required fields with defaults
  posts = posts.map(p => ({
    topic: p.topic || 'Untitled',
    whyItWorks: p.whyItWorks || '',
    visualStyle: p.visualStyle || '',
    suggestedDay: p.suggestedDay || '',
    contentType: p.contentType || 'single-image',
    score: p.score || 5,
    scoreBreakdown: p.scoreBreakdown || {},
    reasoning: p.reasoning || '',
    caption: p.caption || '',
    hookLine: p.hookLine || '',
    hashtags: Array.isArray(p.hashtags) ? p.hashtags : [],
    imageType: p.imageType || 'composite',
    imageReference: p.imageReference || '',
    imagePrompt: p.imagePrompt || '',
    callToAction: p.callToAction || '',
    status: 'Approved',
  }));
} catch(e) {
  posts = (prev.ideas || []).map(i => ({...i, caption:'Error: '+e.message, hashtags:[], status:'Error'}));
}
return [{json:{...prev,posts}}];` } },

  // FINAL: Callback — send all posts to our API
  { id: uuid(), name: 'Callback', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position: [1600, 300],
    parameters: {
      method: 'POST',
      url: `=${CALLBACK_BASE}/callback/{{ $('Webhook').first().json.body.processRunId || $('Parse Research').first().json.processRunId || "unknown" }}`,
      sendHeaders: true,
      specifyHeaders: 'json',
      jsonHeaders: '{ "Content-Type": "application/json" }',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ stepName: "Content Creation Complete", status: "success", data: { posts: $json.posts || [], summary: { total: ($json.posts || []).length } }, executionId: "n8n-content-" + ($("Webhook").first().json.body?.processRunId || "unknown") }) }}',
      options: { timeout: 10000 },
    },
  },
];

const connections = {
  'Webhook': { main: [[{ node: 'Ack', type: 'main', index: 0 }]] },
  'Ack': { main: [[{ node: 'Research', type: 'main', index: 0 }]] },
  'Research': { main: [[{ node: 'Parse Research', type: 'main', index: 0 }]] },
  'Parse Research': { main: [[{ node: 'Create Posts', type: 'main', index: 0 }]] },
  'Create Posts': { main: [[{ node: 'Parse Posts', type: 'main', index: 0 }]] },
  'Parse Posts': { main: [[{ node: 'Callback', type: 'main', index: 0 }]] },
};

const workflow = { name: 'Neuron Content Creation Pipeline', nodes, connections, settings: { executionOrder: 'v1' } };

async function apiCall(method, path, body = null) {
  const opts = { method, headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${N8N_BASE}/api/v1${path}`, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.substring(0, 200)}`);
  return JSON.parse(text);
}

async function main() {
  console.log('=== Content Creation Pipeline — deploy to n8n ===\n');

  // Delete existing
  const existing = await apiCall('GET', '/workflows');
  for (const w of (existing.data || []).filter(w => w.name === workflow.name))
    await apiCall('DELETE', `/workflows/${w.id}`).then(() => console.log(`Deleted: ${w.id}`));

  // Create
  const created = await apiCall('POST', '/workflows', workflow);
  console.log(`Created: ${created.id}`);

  // Activate
  await apiCall('POST', `/workflows/${created.id}/activate`);
  console.log('Active');

  // Test trigger
  const test = await fetch(`${N8N_BASE}/webhook/neuron-content-creation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      processRunId: 'prun_content_test',
      tenantId: 'tnt_test',
      businessContext: { company: { name: 'LSA Sculptures', industry: 'luxury monumental art' } },
      productImages: '## Product Images\n- Eterna Harmonia (dark bronze infinity sculpture)\n- Nebeski Uzlazak (silver chrome rising flame)',
    }),
  });
  console.log(`Test trigger: ${test.status}`);
  console.log(`\nn8n Workflow ID: ${created.id}`);
  console.log('Webhook path: neuron-content-creation');
}

main().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
