/**
 * E2E onboarding test — calls API directly, verifies vault, Qdrant, bridge.
 */
const { Client } = require('ssh2');
const { readFileSync } = require('fs');
require('dotenv').config();

const API = 'http://localhost:3000/api';
const HOST = '91.98.231.87';
const KEY = readFileSync(process.env.HETZNER_SSH_KEY || 'C:/Users/tanjav/.ssh/id_ed25519');

function ssh(cmd) {
  return new Promise((resolve, reject) => {
    const c = new Client();
    let o = '';
    c.on('ready', () => c.exec(cmd, (e, s) => {
      if (e) { c.end(); return reject(e); }
      s.on('data', d => o += d); s.stderr.on('data', () => {});
      s.on('close', () => { c.end(); resolve(o.trim()); });
    }));
    c.on('error', reject);
    c.connect({ host: HOST, port: 22, username: 'root', privateKey: KEY });
  });
}

async function api(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'dev-tenant-001', 'x-user-id': 'dev-user-001' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return r.json();
}

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  let passed = 0, failed = 0;
  const check = (ok, msg) => { if (ok) { passed++; console.log('  ✅ ' + msg); } else { failed++; console.log('  ❌ ' + msg); } };

  console.log('=== E2E ONBOARDING TEST ===\n');

  // 1. Setup company
  console.log('1. POST /onboarding/setup-company');
  await api('POST', '/onboarding/setup-company', {
    companyName: 'Irish Law Test', industry: 'Legal Technology',
    description: 'AI-powered Irish legislation search platform', websiteUrl: 'https://irishlaw.ai',
  });
  console.log('   Waiting 40s for async provisioning...');
  await new Promise(r => setTimeout(r, 40000));

  // 2. Check PG concepts
  console.log('\n2. PostgreSQL');
  const tid = 'dev-tenant-001';
  const concepts = await p.concept.count({ where: { tenantId: tid } });
  const embedded = await p.concept.count({ where: { tenantId: tid, embeddingId: { not: null } } });
  check(concepts > 20, `Concepts created: ${concepts} (need >20)`);
  check(embedded > 0, `Qdrant embedded: ${embedded}`);

  // 3. Check vault on relay
  console.log('\n3. Vault on Hetzner');
  const vb = `/root/.openclaw-${tid}`;
  const vp = `${vb}/vault`;
  const files = [
    [vp + '/SCHEMA.md', 'SCHEMA.md'],
    [vp + '/index.md', 'index.md'],
    [vp + '/instructions/bootstrap.md', 'bootstrap.md'],
    [vp + '/instructions/tenant-config.md', 'tenant-config.md'],
    [vp + '/log.md', 'log.md'],
    [vp + '/wikilink-map.md', 'wikilink-map.md'],
    [vb + '/agents/main/agent/SOUL.md', 'SOUL.md'],
    [vb + '/tools/qdrant-search.sh', 'qdrant-search.sh'],
    [vb + '/config/qdrant.env', 'qdrant.env'],
  ];
  for (const [path, name] of files) {
    try {
      const sz = await ssh(`wc -c < '${path}' 2>/dev/null || echo 0`);
      check(parseInt(sz) > 0, `${name} (${sz} bytes)`);
    } catch { check(false, name + ' (SSH error)'); }
  }

  // Workspace symlink
  try {
    const link = await ssh(`readlink '/root/.openclaw/workspace/${tid}-vault' 2>/dev/null || echo MISSING`);
    check(link.includes('vault'), `Workspace symlink → ${link}`);
  } catch { check(false, 'Workspace symlink'); }

  // 4. Per-tenant Qdrant collection
  console.log('\n4. Per-tenant Qdrant');
  try {
    const r = await fetch(`${process.env.QDRANT_URL}/collections/concepts-${tid}`, { headers: { 'api-key': process.env.QDRANT_API_KEY } });
    const d = await r.json();
    check(d.result?.status === 'green', `Collection concepts-${tid}: ${d.result?.status || 'NOT FOUND'}`);
  } catch (e) { check(false, 'Qdrant: ' + e.message); }

  // 5. Bridge tenant routing
  console.log('\n5. Bridge API routing');
  try {
    const token = process.env.OPENCLAW_RELAY_TOKEN || '9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d';
    const r = await fetch(`${API}/bridge/brain-state?tenantId=${tid}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const d = await r.json();
    check(!d.error, 'Bridge responds for tenant');

    // Create test proposal and verify it uses correct tenantId
    const pr = await fetch(`${API}/bridge/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        tenantId: tid, canvasBlock: 'VALUE_PROPOSITION', type: 'task_execution',
        title: 'E2E Test Proposal', reasoning: 'Testing tenant routing',
        proposedAction: 'Verify proposal lands in correct tenant', estimatedCost: 0,
      }),
    });
    const proposal = await pr.json();
    const proposalTenant = proposal.tenantId || proposal.data?.tenantId;
    check(proposalTenant === tid, `Proposal tenant: ${proposalTenant} (expected ${tid})`);

    // Clean up test proposal
    if (proposal.id) {
      await p.brainProposal.delete({ where: { id: proposal.id } }).catch(() => {});
    }
  } catch (e) { check(false, 'Bridge: ' + e.message); }

  // 6. SOUL.md content check
  console.log('\n6. SOUL.md content');
  try {
    const soul = await ssh(`cat ${vb}/agents/main/agent/SOUL.md`);
    check(soul.includes('Vault Mode'), 'SOUL.md has Vault Mode');
    check(soul.includes('Irish Law') || soul.includes(tid), 'SOUL.md has tenant reference');
    check(soul.includes('SCHEMA.md'), 'SOUL.md references SCHEMA.md');
    check(soul.includes('English'), 'SOUL.md specifies English output');
  } catch { check(false, 'SOUL.md read failed'); }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`PASSED: ${passed} | FAILED: ${failed}`);
  console.log('='.repeat(50));

  // Clean up dev-tenant concepts (don't leave test data)
  await p.concept.deleteMany({ where: { tenantId: tid } }).catch(() => {});
  await p.tenantVault.deleteMany({ where: { tenantId: tid } }).catch(() => {});
  await p.vaultOperationLog.deleteMany({ where: { tenantId: tid } }).catch(() => {});
  await ssh(`rm -rf ${vb} /root/.openclaw/workspace/${tid}-vault 2>/dev/null`).catch(() => {});

  await p.$disconnect();
}

main().catch(e => console.error('FATAL:', e.message));
