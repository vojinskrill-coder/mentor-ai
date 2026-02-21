/**
 * Obsidian Vault → Mentor AI Concept Importer
 *
 * Reads fetched Obsidian pages + cache from temp files,
 * transforms them into Concept + ConceptRelationship records,
 * and seeds them into the database.
 *
 * Usage: npx ts-node apps/api/prisma/seed-obsidian.ts [--clear]
 *   --clear  Deletes existing concepts/relationships before seeding
 */

import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[đ]/g, 'dj')
    .replace(/[ž]/g, 'z')
    .replace(/[ć]/g, 'c')
    .replace(/[č]/g, 'c')
    .replace(/[š]/g, 's')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

/** Strip number prefix like "1.1 " or "3.2.2 " from a name */
function stripNumberPrefix(name: string): string {
  return name.replace(/^\d+(\.\d+)*\s+/, '');
}

/** Extract category name from folder path like "Poslovanje/3. Marketing/..." */
function extractCategory(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length < 2) return 'General';
  const folder = parts[1] || 'General'; // e.g., "3. Marketing"
  return stripNumberPrefix(folder);
}

/** Extract sort order from number prefix */
function extractSortOrder(name: string): number {
  const match = name.match(/^(\d+(\.\d+)*)/);
  if (!match) return 0;
  const numParts = match[1]!.split('.');
  // Convert "3.2.2" → 30202 for ordering
  let order = 0;
  numParts.forEach((p, i) => {
    order += parseInt(p) * Math.pow(100, Math.max(0, 2 - i));
  });
  return order;
}

/** Extract first meaningful paragraph as definition */
function extractDefinition(content: string): string {
  // Remove title line (starts with #)
  const lines = content.split('\n');
  let inContent = false;
  const paragraphs: string[] = [];
  let currentParagraph = '';

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip title, created date, empty lines at start
    if (trimmed.startsWith('#') && !inContent) continue;
    if (trimmed.startsWith('Created:')) continue;
    if (trimmed === '' && !inContent) continue;

    inContent = true;

    if (trimmed === '') {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph);
        currentParagraph = '';
      }
    } else if (trimmed.startsWith('###') || trimmed.startsWith('##')) {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph);
        currentParagraph = '';
      }
      break; // Stop at first subheading
    } else {
      currentParagraph += (currentParagraph ? ' ' : '') + trimmed;
    }
  }
  if (currentParagraph.length > 0) paragraphs.push(currentParagraph);

  // Get the first substantive paragraph (skip very short ones)
  const definition = paragraphs.find((p) => p.length > 30) || paragraphs[0] || '';

  // Clean up markdown formatting
  return definition
    .replace(/\[\[([^\]]+)\]\]/g, '$1') // Remove wikilinks
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .replace(/_([^_]+)_/g, '$1') // Remove underscore emphasis
    .replace(/`([^`]+)`/g, '$1') // Remove code
    .slice(0, 500);
}

/** Clean full content for extended description */
function cleanContent(content: string): string {
  return content
    .replace(/\[\[([^\]]+)\]\]/g, '$1') // Remove wikilinks, keep text
    .replace(/!\[\[.*?\]\]/g, '') // Remove embedded images
    .replace(/^Created:.*$/m, '') // Remove created date
    .replace(/^#[^#].*$/m, '') // Remove title
    .replace(/^\s*tag:.*$/gm, '') // Remove tag lines
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
    .trim();
}

// ─── Category: Use original Serbian folder names ──────────

/** Department tags = the category itself */
function getDepartmentTags(category: string): string[] {
  return [category];
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  const clearFirst = process.argv.includes('--clear');
  const tempDir = process.env.TEMP || '/tmp';

  console.log('Loading Obsidian data...');
  const pages: Record<string, string> = JSON.parse(
    fs.readFileSync(path.join(tempDir, 'obsidian-pages.json'), 'utf8')
  );
  const cache: Record<string, any> = JSON.parse(
    fs.readFileSync(path.join(tempDir, 'obsidian-real.json'), 'utf8')
  );

  const mdFiles = Object.keys(pages).filter((k) => k.endsWith('.md'));
  console.log(`Found ${mdFiles.length} pages`);

  // Build file name → full path lookup
  const nameToPath: Record<string, string> = {};
  mdFiles.forEach((f) => {
    const name = f.split('/').pop()!.replace('.md', '');
    nameToPath[name] = f;
  });

  // ─── Pass 1: Build concept records ─────────────────────

  console.log('\n=== Pass 1: Building concepts ===');

  interface ConceptRecord {
    id: string;
    name: string;
    slug: string;
    category: string;
    definition: string;
    extendedDescription: string;
    departmentTags: string[];
    source: 'SEED_DATA';
    sortOrder: number;
    filePath: string;
    fileName: string;
  }

  const concepts: ConceptRecord[] = [];
  const slugSet = new Set<string>();
  const nameSet = new Set<string>();
  const fileNameToId: Record<string, string> = {};

  // Skip the "Kako koristiti Mentor AI?" page (it's a guide, not a concept)
  const skipFiles = new Set([
    'Poslovanje/1. Kako koristiti Mentor AI?/Kako koristiti Mentor AI?.md',
    'Poslovanje/22. Promptovi/1. Promptovi.md',
  ]);

  for (const filePath of mdFiles) {
    if (skipFiles.has(filePath)) continue;

    const content = pages[filePath];
    if (!content || content.trim().length < 20) continue;

    const fileName = filePath.split('/').pop()!.replace('.md', '');
    const category = extractCategory(filePath);
    let cleanName = stripNumberPrefix(fileName);

    // Ensure unique names
    if (nameSet.has(cleanName)) {
      cleanName = `${cleanName} (${category})`;
    }
    if (nameSet.has(cleanName)) {
      cleanName = `${cleanName} ${createId().slice(0, 4)}`;
    }
    nameSet.add(cleanName);

    let slug = slugify(cleanName);
    // Ensure unique slugs
    if (slugSet.has(slug)) {
      slug = slug + '-' + slugify(category).slice(0, 20);
    }
    if (slugSet.has(slug)) {
      slug = slug + '-' + createId().slice(0, 6);
    }
    slugSet.add(slug);

    const id = `cpt_${createId()}`;
    fileNameToId[fileName] = id;

    concepts.push({
      id,
      name: cleanName,
      slug,
      category,
      definition: extractDefinition(content),
      extendedDescription: cleanContent(content),
      departmentTags: getDepartmentTags(category),
      source: 'SEED_DATA',
      sortOrder: extractSortOrder(fileName),
      filePath,
      fileName,
    });
  }

  console.log(`Built ${concepts.length} concept records`);

  // ─── Pass 2: Build relationships from wikilinks ────────

  console.log('\n=== Pass 2: Building relationships ===');

  interface RelRecord {
    sourceId: string;
    targetId: string;
    type: 'RELATED' | 'PREREQUISITE' | 'ADVANCED';
  }

  const relationships: RelRecord[] = [];
  const relSet = new Set<string>();

  for (const filePath of mdFiles) {
    const entry = cache[filePath];
    if (!entry || !entry.links) continue;

    const fileName = filePath.split('/').pop()!.replace('.md', '');
    const sourceId = fileNameToId[fileName];
    if (!sourceId) continue;

    for (const link of entry.links) {
      const targetName = link.link || link.displayText;
      if (!targetName) continue;

      const targetId = fileNameToId[targetName];
      if (!targetId) continue;
      if (sourceId === targetId) continue;

      const key = `${sourceId}:${targetId}`;
      if (relSet.has(key)) continue;
      relSet.add(key);

      // Determine relationship type based on folder hierarchy
      const targetPath = nameToPath[targetName] || '';

      let type: 'RELATED' | 'PREREQUISITE' | 'ADVANCED' = 'RELATED';
      // If target is from an earlier numbered chapter, it's likely a prerequisite
      const sourceNum = parseInt(filePath.split('/')[1] || '99') || 99;
      const targetNum = parseInt(targetPath.split('/')[1] || '99') || 99;
      if (targetNum < sourceNum) {
        type = 'PREREQUISITE';
      } else if (targetNum > sourceNum) {
        type = 'ADVANCED';
      }

      relationships.push({ sourceId, targetId, type });
    }
  }

  console.log(`Built ${relationships.length} relationship records`);

  // ─── Pass 3: Seed database ─────────────────────────────

  console.log('\n=== Pass 3: Seeding database ===');

  if (clearFirst) {
    console.log('Clearing existing concepts and relationships...');
    await prisma.$executeRawUnsafe('TRUNCATE concept_relationships CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE concepts CASCADE');
    console.log('Cleared.');
  }

  // Insert concepts in batches
  const BATCH_SIZE = 50;
  let inserted = 0;

  for (let i = 0; i < concepts.length; i += BATCH_SIZE) {
    const batch = concepts.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((c) =>
        prisma.concept.upsert({
          where: { slug: c.slug },
          update: {
            name: c.name,
            category: c.category,
            definition: c.definition,
            extendedDescription: c.extendedDescription,
            departmentTags: c.departmentTags,
            sortOrder: c.sortOrder,
          },
          create: {
            id: c.id,
            name: c.name,
            slug: c.slug,
            category: c.category,
            definition: c.definition,
            extendedDescription: c.extendedDescription,
            departmentTags: c.departmentTags,
            source: c.source,
            sortOrder: c.sortOrder,
          },
        })
      )
    );
    inserted += batch.length;
    if (inserted % 100 === 0) console.log(`  Inserted ${inserted}/${concepts.length} concepts`);
  }
  console.log(`Inserted ${inserted} concepts total`);

  // Insert relationships in batches
  let relInserted = 0;
  for (let i = 0; i < relationships.length; i += BATCH_SIZE) {
    const batch = relationships.slice(i, i + BATCH_SIZE);
    for (const rel of batch) {
      try {
        await prisma.conceptRelationship.upsert({
          where: {
            sourceConceptId_targetConceptId: {
              sourceConceptId: rel.sourceId,
              targetConceptId: rel.targetId,
            },
          },
          update: { relationshipType: rel.type },
          create: {
            sourceConceptId: rel.sourceId,
            targetConceptId: rel.targetId,
            relationshipType: rel.type,
          },
        });
        relInserted++;
      } catch {
        // Skip duplicates or FK violations
      }
    }
    if (relInserted % 500 === 0 && relInserted > 0)
      console.log(`  Inserted ${relInserted}/${relationships.length} relationships`);
  }
  console.log(`Inserted ${relInserted} relationships total`);

  // ─── Summary ───────────────────────────────────────────

  const conceptCount = await prisma.concept.count();
  const relCount = await prisma.conceptRelationship.count();
  console.log(`\n=== Done ===`);
  console.log(`Database now has: ${conceptCount} concepts, ${relCount} relationships`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
