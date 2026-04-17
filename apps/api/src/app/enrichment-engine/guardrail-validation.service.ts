import { Injectable, Inject, Logger } from '@nestjs/common';
import { EnrichmentQueueService } from '../enrichment-queue/enrichment-queue.service';
import { ContentValidationService } from '../content-validation/content-validation.service';
import { VAULT_STORAGE, VaultStorage } from '../vault-storage/vault-storage.interface';
import { PlatformConfigService } from '../platform-config/platform-config.service';

@Injectable()
export class GuardrailValidationService {
  private readonly logger = new Logger(GuardrailValidationService.name);

  constructor(
    private readonly queue: EnrichmentQueueService,
    private readonly contentValidation: ContentValidationService,
    @Inject(VAULT_STORAGE) private readonly vaultStorage: VaultStorage,
    private readonly config: PlatformConfigService,
  ) {}

  async validateAndComplete(
    entryId: string,
    slug: string,
  ): Promise<boolean> {
    const entry = await this.queue.getEntry(entryId);
    if (!entry) {
      this.logger.error(`Entry ${entryId} not found`);
      return false;
    }

    const enrichmentConfig = this.config.getEnrichmentConfig();
    const maxCorrections = enrichmentConfig.maxRetries;

    try {
      // Read content from vault
      const content = await this.vaultStorage.readFile(
        entry.tenantId,
        `concepts/${slug}.md`,
      );

      // Validate content
      const validation = this.contentValidation.validateContent(content, {
        minWords: enrichmentConfig.minWords,
        minChars: enrichmentConfig.minChars,
        requireDiacritics: enrichmentConfig.requireDiacritics,
        requireFrontmatter: enrichmentConfig.requireFrontmatter,
        requireSources: enrichmentConfig.requireSources,
      });

      if (validation.valid) {
        await this.queue.markCompleted(entryId);
        this.logger.log(`Entry ${entryId} (${slug}) passed validation`);
        return true;
      }

      // Content failed validation — enter correction loop
      this.logger.warn(
        `Entry ${entryId} (${slug}) failed validation: ${validation.errors.join(', ')}`,
      );

      if (entry.retryCount >= maxCorrections) {
        await this.queue.markFailed(
          entryId,
          `Max corrections reached. Errors: ${validation.errors.join('; ')}`,
        );
        return false;
      }

      // Transition to CORRECTING
      await this.queue.markCorrecting(entryId);

      // In production, this would call the relay for self-correction
      // For now, mark back to VALIDATING after correction attempt
      await this.queue.markBackToValidating(entryId);

      return false; // Will be re-validated on next cycle
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Validation failed for ${entryId}: ${msg}`);
      await this.queue.markFailed(entryId, msg).catch(() => {});
      return false;
    }
  }
}
