import * as fs from 'fs/promises';
import * as path from 'path';
import { VaultStorageBase } from './vault-storage.base';
import { VaultStorageError } from './vault-storage.error';

export class LocalVaultStorage extends VaultStorageBase {
  constructor(private readonly basePath: string) {
    super();
  }

  private resolvePath(tenantId: string, filePath: string): string {
    this.sanitizePath(tenantId, filePath);
    return path.join(this.basePath, tenantId, filePath);
  }

  async writeFile(
    tenantId: string,
    filePath: string,
    content: string,
  ): Promise<void> {
    try {
      const fullPath = this.resolvePath(tenantId, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    } catch (err) {
      if (err instanceof VaultStorageError) throw err;
      throw new VaultStorageError(
        `Failed to write file: ${(err as Error).message}`,
        tenantId,
        filePath,
        'write',
        err as Error,
      );
    }
  }

  async readFile(tenantId: string, filePath: string): Promise<string> {
    try {
      const fullPath = this.resolvePath(tenantId, filePath);
      return await fs.readFile(fullPath, 'utf-8');
    } catch (err) {
      if (err instanceof VaultStorageError) throw err;
      throw new VaultStorageError(
        `Failed to read file: ${(err as Error).message}`,
        tenantId,
        filePath,
        'read',
        err as Error,
      );
    }
  }

  async fileExists(tenantId: string, filePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(tenantId, filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(tenantId: string, dirPath: string): Promise<string[]> {
    try {
      const fullPath = this.resolvePath(tenantId, dirPath);
      const entries = await fs.readdir(fullPath);
      return entries;
    } catch (err) {
      if (err instanceof VaultStorageError) throw err;
      throw new VaultStorageError(
        `Failed to list files: ${(err as Error).message}`,
        tenantId,
        dirPath,
        'list',
        err as Error,
      );
    }
  }

  async writeFiles(
    tenantId: string,
    files: Array<{ path: string; content: string }>,
  ): Promise<void> {
    for (const file of files) {
      await this.writeFile(tenantId, file.path, file.content);
    }
  }

  async createDirectories(tenantId: string, dirs: string[]): Promise<void> {
    for (const dir of dirs) {
      this.sanitizePath(tenantId, dir);
      const fullPath = path.join(this.basePath, tenantId, dir);
      await fs.mkdir(fullPath, { recursive: true });
    }
  }
}
