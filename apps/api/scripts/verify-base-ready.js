/**
 * VERIFY PLATFORM BASE READINESS
 * Checks curriculum.json, DB concepts, relationships, templates, config.
 * Must pass 35/35 before any tenant onboarding.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) { console.log('  ✓', name); passed++; }
  else { console.log('  ✗', name, '—', detail); failed++; }
}

async function main() {
  console.log('\n=== CURRICULUM.JSON ===');
  const currPath = path.join(__dirname, '..', 'src', 'app', 'knowledge', 'data', 'curriculum.json');
  const curr = JSON.parse(fs.readFileSync(currPath, 'utf-8'));
  const currIds = new Set(curr.map(n => n.id));

  check('Entry count is 436', curr.length === 436, 'Got ' + curr.length);
  check('Root nodes are 20', curr.filter(n => !n.parentId).length >= 18, 'Got ' + curr.filter(n => !n.parentId).length);
  check('Zero duplicate IDs', currIds.size === curr.length, 'Dupes: ' + (curr.length - currIds.size));
  check('Zero broken parentIds', curr.filter(n => n.parentId && !currIds.has(n.parentId)).length === 0);
  check('Zero Serbian chars in IDs', curr.filter(n => /[čćšžđ]/.test(n.id)).length === 0);
  check('Zero Serbian chars in labels', curr.filter(n => /[čćšžđ]/.test(n.label)).length === 0);
  check('All labels non-empty', curr.filter(n => !n.label || n.label.trim() === '').length === 0);
  check('All sortOrders are numbers', curr.filter(n => typeof n.sortOrder !== 'number').length === 0);

  console.log('\n=== PLATFORM CONCEPTS (DB) ===');
  const platformConcepts = await p.concept.findMany({ where: { tenantId: null }, select: { id: true, name: true, slug: true, category: true, curriculumId: true } });
  check('Platform concepts exist (>350)', platformConcepts.length > 350, 'Got ' + platformConcepts.length);
  check('Zero Serbian in names', platformConcepts.filter(c => /[čćšžđ]/.test(c.name)).length === 0);
  check('Zero Serbian in slugs', platformConcepts.filter(c => /[čćšžđ]/.test(c.slug || '')).length === 0);
  check('Zero Serbian in categories', platformConcepts.filter(c => /[čćšžđ]/.test(c.category || '')).length === 0);
  check('Zero numbered categories', platformConcepts.filter(c => /^\d+\./.test(c.category || '')).length === 0);
  check('All have slugs', platformConcepts.filter(c => !c.slug).length === 0);
  check('All have categories', platformConcepts.filter(c => !c.category).length === 0);

  console.log('\n=== RELATIONSHIPS ===');
  const allConceptIds = new Set((await p.concept.findMany({ select: { id: true } })).map(c => c.id));
  const totalRels = await p.conceptRelationship.count();
  const allRels = await p.conceptRelationship.findMany({ select: { sourceConceptId: true, targetConceptId: true } });
  const brokenRels = allRels.filter(r => !allConceptIds.has(r.sourceConceptId) || !allConceptIds.has(r.targetConceptId));
  check('Relationships exist', totalRels > 3000, 'Got ' + totalRels);
  check('Zero orphaned relationships', brokenRels.length === 0, 'Broken: ' + brokenRels.length);

  console.log('\n=== SEEDING READINESS ===');
  const withCurr = platformConcepts.filter(c => c.curriculumId);
  check('Concepts with curriculumId > 300', withCurr.length > 300, 'Got ' + withCurr.length);
  const brokenCurrRefs = withCurr.filter(c => !currIds.has(c.curriculumId));
  check('Zero broken curriculumId refs', brokenCurrRefs.length === 0, 'Broken: ' + brokenCurrRefs.length);

  console.log('\n=== VAULT TEMPLATES ===');
  const templateDir = path.join(process.cwd(), 'openclaw-config', 'templates', 'vault');
  const templates = ['SOUL.template.md'];
  for (const tmpl of templates) {
    const tmplPath = path.join(templateDir, tmpl);
    const exists = fs.existsSync(tmplPath);
    check(tmpl + ' exists', exists, 'MISSING');
  }

  console.log('\n=== AGENT REGISTRY ===');
  const registryPath = path.join(process.cwd(), 'openclaw-config', 'agent-registry.yaml');
  check('agent-registry.yaml exists', fs.existsSync(registryPath));

  console.log('\n=== PLATFORM CONFIG ===');
  const configPath = path.join(process.cwd(), 'openclaw-config', 'platform-config.yaml');
  check('platform-config.yaml exists', fs.existsSync(configPath));

  console.log('\n' + '='.repeat(50));
  console.log('PASSED:', passed, '| FAILED:', failed);
  if (failed === 0) console.log('✓ BASE IS READY FOR ANY FUTURE TENANT');
  else console.log('✗ BASE HAS ISSUES — FIX BEFORE TESTING');
  console.log('='.repeat(50));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
