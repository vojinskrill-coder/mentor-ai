import { Module } from '@nestjs/common';
import { ConsistencyCheckService } from './consistency-check.service';
import { VaultStorageModule } from '../vault-storage/vault-storage.module';
import { EnrichmentQueueModule } from '../enrichment-queue/enrichment-queue.module';

@Module({
  imports: [VaultStorageModule, EnrichmentQueueModule],
  providers: [ConsistencyCheckService],
  exports: [ConsistencyCheckService],
})
export class SystemValidationModule {}
