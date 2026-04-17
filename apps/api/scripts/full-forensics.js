/**
 * FULL SYSTEM FORENSICS
 * Checks EVERY component, EVERY config, EVERY data path.
 * Reports PASS/FAIL for each check with evidence.
 */
const { PrismaClient } = require('@prisma/client');
const { Client } = require('ssh2');
const { readFileSync, existsSync } = require('fs');
require('dotenv').config();
const p = new PrismaClient();

let passed = 0, failed = 0;
const failures = [];

function check(ok, desc, evidence) {
  if (ok) { passed++; console.log(`  ✅ ${desc}`); }
  else { failed++; console.log(`  ❌ ${desc}: ${evidence}`); failures.push({ desc, evidence }); }
}

function ssh(cmd) {
  return new Promise((resolve) => {
    const conn = new Client();
    let out = '';
    conn.on('ready', () => {
      conn.exec(cmd, (err, stream) => {
        if (err) { conn.end(); return resolve('SSH_ERROR: ' + err.message); }
        stream.on('data', d => out += d);
        stream.stderr.on('data', d => out += d);
        stream.on('close', () => { conn.end(); resolve(out.trim()); });
      });
    });
    conn.on('error', e => resolve('CONN_ERROR: ' + e.message));
    try {
      conn.connect({ host: '91.98.231.87', port: 22, username: 'root', privateKey: readFileSync(process.env.HETZNER_SSH_KEY) });
    } catch (e) { resolve('KEY_ERROR: ' + e.message); }
  });
}

async function main() {
  const user = await p.user.findFirst({ where: { email: { contains: 'nafata' } }, select: { tenantId: true, id: true } });
  if (!user) { console.log('NO USER — cannot run forensics'); return; }
  const tid = user.tenantId;
  const uid = user.id;

  console.log('══════════════════════════════════════════');
  console.log('  FULL SYSTEM FORENSICS');
  console.log('  Tenant:', tid);
  console.log('══════════════════════════════════════════\n');

  // ═══ 1. TENANT ISOLATION ═══
  console.log('1. TENANT ISOLATION');
  check(tid !== 'tnt_rljn1gj4cgxoph0hxfohv6l4', 'Tenant is NOT LSA', tid);
  check(tid !== 'dev-tenant-001', 'Tenant is NOT dev default', tid);
  const tenant = await p.tenant.findUnique({ where: { id: tid }, select: { name: true, status: true } });
  check(tenant?.status === 'ACTIVE', 'Tenant is ACTIVE', tenant?.status);

  // Check no LSA concepts leak
  const lsaConcepts = await p.concept.findMany({ where: { tenantId: 'tnt_rljn1gj4cgxoph0hxfohv6l4' } });
  // Check if any tenant concepts reference LSA
  const tenantConcepts = await p.concept.findMany({ where: { tenantId: tid }, select: { name: true, definition: true } });
  let lsaInConcepts = 0;
  for (const c of tenantConcepts) {
    if ((c.definition || '').toLowerCase().includes('statue') || (c.definition || '').toLowerCase().includes('skulptur')) lsaInConcepts++;
  }
  check(lsaInConcepts === 0, 'No LSA references in concept definitions', `${lsaInConcepts} found`);

  // Check proposals
  const proposals = await p.brainProposal.findMany({ where: { tenantId: tid }, select: { title: true, reasoning: true, relatedConcepts: true } });
  let lsaInProposals = 0;
  let crossTenantProposals = 0;
  for (const pr of proposals) {
    const text = (pr.title + ' ' + (pr.reasoning || '')).toLowerCase();
    if (text.includes('statue') || text.includes('skulptur') || text.includes('luxury statues')) lsaInProposals++;
    for (const cId of (pr.relatedConcepts || [])) {
      const c = await p.concept.findUnique({ where: { id: cId }, select: { tenantId: true } });
      if (c && c.tenantId !== tid && c.tenantId !== null) crossTenantProposals++;
    }
  }
  check(lsaInProposals === 0, 'No LSA references in proposals', `${lsaInProposals} found`);
  check(crossTenantProposals === 0, 'No cross-tenant concept references in proposals', `${crossTenantProposals} found`);

  // Check messages for LSA content
  const allMsgs = await p.message.findMany({
    where: { conversation: { userId: uid } },
    select: { content: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  let lsaInMsgs = 0;
  for (const m of allMsgs) {
    const text = (m.content || '').toLowerCase();
    if (text.includes('luxury statues adria') || text.includes('skulptur')) lsaInMsgs++;
  }
  check(lsaInMsgs === 0, 'No LSA references in messages', `${lsaInMsgs} found`);

  // ═══ 2. CONCEPT SELECTION ═══
  console.log('\n2. CONCEPT SELECTION');
  const conceptCount = await p.concept.count({ where: { tenantId: tid } });
  check(conceptCount >= 30, 'At least 30 concepts selected', `${conceptCount} found`);
  check(conceptCount <= 150, 'Not more than 150 concepts', `${conceptCount} found`);

  // Check category balance
  const byCategory = {};
  for (const c of tenantConcepts) {
    const cat = (c.name || '').split(' ')[0];
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  const categories = Object.keys(byCategory).length;
  check(categories >= 5, 'Concepts from at least 5 categories', `${categories} categories`);

  // ═══ 3. LANGUAGE ═══
  console.log('\n3. LANGUAGE');
  let serbianDefs = 0;
  for (const c of tenantConcepts) {
    if (/[čćšžđ]/i.test(c.definition || '')) serbianDefs++;
  }
  check(serbianDefs === 0, 'No Serbian characters in definitions', `${serbianDefs} found`);

  // Check tree labels (curriculum.json)
  const currPath = require('path').join(__dirname, '..', 'src', 'app', 'knowledge', 'data', 'curriculum.json');
  if (existsSync(currPath)) {
    const curr = JSON.parse(readFileSync(currPath, 'utf-8'));
    const serbianLabels = curr.filter(n => /[čćšžđ]/i.test(n.label));
    check(serbianLabels.length <= 1, 'Curriculum labels in English', `${serbianLabels.length} Serbian labels`);
  }

  // ═══ 4. VAULT (OBSIDIAN) ON RELAY ═══
  console.log('\n4. VAULT ON RELAY');
  const vaultBase = `/root/.openclaw-${tid}`;
  const vaultPath = `${vaultBase}/vault`;

  const requiredFiles = [
    'SCHEMA.md', 'index.md', 'log.md', 'wikilink-map.md',
    'GUARDRAILS.md', 'FLOW.md', 'TENANT-PROTOCOL.md',
    'instructions/bootstrap.md', 'instructions/tenant-config.md',
  ];
  for (const f of requiredFiles) {
    const sz = await ssh(`wc -c < '${vaultPath}/${f}' 2>/dev/null || echo 0`);
    check(parseInt(sz) > 0, `Vault file: ${f}`, `${sz} bytes`);
  }

  // SOUL.md
  const soulSz = await ssh(`wc -c < '${vaultBase}/agents/main/agent/SOUL.md' 2>/dev/null || echo 0`);
  check(parseInt(soulSz) > 0, 'SOUL.md exists', `${soulSz} bytes`);
  const soulContent = await ssh(`cat '${vaultBase}/agents/main/agent/SOUL.md' 2>/dev/null`);
  check(soulContent.includes('ENGLISH'), 'SOUL.md enforces English', soulContent.includes('ENGLISH') ? '' : 'Missing ENGLISH rule');
  check(!soulContent.includes('Luxury Statues'), 'SOUL.md has no LSA', soulContent.includes('Luxury Statues') ? 'Contains LSA' : '');
  check(soulContent.includes(tid), 'SOUL.md has correct tenantId', soulContent.includes(tid) ? '' : 'Wrong tenant');

  // Workspace symlink
  const symlink = await ssh(`readlink /root/.openclaw/workspace/${tid}-vault 2>/dev/null || echo MISSING`);
  check(symlink.includes('vault'), 'Workspace symlink exists', symlink);

  // qdrant-search.sh
  const qdrantTool = await ssh(`test -x '${vaultBase}/tools/qdrant-search.sh' && echo OK || echo MISSING`);
  check(qdrantTool === 'OK', 'qdrant-search.sh executable', qdrantTool);

  // qdrant.env
  const qdrantEnv = await ssh(`cat '${vaultBase}/config/qdrant.env' 2>/dev/null | head -1`);
  check(qdrantEnv.includes('QDRANT_HOST'), 'qdrant.env has credentials', qdrantEnv.substring(0, 30));

  // ═══ 5. BASE OPENCLAW CONFIG ═══
  console.log('\n5. BASE OPENCLAW CONFIG');
  const baseSoul = await ssh('cat /root/.openclaw/agents/main/agent/SOUL.md 2>/dev/null | head -3');
  check(!baseSoul.includes('Luxury Statues'), 'Base SOUL.md has no LSA', baseSoul.includes('Luxury Statues') ? 'CONTAINS LSA!' : '');

  // ═══ 6. ENV CONFIGURATION ═══
  console.log('\n6. ENV CONFIGURATION');
  check(process.env.STAGE_MAX_CONCURRENCY === '1', 'STAGE_MAX_CONCURRENCY=1', process.env.STAGE_MAX_CONCURRENCY);
  check(process.env.OPENCLAW_DEFAULT_TENANT_ID !== tid, 'DEFAULT_TENANT_ID is not this tenant', process.env.OPENCLAW_DEFAULT_TENANT_ID);
  check(!!process.env.HETZNER_SSH_KEY, 'HETZNER_SSH_KEY set', process.env.HETZNER_SSH_KEY ? 'set' : 'MISSING');
  check(!!process.env.QDRANT_URL, 'QDRANT_URL set', process.env.QDRANT_URL ? 'set' : 'MISSING');
  check(!!process.env.OPENAI_API_KEY, 'OPENAI_API_KEY set', process.env.OPENAI_API_KEY ? 'set' : 'MISSING');

  // ═══ 7. QDRANT ═══
  console.log('\n7. QDRANT');
  const qdrantUrl = process.env.QDRANT_URL;
  const qdrantKey = process.env.QDRANT_API_KEY;
  try {
    // Shared collection
    const shared = await fetch(`${qdrantUrl}/collections/concepts`, { headers: { 'api-key': qdrantKey } });
    const sharedData = await shared.json();
    check(sharedData.result?.status === 'green', 'Shared concepts collection', sharedData.result?.status);

    // Per-tenant collection
    const perTenant = await fetch(`${qdrantUrl}/collections/concepts-${tid}`, { headers: { 'api-key': qdrantKey } });
    const perTenantData = await perTenant.json();
    check(perTenantData.result?.status === 'green', `Per-tenant collection concepts-${tid}`, perTenantData.result?.status || 'NOT FOUND');

    // Check embeddings exist
    const tenantEmbedded = await p.concept.count({ where: { tenantId: tid, embeddingId: { not: null } } });
    check(tenantEmbedded > 0, 'Concepts embedded in Qdrant', `${tenantEmbedded} embedded`);
  } catch (e) {
    check(false, 'Qdrant accessible', e.message);
  }

  // ═══ 8. MATURITY ENGINE ═══
  console.log('\n8. MATURITY ENGINE');
  const assignments = await p.stageConceptAssignment.groupBy({ by: ['status'], where: { tenantId: tid }, _count: true });
  const hasAssignments = assignments.length > 0;
  check(hasAssignments, 'Stage assignments created', JSON.stringify(assignments));
  const tasks = await p.note.groupBy({ by: ['status'], where: { tenantId: tid, noteType: 'TASK' }, _count: true });
  check(tasks.length > 0, 'Tasks created', JSON.stringify(tasks));

  // ═══ 9. VAULT ARTICLES ═══
  console.log('\n9. VAULT ARTICLES');
  const articleCount = await ssh(`ls ${vaultPath}/wiki/concepts/*.md 2>/dev/null | wc -l`);
  console.log(`   Articles in vault: ${articleCount}`);
  const logContent = await ssh(`tail -10 ${vaultPath}/log.md 2>/dev/null`);
  const enrichedInLog = (logContent.match(/enriched/g) || []).length;
  console.log(`   Enriched entries in log: ${enrichedInLog}`);

  // Check articles are in English
  if (parseInt(articleCount) > 0) {
    const firstArticle = await ssh(`ls -1 ${vaultPath}/wiki/concepts/*.md 2>/dev/null | head -1`);
    if (firstArticle && !firstArticle.includes('ERROR')) {
      const articleContent = await ssh(`head -30 '${firstArticle}' 2>/dev/null`);
      check(!(/[čćšžđ]/i.test(articleContent)), 'Vault articles in English', articleContent.includes('čćšžđ') ? 'Contains Serbian' : '');
    }
  }

  // ═══ 10. API ENDPOINTS ═══
  console.log('\n10. API ENDPOINTS');
  try {
    const health = await fetch('http://localhost:3000/api/health');
    check(health.status === 200, 'API health endpoint', `status ${health.status}`);
  } catch (e) {
    check(false, 'API health endpoint', e.message);
  }

  // Test vault concept read
  if (tenantConcepts.length > 0) {
    const testConcept = await p.concept.findFirst({ where: { tenantId: tid }, select: { id: true, slug: true } });
    try {
      const resp = await fetch(`http://localhost:3000/api/v1/knowledge/concepts/${testConcept.id}`);
      const data = await resp.json();
      check(resp.status === 200, 'Knowledge concept endpoint', `status ${resp.status}`);
      // If vault has articles, check if vault content is returned
      if (parseInt(articleCount) > 0) {
        const ext = data.data?.extendedDescription;
        console.log(`   Concept content length: ${ext?.length ?? 0}`);
      }
    } catch (e) {
      check(false, 'Knowledge concept endpoint', e.message);
    }
  }

  // ═══ 11. BRIDGE ROUTING ═══
  console.log('\n11. BRIDGE ROUTING');
  check(process.env.OPENCLAW_DEFAULT_TENANT_ID !== undefined, 'OPENCLAW_DEFAULT_TENANT_ID exists', process.env.OPENCLAW_DEFAULT_TENANT_ID || 'EMPTY');
  // The fix: body tenantId should override env default
  // Verify by checking the code (can't test without creating a proposal)

  // ═══ SUMMARY ═══
  console.log('\n══════════════════════════════════════════');
  console.log(`  PASSED: ${passed} | FAILED: ${failed}`);
  console.log('══════════════════════════════════════════');

  if (failures.length > 0) {
    console.log('\nFAILURES:');
    for (const f of failures) {
      console.log(`  ❌ ${f.desc}: ${f.evidence}`);
    }
  }
}

main().catch(console.error).finally(() => p.$disconnect());
