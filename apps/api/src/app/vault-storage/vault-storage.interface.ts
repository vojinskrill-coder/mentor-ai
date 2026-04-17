/**
 * VaultStorage — unified interface for all vault file I/O.
 *
 * Implementations:
 *   - SshVaultStorage  (production — Hetzner relay via ssh2)
 *   - LocalVaultStorage (dev / test — local filesystem)
 */
export interface VaultStorage {
  /** Write a single file (creates parent dirs as needed). */
  writeFile(tenantId: string, path: string, content: string): Promise<void>;

  /** Read a file and return its UTF-8 content. Throws if missing. */
  readFile(tenantId: string, path: string): Promise<string>;

  /** Check whether a file exists at the given path. */
  fileExists(tenantId: string, path: string): Promise<boolean>;

  /** List file names (not full paths) in a directory. */
  listFiles(tenantId: string, dir: string): Promise<string[]>;

  /** Write multiple files in a single batch (one connection for SSH). */
  writeFiles(tenantId: string, files: Map<string, string>): Promise<void>;

  /** Ensure the listed directories exist (mkdir -p semantics). */
  createDirectories(tenantId: string, dirs: string[]): Promise<void>;
}

/** Injection token for the VaultStorage provider. */
export const VAULT_STORAGE = Symbol('VAULT_STORAGE');
