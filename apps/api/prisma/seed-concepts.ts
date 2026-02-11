/**
 * Concept seeding script for Mentor AI.
 * Seeds the business concepts knowledge base from JSON files.
 *
 * Usage:
 *   npx ts-node prisma/seed-concepts.ts [--dry-run] [--clear]
 *
 * Options:
 *   --dry-run  Preview changes without modifying database
 *   --clear    Clear all concepts before seeding (use with caution)
 */

import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import * as fs from 'fs';
import * as path from 'path';

interface ConceptSeedData {
  name: string;
  slug: string;
  category: string;
  definition: string;
  extendedDescription?: string;
  departmentTags: string[];
  relatedConcepts?: Array<{
    slug: string;
    type: 'PREREQUISITE' | 'RELATED' | 'ADVANCED';
  }>;
}

interface SeedFile {
  concepts: ConceptSeedData[];
}

interface SeedResult {
  conceptsCreated: number;
  conceptsSkipped: number;
  relationshipsCreated: number;
  errors: string[];
}

const prisma = new PrismaClient();

async function loadSeedFile(filePath: string): Promise<SeedFile | null> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as SeedFile;
  } catch (error) {
    console.error(`Failed to load ${filePath}:`, error);
    return null;
  }
}

async function seedConcepts(dryRun = false, clear = false): Promise<SeedResult> {
  const result: SeedResult = {
    conceptsCreated: 0,
    conceptsSkipped: 0,
    relationshipsCreated: 0,
    errors: [],
  };

  const seedDataPath = path.resolve(__dirname, 'seed-data/concepts');

  console.log(`\nSeeding concepts from: ${seedDataPath}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Clear first: ${clear}\n`);

  // Clear if requested
  if (clear && !dryRun) {
    console.log('Clearing existing concepts...');
    await prisma.conceptRelationship.deleteMany({});
    await prisma.concept.deleteMany({});
    console.log('Cleared all concepts and relationships.\n');
  }

  // Get all JSON files
  const files = fs
    .readdirSync(seedDataPath)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(seedDataPath, f));

  if (files.length === 0) {
    console.log('No seed files found.');
    return result;
  }

  console.log(`Found ${files.length} seed files.\n`);

  // First pass: Create concepts
  const conceptsBySlug = new Map<string, string>();

  for (const file of files) {
    const fileName = path.basename(file);
    console.log(`Processing ${fileName}...`);

    const seedData = await loadSeedFile(file);
    if (!seedData) continue;

    for (const conceptData of seedData.concepts) {
      try {
        const existing = await prisma.concept.findUnique({
          where: { slug: conceptData.slug },
        });

        if (existing) {
          conceptsBySlug.set(conceptData.slug, existing.id);
          result.conceptsSkipped++;
          continue;
        }

        if (dryRun) {
          const conceptId = `cpt_${createId()}`;
          conceptsBySlug.set(conceptData.slug, conceptId);
          result.conceptsCreated++;
          console.log(`  [DRY RUN] Would create: ${conceptData.name}`);
          continue;
        }

        const conceptId = `cpt_${createId()}`;
        await prisma.concept.create({
          data: {
            id: conceptId,
            name: conceptData.name,
            slug: conceptData.slug,
            category: conceptData.category,
            definition: conceptData.definition,
            extendedDescription: conceptData.extendedDescription,
            departmentTags: conceptData.departmentTags,
            version: 1,
          },
        });

        conceptsBySlug.set(conceptData.slug, conceptId);
        result.conceptsCreated++;
        console.log(`  Created: ${conceptData.name}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`${conceptData.slug}: ${msg}`);
        console.error(`  Error creating ${conceptData.slug}: ${msg}`);
      }
    }
  }

  console.log('\nCreating relationships...\n');

  // Second pass: Create relationships
  for (const file of files) {
    const seedData = await loadSeedFile(file);
    if (!seedData) continue;

    for (const conceptData of seedData.concepts) {
      if (!conceptData.relatedConcepts?.length) continue;

      const sourceId = conceptsBySlug.get(conceptData.slug);
      if (!sourceId) continue;

      for (const rel of conceptData.relatedConcepts) {
        const targetId = conceptsBySlug.get(rel.slug);
        if (!targetId) {
          console.log(`  Warning: Related concept not found: ${rel.slug}`);
          continue;
        }

        try {
          if (dryRun) {
            result.relationshipsCreated++;
            continue;
          }

          const existing = await prisma.conceptRelationship.findUnique({
            where: {
              sourceConceptId_targetConceptId: {
                sourceConceptId: sourceId,
                targetConceptId: targetId,
              },
            },
          });

          if (existing) continue;

          await prisma.conceptRelationship.create({
            data: {
              sourceConceptId: sourceId,
              targetConceptId: targetId,
              relationshipType: rel.type,
            },
          });

          result.relationshipsCreated++;
        } catch (error) {
          // Ignore duplicate relationship errors
        }
      }
    }
  }

  // Third pass: Apply curriculum mappings
  console.log('\nApplying curriculum mappings...\n');

  const mapFilePath = path.resolve(__dirname, 'seed-data/concept-curriculum-map.json');
  let mappingsApplied = 0;
  try {
    const mapContent = fs.readFileSync(mapFilePath, 'utf-8');
    const { mappings } = JSON.parse(mapContent) as { mappings: Record<string, string> };
    for (const [slug, curriculumId] of Object.entries(mappings)) {
      const conceptId = conceptsBySlug.get(slug);
      if (!conceptId) {
        console.log(`  Warning: Mapped slug not found in DB: ${slug}`);
        continue;
      }
      if (dryRun) {
        console.log(`  [DRY RUN] Would map: ${slug} → ${curriculumId}`);
        mappingsApplied++;
        continue;
      }
      try {
        await prisma.concept.update({
          where: { id: conceptId },
          data: { curriculumId },
        });
        mappingsApplied++;
        console.log(`  Mapped: ${slug} → ${curriculumId}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown';
        result.errors.push(`mapping ${slug}: ${msg}`);
        console.error(`  Error mapping ${slug}: ${msg}`);
      }
    }
  } catch {
    console.log('  No concept-curriculum-map.json found (optional)');
  }

  (result as SeedResult & { mappingsApplied: number }).mappingsApplied = mappingsApplied;

  return result;
}

async function validateSeedResults(dryRun: boolean): Promise<boolean> {
  if (dryRun) return true;

  console.log('\nValidating seed results...\n');
  let hasErrors = false;

  const concepts = await prisma.concept.findMany({
    select: { id: true, slug: true, category: true, definition: true, curriculumId: true, embeddingId: true },
  });

  // Check for empty required fields
  for (const c of concepts) {
    if (!c.slug || !c.category || !c.definition) {
      console.error(`  ERROR: Concept ${c.id} missing slug/category/definition`);
      hasErrors = true;
    }
  }

  // Check for duplicate slugs
  const slugs = concepts.map((c) => c.slug);
  const dupSlugs = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  if (dupSlugs.length > 0) {
    console.error(`  ERROR: Duplicate slugs found: ${dupSlugs.join(', ')}`);
    hasErrors = true;
  }

  // Check for duplicate curriculumIds
  const currIds = concepts.filter((c) => c.curriculumId).map((c) => c.curriculumId!);
  const dupCurrIds = currIds.filter((id, i) => currIds.indexOf(id) !== i);
  if (dupCurrIds.length > 0) {
    console.error(`  ERROR: Duplicate curriculumIds found: ${dupCurrIds.join(', ')}`);
    hasErrors = true;
  }

  // Informational stats
  const withCurriculum = concepts.filter((c) => c.curriculumId).length;
  const withEmbedding = concepts.filter((c) => c.embeddingId).length;
  console.log(`  Total concepts: ${concepts.length}`);
  console.log(`  With curriculumId: ${withCurriculum} (${Math.round((withCurriculum / concepts.length) * 100)}%)`);
  console.log(`  With embeddingId: ${withEmbedding} (${Math.round((withEmbedding / concepts.length) * 100)}%)`);

  if (withEmbedding === 0) {
    console.log('  WARNING: No concepts have embeddings. Run the embedding script after seeding.');
  }

  if (hasErrors) {
    console.error('\n  VALIDATION FAILED — see errors above');
  } else {
    console.log('\n  Validation passed');
  }

  return !hasErrors;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const clear = args.includes('--clear');

  console.log('====================================');
  console.log('  Mentor AI - Concept Seeding');
  console.log('====================================');

  try {
    const result = await seedConcepts(dryRun, clear);

    console.log('\n====================================');
    console.log('  Seeding Complete');
    console.log('====================================');
    console.log(`  Concepts created: ${result.conceptsCreated}`);
    console.log(`  Concepts skipped: ${result.conceptsSkipped}`);
    console.log(`  Relationships created: ${result.relationshipsCreated}`);
    console.log(`  Curriculum mappings: ${(result as SeedResult & { mappingsApplied?: number }).mappingsApplied ?? 0}`);

    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`);
      result.errors.forEach((e) => console.log(`    - ${e}`));
    }

    console.log('====================================');

    // Run validation
    const valid = await validateSeedResults(dryRun);
    if (!valid) {
      process.exit(1);
    }

    console.log('');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
