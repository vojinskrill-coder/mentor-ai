import { Injectable, Inject, Logger } from '@nestjs/common';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { EnrichmentQueueService } from '../enrichment-queue/enrichment-queue.service';
import { ContentValidationService } from '../content-validation/content-validation.service';
import { VaultStorage } from '../vault-storage/vault-storage.interface';

// ── Result interface ────────────────────────────────────────────────────────
export interface ValidationResult {
  status: 'completed' | 'failed' | 'permanently_failed' | 'correcting';
  errors?: string[];
  error?: string;
  correctionMessage?: string;
}

// ── Service ─────────────────────────────────────────────────────────────────
@Injectable()
export class GuardrailValidationService {
  private readonly logger = new Logger(GuardrailValidationService.name);

  constructor(
    @Inject('VAULT_STORAGE') private readonly vaultStorage: VaultStorage,
    private readonly validationService: ContentValidationService,
    private readonly queueService: EnrichmentQueueService,
    private readonly configService: PlatformConfigService,
  ) {}

  async validateAndComplete(entryId: string, slug: string): Promise<ValidationResult> {
    const entry = await this.queueService.getEntry(entryId);
    if (!entry) throw new Error(`Queue entry ${entryId} not found`);

    const maxRetries = this.configService.getEnrichmentConfig().maxRetries;

    // FR23: Always read vault regardless of relay success
    let content: string;
    try {
      content = await this.vaultStorage.readFile(entry.tenantId, `wiki/concepts/${slug}.md`);
    } catch {
      await this.queueService.markFailed(entryId, 'No article written to vault');
      return { status: 'failed', error: 'No article in vault' };
    }

    // Validate content
    const validation = this.validationService.validateContent(content);

    if (validation.valid) {
      await this.queueService.markCompleted(entryId);
      this.logger.log({
        event: 'enrichment.validated',
        tenantId: entry.tenantId,
        conceptId: entry.conceptId,
      });
      return { status: 'completed' };
    }

    // Check retry budget
    if (entry.attempt >= maxRetries) {
      await this.queueService.markFailed(
        entryId,
        `Validation failed after ${maxRetries} attempts: ${validation.errors.join('; ')}`,
      );
      return { status: 'permanently_failed', errors: validation.errors };
    }

    // Send correction
    await this.queueService.markCorrecting(entryId);
    this.logger.warn({
      event: 'enrichment.correction_needed',
      tenantId: entry.tenantId,
      conceptId: entry.conceptId,
      errors: validation.errors,
      attempt: entry.attempt + 1,
    });

    return {
      status: 'correcting',
      errors: validation.errors,
      correctionMessage: `Article for concept failed validation. Errors: ${validation.errors.join('; ')}. Fix ONLY these issues.`,
    };
  }
}
