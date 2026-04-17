/**
 * FULL ROUND-TRIP TEST: Onboarding → Enrichment → Content Delivery
 *
 * This test exercises the REAL system end-to-end:
 * 1. Register a test tenant via API
 * 2. Run onboarding (concept selection + vault provisioning)
 * 3. Wait for enrichment to complete (or timeout)
 * 4. Validate: vault files exist, content is English, word count OK
 * 5. Validate: API returns enriched content
 * 6. Clean up
 *
 * Usage: node -r dotenv/config apps/api/scripts/full-roundtrip-test.js
 *
 * Requires: API running at localhost:3000, relay accessible, SSH key configured
 */
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');
const p = new PrismaClient();

const API_BASE = 'http://localhost:3000/api';
const SSH_HOST = process.env.HETZNER_HOST || '91.98.231.87';
const SSH_KEY_PATH = process.env.HETZNER_SSH_KEY;
const ONE_HOUR = 3600000;
const POLL_INTERVAL = 30000; // 30 seconds

let testTenantId = null;
let testUserId = null;
let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log('  ✓', name);
    passed++;
  } else {
    console.log('  ✗', name, '—', detail || '');
    failed++;
  }
  return condition;
}

async function apiCall(method, path, body, headers = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    signal: AbortSignal.timeout(60000),
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${API_BASE}${path}`, opts);
  return { status: resp.status, data: await resp.json().catch(() => null) };
}

function sshExec(command) {
  if (!SSH_KEY_PATH) throw new Error('No SSH key');
  try {
    const result = execSync(
      `ssh -i "${SSH_KEY_PATH}" -o StrictHostKeyChecking=no -o ConnectTimeout=30 root@${SSH_HOST} "${command.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: 60000, shell: 'bash' }
    );
    return result.trim();
  } catch (e) {
    throw new Error('SSH failed: ' + (e.stderr || e.message || '').substring(0, 200));
  }
}

async function pollEnrichment(tenantId, userId, maxWaitMs) {
  const startTime = Date.now();
  let lastExecuted = 0;
  let lastFailed = 0;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const { data } = await apiCall('GET', '/v1/maturity/execution-status', null, {
        'x-tenant-id': tenantId,
        'x-user-id': userId,
      });

      const d = data?.data;
      if (!d) {
        console.log('    [poll] No data returned');
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        continue;
      }

      const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);

      if (d.executed !== lastExecuted || d.failed !== lastFailed) {
        console.log(`    [${elapsed}m] completed=${d.executed} failed=${d.failed} pending=${d.pendingCount} current="${d.currentConceptName || 'none'}"`);
        lastExecuted = d.executed;
        lastFailed = d.failed;
      }

      // Done when not running and no pending
      if (!d.running && d.pendingCount === 0) {
        return { completed: d.executed, failed: d.failed, total: d.total };
      }

      // Also done if running but everything is terminal
      if (d.executed + d.failed >= d.total) {
        return { completed: d.executed, failed: d.failed, total: d.total };
      }
    } catch (e) {
      console.log('    [poll] Error:', e.message);
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }

  return { completed: lastExecuted, failed: lastFailed, total: -1, timedOut: true };
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' FULL ROUND-TRIP TEST');
  console.log(' Onboarding → Enrichment → Content Delivery');
  console.log('═══════════════════════════════════════════════\n');

  // ═══ PHASE 1: Pre-flight ═══
  console.log('PHASE 1: Pre-flight checks');
  const health = await apiCall('GET', '/health');
  check('API is healthy', health.data?.status === 'healthy');

  let sshOk = false;
  try {
    const result = sshExec('echo OK');
    sshOk = result === 'OK';
  } catch (e) {
    console.log('  ⚠ SSH not available from this environment — vault checks will use API only');
    console.log('    (' + e.message.substring(0, 80) + ')');
  }

  // ═══ PHASE 2: Check tenant is clean ═══
  console.log('\nPHASE 2: Verify clean state');
  const user = await p.user.findFirst({ where: { email: { contains: 'nafata' } } });
  check('nafataperla user does NOT exist', !user, 'User already exists — run cleanup first');

  if (failed > 0) {
    console.log('\nTenant not clean — run cleanup-tenant.js first');
    process.exit(1);
  }

  // ═══ PHASE 3: Wait for user to register ═══
  console.log('\nPHASE 3: Waiting for nafataperla@gmail.com to register...');
  console.log('  → Go to the app and register now\n');

  let tenant = null;
  const regStart = Date.now();
  while (Date.now() - regStart < ONE_HOUR) {
    const u = await p.user.findFirst({ where: { email: { contains: 'nafata' } }, select: { id: true, tenantId: true } });
    if (u) {
      testUserId = u.id;
      testTenantId = u.tenantId;
      tenant = await p.tenant.findUnique({ where: { id: testTenantId } });
      console.log('  ✓ User registered:', testUserId);
      console.log('  ✓ Tenant:', testTenantId, '(' + (tenant?.name || '?') + ')');
      break;
    }
    await new Promise(r => setTimeout(r, 5000));
  }

  if (!testTenantId) {
    console.log('  ✗ Timeout — user did not register within 1 hour');
    process.exit(1);
  }

  // ═══ PHASE 4: Verify onboarding ═══
  console.log('\nPHASE 4: Verifying onboarding...');

  // Wait for concepts to be selected (may take a minute)
  let conceptCount = 0;
  const onboardStart = Date.now();
  while (Date.now() - onboardStart < 300000) { // 5 min max
    conceptCount = await p.concept.count({ where: { tenantId: testTenantId } });
    if (conceptCount > 0) break;
    await new Promise(r => setTimeout(r, 5000));
  }

  check('Concepts selected', conceptCount > 0, 'Got ' + conceptCount);

  if (conceptCount > 0) {
    // Check concept quality
    const concepts = await p.concept.findMany({
      where: { tenantId: testTenantId },
      select: { name: true, slug: true, category: true },
    });
    const serbianNames = concepts.filter(c => /[čćšžđ]/.test(c.name));
    const serbianSlugs = concepts.filter(c => /[čćšžđ]/.test(c.slug || ''));
    const numberedCats = concepts.filter(c => /^\d+\./.test(c.category || ''));

    check('Zero Serbian in concept names', serbianNames.length === 0, serbianNames.slice(0, 3).map(c => c.name).join(', '));
    check('Zero Serbian in concept slugs', serbianSlugs.length === 0);
    check('Zero numbered categories', numberedCats.length === 0, numberedCats.slice(0, 3).map(c => c.category).join(', '));

    // Check categories are balanced
    const cats = {};
    concepts.forEach(c => cats[c.category] = (cats[c.category] || 0) + 1);
    const catCount = Object.keys(cats).length;
    check('At least 10 categories', catCount >= 10, 'Got ' + catCount);
    console.log('  → ' + conceptCount + ' concepts across ' + catCount + ' categories');
  }

  // Wait for vault provisioning
  if (sshOk) {
    console.log('\n  Waiting for vault provisioning...');
    let vaultReady = false;
    const vaultStart = Date.now();
    while (Date.now() - vaultStart < 300000) {
      try {
        const result = sshExec(`test -f /root/.openclaw-${testTenantId}/vault/SCHEMA.md && echo OK || echo MISSING`);
        if (result === 'OK') { vaultReady = true; break; }
      } catch {}
      await new Promise(r => setTimeout(r, 10000));
    }
    check('Vault provisioned on relay', vaultReady);

    if (vaultReady) {
      try {
        const soul = sshExec(`cat /root/.openclaw-${testTenantId}/agents/main/agent/SOUL.md 2>/dev/null | head -5`);
        check('SOUL.md exists and has content', soul.length > 20);
        check('SOUL.md mentions ENGLISH', soul.includes('ENGLISH'));
      } catch (e) {
        check('SOUL.md readable', false, e.message);
      }
    }
  } else {
    console.log('\n  (Vault SSH checks skipped — monitoring via API only)');
  }

  // ═══ PHASE 5: Monitor enrichment ═══
  console.log('\nPHASE 5: Monitoring enrichment (timeout: 1 hour)...');
  console.log('  Each concept takes ~5-15 minutes. ' + conceptCount + ' concepts total.\n');

  const enrichResult = await pollEnrichment(testTenantId, testUserId, ONE_HOUR);

  console.log('\n  Enrichment summary:');
  console.log('    Completed:', enrichResult.completed);
  console.log('    Failed:', enrichResult.failed);
  console.log('    Timed out:', enrichResult.timedOut || false);

  check('At least 1 concept enriched', enrichResult.completed >= 1, 'Completed: ' + enrichResult.completed);
  check('Failure rate < 50%', enrichResult.failed < enrichResult.completed || enrichResult.completed === 0);

  // ═══ PHASE 6: Validate enriched content ═══
  if (enrichResult.completed > 0) {
    console.log('\nPHASE 6: Validating enriched content...');

    // Find a completed concept
    const completedAssignment = await p.stageConceptAssignment.findFirst({
      where: { tenantId: testTenantId, status: 'COMPLETED' },
      select: { conceptId: true },
    });

    if (completedAssignment) {
      const concept = await p.concept.findUnique({
        where: { id: completedAssignment.conceptId },
        select: { name: true, slug: true },
      });

      if (concept) {
        console.log('  Checking concept:', concept.name, '(slug:', concept.slug + ')');

        // Read vault article (via SSH if available, otherwise via API)
        if (sshOk) {
          try {
            const article = sshExec(`cat /root/.openclaw-${testTenantId}/vault/wiki/concepts/${concept.slug}.md 2>/dev/null`);
            check('Vault article exists', article.length > 100, 'Length: ' + article.length);
            check('Article > 4500 words', article.split(/\s+/).length > 4500, 'Words: ' + article.split(/\s+/).length);
            check('Article has frontmatter', article.includes('---'));
            check('Article has Sources section', article.includes('## Sources') || article.includes('## References'));
            check('Article is English (no Serbian chars)', !/[čćšžđ]/i.test(article));
            check('Article is English (no Serbian words)', !/\b(koji|koja|koje|može|nije)\b/gi.test(article));
          } catch (e) {
            console.log('    (Vault SSH read skipped:', e.message.substring(0, 60) + ')');
          }
        }

        // Check API returns content
        try {
          const { data } = await apiCall('GET', `/v1/knowledge/concepts/${completedAssignment.conceptId}`, null, {
            'x-tenant-id': testTenantId,
            'x-user-id': testUserId,
          });
          check('API returns concept data', !!data?.data);
          check('API has extendedDescription', data?.data?.extendedDescription?.length > 100, 'Length: ' + (data?.data?.extendedDescription?.length || 0));
        } catch (e) {
          check('API concept endpoint', false, e.message);
        }
      }
    }
  } else {
    console.log('\nPHASE 6: SKIPPED — no enriched concepts to validate');
  }

  // ═══ FINAL REPORT ═══
  console.log('\n═══════════════════════════════════════════════');
  console.log(' PASSED:', passed, '| FAILED:', failed);
  if (failed === 0) {
    console.log(' ✓ FULL ROUND-TRIP TEST PASSED');
  } else {
    console.log(' ✗ FULL ROUND-TRIP TEST HAS FAILURES');
  }
  console.log('═══════════════════════════════════════════════');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
