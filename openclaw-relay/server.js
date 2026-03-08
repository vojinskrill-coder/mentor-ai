#!/usr/bin/env node
/**
 * OpenClaw Streaming Relay Server v2
 *
 * SSE streaming endpoint + backwards-compatible blocking /execute.
 * Runs the OpenClaw CLI and streams stdout/stderr as Server-Sent Events.
 *
 * Events emitted (SSE):
 *   event: status     → { phase: "starting"|"running"|"completed"|"failed" }
 *   event: stdout     → { text: "..." }  (agent text output, streamed in real-time)
 *   event: tool       → { tool: "web_search|web_fetch|exec|browser", status: "start"|"end", query?: "..." }
 *   event: result     → { success, output, durationMs, usage, runId }
 *   event: error      → { error: "..." }
 *
 * Env vars:
 *   RELAY_PORT       (default 3100)
 *   RELAY_AUTH_TOKEN  (required)
 */

import http from 'http';
import { spawn } from 'child_process';
import crypto from 'crypto';

const PORT = parseInt(process.env.RELAY_PORT || '3100', 10);
const AUTH_TOKEN = process.env.RELAY_AUTH_TOKEN || '';
const MAX_TIMEOUT = 600;

const OPENCLAW_ENV = {
  ...process.env,
  NO_COLOR: '1',
  NODE_COMPILE_CACHE: '/var/tmp/openclaw-compile-cache',
  OPENCLAW_NO_RESPAWN: '1',
};

function log(msg, data = {}) {
  console.log(`[${new Date().toISOString()}] ${msg}`, Object.keys(data).length ? JSON.stringify(data) : '');
}

function verifyAuth(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  return AUTH_TOKEN && token === AUTH_TOKEN;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Parse OpenClaw --json stdout into { output, usage, runId }.
 * Format: { result: { payloads: [{text}], meta: { agentMeta: { usage } } }, runId }
 */
function parseOpenClawOutput(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    const payloads = parsed?.result?.payloads || [];
    const output = payloads.map((p) => p.text).filter(Boolean).join('\n\n');
    const usage = parsed?.result?.meta?.agentMeta?.usage || {};
    return { output: output || stdout, usage, runId: parsed?.runId };
  } catch {
    return { output: stdout, usage: {}, runId: undefined };
  }
}

/**
 * Tool call detection patterns in OpenClaw stdout.
 */
const TOOL_PATTERNS = [
  { regex: /\[tool:(\w+)\]\s*(.*)/, extract: (m) => ({ tool: m[1], query: m[2] }) },
  { regex: /Searching:\s*(.+)/i, extract: (m) => ({ tool: 'web_search', query: m[1] }) },
  { regex: /Fetching:\s*(https?:\/\/\S+)/i, extract: (m) => ({ tool: 'web_fetch', query: m[1] }) },
  { regex: /Running:\s*(.+)/i, extract: (m) => ({ tool: 'exec', query: m[1] }) },
  { regex: /Browsing:\s*(https?:\/\/\S+)/i, extract: (m) => ({ tool: 'browser', query: m[1] }) },
];

function detectTool(line) {
  for (const { regex, extract } of TOOL_PATTERNS) {
    const match = line.match(regex);
    if (match) return extract(match);
  }
  return null;
}

/**
 * SSE streaming endpoint.
 * Runs openclaw CLI and streams output as Server-Sent Events.
 */
function handleStream(req, res, body) {
  const { message, agentId = 'main', timeoutSeconds = MAX_TIMEOUT } = body;
  const timeout = Math.min(timeoutSeconds, MAX_TIMEOUT);
  const runId = crypto.randomUUID();
  let responseClosed = false;

  log('Stream execution start', { agentId, runId, msgLength: message.length });

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Run-Id': runId,
  });

  function sendEvent(event, data) {
    if (responseClosed) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      log('sendEvent write failed', { runId, event, error: err.message });
      responseClosed = true;
    }
  }

  function endResponse() {
    if (responseClosed) return;
    responseClosed = true;
    try { res.end(); } catch { /* already closed */ }
  }

  function cleanup() {
    clearTimeout(abortTimer);
    if (!proc.killed) {
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }
    }
  }

  sendEvent('status', { phase: 'starting', runId });

  // Spawn openclaw CLI WITHOUT --json for real-time text streaming.
  // With --json, OpenClaw buffers everything and dumps JSON at the end.
  // Without --json, text streams to stdout as the LLM generates it.
  const startTime = Date.now();
  const proc = spawn('openclaw', [
    'agent', '--agent', agentId,
    '--message', message,
    '--timeout', String(timeout),
  ], {
    timeout: (timeout + 30) * 1000,
    maxBuffer: 10 * 1024 * 1024,
    env: OPENCLAW_ENV,
  });

  let fullOutput = '';
  let lastToolEvent = null;

  sendEvent('status', { phase: 'running', runId });

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    fullOutput += text;

    // Split into lines for tool detection
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check for tool calls
      const tool = detectTool(trimmed);
      if (tool) {
        if (lastToolEvent) {
          sendEvent('tool', { ...lastToolEvent, status: 'end' });
        }
        lastToolEvent = tool;
        sendEvent('tool', { ...tool, status: 'start' });
      }

      // Send the text chunk
      sendEvent('stdout', { text: trimmed + '\n' });
    }
  });

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) {
      log('stderr', { runId, text: text.substring(0, 200) });
    }
  });

  const abortTimer = setTimeout(() => {
    log('Timeout exceeded, killing process', { runId });
    if (!proc.killed) {
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }
    }
    // Don't sendEvent or endResponse here — let proc.on('close') handle final events.
    // The process will exit after SIGTERM and 'close' fires with the exit code.
  }, (timeout + 30) * 1000);

  proc.on('close', (code) => {
    clearTimeout(abortTimer);
    const durationMs = Date.now() - startTime;

    if (lastToolEvent) {
      sendEvent('tool', { ...lastToolEvent, status: 'end' });
    }

    const success = code === 0;

    const result = {
      success,
      output: fullOutput.trim(),
      durationMs,
      usage: {},
      runId,
      error: success ? undefined : `Process exited with code ${code}`,
    };

    sendEvent('result', result);
    sendEvent('status', { phase: success ? 'completed' : 'failed', runId, durationMs });

    log(`Stream ${success ? 'OK' : 'FAIL'} in ${durationMs}ms, len=${result.output.length}`);
    endResponse();
  });

  proc.on('error', (err) => {
    clearTimeout(abortTimer);
    const durationMs = Date.now() - startTime;
    sendEvent('error', { error: err.message });
    sendEvent('status', { phase: 'failed', runId, durationMs });
    log('Stream execution error', { runId, error: err.message });
    endResponse();
  });

  // Clean up on client disconnect
  req.on('close', () => {
    log('Client disconnected', { runId, responseClosed });
    responseClosed = true; // prevent further writes
    cleanup();
  });
}

/**
 * Blocking /execute endpoint (backwards compatible).
 * Identical behavior to the original relay.
 */
function handleExecute(req, res, body) {
  const { message, agentId = 'main', timeoutSeconds = MAX_TIMEOUT } = body;
  const timeout = Math.min(timeoutSeconds, MAX_TIMEOUT);

  const startMs = Date.now();
  log(`Execute: agent=${agentId}, msgLen=${message.length}`);

  const proc = spawn('openclaw', [
    'agent', '--agent', agentId,
    '--message', message,
    '--json',
    '--timeout', String(timeout),
  ], {
    timeout: (timeout + 30) * 1000,
    maxBuffer: 10 * 1024 * 1024,
    env: OPENCLAW_ENV,
  });

  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (chunk) => (stdout += chunk));
  proc.stderr.on('data', (chunk) => (stderr += chunk));

  const abortTimer = setTimeout(() => {
    proc.kill('SIGTERM');
  }, (timeout + 30) * 1000);

  proc.on('close', (code) => {
    clearTimeout(abortTimer);
    const durationMs = Date.now() - startMs;
    const success = code === 0;

    const parsed = parseOpenClawOutput(stdout);
    log(`${success ? 'OK' : 'FAIL'} in ${durationMs}ms, len=${parsed.output.length}`);

    const result = {
      success,
      output: parsed.output,
      durationMs,
      usage: parsed.usage,
      runId: parsed.runId,
      error: success ? undefined : `Exit code ${code}`,
    };

    res.writeHead(success ? 200 : 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  });

  proc.on('error', (err) => {
    clearTimeout(abortTimer);
    const durationMs = Date.now() - startMs;
    log(`FAIL after ${durationMs}ms: ${err.message}`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, output: '', durationMs, error: err.message }));
  });
}

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, ts: Date.now(), version: 2 }));
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    });
    return res.end();
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  if (!verifyAuth(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  let body;
  try {
    body = await parseBody(req);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
  }

  if (!body.message || typeof body.message !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'message is required' }));
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/stream' || req.headers['accept'] === 'text/event-stream') {
    return handleStream(req, res, body);
  }

  if (url.pathname === '/execute') {
    return handleExecute(req, res, body);
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found. Use POST /execute or POST /stream' }));
});

server.listen(PORT, '127.0.0.1', () => {
  log(`OpenClaw Streaming Relay v2 on 127.0.0.1:${PORT}`, {
    endpoints: ['GET /health', 'POST /execute (blocking)', 'POST /stream (SSE)'],
  });
});
