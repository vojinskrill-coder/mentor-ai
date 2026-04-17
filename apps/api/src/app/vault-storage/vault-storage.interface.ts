export const VAULT_STORAGE = Symbol('VAULT_STORAGE');

export interface VaultStorage {
  writeFile(tenantId: string, filePath: string, content: string): Promise<void>;
  readFile(tenantId: string, filePath: string): Promise<string>;
  fileExists(tenantId: string, filePath: string): Promise<boolean>;
  listFiles(tenantId: string, dirPath: string): Promise<string[]>;
  writeFiles(
    tenantId: string,
    files: Array<{ path: string; content: string }>,
  ): Promise<void>;
  createDirectories(tenantId: string, dirs: string[]): Promise<void>;
}
