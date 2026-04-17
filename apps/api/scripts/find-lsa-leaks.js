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
        if (err) { conn.end(); return resolve('SSH_ERROR'); }
        stream.on('data', d => out += d);
        stream.stderr.on('data', () => {});
        stream.on('close', () => { conn.end(); resolve(out.trim()); });
      });
    });
    conn.on('error', () => resolve('CONN_ERROR'));
    conn.connect({ host: '91.98.231.87', port: 22, username: 'root', privateKey: readFileSync(process.env.HETZNER_SSH_KEY) });
  });
}

async function main() {
  const user = await p.user.findFirst({ where: { email: { contains: 'nafata' } }, select: { tenantId: true } });
  if (!user) { console.log('No user'); return; }
  const tid = user.tenantId;
  console.log('=== LSA LEAK SCAN for tenant:', tid, '===\n');

  let leaks = 0;

  // 1. Check concepts
  const concepts = await p.concept.findMany({ where: { tenantId: tid }, select: { name: true, definition: true } });
  for (const c of concepts) {
    const text = (c.name + ' ' + (c.definition || '')).toLowerCase();
    if (text.includes('statue') || text.includes('skulptur') || text.includes('luxury statues') || text.includes('adria')) {
      console.log('LEAK concept:', c.name);
      leaks++;
    }
  }

  // 2. Check proposals
  const proposals = await p.brainProposal.findMany({ where: { tenantId: tid }, select: { title: true, reasoning: true, relatedConcepts: true } });
  for (const pr of proposals) {
    const text = (pr.title + ' ' + (pr.reasoning || '')).toLowerCase();
    if (text.includes('statue') || text.includes('skulptur') || text.includes('luxury statues') || text.includes('adria')) {
      console.log('LEAK proposal:', pr.title);
      leaks++;
    }
    for (const cId of (pr.relatedConcepts || [])) {
      const c = await p.concept.findUnique({ where: { id: cId }, select: { tenantId: true, name: true } });
      if (c && c.tenantId !== tid && c.tenantId !== null) {
        console.log('CROSS-TENANT proposal:', pr.title, '-> concept', c.name, 'from', c.tenantId);
        leaks++;
      }
    }
  }

  // 3. Check messages
  const convs = await p.conversation.findMany({ where: { userId: { not: undefined } }, select: { id: true }, take: 50 });
  for (const conv of convs) {
    const msgs = await p.message.findMany({ where: { conversationId: conv.id }, select: { content: true }, take: 5 });
    for (const m of msgs) {
      const text = (m.content || '').toLowerCase();
      if (text.includes('statue') || text.includes('skulptur') || text.includes('luxury statues adria')) {
        console.log('LEAK message:', text.substring(0, 80));
        leaks++;
      }
    }
  }

  // 4. Check SOUL.md on relay
  const soul = await ssh(`cat /root/.openclaw-${tid}/agents/main/agent/SOUL.md 2>/dev/null`);
  if (soul.includes('Luxury Statues') || soul.includes('LSA') || soul.includes('skulptur')) {
    console.log('LEAK SOUL.md: contains LSA references');
    leaks++;
  } else if (soul.length > 50) {
    console.log('SOUL.md OK: no LSA references');
  }

  // 5. Check base SOUL.md (affects all tenants)
  const baseSoul = await ssh('head -5 /root/.openclaw/agents/main/agent/SOUL.md 2>/dev/null');
  if (baseSoul.includes('Luxury Statues') || baseSoul.includes('LSA')) {
    console.log('BASE SOUL.md: STILL has LSA references (affects all tenants!)');
    leaks++;
  }

  // 6. Check bridge default tenant
  const bridgeDefault = process.env.OPENCLAW_DEFAULT_TENANT_ID;
  if (bridgeDefault === 'tnt_rljn1gj4cgxoph0hxfohv6l4') {
    console.log('BRIDGE: OPENCLAW_DEFAULT_TENANT_ID still points to LSA');
    leaks++;
  }

  console.log('\n=== TOTAL LEAKS:', leaks, leaks === 0 ? '✅' : '❌', '===');
}

main().catch(console.error).finally(() => p.$disconnect());
