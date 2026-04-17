import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { TenantIsolationService } from './tenant-isolation.service';
import { VaultStorageModule } from '../vault-storage/vault-storage.module';

@Module({
  imports: [TenantModule, VaultStorageModule],
  providers: [TenantIsolationService],
  exports: [TenantIsolationService],
})
export class TenantIsolationModule {}
