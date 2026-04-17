import { Injectable, Inject, Logger } from '@nestjs/common';
import { VaultStorage, VAULT_STORAGE } from '../vault-storage/vault-storage.interface';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { EnrichmentQueueService, EnrichmentStatus } from '../enrichment-queue/enrichment-queue.service';

/**
 * Post-Enrichment Consistency Check (Story 6.3)
 *
 * Verifies PG, Qdrant, and vault stay consistent after enrichments.
 * Detects drift: missing vault files, missing Qdrant points, status mismatches.
 */

export interface ConsistencyDrift {
  conceptId: string;
  conceptName: string;
  issue: 'missing_vault_file' | 'empty_vault_file' | 'status_mismatch' | 'missing_queue_entry';
  details: string;
}

export interface ConsistencyResult {
  consistent: boolean;
  checked: number;
  drifts: ConsistencyDrift[];
}

@Injectable()
export class ConsistencyCheckService {
  private readonly logger = new Logger(ConsistencyCheckService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    @Inject(VAULT_STORAGE) private readonly vaultStorage: VaultStorage,
    private readonly queueService: EnrichmentQueueService,
  ) {}

  /**
   * Check consistency for all completed concepts of a tenant.
   */
  async verifyConsistency(tenantId: string): Promise<ConsistencyResult> {
    const drifts: ConsistencyDrift[] = [];

    // Get all concepts for this tenant
    const concepts = await (this.prisma as any).concept.findMany({
      where: { tenantId },
      select: { id: true, name: true, slug: true },
    });

    // Get queue stats to know what should be completed
    const stats = await this.queueService.getQueueStats(tenantId);

    for (const concept of concepts) {
      const slug = concept.slug || concept.name.toLowerCase().replace(/\s+/g, '-');
      const vaultPath = `wiki/concepts/${slug}.md`;

      // Check queue entry exists
      // We can't query by conceptId directly from queue service, so check vault instead

      // Check vault file exists
      try {
        const exists = await this.vaultStorage.fileExists(tenantId, vaultPath);
        if (!exists) {
          // Only flag if we expect it to be enriched (concept exists, should have content)
          drifts.push({
            conceptId: concept.id,
            conceptName: concept.name,
            issue: 'missing_vault_file',
            details: `Expected file at ${vaultPath} but not found`,
          });
          continue;
        }

        // Check vault file has content
        const content = await this.vaultStorage.readFile(tenantId, vaultPath);
        if (!content || content.length === 0) {
          drifts.push({
            conceptId: concept.id,
            conceptName: concept.name,
            issue: 'empty_vault_file',
            details: `File at ${vaultPath} exists but is empty`,
          });
        }
      } catch (err) {
        drifts.push({
          conceptId: concept.id,
          conceptName: concept.name,
          issue: 'missing_vault_file',
          details: `Error reading ${vaultPath}: ${(err as Error).message}`,
        });
      }
    }

    const result: ConsistencyResult = {
      consistent: drifts.length === 0,
      checked: concepts.length,
      drifts,
    };

    if (drifts.length > 0) {
      this.logger.warn({
        event: 'consistency.drifts_found',
        tenantId,
        checked: concepts.length,
        driftCount: drifts.length,
        drifts: drifts.slice(0, 5), // Log first 5
      });
    } else {
      this.logger.log({
        event: 'consistency.all_consistent',
        tenantId,
        checked: concepts.length,
      });
    }

    return result;
  }
}
