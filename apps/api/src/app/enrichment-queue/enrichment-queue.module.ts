import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { EnrichmentQueueService } from './enrichment-queue.service';

@Module({
  imports: [TenantModule],
  providers: [EnrichmentQueueService],
  exports: [EnrichmentQueueService],
})
export class EnrichmentQueueModule {}
