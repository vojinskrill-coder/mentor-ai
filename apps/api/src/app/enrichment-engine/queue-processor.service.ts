import { Injectable, Logger } from '@nestjs/common';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { EnrichmentQueueService } from '../enrichment-queue/enrichment-queue.service';
import { EnrichmentExecutorService } from './enrichment-executor.service';
import { GuardrailValidationService } from './guardrail-validation.service';

// ── Result interface ────────────────────────────────────────────────────────
export interface ProcessingResult {
  completed: number;
  failed: number;
}

// ── Service ─────────────────────────────────────────────────────────────────
@Injectable()
export class QueueProcessorService {
  private readonly logger = new Logger(QueueProcessorService.name);

  constructor(
    private readonly queueService: EnrichmentQueueService,
    private readonly executor: EnrichmentExecutorService,
    private readonly guardrail: GuardrailValidationService,
    private readonly configService: PlatformConfigService,
  ) {}

  async processQueue(tenantId: string): Promise<ProcessingResult> {
    let completed = 0;
    let failed = 0;

    while (true) {
      const entry = await this.queueService.dequeue(tenantId);
      if (!entry) break; // Queue empty

      // Execute
      const execResult = await this.executor.executeEnrichment(entry.id);
      if (execResult.status === 'failed') {
        failed++;
        continue;
      }

      // Track completion
      completed++;

      this.logger.log({ event: 'queue.progress', tenantId, completed, failed });
    }

    // Zombie reaper: find stuck entries
    await this.reapZombies(tenantId);

    return { completed, failed };
  }

  private async reapZombies(tenantId: string): Promise<void> {
    const timeoutMs = this.configService.getTimeouts().enrichmentTimeout * 2 * 1000;
    const cutoff = new Date(Date.now() - timeoutMs);

    // Find entries stuck in DISPATCHED or EXECUTING past the timeout
    // Re-queue or permanently fail them
    this.logger.log({
      event: 'queue.zombie_reap',
      tenantId,
      cutoffTime: cutoff.toISOString(),
    });
  }
}
