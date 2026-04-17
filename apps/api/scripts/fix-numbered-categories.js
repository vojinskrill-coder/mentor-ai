const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Fix category names: "1. Introduction to Business" -> "Introduction to Business"
  // Fix concept names: "2. Business Culture" -> "Business Culture"
  const concepts = await p.concept.findMany({ select: { id: true, name: true, category: true, slug: true } });
  console.log('Total concepts:', concepts.length);

  const numberPrefix = /^\d+\.\s*/;
  let catFixed = 0;
  let nameFixed = 0;
  let slugFixed = 0;

  for (const c of concepts) {
    const updates = {};

    // Fix category: strip leading number + dot
    if (c.category && numberPrefix.test(c.category)) {
      updates.category = c.category.replace(numberPrefix, '');
    }

    // Fix name: strip leading number + dot
    if (c.name && numberPrefix.test(c.name)) {
      updates.name = c.name.replace(numberPrefix, '');
      // Also fix slug to match new name
      updates.slug = updates.name.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/^-|-$/g, '');
    }

    if (Object.keys(updates).length > 0) {
      try {
        await p.concept.update({ where: { id: c.id }, data: updates });
        if (updates.category) catFixed++;
        if (updates.name) { nameFixed++; if (nameFixed <= 10) console.log('  name:', c.name, '->', updates.name); }
      } catch (e) {
        // Duplicate slug — append ID
        if (updates.slug) {
          updates.slug = updates.slug + '-' + c.id.substring(4, 12);
          try {
            await p.concept.update({ where: { id: c.id }, data: updates });
            if (updates.category) catFixed++;
            if (updates.name) nameFixed++;
          } catch (e2) {
            console.log('  FAILED:', c.name, e2.message.substring(0, 80));
          }
        }
      }
    }
  }

  console.log('Categories fixed:', catFixed);
  console.log('Names fixed:', nameFixed);

  // Verify: show unique categories
  const cats = await p.concept.groupBy({ by: ['category'], _count: true, orderBy: { category: 'asc' } });
  console.log('\nCategories after fix:');
  cats.forEach(c => console.log('  ' + c.category + ': ' + c._count));
}

main().catch(console.error).finally(() => p.$disconnect());
