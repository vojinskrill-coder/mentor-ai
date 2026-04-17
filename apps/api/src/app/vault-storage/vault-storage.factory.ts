import { SshVaultStorage, SshVaultStorageConfig } from './ssh-vault-storage';
import { LocalVaultStorage } from './local-vault-storage';
import { VaultStorage } from './vault-storage.interface';

export interface VaultStorageFactoryConfig {
  /** 'ssh' or 'local'. Ignored when NODE_ENV === 'test' (always local). */
  storageBackend: 'ssh' | 'local';
  /** SSH connection details (required when storageBackend === 'ssh'). */
  ssh?: Omit<SshVaultStorageConfig, 'basePath'>;
  /** Base path for file storage. Defaults to os.tmpdir() for local. */
  basePath?: string;
}

/**
 * Factory that returns the correct VaultStorage implementation based on config.
 *
 * In test environments (NODE_ENV === 'test'), always returns LocalVaultStorage
 * regardless of `storageBackend` to avoid SSH dependencies in tests.
 */
export function createVaultStorage(config: VaultStorageFactoryConfig): VaultStorage {
  if (process.env['NODE_ENV'] === 'test' || config.storageBackend === 'local') {
    return new LocalVaultStorage(config.basePath);
  }

  if (!config.ssh) {
    throw new Error('SSH config is required when storageBackend is "ssh"');
  }

  return new SshVaultStorage({
    host: config.ssh.host,
    port: config.ssh.port,
    username: config.ssh.username,
    privateKey: config.ssh.privateKey,
    basePath: config.basePath ?? '/root',
  });
}
