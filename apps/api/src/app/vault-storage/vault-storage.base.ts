import { VaultStorage } from './vault-storage.interface';
import { VaultStorageError } from './vault-storage.error';

/**
 * Abstract base class for VaultStorage implementations.
 *
 * Provides:
 *  - Path sanitization (rejects `..` segments and absolute paths)
 *  - Full-path resolution against a configured basePath
 */
export abstract class VaultStorageBase implements VaultStorage {
  constructor(protected readonly basePath: string) {}

  // ── public contract (delegated to subclass) ────────────────────────

  async writeFile(tenantId: string, path: string, content: string): Promise<void> {
    this.validatePath(tenantId, path, 'write');
    return this.doWriteFile(tenantId, this.resolve(tenantId, path), content);
  }

  async readFile(tenantId: string, path: string): Promise<string> {
    this.validatePath(tenantId, path, 'read');
    return this.doReadFile(tenantId, this.resolve(tenantId, path));
  }

  async fileExists(tenantId: string, path: string): Promise<boolean> {
    this.validatePath(tenantId, path, 'exists');
    return this.doFileExists(tenantId, this.resolve(tenantId, path));
  }

  async listFiles(tenantId: string, dir: string): Promise<string[]> {
    this.validatePath(tenantId, dir, 'list');
    return this.doListFiles(tenantId, this.resolve(tenantId, dir));
  }

  async writeFiles(tenantId: string, files: Map<string, string>): Promise<void> {
    for (const relPath of files.keys()) {
      this.validatePath(tenantId, relPath, 'writeFiles');
    }
    const resolved = new Map<string, string>();
    for (const [relPath, content] of files) {
      resolved.set(this.resolve(tenantId, relPath), content);
    }
    return this.doWriteFiles(tenantId, resolved);
  }

  async createDirectories(tenantId: string, dirs: string[]): Promise<void> {
    for (const dir of dirs) {
      this.validatePath(tenantId, dir, 'mkdir');
    }
    const resolved = dirs.map((d) => this.resolve(tenantId, d));
    return this.doCreateDirectories(tenantId, resolved);
  }

  // ── path helpers ───────────────────────────────────────────────────

  /**
   * Reject path-traversal attempts and absolute paths.
   */
  protected validatePath(
    tenantId: string,
    path: string,
    operation: 'read' | 'write' | 'exists' | 'list' | 'mkdir' | 'writeFiles',
  ): void {
    if (path.startsWith('/')) {
      throw new VaultStorageError(
        `Absolute paths are not allowed: ${path}`,
        tenantId,
        path,
        operation,
      );
    }
    // Normalise backslashes for Windows callers, then check for traversal
    const normalised = path.replace(/\\/g, '/');
    const segments = normalised.split('/');
    if (segments.some((s) => s === '..')) {
      throw new VaultStorageError(
        `Path traversal detected: ${path}`,
        tenantId,
        path,
        operation,
      );
    }
  }

  /**
   * Build the full path: {basePath}/{tenantId}/vault/{path}
   * Subclasses that need a different layout can override.
   */
  protected resolve(tenantId: string, relPath: string): string {
    return `${this.basePath}/${tenantId}/vault/${relPath}`;
  }

  // ── abstract methods for subclasses ────────────────────────────────

  protected abstract doWriteFile(tenantId: string, fullPath: string, content: string): Promise<void>;
  protected abstract doReadFile(tenantId: string, fullPath: string): Promise<string>;
  protected abstract doFileExists(tenantId: string, fullPath: string): Promise<boolean>;
  protected abstract doListFiles(tenantId: string, fullPath: string): Promise<string[]>;
  protected abstract doWriteFiles(tenantId: string, files: Map<string, string>): Promise<void>;
  protected abstract doCreateDirectories(tenantId: string, dirs: string[]): Promise<void>;
}
