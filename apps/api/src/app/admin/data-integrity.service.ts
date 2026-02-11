import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { QdrantClientService } from '../qdrant/qdrant-client.service';

export interface DataIntegrityReport {
  timestamp: string;
  concepts: {
    total: number;
    withEmbeddingId: number;
    withoutEmbeddingId: number;
    withCurriculumId: number;
    withoutCurriculumId: number;
  };
  qdrant: {
    available: boolean;
    pointCount: number | null;
    collectionExists: boolean;
  };
  sync: {
    status: 'synced' | 'drift' | 'unavailable';
    mismatchCount: number;
  };
  issues: string[];
}

@Injectable()
export class DataIntegrityService {
  private readonly logger = new Logger(DataIntegrityService.name);
  private readonly COLLECTION_NAME = 'concepts';

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly qdrantClient: QdrantClientService,
  ) {}

  async runFullCheck(): Promise<DataIntegrityReport> {
    const issues: string[] = [];

    // 1. Concept stats from PostgreSQL
    const concepts = await this.prisma.concept.findMany({
      select: { id: true, embeddingId: true, curriculumId: true, slug: true },
    });

    const total = concepts.length;
    const withEmbeddingId = concepts.filter((c) => c.embeddingId).length;
    const withCurriculumId = concepts.filter((c) => c.curriculumId).length;

    if (total === 0) {
      issues.push('No concepts found in database — run seed script');
    }
    if (withEmbeddingId === 0 && total > 0) {
      issues.push('No concepts have embeddings — run embedding script');
    }

    // 2. Qdrant stats
    let qdrantAvailable = false;
    let pointCount: number | null = null;
    let collectionExists = false;

    if (this.qdrantClient.isAvailable()) {
      qdrantAvailable = true;
      try {
        const client = this.qdrantClient.getClient();
        const collections = await client.getCollections();
        collectionExists = collections.collections.some(
          (c) => c.name === this.COLLECTION_NAME,
        );

        if (collectionExists) {
          const info = await client.getCollection(this.COLLECTION_NAME);
          pointCount = info.points_count ?? null;
        } else {
          issues.push(`Qdrant collection '${this.COLLECTION_NAME}' does not exist`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown';
        issues.push(`Qdrant query failed: ${msg}`);
        qdrantAvailable = false;
      }
    } else {
      issues.push('Qdrant not configured (QDRANT_URL missing)');
    }

    // 3. Sync check
    let syncStatus: 'synced' | 'drift' | 'unavailable' = 'unavailable';
    let mismatchCount = 0;

    if (qdrantAvailable && pointCount !== null) {
      mismatchCount = Math.abs(withEmbeddingId - pointCount);
      if (mismatchCount === 0 && withEmbeddingId === pointCount) {
        syncStatus = 'synced';
      } else {
        syncStatus = 'drift';
        issues.push(
          `DB has ${withEmbeddingId} concepts with embeddingId but Qdrant has ${pointCount} points (diff: ${mismatchCount})`,
        );
      }
    }

    // Check for duplicate slugs
    const slugs = concepts.map((c) => c.slug);
    const dupSlugs = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    if (dupSlugs.length > 0) {
      issues.push(`Duplicate slugs found: ${dupSlugs.join(', ')}`);
    }

    // Check for duplicate curriculumIds
    const currIds = concepts.filter((c) => c.curriculumId).map((c) => c.curriculumId!);
    const dupCurrIds = currIds.filter((id, i) => currIds.indexOf(id) !== i);
    if (dupCurrIds.length > 0) {
      issues.push(`Duplicate curriculumIds: ${dupCurrIds.join(', ')}`);
    }

    const report: DataIntegrityReport = {
      timestamp: new Date().toISOString(),
      concepts: {
        total,
        withEmbeddingId,
        withoutEmbeddingId: total - withEmbeddingId,
        withCurriculumId,
        withoutCurriculumId: total - withCurriculumId,
      },
      qdrant: {
        available: qdrantAvailable,
        pointCount,
        collectionExists,
      },
      sync: {
        status: syncStatus,
        mismatchCount,
      },
      issues,
    };

    this.logger.log({
      message: 'Data integrity check completed',
      syncStatus,
      issueCount: issues.length,
    });

    return report;
  }
}
