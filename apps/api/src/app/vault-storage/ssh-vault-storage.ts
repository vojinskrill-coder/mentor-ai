import { Logger } from '@nestjs/common';
import { Client } from 'ssh2';
import { VaultStorageBase } from './vault-storage.base';
import { VaultStorageError } from './vault-storage.error';

export interface SshVaultStorageConfig {
  host: string;
  port?: number;
  username: string;
  privateKey?: Buffer | string;
  /** Base path on the remote server (e.g. /root) */
  basePath: string;
}

/**
 * SSH/SFTP-backed VaultStorage.
 *
 * Design decisions:
 *  - writeFiles() opens ONE connection, one SFTP session, writes ALL files, then closes.
 *  - Exec-based helpers (readFile, fileExists, listFiles) each open a short-lived connection
 *    (matches the existing pattern in VaultProvisionerService).
 */
export class SshVaultStorage extends VaultStorageBase {
  private readonly logger = new Logger(SshVaultStorage.name);
  private readonly sshConfig: Record<string, unknown>;

  constructor(private readonly config: SshVaultStorageConfig) {
    super(config.basePath);
    this.sshConfig = {
      host: config.host,
      port: config.port ?? 22,
      username: config.username,
      ...(config.privateKey ? { privateKey: config.privateKey } : {}),
    };
  }

  // ── single-file write (opens one SFTP connection) ──────────────────

  protected async doWriteFile(tenantId: string, fullPath: string, content: string): Promise<void> {
    const files = new Map<string, string>();
    files.set(fullPath, content);
    return this.doWriteFiles(tenantId, files);
  }

  // ── batch write: ONE connection, ONE sftp session ──────────────────

  protected doWriteFiles(tenantId: string, files: Map<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      const conn = new Client();

      conn.on('error', (err) => {
        reject(
          new VaultStorageError(
            `SSH connection failed: ${err.message}`,
            tenantId,
            '',
            'writeFiles',
            err,
          ),
        );
      });

      conn.on('ready', () => {
        // Collect all parent directories and ensure they exist first
        const dirs = new Set<string>();
        for (const fullPath of files.keys()) {
          const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
          if (dir) dirs.add(dir);
        }

        const mkdirCmd = dirs.size > 0 ? `mkdir -p ${[...dirs].join(' ')}` : 'true';

        conn.exec(mkdirCmd, (execErr, mkdirStream) => {
          if (execErr) {
            conn.end();
            return reject(
              new VaultStorageError(`mkdir failed: ${execErr.message}`, tenantId, '', 'writeFiles', execErr),
            );
          }

          mkdirStream.on('close', () => {
            // Now open SFTP and write all files
            conn.sftp((sftpErr, sftp) => {
              if (sftpErr) {
                conn.end();
                return reject(
                  new VaultStorageError(`SFTP session failed: ${sftpErr.message}`, tenantId, '', 'writeFiles', sftpErr),
                );
              }

              const entries = [...files.entries()];
              let idx = 0;

              const writeNext = () => {
                if (idx >= entries.length) {
                  sftp.end();
                  conn.end();
                  return resolve();
                }

                const entry = entries[idx++]!;
                const [path, content] = entry;
                const ws = sftp.createWriteStream(path);
                ws.on('close', writeNext);
                ws.on('error', (e: Error) => {
                  sftp.end();
                  conn.end();
                  reject(
                    new VaultStorageError(`Write failed: ${path} — ${e.message}`, tenantId, path, 'writeFiles', e),
                  );
                });
                ws.end(Buffer.from(content, 'utf-8'));
              };

              writeNext();
            });
          });

          // Drain mkdir streams
          mkdirStream.resume();
          mkdirStream.stderr.resume();
        });
      });

      conn.connect(this.sshConfig);
    });
  }

  // ── read via ssh exec cat ──────────────────────────────────────────

  protected async doReadFile(tenantId: string, fullPath: string): Promise<string> {
    try {
      return await this.exec(`cat ${this.shellEscape(fullPath)}`);
    } catch (err) {
      throw new VaultStorageError(
        `Read failed: ${fullPath}`,
        tenantId,
        fullPath,
        'read',
        err instanceof Error ? err : undefined,
      );
    }
  }

  // ── exists via ssh exec test -f ────────────────────────────────────

  protected async doFileExists(tenantId: string, fullPath: string): Promise<boolean> {
    try {
      const result = await this.exec(`test -f ${this.shellEscape(fullPath)} && echo 1 || echo 0`);
      return result.trim() === '1';
    } catch (err) {
      throw new VaultStorageError(
        `Exists check failed: ${fullPath}`,
        tenantId,
        fullPath,
        'exists',
        err instanceof Error ? err : undefined,
      );
    }
  }

  // ── list via ssh exec ls ───────────────────────────────────────────

  protected async doListFiles(tenantId: string, fullPath: string): Promise<string[]> {
    try {
      const result = await this.exec(`ls ${this.shellEscape(fullPath)} 2>/dev/null || true`);
      return result
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    } catch (err) {
      throw new VaultStorageError(
        `List failed: ${fullPath}`,
        tenantId,
        fullPath,
        'list',
        err instanceof Error ? err : undefined,
      );
    }
  }

  // ── mkdir -p via single ssh exec ───────────────────────────────────

  protected async doCreateDirectories(tenantId: string, dirs: string[]): Promise<void> {
    if (dirs.length === 0) return;
    try {
      await this.exec(`mkdir -p ${dirs.map((d) => this.shellEscape(d)).join(' ')}`);
    } catch (err) {
      throw new VaultStorageError(
        `mkdir -p failed`,
        tenantId,
        dirs.join(', '),
        'mkdir',
        err instanceof Error ? err : undefined,
      );
    }
  }

  // ── low-level SSH exec ─────────────────────────────────────────────

  private exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let output = '';

      conn.on('error', reject);

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          stream.on('data', (data: Buffer) => {
            output += data.toString();
          });
          stream.stderr.on('data', (data: Buffer) => {
            this.logger.warn(`[ssh stderr] ${data.toString().trim()}`);
          });
          stream.on('close', (code: number) => {
            conn.end();
            if (code !== 0 && code !== null) {
              return reject(new Error(`SSH command exited with code ${code}: ${command.substring(0, 120)}`));
            }
            resolve(output);
          });
        });
      });

      conn.connect(this.sshConfig);
    });
  }

  /** Minimal shell escaping — wrap in single quotes, escape embedded quotes. */
  private shellEscape(s: string): string {
    return `'${s.replace(/'/g, "'\\''")}'`;
  }
}
