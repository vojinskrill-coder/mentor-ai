import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { createId } from '@paralleldrive/cuid2';
import * as fs from 'fs';
import * as path from 'path';
import type { ConceptSeedData, RelationshipType } from '@mentor-ai/shared/types';

/**
 * Seed data file structure
 */
interface SeedFile {
  concepts: ConceptSeedData[];
}

/**
 * Service for seeding business concepts into the database.
 * Provides idempotent seeding with bidirectional relationship creation.
 */
@Injectable()
export class ConceptSeedService {
  private readonly logger = new Logger(ConceptSeedService.name);
  private readonly seedDataPath: string;

  constructor(private readonly prisma: PlatformPrismaService) {
    // Resolve path relative to the compiled output
    this.seedDataPath = path.resolve(
      __dirname,
      '../../../../prisma/seed-data/concepts'
    );
  }

  /**
   * Seeds all concepts from JSON files in the seed-data folder.
   * Idempotent: skips concepts that already exist.
   *
   * @param dryRun - If true, only logs what would be created without making changes
   * @returns Summary of seeding results
   */
  async seedAllConcepts(dryRun = false): Promise<SeedResult> {
    const result: SeedResult = {
      conceptsCreated: 0,
      conceptsSkipped: 0,
      relationshipsCreated: 0,
      errors: [],
    };

    this.logger.log({
      message: 'Starting concept seeding',
      seedDataPath: this.seedDataPath,
      dryRun,
    });

    // Get all JSON files in the seed data folder
    const files = this.getSeedFiles();

    if (files.length === 0) {
      this.logger.warn({
        message: 'No seed files found',
        path: this.seedDataPath,
      });
      return result;
    }

    // First pass: Create all concepts
    const conceptsBySlug = new Map<string, string>(); // slug -> id

    for (const file of files) {
      const seedData = this.loadSeedFile(file);
      if (!seedData) continue;

      for (const conceptData of seedData.concepts) {
        try {
          const existingConcept = await this.prisma.concept.findUnique({
            where: { slug: conceptData.slug },
          });

          if (existingConcept) {
            conceptsBySlug.set(conceptData.slug, existingConcept.id);
            result.conceptsSkipped++;
            this.logger.debug({
              message: 'Concept already exists, skipping',
              slug: conceptData.slug,
            });
            continue;
          }

          if (dryRun) {
            const conceptId = `cpt_${createId()}`;
            conceptsBySlug.set(conceptData.slug, conceptId);
            result.conceptsCreated++;
            this.logger.log({
              message: '[DRY RUN] Would create concept',
              name: conceptData.name,
              slug: conceptData.slug,
            });
            continue;
          }

          const concept = await this.createConcept(conceptData);
          conceptsBySlug.set(conceptData.slug, concept.id);
          result.conceptsCreated++;

          this.logger.log({
            message: 'Created concept',
            id: concept.id,
            name: concept.name,
            category: concept.category,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Failed to create concept ${conceptData.slug}: ${errorMessage}`);
          this.logger.error({
            message: 'Failed to create concept',
            slug: conceptData.slug,
            error: errorMessage,
          });
        }
      }
    }

    // Second pass: Create relationships
    for (const file of files) {
      const seedData = this.loadSeedFile(file);
      if (!seedData) continue;

      for (const conceptData of seedData.concepts) {
        if (!conceptData.relatedConcepts || conceptData.relatedConcepts.length === 0) {
          continue;
        }

        const sourceId = conceptsBySlug.get(conceptData.slug);
        if (!sourceId) continue;

        for (const relation of conceptData.relatedConcepts) {
          const targetId = conceptsBySlug.get(relation.slug);
          if (!targetId) {
            this.logger.warn({
              message: 'Related concept not found',
              sourceSlug: conceptData.slug,
              targetSlug: relation.slug,
            });
            continue;
          }

          try {
            if (dryRun) {
              result.relationshipsCreated++;
              this.logger.log({
                message: '[DRY RUN] Would create relationship',
                source: conceptData.slug,
                target: relation.slug,
                type: relation.type,
              });
              continue;
            }

            // Check if relationship already exists
            const existingRelation = await this.prisma.conceptRelationship.findUnique({
              where: {
                sourceConceptId_targetConceptId: {
                  sourceConceptId: sourceId,
                  targetConceptId: targetId,
                },
              },
            });

            if (existingRelation) {
              continue; // Skip existing relationships
            }

            await this.prisma.conceptRelationship.create({
              data: {
                sourceConceptId: sourceId,
                targetConceptId: targetId,
                relationshipType: relation.type as RelationshipType,
              },
            });

            result.relationshipsCreated++;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            this.logger.error({
              message: 'Failed to create relationship',
              source: conceptData.slug,
              target: relation.slug,
              error: errorMessage,
            });
          }
        }
      }
    }

    this.logger.log({
      message: 'Concept seeding complete',
      conceptsCreated: result.conceptsCreated,
      conceptsSkipped: result.conceptsSkipped,
      relationshipsCreated: result.relationshipsCreated,
      errorCount: result.errors.length,
    });

    return result;
  }

  /**
   * Gets list of seed data JSON files.
   */
  private getSeedFiles(): string[] {
    try {
      if (!fs.existsSync(this.seedDataPath)) {
        this.logger.warn({
          message: 'Seed data path does not exist',
          path: this.seedDataPath,
        });
        return [];
      }

      return fs
        .readdirSync(this.seedDataPath)
        .filter((file) => file.endsWith('.json'))
        .map((file) => path.join(this.seedDataPath, file));
    } catch (error) {
      this.logger.error({
        message: 'Failed to read seed data directory',
        path: this.seedDataPath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Loads and parses a seed data JSON file.
   */
  private loadSeedFile(filePath: string): SeedFile | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as SeedFile;
    } catch (error) {
      this.logger.error({
        message: 'Failed to load seed file',
        filePath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Creates a single concept in the database.
   */
  private async createConcept(data: ConceptSeedData) {
    const conceptId = `cpt_${createId()}`;

    return this.prisma.concept.create({
      data: {
        id: conceptId,
        name: data.name,
        slug: data.slug,
        category: data.category,
        definition: data.definition,
        extendedDescription: data.extendedDescription,
        departmentTags: data.departmentTags,
        version: 1,
      },
    });
  }

  /**
   * Clears all concepts and relationships from the database.
   * Use with caution - primarily for testing.
   */
  async clearAllConcepts(): Promise<void> {
    this.logger.warn({ message: 'Clearing all concepts and relationships' });

    // Delete relationships first (foreign key constraint)
    await this.prisma.conceptRelationship.deleteMany({});
    await this.prisma.concept.deleteMany({});

    this.logger.log({ message: 'All concepts and relationships cleared' });
  }
}

/**
 * Result of concept seeding operation.
 */
export interface SeedResult {
  /** Number of concepts created */
  conceptsCreated: number;
  /** Number of concepts skipped (already existed) */
  conceptsSkipped: number;
  /** Number of relationships created */
  relationshipsCreated: number;
  /** Error messages for any failures */
  errors: string[];
}
