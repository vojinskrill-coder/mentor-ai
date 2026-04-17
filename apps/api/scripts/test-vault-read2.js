const { PrismaClient } = require('@prisma/client');
const { Client } = require('ssh2');
const { readFileSync } = require('fs');
require('dotenv').config();
const p = new PrismaClient();

async function main() {
  const user = await p.user.findFirst({ where: { email: { contains: 'nafata' } }, select: { tenantId: true } });
  const tid = user.tenantId;
  const concept = await p.concept.findFirst({
    where: { tenantId: tid, slug: 'osiguranje' },
    select: { id: true, slug: true },
  });
  console.log('Testing vault read for:', concept.slug, 'tenant:', tid);

  // Test SSH read directly (same as controller does)
  const host = process.env.HETZNER_HOST || '91.98.231.87';
  const keyPath = process.env.HETZNER_SSH_KEY || '';
  const vaultPath = `/root/.openclaw-${tid}/vault/wiki/concepts/${concept.slug}.md`;

  console.log('SSH host:', host);
  console.log('SSH key:', keyPath, '| exists:', require('fs').existsSync(keyPath));
  console.log('Vault path:', vaultPath);

  const content = await new Promise((resolve) => {
    const conn = new Client();
    let output = '';
    conn.on('ready', () => {
      console.log('SSH connected');
      conn.exec(`cat '${vaultPath}' 2>/dev/null`, (err, stream) => {
        if (err) { console.log('SSH exec error:', err.message); conn.end(); return resolve(''); }
        stream.on('data', (d) => { output += d.toString(); });
        stream.stderr.on('data', () => {});
        stream.on('close', () => { console.log('SSH stream closed, got', output.length, 'chars'); conn.end(); resolve(output); });
      });
    });
    conn.on('error', (e) => { console.log('SSH error:', e.message); resolve(''); });
    try {
      conn.connect({ host, port: 22, username: 'root', privateKey: readFileSync(keyPath) });
    } catch (e) {
      console.log('SSH connect error:', e.message);
      resolve('');
    }
  });

  console.log('\nResult:', content.length, 'chars');
  if (content.length > 0) {
    console.log('First 200:', content.substring(0, 200));
    console.log('VAULT READ WORKS ✅');
  } else {
    console.log('VAULT READ FAILED ❌');
  }
}

main().catch(console.error).finally(() => p.$disconnect());
