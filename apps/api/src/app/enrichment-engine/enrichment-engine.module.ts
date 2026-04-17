import { Module } from '@nestjs/common';
import { EnrichmentExecutorService } from './enrichment-executor.service';
import { GuardrailValidationService } from './guardrail-validation.service';
import { QueueProcessorService } from './queue-processor.service';
import { EnrichmentQueueModule } from '../enrichment-queue/enrichment-queue.module';
import { ContentValidationModule } from '../content-validation/content-validation.module';
import { VaultStorageModule } from '../vault-storage/vault-storage.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';

@Module({
  imports: [
    EnrichmentQueueModule,
    ContentValidationModule,
    VaultStorageModule,
    PlatformConfigModule,
  ],
  providers: [
    EnrichmentExecutorService,
    GuardrailValidationService,
    QueueProcessorService,
  ],
  exports: [
    EnrichmentExecutorService,
    GuardrailValidationService,
    QueueProcessorService,
  ],
})
export class EnrichmentEngineModule {}
