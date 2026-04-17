const { PrismaClient } = require('@prisma/client');
const { Client } = require('ssh2');
const { readFileSync } = require('fs');
require('dotenv').config();
const p = new PrismaClient();

async function main() {
  const user = await p.user.findFirst({ where: { email: { contains: 'nafata' } }, select: { tenantId: true } });
  const tid = user.tenantId;
  const c = await p.concept.findFirst({ where: { tenantId: tid, slug: 'osiguranje' }, select: { id: true, slug: true } });
  console.log('Concept ID:', c.id, '| Slug:', c.slug, '| Tenant:', tid);

  // 1. Test direct SSH read (proves SSH works)
  console.log('\n1. Direct SSH read:');
  const vaultPath = `/root/.openclaw-${tid}/vault/wiki/concepts/${c.slug}.md`;
  const content = await new Promise((resolve) => {
    const conn = new Client();
    let out = '';
    conn.on('ready', () => {
      conn.exec(`cat '${vaultPath}'`, (err, stream) => {
        if (err) { conn.end(); return resolve('SSH_EXEC_ERROR: ' + err.message); }
        stream.on('data', d => out += d);
        stream.stderr.on('data', () => {});
        stream.on('close', () => { conn.end(); resolve(out); });
      });
    });
    conn.on('error', e => resolve('SSH_CONN_ERROR: ' + e.message));
    conn.connect({ host: '91.98.231.87', port: 22, username: 'root', privateKey: readFileSync(process.env.HETZNER_SSH_KEY) });
  });
  console.log('  Length:', content.length);
  console.log('  ' + (content.length > 5000 ? 'WORKS ✅' : 'FAILED ❌'));

  // 2. Test API endpoint
  console.log('\n2. API endpoint /api/v1/knowledge/concepts/' + c.id);
  const resp = await fetch('http://localhost:3000/api/v1/knowledge/concepts/' + c.id);
  const data = await resp.json();
  const ext = data.data?.extendedDescription;
  console.log('  extendedDescription:', ext?.length ?? 0, 'chars');
  console.log('  ' + ((ext?.length ?? 0) > 5000 ? 'FROM VAULT ✅' : 'FROM PG (empty) ❌'));

  // 3. Check if API has the concept's tenantId
  console.log('\n3. API response has tenantId?', data.data?.tenantId ?? 'MISSING');
}

main().catch(console.error).finally(() => p.$disconnect());
