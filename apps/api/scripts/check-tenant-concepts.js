const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const user = await p.user.findFirst({ where: { email: { contains: 'nafata' } } });
  if (!user) { console.log('No user yet - not registered'); return; }

  const concepts = await p.concept.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, name: true, slug: true, category: true, curriculumId: true },
    orderBy: { category: 'asc' }
  });

  console.log('Tenant:', user.tenantId);
  console.log('Total concepts:', concepts.length);

  const cats = {};
  for (const c of concepts) {
    const cat = c.category || 'NO_CATEGORY';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(c);
  }

  for (const [cat, items] of Object.entries(cats)) {
    console.log('\n' + cat + ': ' + items.length);
    items.slice(0, 3).forEach(c => console.log('  - ' + c.name + ' [slug: ' + c.slug + ']'));
    if (items.length > 3) console.log('  ... +' + (items.length - 3) + ' more');
  }

  // Check slug quality
  const serbianSlugs = concepts.filter(c => /[čćšžđ]/.test(c.slug || ''));
  console.log('\nSerbian chars in slugs:', serbianSlugs.length);

  // Check curriculumId references
  const withCurrId = concepts.filter(c => c.curriculumId);
  console.log('Concepts with curriculumId:', withCurrId.length);
}

main().catch(console.error).finally(() => p.$disconnect());
