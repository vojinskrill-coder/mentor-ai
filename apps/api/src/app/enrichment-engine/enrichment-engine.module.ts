import { Module } from '@nestjs/common';
import { EnrichmentQueueModule } from '../enrichment-queue/enrichment-queue.module';
import { VaultStorageModule } from '../vault-storage/vault-storage.module';
import { EnrichmentExecutorService } from './enrichment-executor.service';
import { GuardrailValidationService } from './guardrail-validation.service';
import { QueueProcessorService } from './queue-processor.service';

@Module({
  imports: [EnrichmentQueueModule, VaultStorageModule],
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
