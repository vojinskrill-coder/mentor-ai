import { Module } from '@nestjs/common';
import { ContentDeliveryService } from './content-delivery.service';
import { VaultStorageModule } from '../vault-storage/vault-storage.module';

@Module({
  imports: [VaultStorageModule],
  providers: [ContentDeliveryService],
  exports: [ContentDeliveryService],
})
export class ContentDeliveryModule {}
