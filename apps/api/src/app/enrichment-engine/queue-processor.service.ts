import { Injectable, Logger } from '@nestjs/common';
import { EnrichmentQueueService, EnrichmentStatus } from '../enrichment-queue/enrichment-queue.service';
import { EnrichmentExecutorService } from './enrichment-executor.service';
import { GuardrailValidationService } from './guardrail-validation.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';

@Injectable()
export class QueueProcessorService {
  private readonly logger = new Logger(QueueProcessorService.name);

  constructor(
    private readonly queue: EnrichmentQueueService,
    private readonly executor: EnrichmentExecutorService,
    private readonly validator: GuardrailValidationService,
    private readonly config: PlatformConfigService,
  ) {}

  async processQueue(tenantId: string): Promise<{
    processed: number;
    completed: number;
    failed: number;
  }> {
    const enrichmentConfig = this.config.getEnrichmentConfig();
    let processed = 0;
    let completed = 0;
    let failed = 0;

    // Reap zombies first
    await this.reapZombies(tenantId, enrichmentConfig.zombieTimeoutMs);

    // Process queue entries
    while (processed < enrichmentConfig.batchSize) {
      const entry = await this.queue.dequeue(tenantId);
      if (!entry) {
        this.logger.log(`Queue empty for tenant ${tenantId}`);
        break;
      }

      processed++;

      // Execute enrichment
      const execSuccess = await this.executor.executeEnrichment(entry.id);
      if (!execSuccess) {
        failed++;
        continue;
      }

      // Validate result
      const validSuccess = await this.validator.validateAndComplete(
        entry.id,
        entry.conceptSlug,
      );
      if (validSuccess) {
        completed++;
      } else {
        failed++;
      }
    }

    this.logger.log(
      `Queue processing complete for ${tenantId}: processed=${processed}, completed=${completed}, failed=${failed}`,
    );

    return { processed, completed, failed };
  }

  /**
   * Find and reset zombie entries (stuck in EXECUTING/DISPATCHED too long)
   */
  async reapZombies(tenantId: string, timeoutMs: number): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - timeoutMs);
      const stats = await this.queue.getQueueStats(tenantId);
      const executingCount = stats[EnrichmentStatus.EXECUTING] || 0;
      const dispatchedCount = stats[EnrichmentStatus.DISPATCHED] || 0;

      if (executingCount + dispatchedCount === 0) return 0;

      this.logger.warn(
        `Potential zombies detected for ${tenantId}: ${executingCount} executing, ${dispatchedCount} dispatched (cutoff: ${cutoff.toISOString()})`,
      );

      // In production: query for entries older than cutoff and reset them
      return 0;
    } catch (err) {
      this.logger.error(`Zombie reaper failed: ${(err as Error).message}`);
      return 0;
    }
  }
}
