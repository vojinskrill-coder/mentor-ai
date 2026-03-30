const fs = require('fs');
let code = fs.readFileSync('/root/openclaw-relay/index.mjs', 'utf8');

// Add SOUL.MD injection function after the existing helper functions
const soulInjectorCode = `
/**
 * Read SOUL.MD for a tenant+agent and prepend it to the message.
 * Falls back to original message if no SOUL.MD found.
 */
function injectSoulContext(message, tenantProfile, agentId) {
  if (!tenantProfile) return message;
  const soulPath = \`/root/.openclaw-\${tenantProfile}/agents/\${agentId}/agent/SOUL.md\`;
  try {
    const soul = fs.readFileSync(soulPath, 'utf8');
    if (soul && soul.length > 50) {
      log('Injecting SOUL.MD', { tenantProfile, agentId, soulChars: soul.length });
      return \`--- TVOJ IDENTITET I KONTEKST (obavezno postuj) ---\\n\${soul}\\n--- KRAJ IDENTITETA ---\\n\\n\${message}\`;
    }
  } catch {
    // No SOUL.MD for this tenant/agent
  }
  return message;
}

`;

// Insert after the imports (after "import crypto from 'crypto';")
code = code.replace(
  "import crypto from 'crypto';",
  "import crypto from 'crypto';\nimport fs from 'fs';" + soulInjectorCode
);

// Inject SOUL context in handleStream before spawning
code = code.replace(
  "sendEvent('status', { phase: 'starting', runId });",
  "const enrichedMessage = injectSoulContext(message, tenantProfile, agentId);\n  sendEvent('status', { phase: 'starting', runId });"
);

// Use enrichedMessage in stream spawn
code = code.replace(
  "streamArgs.push('--message', message, '--timeout', String(timeout));",
  "streamArgs.push('--message', enrichedMessage, '--timeout', String(timeout));"
);

// Inject SOUL context in handleExecute before spawning
code = code.replace(
  "log(`Execute: agent=${agentId}, msgLen=${message.length}`);",
  "const enrichedMessage = injectSoulContext(message, tenantProfile, agentId);\n  log(`Execute: agent=${agentId}, msgLen=${enrichedMessage.length}, tenant=${tenantProfile || 'default'}`);"
);

// Use enrichedMessage in execute spawn
code = code.replace(
  "execArgs.push('--message', message, '--json', '--timeout', String(timeout));",
  "execArgs.push('--message', enrichedMessage, '--json', '--timeout', String(timeout));"
);

fs.writeFileSync('/root/openclaw-relay/index.mjs', code);
console.log('Relay patched with SOUL.MD injection');

// Verify
const patched = fs.readFileSync('/root/openclaw-relay/index.mjs', 'utf8');
console.log('Has injectSoulContext:', patched.includes('function injectSoulContext'));
console.log('Has enrichedMessage in stream:', patched.includes("streamArgs.push('--message', enrichedMessage"));
console.log('Has enrichedMessage in execute:', patched.includes("execArgs.push('--message', enrichedMessage"));
console.log('Has fs import:', patched.includes("import fs from 'fs'"));
