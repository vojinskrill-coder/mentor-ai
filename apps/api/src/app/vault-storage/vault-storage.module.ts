import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VAULT_STORAGE } from './vault-storage.interface';
import { createVaultStorage } from './vault-storage.factory';
import { readFileSync } from 'fs';

/**
 * NestJS module that provides the VAULT_STORAGE injection token.
 *
 * Configuration (via environment / ConfigService):
 *   VAULT_STORAGE_BACKEND  — 'ssh' | 'local'  (default: 'local')
 *   HETZNER_HOST           — SSH host
 *   HETZNER_USER           — SSH username      (default: 'root')
 *   HETZNER_SSH_KEY        — path to private key
 *   VAULT_BASE_PATH        — remote base path  (default: '/root')
 */
@Module({
  providers: [
    {
      provide: VAULT_STORAGE,
      useFactory: (configService: ConfigService) => {
        const backend = (configService.get<string>('VAULT_STORAGE_BACKEND') ?? 'local') as 'ssh' | 'local';
        const basePath = configService.get<string>('VAULT_BASE_PATH') ?? '/root';
        const sshKeyPath = configService.get<string>('HETZNER_SSH_KEY') ?? '';

        let privateKey: Buffer | undefined;
        if (backend === 'ssh' && sshKeyPath) {
          try {
            privateKey = readFileSync(sshKeyPath);
          } catch {
            throw new Error(`SSH key not found: ${sshKeyPath}`);
          }
        }

        return createVaultStorage({
          storageBackend: backend,
          basePath,
          ssh:
            backend === 'ssh'
              ? {
                  host: configService.get<string>('HETZNER_HOST') ?? '91.98.231.87',
                  port: 22,
                  username: configService.get<string>('HETZNER_USER') ?? 'root',
                  privateKey,
                }
              : undefined,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [VAULT_STORAGE],
})
export class VaultStorageModule {}
