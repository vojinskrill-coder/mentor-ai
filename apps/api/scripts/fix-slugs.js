const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const tid = 'tnt_vbbupo4u27wezti3gz604ort';
  const concepts = await p.concept.findMany({ where: { tenantId: tid }, select: { id: true, name: true, slug: true } });

  let updated = 0;
  for (const c of concepts) {
    const englishSlug = c.name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^-|-$/g, '');

    if (c.slug !== englishSlug) {
      await p.concept.update({ where: { id: c.id }, data: { slug: englishSlug } });
      updated++;
      if (updated <= 10) console.log(c.slug, '->', englishSlug);
    }
  }
  console.log('Updated', updated, 'slugs out of', concepts.length);
}

main().catch(console.error).finally(() => p.$disconnect());
