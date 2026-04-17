import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { ConsistencyCheckService } from './consistency-check.service';
import { VaultStorageModule } from '../vault-storage/vault-storage.module';

@Module({
  imports: [TenantModule, VaultStorageModule],
  providers: [ConsistencyCheckService],
  exports: [ConsistencyCheckService],
})
export class SystemValidationModule {}
