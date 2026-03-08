const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Get all distinct categories
  const cats = await prisma.$queryRaw`SELECT DISTINCT category FROM concepts ORDER BY category`;
  console.log('All categories:');
  cats.forEach(c => console.log(`  "${c.category}"`));

  // Check for Poslovanje-related concepts
  const poslo = await prisma.concept.findMany({
    where: { name: { contains: 'Poslov', mode: 'insensitive' } },
    select: { id: true, name: true, category: true, sortOrder: true },
    take: 10,
  });
  console.log('\nConcepts with "Poslov" in name:');
  poslo.forEach(c => console.log(`  "${c.name}" | category: "${c.category}" | sortOrder: ${c.sortOrder}`));

  // Foundation concepts
  const found = await prisma.concept.findMany({
    where: { category: { in: ['Uvod u Poslovanje', 'Vrednost', 'Poslovanje'] } },
    select: { name: true, category: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
    take: 20,
  });
  console.log('\nFoundation concepts (Uvod u Poslovanje/Vrednost/Poslovanje):');
  found.forEach(c => console.log(`  "${c.name}" | category: "${c.category}" | sortOrder: ${c.sortOrder}`));
  console.log(`  Total: ${found.length}`);

  await prisma.$disconnect();
}

main();
