/**
 * Test vault provisioning end-to-end WITHOUT onboarding.
 * Creates a test vault, verifies all files, then cleans up.
 */
const { Client } = require('ssh2');
const { readFileSync } = require('fs');
require('dotenv').config();

const TENANT_ID = 'tnt_test_vault_check';
const HOST = process.env.HETZNER_HOST || '91.98.231.87';
const USER = process.env.HETZNER_USER || 'root';
const KEY_PATH = process.env.HETZNER_SSH_KEY || 'C:/Users/tanjav/.ssh/id_ed25519';
const VAULT_PATH = `/root/.openclaw-${TENANT_ID}/vault`;
const BASE_PATH = `/root/.openclaw-${TENANT_ID}`;

function sshExec(command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) { conn.end(); return reject(err); }
        stream.on('data', (d) => { output += d.toString(); });
        stream.stderr.on('data', () => {});
        stream.on('close', () => { conn.end(); resolve(output.trim()); });
      });
    });
    conn.on('error', reject);
    conn.connect({ host: HOST, port: 22, username: USER, privateKey: readFileSync(KEY_PATH) });
  });
}

function sftpWrite(remotePath, content) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }
        const ws = sftp.createWriteStream(remotePath);
        ws.on('close', () => { conn.end(); resolve(); });
        ws.on('error', (e) => { conn.end(); reject(e); });
        ws.end(Buffer.from(content, 'utf-8'));
      });
    });
    conn.on('error', reject);
    conn.connect({ host: HOST, port: 22, username: USER, privateKey: readFileSync(KEY_PATH) });
  });
}

async function main() {
  console.log('=== Testing Vault Provisioning ===');

  // 1. Create directories
  console.log('1. Creating directories...');
  await sshExec(`mkdir -p ${VAULT_PATH}/raw/research ${VAULT_PATH}/raw/user-uploads ${VAULT_PATH}/wiki/concepts ${VAULT_PATH}/wiki/skills ${VAULT_PATH}/instructions`);
  await sshExec(`mkdir -p ${BASE_PATH}/agents/main/agent ${BASE_PATH}/tools ${BASE_PATH}/config`);

  // 2. Write test files via SFTP
  console.log('2. Writing SCHEMA.md via SFTP...');
  await sftpWrite(`${VAULT_PATH}/SCHEMA.md`, '# SCHEMA.md — Test\n\nThis is a test schema with special chars: "quotes" and \'apostrophes\' and $variables and `backticks`.\n');

  console.log('3. Writing index.md via SFTP...');
  await sftpWrite(`${VAULT_PATH}/index.md`, '# Concept Index\n\n| Slug | Name | Category | Stage |\n|------|------|----------|-------|\n| test-concept | Test Concept | Value | placeholder |\n');

  console.log('4. Writing bootstrap.md via SFTP...');
  await sftpWrite(`${VAULT_PATH}/instructions/bootstrap.md`, '# bootstrap.md\n\n**Company:** Test Company\n**Industry:** Technology\n');

  console.log('5. Writing tenant-config.md via SFTP...');
  await sftpWrite(`${VAULT_PATH}/instructions/tenant-config.md`, '# Tenant Config\n\nBusiness profile for test.\n');

  console.log('6. Writing log.md via SFTP...');
  await sftpWrite(`${VAULT_PATH}/log.md`, '# Operation Log\n\n| Date | Action |\n|------|--------|\n');

  console.log('7. Writing wikilink-map.md via SFTP...');
  await sftpWrite(`${VAULT_PATH}/wikilink-map.md`, '# Wikilink Map\n\ntest-concept → wiki/concepts/test-concept.md\n');

  console.log('8. Writing SOUL.md via SFTP...');
  await sftpWrite(`${BASE_PATH}/agents/main/agent/SOUL.md`, '# SOUL.md — Vault Mode\n\nTest vault mode.\n');

  console.log('9. Writing qdrant-search.sh via SFTP...');
  await sftpWrite(`${BASE_PATH}/tools/qdrant-search.sh`, '#!/bin/bash\necho "qdrant search stub"\n');
  await sshExec(`chmod +x ${BASE_PATH}/tools/qdrant-search.sh`);

  console.log('10. Writing qdrant.env via SFTP...');
  await sftpWrite(`${BASE_PATH}/config/qdrant.env`, `QDRANT_HOST=${process.env.QDRANT_URL || 'https://localhost'}\nQDRANT_API_KEY=${process.env.QDRANT_API_KEY || 'test'}\n`);

  // 3. Verify all files exist
  console.log('\n=== Verifying Files ===');
  const files = [
    `${VAULT_PATH}/SCHEMA.md`,
    `${VAULT_PATH}/index.md`,
    `${VAULT_PATH}/instructions/bootstrap.md`,
    `${VAULT_PATH}/instructions/tenant-config.md`,
    `${VAULT_PATH}/log.md`,
    `${VAULT_PATH}/wikilink-map.md`,
    `${BASE_PATH}/agents/main/agent/SOUL.md`,
    `${BASE_PATH}/tools/qdrant-search.sh`,
    `${BASE_PATH}/config/qdrant.env`,
  ];

  let allOk = true;
  for (const f of files) {
    const exists = await sshExec(`test -f '${f}' && echo OK || echo MISSING`);
    const size = await sshExec(`wc -c < '${f}' 2>/dev/null || echo 0`);
    const status = exists === 'OK' && parseInt(size) > 0 ? '✅' : '❌';
    if (status === '❌') allOk = false;
    console.log(`  ${status} ${f.replace(BASE_PATH, '.')} (${size} bytes)`);
  }

  // 4. Verify content is readable
  console.log('\n=== Content Check ===');
  const schemaContent = await sshExec(`head -3 ${VAULT_PATH}/SCHEMA.md`);
  console.log('SCHEMA.md first 3 lines:', schemaContent);
  const indexContent = await sshExec(`head -3 ${VAULT_PATH}/index.md`);
  console.log('index.md first 3 lines:', indexContent);

  // 5. Clean up test
  console.log('\n=== Cleaning up test vault ===');
  await sshExec(`rm -rf ${BASE_PATH}`);
  console.log('Cleaned.');

  console.log('\n=== RESULT:', allOk ? 'ALL PASSED ✅' : 'SOME FAILED ❌', '===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
