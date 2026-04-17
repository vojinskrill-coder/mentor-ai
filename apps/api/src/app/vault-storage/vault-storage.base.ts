import { VaultStorage } from './vault-storage.interface';
import { VaultStorageError } from './vault-storage.error';

export abstract class VaultStorageBase implements VaultStorage {
  protected sanitizePath(tenantId: string, filePath: string): string {
    if (filePath.includes('..')) {
      throw new VaultStorageError(
        'Path traversal detected',
        tenantId,
        filePath,
        'sanitize',
      );
    }
    if (filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath)) {
      throw new VaultStorageError(
        'Absolute paths are not allowed',
        tenantId,
        filePath,
        'sanitize',
      );
    }
    return filePath;
  }

  abstract writeFile(
    tenantId: string,
    filePath: string,
    content: string,
  ): Promise<void>;
  abstract readFile(tenantId: string, filePath: string): Promise<string>;
  abstract fileExists(tenantId: string, filePath: string): Promise<boolean>;
  abstract listFiles(tenantId: string, dirPath: string): Promise<string[]>;
  abstract writeFiles(
    tenantId: string,
    files: Array<{ path: string; content: string }>,
  ): Promise<void>;
  abstract createDirectories(
    tenantId: string,
    dirs: string[],
  ): Promise<void>;
}
