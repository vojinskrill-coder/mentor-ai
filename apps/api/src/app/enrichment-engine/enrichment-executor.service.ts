import { Injectable, Logger } from '@nestjs/common';
import { EnrichmentQueueService, EnrichmentStatus } from '../enrichment-queue/enrichment-queue.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';

@Injectable()
export class EnrichmentExecutorService {
  private readonly logger = new Logger(EnrichmentExecutorService.name);

  constructor(
    private readonly queue: EnrichmentQueueService,
    private readonly config: PlatformConfigService,
  ) {}

  async executeEnrichment(entryId: string): Promise<boolean> {
    try {
      // Transition: DISPATCHED -> EXECUTING
      await this.queue.markExecuting(entryId);
      this.logger.log(`Executing enrichment for entry ${entryId}`);

      const entry = await this.queue.getEntry(entryId);
      if (!entry) {
        this.logger.error(`Entry ${entryId} not found after marking executing`);
        return false;
      }

      const timeouts = this.config.getTimeouts();
      const relayConfig = this.config.getRelayConfig();

      // Call the relay to execute enrichment
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        timeouts.enrichmentStepMs,
      );

      try {
        const response = await fetch(
          `http://${relayConfig.host}:${relayConfig.port}/execute`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${relayConfig.authToken}`,
            },
            body: JSON.stringify({
              tenantId: entry.tenantId,
              conceptSlug: entry.conceptSlug,
              agentId: 'content',
            }),
            signal: controller.signal,
          },
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Relay returned ${response.status}: ${response.statusText}`);
        }

        // Transition: EXECUTING -> VALIDATING
        await this.queue.markValidating(entryId);
        this.logger.log(`Enrichment executed for entry ${entryId}, now validating`);
        return true;
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Enrichment execution failed for ${entryId}: ${msg}`);
      await this.queue.markFailed(entryId, msg).catch((e) =>
        this.logger.error(`Failed to mark entry as failed: ${e.message}`),
      );
      return false;
    }
  }
}
