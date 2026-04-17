const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const fixes = [
    { match: 'mozete intociti', newName: 'How Can You Learn from Your Competition?', newSlug: 'how-can-you-learn-from-your-competition' },
    { match: 'Stubovi Sadrzaja', newName: 'Content Pillars', newSlug: 'content-pillars' },
    { match: 'Umetnost specificna', newName: 'Site-Specific Art', newSlug: 'site-specific-art' },
    { match: 'Sertifikat Autenticnosti', newName: 'Certificate of Authenticity as Investment Guarantee', newSlug: 'certificate-of-authenticity-as-investment-guarantee' },
  ];

  for (const fix of fixes) {
    const concept = await p.concept.findFirst({ where: { name: { contains: fix.match } } });
    if (concept) {
      console.log(concept.name, '->', fix.newName);
      await p.concept.update({ where: { id: concept.id }, data: { name: fix.newName, slug: fix.newSlug } });
    } else {
      console.log('NOT FOUND:', fix.match);
    }
  }

  console.log('\nDone');
}

main().catch(console.error).finally(() => p.$disconnect());
