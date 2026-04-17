/**
 * CLEAN PLATFORM DB TO OBSIDIAN-ONLY CONCEPTS
 *
 * Removes ALL AI-discovered junk concepts (no curriculumId) from the platform.
 * Keeps ONLY the ~304 concepts that map to the original Obsidian vault.
 * Also removes orphaned relationships.
 *
 * Usage: node apps/api/scripts/clean-platform-to-obsidian-only.js [--dry-run]
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('=== DRY RUN ===\n');

  // Find junk: platform concepts without curriculumId
  const junk = await p.concept.findMany({
    where: { tenantId: null, curriculumId: null },
    select: { id: true, name: true, category: true }
  });

  const keep = await p.concept.findMany({
    where: { tenantId: null, curriculumId: { not: null } },
    select: { id: true, name: true }
  });

  console.log('Concepts to KEEP (Obsidian with curriculumId):', keep.length);
  console.log('Concepts to DELETE (AI junk, no curriculumId):', junk.length);

  if (junk.length === 0) {
    console.log('Nothing to clean!');
    return;
  }

  const junkIds = junk.map(c => c.id);

  // Count relationships that will be removed
  const relsToDelete = await p.conceptRelationship.count({
    where: { OR: [{ sourceConceptId: { in: junkIds } }, { targetConceptId: { in: junkIds } }] }
  });
  console.log('Relationships to DELETE (involving junk):', relsToDelete);

  // Count relationships that will survive
  const keepIds = keep.map(c => c.id);
  const relsToKeep = await p.conceptRelationship.count({
    where: {
      sourceConceptId: { in: keepIds },
      targetConceptId: { in: keepIds }
    }
  });
  console.log('Relationships to KEEP (between Obsidian concepts):', relsToKeep);

  if (dryRun) {
    console.log('\nSample junk to delete:');
    junk.slice(0, 20).forEach(c => console.log('  DEL:', c.category, '-', c.name));
    console.log('\n(dry run — no changes made)');
    return;
  }

  // Delete relationships involving junk
  console.log('\nDeleting junk relationships...');
  const delRels = await p.conceptRelationship.deleteMany({
    where: { OR: [{ sourceConceptId: { in: junkIds } }, { targetConceptId: { in: junkIds } }] }
  });
  console.log('Deleted relationships:', delRels.count);

  // Delete junk concepts
  console.log('Deleting junk concepts...');
  const delConcepts = await p.concept.deleteMany({
    where: { id: { in: junkIds } }
  });
  console.log('Deleted concepts:', delConcepts.count);

  // Verify
  const remaining = await p.concept.count({ where: { tenantId: null } });
  const remainingRels = await p.conceptRelationship.count();
  console.log('\nAfter cleanup:');
  console.log('Platform concepts:', remaining);
  console.log('Total relationships:', remainingRels);
}

main().catch(console.error).finally(() => p.$disconnect());
