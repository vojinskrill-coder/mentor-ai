import { Module } from '@nestjs/common';
import { VAULT_STORAGE } from './vault-storage.interface';
import { vaultStorageFactory } from './vault-storage.factory';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { PlatformConfigModule } from '../platform-config/platform-config.module';

@Module({
  imports: [PlatformConfigModule],
  providers: [
    {
      provide: VAULT_STORAGE,
      useFactory: (configService: PlatformConfigService) =>
        vaultStorageFactory(configService),
      inject: [PlatformConfigService],
    },
  ],
  exports: [VAULT_STORAGE],
})
export class VaultStorageModule {}
