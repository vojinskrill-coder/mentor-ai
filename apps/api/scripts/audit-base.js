const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

async function main() {
  // Count platform concepts (tenantId = null)
  const platformConcepts = await p.concept.findMany({
    where: { tenantId: null },
    select: { id: true, name: true, slug: true, category: true, curriculumId: true }
  });
  console.log('Platform concepts:', platformConcepts.length);

  // Check for Serbian in names, slugs, categories
  const serbianNames = platformConcepts.filter(c => /[\u010d\u0107\u0161\u017e\u0111]/.test(c.name));
  const serbianSlugs = platformConcepts.filter(c => /[\u010d\u0107\u0161\u017e\u0111]/.test(c.slug || ''));
  const serbianCats = platformConcepts.filter(c => /[\u010d\u0107\u0161\u017e\u0111]/.test(c.category || ''));
  console.log('Serbian in names:', serbianNames.length);
  console.log('Serbian in slugs:', serbianSlugs.length);
  console.log('Serbian in categories:', serbianCats.length);
  if (serbianNames.length > 0) serbianNames.slice(0,5).forEach(c => console.log('  NAME:', c.name));

  // Check numbered categories (should be clean)
  const numberedCats = platformConcepts.filter(c => /^\d+\./.test(c.category || ''));
  console.log('Numbered categories:', numberedCats.length);
  if (numberedCats.length > 0) numberedCats.slice(0,5).forEach(c => console.log('  CAT:', c.category));

  // Check relationships
  const totalRels = await p.conceptRelationship.count();
  const platformRels = await p.conceptRelationship.count({
    where: { sourceConcept: { tenantId: null } }
  });
  console.log('Total relationships:', totalRels);
  console.log('Platform relationships:', platformRels);

  // Check for relationships pointing to non-existent concepts
  const allConceptIds = new Set((await p.concept.findMany({ select: { id: true } })).map(c => c.id));
  const allRels = await p.conceptRelationship.findMany({ select: { sourceConceptId: true, targetConceptId: true } });
  const brokenRels = allRels.filter(r => !allConceptIds.has(r.sourceConceptId) || !allConceptIds.has(r.targetConceptId));
  console.log('Broken relationships (pointing to missing concepts):', brokenRels.length);

  // Category distribution
  const cats = {};
  platformConcepts.forEach(c => {
    const cat = c.category || 'NO_CATEGORY';
    cats[cat] = (cats[cat] || 0) + 1;
  });
  console.log('\nPlatform concept categories:');
  Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => console.log('  ' + cat + ': ' + count));
}

main().catch(console.error).finally(() => p.$disconnect());
