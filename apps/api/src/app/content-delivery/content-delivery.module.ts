import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { ContentDeliveryService } from './content-delivery.service';
import { VaultStorageModule } from '../vault-storage/vault-storage.module';

@Module({
  imports: [TenantModule, VaultStorageModule],
  providers: [ContentDeliveryService],
  exports: [ContentDeliveryService],
})
export class ContentDeliveryModule {}
