import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { VaultStorageBase } from './vault-storage.base';
import { VaultStorageError } from './vault-storage.error';

/**
 * Local-filesystem VaultStorage for development and testing.
 *
 * File layout: {rootDir}/{tenantId}/vault/{path}
 */
export class LocalVaultStorage extends VaultStorageBase {
  constructor(rootDir?: string) {
    super(rootDir ?? os.tmpdir());
  }

  protected async doWriteFile(tenantId: string, fullPath: string, content: string): Promise<void> {
    try {
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    } catch (err) {
      throw new VaultStorageError(
        `Local write failed: ${fullPath} — ${(err as Error).message}`,
        tenantId,
        fullPath,
        'write',
        err instanceof Error ? err : undefined,
      );
    }
  }

  protected async doReadFile(tenantId: string, fullPath: string): Promise<string> {
    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch (err) {
      throw new VaultStorageError(
        `Local read failed: ${fullPath} — ${(err as Error).message}`,
        tenantId,
        fullPath,
        'read',
        err instanceof Error ? err : undefined,
      );
    }
  }

  protected async doFileExists(tenantId: string, fullPath: string): Promise<boolean> {
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  protected async doListFiles(tenantId: string, fullPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(fullPath);
      return entries;
    } catch (err) {
      // If directory doesn't exist, return empty list (matches `ls ... || true` SSH behaviour)
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw new VaultStorageError(
        `Local list failed: ${fullPath} — ${(err as Error).message}`,
        tenantId,
        fullPath,
        'list',
        err instanceof Error ? err : undefined,
      );
    }
  }

  protected async doWriteFiles(tenantId: string, files: Map<string, string>): Promise<void> {
    for (const [fullPath, content] of files) {
      try {
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
      } catch (err) {
        throw new VaultStorageError(
          `Local batch write failed: ${fullPath} — ${(err as Error).message}`,
          tenantId,
          fullPath,
          'writeFiles',
          err instanceof Error ? err : undefined,
        );
      }
    }
  }

  protected async doCreateDirectories(tenantId: string, dirs: string[]): Promise<void> {
    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (err) {
        throw new VaultStorageError(
          `Local mkdir failed: ${dir} — ${(err as Error).message}`,
          tenantId,
          dir,
          'mkdir',
          err instanceof Error ? err : undefined,
        );
      }
    }
  }
}
