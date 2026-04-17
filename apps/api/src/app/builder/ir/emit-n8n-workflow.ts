/**
 * Emit an n8n workflow JSON from a ProcessIR.
 *
 * Mirrors the lead-discovery pattern exactly:
 *   Webhook → Ack → [BrainCall N → Parse N] × M → Callback
 *
 * Each BrainCall is an httpRequest node that POSTs to the OpenClaw
 * relay at host.docker.internal:3100/execute with:
 *   { message, agentId, thinking, timeoutSeconds }
 *
 * Each Parse node is a Code node that strips markdown fences and
 * extracts a JSON array from the agent's text response.
 *
 * The Callback node POSTs the final parsed data to our API at
 * /api/v1/n8n/callback/:processRunId — which already exists and
 * handles storage + UI notification.
 */

import type { ProcessIR, BrainCall } from './process-ir';
import type {
  N8nWorkflowDef,
  N8nNode,
} from '../../n8n/n8n-orchestrator.service';

// ─── Constants (mirrors existing workflows) ──────────────────────

const RELAY_URL = 'http://host.docker.internal:3100/execute';
const CALLBACK_BASE_URL = 'http://100.114.192.85:3000/api/v1/n8n/callback';

// ─── Emit ────────────────────────────────────────────────────────

export function emitN8nWorkflow(ir: ProcessIR): N8nWorkflowDef {
  if (ir.brainCalls.length === 0) {
    throw new Error(
      `emitN8nWorkflow: process "${ir.slug}" has no brain calls — ` +
        'at least one MCP_READ / MCP_SEARCH step is required.',
    );
  }

  const nodes: N8nNode[] = [];
  const connections: N8nWorkflowDef['connections'] = {};
  let x = 240;
  const y = 300;
  const step = 220;
  let nodeIndex = 0;

  const addConnection = (from: string, to: string) => {
    const existing = connections[from] ?? { main: [[]] };
    if (!existing.main[0]) existing.main[0] = [];
    existing.main[0].push({ node: to, type: 'main', index: 0 });
    connections[from] = existing;
  };

  // ── 1. Webhook ──────────────────────────────────────────────
  const webhookNode: N8nNode = {
    id: `node_${nodeIndex++}`,
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [x, y],
    parameters: {
      path: `neuron-${ir.slug}`,
      httpMethod: 'POST',
      responseMode: 'responseNode',
      options: {},
    },
  };
  nodes.push(webhookNode);
  x += step;

  // ── 2. Ack ──────────────────────────────────────────────────
  const ackNode: N8nNode = {
    id: `node_${nodeIndex++}`,
    name: 'Ack',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1,
    position: [x, y],
    parameters: {
      respondWith: 'json',
      responseBody: `={{ JSON.stringify({ started: true, processRunId: $json.body?.processRunId || "unknown" }) }}`,
    },
  };
  nodes.push(ackNode);
  addConnection('Webhook', 'Ack');
  x += step;

  // ── 3. Pipeline steps — ALL are brain calls + Parse pairs ───────
  // Every step (including MCP operations) is a brain call to the
  // per-process OpenClaw agent. The agent handles MCP tool calls
  // internally via exec curl to the MCP gateway. This is the
  // "Agent-as-Executor" pattern.
  const BRIDGE_TOKEN = '9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d';

  let prevParseNode = 'Ack';
  for (const call of ir.brainCalls) {
    const nodeName = sanitizeName(call.name);
    const parseNodeName = `Parse ${nodeName}`;

    // Single code path: all steps are brain calls to the relay.
    // MCP operations are handled by the agent (it calls the gateway
    // via exec curl per its SOUL.md instructions).
    nodes.push({
      id: `node_${nodeIndex++}`,
      name: nodeName,
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [x, y],
      continueOnFail: true,
      parameters: {
        method: 'POST',
        url: RELAY_URL,
        sendHeaders: true,
        specifyHeaders: 'json',
        jsonHeaders: `={{ JSON.stringify({ "Content-Type": "application/json", "Authorization": "Bearer ${BRIDGE_TOKEN}" }) }}`,
        sendBody: true,
        specifyBody: 'json',
        jsonBody: buildBrainCallBody(call, ir.agentId, prevParseNode),
        options: {
          timeout: call.timeoutSeconds * 1000,
        },
      },
    });
    addConnection(prevParseNode, nodeName);
    x += step;

    // Parse code node (same for both MCP and brain calls)
    nodes.push({
      id: `node_${nodeIndex++}`,
      name: parseNodeName,
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [x, y],
      parameters: {
        jsCode: buildParseNodeCode(call),
      },
    });
    addConnection(nodeName, parseNodeName);
    x += step;

    prevParseNode = parseNodeName;
  }

  // ── 4. Callback ─────────────────────────────────────────────
  nodes.push({
    id: `node_${nodeIndex++}`,
    name: 'Callback',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4,
    position: [x, y],
    parameters: {
      method: 'POST',
      url: `=${CALLBACK_BASE_URL}/{{ $('Webhook').first().json.body?.processRunId || "unknown" }}`,
      sendHeaders: true,
      specifyHeaders: 'json',
      jsonHeaders: '{ "Content-Type": "application/json" }',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: buildCallbackBody(ir),
      options: {
        timeout: 3600000,
      },
    },
  });
  addConnection(prevParseNode, 'Callback');

  return {
    name: `Neuron ${ir.name} Pipeline`,
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
  };
}

// ─── Body builders ───────────────────────────────────────────────

/**
 * Build the jsonBody expression for a brain call node.
 * Matches the lead-discovery format exactly — plus automatic
 * business context injection so every brain call is grounded in
 * the tenant's domain (company name, industry, ICP) the same way
 * lead-discovery and content-creation do.
 */
function buildBrainCallBody(
  call: BrainCall,
  agentId: string,
  prevParseNode: string,
): string {
  // Construct the message as a JavaScript expression that concatenates
  // the instruction template with the previous step's output.
  // Placeholder substitution: each {{name}} in call.instruction is
  // replaced with an inline n8n expression.

  let instruction = JSON.stringify(call.instruction);
  // Strip outer quotes so we can concatenate
  instruction = instruction.slice(1, -1);

  // Substitute placeholders with inline expressions
  let messageExpr = `"${instruction}"`;
  for (const binding of call.inputBindings) {
    const needle = `{{${binding.placeholder}}}`;
    const expr =
      binding.fallback !== undefined
        ? `(${binding.expression} || ${binding.fallback})`
        : `(${binding.expression})`;
    // Split around the needle and wrap the n8n expression
    messageExpr = messageExpr.split(needle).join(`" + ${expr} + "`);
  }

  // Prepend the business context block. This pulls
  // $json.body.businessContext (populated by ProcessExecutorService.startRun)
  // and embeds it inline so the agent sees the tenant's domain facts.
  //
  // GENERIC: No hardcoded company names, ICPs, or API keys. All context
  // comes from the runtime payload which ProcessExecutorService builds
  // from the tenant's bridge/context + bridge/memories endpoints.
  const businessContextExpr =
    `"You are executing a business process for " + ` +
    `($json.body?.businessContext?.company?.name || "the business") + ` +
    `" (industry: " + ($json.body?.businessContext?.company?.industry || "general") + "). " + ` +
    `($json.body?.businessContext?.company?.description ? "Company description: " + $json.body.businessContext.company.description + ". " : "") + ` +
    `($json.body?.businessContext?.icp ? "Target ICP: " + $json.body.businessContext.icp + ". " : "") + ` +
    `"Every result you return must be RELEVANT to this business — filter out noise that does not fit. " + ` +
    `($json.body?.businessContext?.mcpTools ? "\\nAvailable MCP tools for this process: " + $json.body.businessContext.mcpTools + ". Use them via the MCP gateway when appropriate." : "") + ` +
    `"\\n\\n---\\n\\nTask: "`;

  // Append a deduplication block. The executor populates
  // $json.body.deduplicationContext with the list of items already
  // saved in the per-process Notion DB. The agent must skip these.
  const dedupExpr =
    `($json.body?.deduplicationContext ? ` +
    `"\\n\\n---\\n\\nDO NOT RETURN any of these items — they are already saved in our database:\\n" + $json.body.deduplicationContext + "\\n\\nYour results must be NEW items not in this list." ` +
    `: "")`;

  const prependedMessageExpr = `${businessContextExpr} + ${messageExpr} + ${dedupExpr}`;

  // For calls after the first, include the previous step's output as context
  const includesPrevOutput = call.index > 1;
  const prevOutputExpr = includesPrevOutput
    ? ` + "\\n\\nInput from previous step:\\n" + JSON.stringify($('${prevParseNode}').first().json || {})`
    : '';

  const bodyExpr = `{
  message: ${prependedMessageExpr}${prevOutputExpr},
  agentId: "${agentId}",
  thinking: "${call.thinking}",
  timeoutSeconds: ${call.timeoutSeconds}
}`;

  return `={{ JSON.stringify(${bodyExpr}) }}`;
}

/**
 * Build the JavaScript code for a parse node.
 * Mirrors the extractJson function from lead-discovery's Parse nodes.
 */
function buildParseNodeCode(call: BrainCall): string {
  return `function extractJson(text) {
  if (!text || typeof text !== 'string') return [];
  let cleaned = text.replace(/\`\`\`json\\n?/g, '').replace(/\`\`\`\\n?/g, '').trim();
  try { const r = JSON.parse(cleaned); if (Array.isArray(r)) return r; if (typeof r === 'object' && r !== null) return [r]; } catch {}
  const match = cleaned.match(/\\[\\s*\\{[\\s\\S]*\\}\\s*\\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
    const fixed = match[0].replace(/,\\s*\\}/g, '}').replace(/,\\s*\\]/g, ']');
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
}
const oc = $input.first().json;
const wh = $('Webhook').first().json;
const body = wh.body || wh;
const output = oc.output || oc.result || '[]';
let items = [];
try { items = extractJson(output); } catch(e) { items = [{parseError: e.message, rawPreview: String(output).substring(0, 300)}]; }
return [{ json: {
  processRunId: body.processRunId,
  tenantId: body.tenantId,
  input: body.input || {},
  ${call.id.replace(/-/g, '_')}Items: items,
  items
} }];`;
}

/**
 * Build the callback body expression. Sends the items from the last
 * parse node plus summary metadata to our callback endpoint.
 */
function buildCallbackBody(ir: ProcessIR): string {
  const lastCall = ir.brainCalls[ir.brainCalls.length - 1];
  if (!lastCall) throw new Error('no brain calls');

  // Detect error items (parseError, error, statusCode) and set status accordingly.
  // If ALL items are errors, report "error". Otherwise report "success".
  return `={{ (() => {
    const items = $json.items || [];
    const errorItems = items.filter(i => i && (i.parseError || i.error || i.statusCode));
    const hasOnlyErrors = items.length > 0 && errorItems.length === items.length;
    return JSON.stringify({
      stepName: "${ir.name} Complete",
      status: hasOnlyErrors || items.length === 0 ? "error" : "success",
      data: {
        items: items,
        summary: { total: items.length, errors: errorItems.length }
      },
      executionId: "n8n-${ir.slug}-" + ($('Webhook').first().json.body?.processRunId || "unknown")
    });
  })() }}`;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 60) || 'Step';
}
