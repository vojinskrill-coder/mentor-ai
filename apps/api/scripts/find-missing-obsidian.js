/**
 * Find which curriculum entries DON'T have a matching platform concept.
 * These are Obsidian concepts that exist in curriculum.json but couldn't
 * be matched to any DB concept by name.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  const curr = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'knowledge', 'data', 'curriculum.json'), 'utf-8'));

  const concepts = await p.concept.findMany({
    where: { tenantId: null },
    select: { id: true, name: true, slug: true, curriculumId: true }
  });

  // Build lookup
  const conceptByName = new Map();
  const conceptBySlug = new Map();
  for (const c of concepts) {
    conceptByName.set(c.name.toLowerCase().trim(), c);
    if (c.slug) conceptBySlug.set(c.slug, c);
  }

  console.log('Curriculum entries:', curr.length);
  console.log('Platform concepts:', concepts.length);
  console.log('Concepts with curriculumId:', concepts.filter(c => c.curriculumId).length);

  // Find unmatched curriculum entries
  const unmatched = [];
  const matched = [];
  for (const node of curr) {
    const byName = conceptByName.get(node.label.toLowerCase().trim());
    const bySlug = conceptBySlug.get(node.id);
    if (byName || bySlug) {
      matched.push({ node, concept: byName || bySlug });
    } else {
      unmatched.push(node);
    }
  }

  console.log('\nMatched:', matched.length);
  console.log('Unmatched curriculum entries:', unmatched.length);

  if (unmatched.length > 0) {
    console.log('\nUnmatched (first 30):');
    unmatched.slice(0, 30).forEach(n => console.log('  MISSING:', n.label, '[' + n.id + ']'));
  }

  // Now find concepts WITHOUT curriculumId that SHOULD have one
  // (their name matches a curriculum label but they weren't linked)
  const currLabels = new Map();
  for (const n of curr) currLabels.set(n.label.toLowerCase().trim(), n.id);

  const shouldBeLinked = concepts.filter(c => !c.curriculumId && currLabels.has(c.name.toLowerCase().trim()));
  console.log('\nConcepts that SHOULD be linked but arent:', shouldBeLinked.length);
  shouldBeLinked.slice(0, 10).forEach(c => console.log('  LINK:', c.name, '->', currLabels.get(c.name.toLowerCase().trim())));
}

main().catch(console.error).finally(() => p.$disconnect());
