import { Injectable, Inject, Logger } from '@nestjs/common';
import { PlatformConfigService, RelayConfig } from '../platform-config/platform-config.service';
import { EnrichmentQueueService, EnrichmentQueueEntry, EnrichmentStatus } from '../enrichment-queue/enrichment-queue.service';
import { ContentValidationService } from '../content-validation/content-validation.service';
import { VaultStorage } from '../vault-storage/vault-storage.interface';

// ── Result interface ────────────────────────────────────────────────────────
export interface ExecutionResult {
  status: 'validating' | 'failed' | 'skipped';
  durationMs?: number;
  error?: string;
  reason?: string;
}

// ── Service ─────────────────────────────────────────────────────────────────
@Injectable()
export class EnrichmentExecutorService {
  private readonly logger = new Logger(EnrichmentExecutorService.name);

  constructor(
    private readonly configService: PlatformConfigService,
    private readonly queueService: EnrichmentQueueService,
    @Inject('VAULT_STORAGE') private readonly vaultStorage: VaultStorage,
    private readonly validationService: ContentValidationService,
  ) {}

  async executeEnrichment(entryId: string): Promise<ExecutionResult> {
    const entry = await this.queueService.getEntry(entryId);
    if (!entry) throw new Error(`Queue entry ${entryId} not found`);

    // Already completed — idempotent
    if (entry.status === EnrichmentStatus.COMPLETED || entry.status === EnrichmentStatus.PERMANENTLY_FAILED) {
      return { status: 'skipped', reason: `Already ${entry.status}` };
    }

    const timeouts = this.configService.getTimeouts();
    const relayConfig = this.configService.getRelayConfig();

    // Mark EXECUTING
    await this.queueService.markExecuting(entryId);
    this.logger.log({
      event: 'enrichment.started',
      tenantId: entry.tenantId,
      conceptId: entry.conceptId,
      timeout: timeouts.enrichmentTimeout,
    });

    try {
      // Send to relay
      const startTime = Date.now();
      const relayResult = await this.callRelay(relayConfig, entry, timeouts.enrichmentTimeout);
      const durationMs = Date.now() - startTime;

      this.logger.log({
        event: 'enrichment.relay_returned',
        tenantId: entry.tenantId,
        success: relayResult.success,
        durationMs,
      });

      // Move to VALIDATING regardless of relay success (FR23: vault-read-after-write)
      await this.queueService.markValidating(entryId);

      return { status: 'validating', durationMs };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({
        event: 'enrichment.failed',
        tenantId: entry.tenantId,
        conceptId: entry.conceptId,
        error: message,
      });
      await this.queueService.markFailed(entryId, message);
      return { status: 'failed', error: message };
    }
  }

  async callRelay(
    relayConfig: RelayConfig,
    entry: EnrichmentQueueEntry,
    timeoutSeconds: number,
  ): Promise<{ success: boolean }> {
    // Actual HTTP call to OpenClaw relay would go here
    // For now, this is the interface — real implementation connects to relay
    const url = `http://${relayConfig.host}:${relayConfig.port}/api/ask`;
    // POST with timeout, tenantId, conceptId, sessionId, etc.
    // This will be implemented when we have the relay integration story
    throw new Error('Relay call not yet implemented — use mock in tests');
  }
}
