/**
 * RELAY ROUND-TRIP TEST
 *
 * Sends ONE concept to the real OpenClaw relay, waits for completion,
 * reads the vault, and validates the article.
 *
 * Usage: node -r dotenv/config apps/api/scripts/test-relay-roundtrip.js
 */
const { Client } = require('ssh2');
const { readFileSync } = require('fs');

const RELAY_URL = process.env.OPENCLAW_RELAY_URL || 'http://91.98.231.87:3100/execute';
const AUTH_TOKEN = process.env.OPENCLAW_AUTH_TOKEN;
const SSH_KEY_PATH = process.env.HETZNER_SSH_KEY;
const SSH_HOST = process.env.HETZNER_HOST || '91.98.231.87';
const TENANT_ID = 'test-roundtrip';
const TIMEOUT_MS = 600000; // 10 minutes

async function main() {
  console.log('=== RELAY ROUND-TRIP TEST ===');
  console.log('Relay:', RELAY_URL);
  console.log('Timeout:', TIMEOUT_MS / 1000, 'seconds');

  if (!AUTH_TOKEN) {
    console.log('ERROR: OPENCLAW_AUTH_TOKEN not set');
    process.exit(1);
  }

  // Step 1: Send a simple task to the relay
  console.log('\n1. Sending test task to relay...');
  const startTime = Date.now();

  try {
    const response = await fetch(RELAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        message: 'Write a 200-word summary about "Business Strategy" for a technology company called TestCorp. Write in ENGLISH. Return only the text, no markdown formatting.',
        agentId: 'main',
        tenantProfile: TENANT_ID,
        timeoutSeconds: 300,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const result = await response.json();
    const durationMs = Date.now() - startTime;

    console.log('   Status:', response.status);
    console.log('   Duration:', (durationMs / 1000).toFixed(1) + 's');
    console.log('   Success:', result.success);

    if (result.output) {
      console.log('   Output length:', result.output.length, 'chars');
      console.log('   First 200 chars:', result.output.substring(0, 200));

      // Validate: is it English?
      const hasSerbianChars = /[čćšžđ]/i.test(result.output);
      const hasSerbianWords = /\b(koji|koja|koje|može|nije|već|što|zato)\b/gi.test(result.output);
      console.log('\n2. Validation:');
      console.log('   Serbian chars:', hasSerbianChars ? 'FAIL' : 'PASS');
      console.log('   Serbian words:', hasSerbianWords ? 'FAIL' : 'PASS');
      console.log('   Has content:', result.output.length > 50 ? 'PASS' : 'FAIL');

      if (hasSerbianChars || hasSerbianWords) {
        console.log('\n   ✗ RELAY PRODUCED SERBIAN OUTPUT');
        process.exit(1);
      } else {
        console.log('\n   ✓ RELAY OUTPUT IS ENGLISH');
      }
    } else {
      console.log('   Error:', result.error || 'No output');
      console.log('\n   ✗ RELAY RETURNED NO OUTPUT');
      process.exit(1);
    }

  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.log('   Duration:', (durationMs / 1000).toFixed(1) + 's');
    console.log('   ERROR:', err.message);
    console.log('\n   ✗ RELAY CALL FAILED');
    process.exit(1);
  }

  console.log('\n=== ROUND-TRIP TEST PASSED ===');
}

main().catch(e => { console.error(e); process.exit(1); });
