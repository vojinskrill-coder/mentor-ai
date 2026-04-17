const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

async function main() {
  // Check slugs in DB
  const allConcepts = await p.concept.findMany({ select: { slug: true, name: true } });
  const serbianSlugs = allConcepts.filter(c => /[čćšžđ]/.test(c.slug || ''));
  console.log('Concepts with Serbian chars in slug:', serbianSlugs.length);
  if (serbianSlugs.length > 0) serbianSlugs.slice(0, 5).forEach(c => console.log('  ', c.slug));

  // Check curriculum.json
  const currPath = path.join(__dirname, '..', 'src', 'app', 'knowledge', 'data', 'curriculum.json');
  const curr = JSON.parse(fs.readFileSync(currPath, 'utf-8'));
  const serbianCurr = curr.filter(n => /[čćšžđ]/.test(n.id));
  console.log('Curriculum nodes with Serbian chars in ID:', serbianCurr.length);

  // Check for Serbian parentIds
  const serbianParents = curr.filter(n => n.parentId && /[čćšžđ]/.test(n.parentId));
  console.log('Curriculum nodes with Serbian parentId:', serbianParents.length);

  console.log('Total platform concepts:', allConcepts.length);
  console.log('Total curriculum nodes:', curr.length);

  // Check nafataperla tenant is clean
  const user = await p.user.findFirst({ where: { email: { contains: 'nafata' } } });
  console.log('nafataperla user exists:', !!user);
}

main().catch(console.error).finally(() => p.$disconnect());
