const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const user = await p.user.findFirst({ where: { email: { contains: 'nafata' } }, select: { tenantId: true } });
  const tid = user.tenantId;
  console.log('Tenant:', tid);

  const completed = await p.stageConceptAssignment.findMany({
    where: { tenantId: tid, status: 'COMPLETED' },
    select: { conceptId: true },
  });
  console.log('\nCompleted concepts:');
  for (const sa of completed) {
    const c = await p.concept.findUnique({ where: { id: sa.conceptId }, select: { name: true, slug: true, extendedDescription: true, confidence: true } });
    console.log('  ' + c.name + ' | slug: ' + c.slug + ' | content: ' + (c.extendedDescription?.length ?? 0) + ' | conf: ' + c.confidence);
  }

  // Check vault files on relay
  console.log('\nVault files:');
  const { Client } = require('ssh2');
  const { readFileSync } = require('fs');
  const conn = new Client();
  conn.on('ready', () => {
    conn.exec('ls /root/.openclaw-' + tid + '/vault/wiki/concepts/ 2>/dev/null', (err, stream) => {
      let out = '';
      stream.on('data', d => out += d);
      stream.on('close', () => {
        console.log(out.trim() || '(empty)');
        conn.end();
      });
    });
  });
  conn.connect({ host: '91.98.231.87', port: 22, username: 'root', privateKey: readFileSync('C:/Users/tanjav/.ssh/id_ed25519') });

  // Wait for SSH
  await new Promise(r => setTimeout(r, 3000));
}
main().catch(console.error).finally(() => p.$disconnect());
