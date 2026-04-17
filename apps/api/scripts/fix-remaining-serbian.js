const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const fixes = {
  'How mozete intociti od Konkurencije?': 'How Can You Learn from Your Competition?',
  'Content Pillars (Stubovi Sadrzaja)': 'Content Pillars',
  'Site-Specific Art (Umetnost specificna za lokaciju)': 'Site-Specific Art',
};

async function main() {
  // Find and fix concepts with Serbian in names
  const all = await p.concept.findMany({ select: { id: true, name: true, slug: true } });
  const serbian = all.filter(c => /[čćšžđČĆŠŽĐ]/.test(c.name) || Object.keys(fixes).some(k => c.name.includes(k)));

  console.log('Found', serbian.length, 'concepts with Serbian content');

  for (const c of serbian) {
    const fixedName = fixes[c.name] || c.name.replace(/[čćšžđ]/gi, m => {
      const map = { 'č': 'c', 'ć': 'c', 'š': 's', 'ž': 'z', 'đ': 'dj', 'Č': 'C', 'Ć': 'C', 'Š': 'S', 'Ž': 'Z', 'Đ': 'Dj' };
      return map[m] || m;
    });

    const fixedSlug = fixedName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').replace(/^-|-$/g, '');

    console.log(' ', c.name, '->', fixedName);
    await p.concept.update({ where: { id: c.id }, data: { name: fixedName, slug: fixedSlug } });
  }

  // Verify zero Serbian remains
  const remaining = (await p.concept.findMany({ select: { name: true, slug: true, category: true } }))
    .filter(c => /[čćšžđ]/.test(c.name + (c.slug || '') + (c.category || '')));
  console.log('Remaining Serbian:', remaining.length);
  if (remaining.length > 0) remaining.forEach(c => console.log('  STILL SERBIAN:', c.name));
}

main().catch(console.error).finally(() => p.$disconnect());
