import { PlatformConfigService } from '../platform-config/platform-config.service';
import { VaultStorage } from './vault-storage.interface';
import { SshVaultStorage } from './ssh-vault-storage';
import { LocalVaultStorage } from './local-vault-storage';

export function vaultStorageFactory(
  configService: PlatformConfigService,
): VaultStorage {
  const isTest = process.env.NODE_ENV === 'test';
  const vaultConfig = configService.getVaultConfig();

  if (isTest || vaultConfig.mode === 'local') {
    return new LocalVaultStorage(vaultConfig.basePath);
  }

  return new SshVaultStorage(configService);
}
