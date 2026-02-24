/**
 * Data migration: set categorySortOrder on all concepts (Story 3.3 AC4)
 *
 * Maps each concept's category to its position in the Obsidian vault hierarchy.
 * Handles both numbered ("3. Marketing") and stripped ("Marketing") category names.
 *
 * Usage:
 *   cd apps/api
 *   npx ts-node -P tsconfig.json prisma/set-concept-sort-orders.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Complete Obsidian vault folder ordering.
 * Maps the stripped category name to its display order.
 * Covers ALL 22 Obsidian chapters (not just the 16 in ALL_CATEGORIES).
 */
const CATEGORY_ORDER: Record<string, number> = {
  'Kako koristiti Mentor AI?': 0,
  'Uvod u Poslovanje': 1,
  Vrednost: 2,
  Marketing: 3,
  'Kognitivne Sklonosti': 4,
  'Određivanje Cene': 5,
  Finansije: 6,
  'Razvoj Poslovanja': 7,
  Prodaja: 8,
  'Operacije i Proizvodnja': 9,
  Menadžment: 10,
  'Ljudski Resursi': 11,
  'Rad sa Ljudima': 12,
  Preduzetništvo: 13,
  'Isporuka Vrednosti': 14,
  Sistemi: 15,
  'Poslovni Modeli': 16,
  'Kompanijska Struktura': 17,
  'Tipovi Kompanija': 18,
  'Kupovina i Prodaja Poslovanja': 19,
  Startup: 20,
  'Upravljanje Podacima': 21,
  'Upravljanje Svojim Radom': 13,
  // Aliases from ALL_CATEGORIES (different names mapped to same concepts)
  Operacije: 9,
  'Odnosi sa Klijentima': 12,
  Računovodstvo: 6,
  'Digitalni Marketing': 3,
  Tehnologija: 15,
  Inovacije: 13,
  Liderstvo: 10,
  Strategija: 15,
  // Sub-categories and English aliases → map to nearest parent chapter
  Strategy: 15,
  Finance: 6,
  Poslovanje: 1,
  'Razumevanje Sistema': 15,
  'Tok Vrednosti': 2,
  'Spajanja i Akvizicije (M&A)': 19,
  'Modeli Vlasništva': 18,
  'Stvaranje Barijera za Konkurente': 16,
};

/**
 * Strips the numeric prefix from Obsidian folder names.
 * "3. Marketing" → "Marketing", "10. Menadžment" → "Menadžment"
 * Also strips ".md" suffix for raw filenames.
 */
function stripPrefix(category: string): string {
  return category
    .replace(/^\d+\.\s*/, '')
    .replace(/\.md$/, '')
    .trim();
}

async function main() {
  console.log('Setting categorySortOrder on all concepts...');

  const concepts = await prisma.concept.findMany({
    select: { id: true, category: true, name: true },
  });

  console.log(`Found ${concepts.length} concepts`);

  let unmapped = 0;

  // Group concepts by their resolved sort order to batch updates
  const orderGroups = new Map<number, string[]>();

  for (const concept of concepts) {
    let order = CATEGORY_ORDER[concept.category];
    if (order === undefined) {
      const stripped = stripPrefix(concept.category);
      order = CATEGORY_ORDER[stripped];
    }

    if (order === undefined) {
      console.warn(
        `  WARN: Unknown category "${concept.category}" for concept "${concept.name}" — defaulting to 99`
      );
      unmapped++;
      order = 99;
    }

    if (!orderGroups.has(order)) orderGroups.set(order, []);
    orderGroups.get(order)!.push(concept.id);
  }

  // Batch update all concepts per sort order group in a single transaction
  await prisma.$transaction(
    [...orderGroups.entries()].map(([order, ids]) =>
      prisma.concept.updateMany({
        where: { id: { in: ids } },
        data: { categorySortOrder: order },
      })
    )
  );

  const updated = concepts.length;

  console.log(`\nDone! Updated ${updated} concepts (${unmapped} unmapped categories)`);

  // Verify: show count per category with sort order
  const categories = await prisma.concept.groupBy({
    by: ['category', 'categorySortOrder'],
    _count: { id: true },
    orderBy: { categorySortOrder: 'asc' },
  });

  console.log('\nCategory distribution:');
  for (const cat of categories) {
    console.log(`  [${cat.categorySortOrder}] ${cat.category}: ${cat._count.id} concepts`);
  }
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
