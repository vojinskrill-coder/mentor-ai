/**
 * Forensics: trace the exact execution path for the current tenant.
 * Checks every step from onboarding → maturity → enrichment → vault.
 */
const { PrismaClient } = require('@prisma/client');
const { Client } = require('ssh2');
const { readFileSync } = require('fs');
require('dotenv').config();
const p = new PrismaClient();

async function ssh(cmd) {
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
    conn.connect({ host: '91.98.231.87', port: 22, username: 'root', privateKey: readFileSync(process.env.HETZNER_SSH_KEY) });
  });
}

async function main() {
  console.log('=== FORENSICS REPORT ===\n');

  // 1. Find tenant
  const user = await p.user.findFirst({ where: { email: { contains: 'nafata' } }, select: { tenantId: true, id: true } });
  if (!user) { console.log('NO USER'); return; }
  const tid = user.tenantId;
  console.log('1. TENANT:', tid);

  // 2. Check tenant exists and is ACTIVE
  const tenant = await p.tenant.findUnique({ where: { id: tid }, select: { status: true, name: true, maturityStage: true } });
  console.log('2. TENANT STATUS:', tenant?.status, '| name:', tenant?.name, '| maturity:', tenant?.maturityStage);

  // 3. Concepts
  const total = await p.concept.count({ where: { tenantId: tid } });
  const byTier = await p.concept.groupBy({ by: ['tier'], where: { tenantId: tid }, _count: true });
  console.log('3. CONCEPTS:', total, '| by tier:', JSON.stringify(byTier));

  // 4. Stage assignments
  const sa = await p.stageConceptAssignment.groupBy({ by: ['status', 'stage'], where: { tenantId: tid }, _count: true });
  console.log('4. STAGE ASSIGNMENTS:', JSON.stringify(sa));

  // 5. Tasks
  const tasks = await p.note.groupBy({ by: ['status'], where: { tenantId: tid, noteType: 'TASK' }, _count: true });
  console.log('5. TASKS:', JSON.stringify(tasks));

  // 6. Check if maturity engine was triggered
  const conversations = await p.conversation.count({ where: { conceptId: { not: null } } });
  console.log('6. CONVERSATIONS WITH CONCEPTS:', conversations);

  // 7. Vault on relay
  const vaultFiles = await ssh(`find /root/.openclaw-${tid}/vault/ -type f 2>/dev/null | wc -l`);
  const vaultArticles = await ssh(`ls /root/.openclaw-${tid}/vault/wiki/concepts/ 2>/dev/null | wc -l`);
  const vaultLog = await ssh(`tail -5 /root/.openclaw-${tid}/vault/log.md 2>/dev/null`);
  const symlink = await ssh(`readlink /root/.openclaw/workspace/${tid}-vault 2>/dev/null || echo MISSING`);
  console.log('7. VAULT FILES:', vaultFiles, '| ARTICLES:', vaultArticles);
  console.log('   SYMLINK:', symlink);
  console.log('   LOG:', vaultLog);

  // 8. Check execution status API
  try {
    const r = await fetch(`http://localhost:3000/api/v1/maturity/execution-status`, {
      headers: { 'x-tenant-id': tid, 'x-user-id': user.id },
    });
    const d = await r.json();
    console.log('8. EXECUTION STATUS:', JSON.stringify(d.data));
  } catch (e) {
    console.log('8. EXECUTION STATUS: API ERROR -', e.message);
  }

  // 9. Check if enrichOnboardingConcepts was called
  // (it calls maturityEngine.initializeStage which creates stage assignments)
  // If assignments exist, it was called.
  const assignmentCount = await p.stageConceptAssignment.count({ where: { tenantId: tid } });
  console.log('9. MATURITY ENGINE CALLED:', assignmentCount > 0 ? 'YES (' + assignmentCount + ' assignments)' : 'NO (0 assignments)');

  // 10. Check if execution is running (in-memory lock)
  try {
    const r = await fetch(`http://localhost:3000/api/v1/maturity/execution-status`, {
      headers: { 'x-tenant-id': tid, 'x-user-id': user.id },
    });
    const d = await r.json();
    console.log('10. RUNNING:', d.data?.running ? 'YES' : 'NO', '| pendingCount:', d.data?.pendingCount);
  } catch { console.log('10. CANNOT CHECK'); }

  // 11. If not running and has pending, WHY?
  if (assignmentCount > 0) {
    const pending = await p.stageConceptAssignment.count({ where: { tenantId: tid, status: 'PENDING' } });
    const completed = await p.stageConceptAssignment.count({ where: { tenantId: tid, status: 'COMPLETED' } });
    console.log('11. PENDING:', pending, '| COMPLETED:', completed);
    if (pending > 0 && completed === 0) {
      console.log('    DIAGNOSIS: Execution never started OR all attempts failed');
    }
  }

  // 12. List vault articles with word counts
  const articleList = await ssh(`wc -w /root/.openclaw-${tid}/vault/wiki/concepts/*.md 2>/dev/null`);
  if (articleList && !articleList.includes('ERROR')) {
    console.log('12. VAULT ARTICLES:');
    for (const line of articleList.split('\n')) {
      if (line.trim()) console.log('    ', line.trim());
    }
  }

  console.log('\n=== END FORENSICS ===');
}

main().catch(console.error).finally(() => p.$disconnect());
