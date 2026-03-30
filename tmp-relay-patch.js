const fs = require('fs');
let code = fs.readFileSync('/root/openclaw-relay/index.mjs', 'utf8');

// 1. Add tenantProfile to handleStream destructuring
code = code.replace(
  'const { message, agentId = "main", timeoutSeconds = MAX_TIMEOUT, sessionId } = body;\n  const timeout = Math.min(timeoutSeconds, MAX_TIMEOUT);\n  const runId = crypto.randomUUID();',
  'const { message, agentId = "main", timeoutSeconds = MAX_TIMEOUT, sessionId, tenantProfile } = body;\n  const timeout = Math.min(timeoutSeconds, MAX_TIMEOUT);\n  const runId = crypto.randomUUID();'
);

// 2. Update stream spawn to include --profile before 'agent'
code = code.replace(
  "const streamArgs = ['agent', '--agent', agentId];",
  "const streamArgs = [];\n  if (tenantProfile) streamArgs.push('--profile', tenantProfile);\n  streamArgs.push('agent', '--agent', agentId);"
);

// 3. Add tenantProfile to handleExecute destructuring
code = code.replace(
  "const { message, agentId = 'main', timeoutSeconds = MAX_TIMEOUT, sessionId } = body;\n  const timeout = Math.min(timeoutSeconds, MAX_TIMEOUT);",
  "const { message, agentId = 'main', timeoutSeconds = MAX_TIMEOUT, sessionId, tenantProfile } = body;\n  const timeout = Math.min(timeoutSeconds, MAX_TIMEOUT);"
);

// 4. Update execute spawn to include --profile before 'agent'
code = code.replace(
  "const execArgs = ['agent', '--agent', agentId];",
  "const execArgs = [];\n  if (tenantProfile) execArgs.push('--profile', tenantProfile);\n  execArgs.push('agent', '--agent', agentId);"
);

fs.writeFileSync('/root/openclaw-relay/index.mjs', code);
console.log('Relay patched successfully');

// Verify
const patched = fs.readFileSync('/root/openclaw-relay/index.mjs', 'utf8');
console.log('tenantProfile in stream:', patched.includes("tenantProfile } = body;"));
console.log('--profile in stream spawn:', patched.includes("streamArgs.push('--profile', tenantProfile)"));
console.log('--profile in execute spawn:', patched.includes("execArgs.push('--profile', tenantProfile)"));
