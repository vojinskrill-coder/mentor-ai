import { Logger } from '@nestjs/common';
import { Client, SFTPWrapper } from 'ssh2';
import { VaultStorageBase } from './vault-storage.base';
import { VaultStorageError } from './vault-storage.error';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import * as fs from 'fs';

export class SshVaultStorage extends VaultStorageBase {
  private readonly logger = new Logger(SshVaultStorage.name);

  constructor(private readonly configService: PlatformConfigService) {
    super();
  }

  private getConfig(tenantId: string) {
    return this.configService.getVaultConfig(tenantId);
  }

  private resolvePath(tenantId: string, filePath: string): string {
    this.sanitizePath(tenantId, filePath);
    const config = this.getConfig(tenantId);
    return `${config.tenantPath}/${filePath}`;
  }

  private async withSftp<T>(
    tenantId: string,
    operation: string,
    fn: (sftp: SFTPWrapper) => Promise<T>,
  ): Promise<T> {
    const config = this.getConfig(tenantId);
    const conn = new Client();

    return new Promise<T>((resolve, reject) => {
      conn
        .on('ready', () => {
          conn.sftp((err, sftp) => {
            if (err) {
              conn.end();
              return reject(
                new VaultStorageError(
                  `SFTP session failed: ${err.message}`,
                  tenantId,
                  '',
                  operation,
                  err,
                ),
              );
            }
            fn(sftp)
              .then((result) => {
                conn.end();
                resolve(result);
              })
              .catch((fnErr) => {
                conn.end();
                reject(fnErr);
              });
          });
        })
        .on('error', (err) => {
          reject(
            new VaultStorageError(
              `SSH connection failed: ${err.message}`,
              tenantId,
              '',
              operation,
              err,
            ),
          );
        })
        .connect({
          host: config.sshHost,
          port: config.sshPort,
          username: config.sshUser,
          privateKey: fs.readFileSync(config.sshKeyPath),
        });
    });
  }

  async writeFile(
    tenantId: string,
    filePath: string,
    content: string,
  ): Promise<void> {
    const remotePath = this.resolvePath(tenantId, filePath);
    await this.withSftp(tenantId, 'write', async (sftp) => {
      return new Promise<void>((resolve, reject) => {
        const stream = sftp.createWriteStream(remotePath);
        stream.on('close', () => resolve());
        stream.on('error', (err: Error) =>
          reject(
            new VaultStorageError(
              `Write failed: ${err.message}`,
              tenantId,
              filePath,
              'write',
              err,
            ),
          ),
        );
        stream.end(content);
      });
    });
  }

  async readFile(tenantId: string, filePath: string): Promise<string> {
    const remotePath = this.resolvePath(tenantId, filePath);
    return this.withSftp(tenantId, 'read', async (sftp) => {
      return new Promise<string>((resolve, reject) => {
        let data = '';
        const stream = sftp.createReadStream(remotePath);
        stream.on('data', (chunk: Buffer) => (data += chunk.toString()));
        stream.on('end', () => resolve(data));
        stream.on('error', (err: Error) =>
          reject(
            new VaultStorageError(
              `Read failed: ${err.message}`,
              tenantId,
              filePath,
              'read',
              err,
            ),
          ),
        );
      });
    });
  }

  async fileExists(tenantId: string, filePath: string): Promise<boolean> {
    const remotePath = this.resolvePath(tenantId, filePath);
    try {
      await this.withSftp(tenantId, 'exists', async (sftp) => {
        return new Promise<void>((resolve, reject) => {
          sftp.stat(remotePath, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(tenantId: string, dirPath: string): Promise<string[]> {
    const remotePath = this.resolvePath(tenantId, dirPath);
    return this.withSftp(tenantId, 'list', async (sftp) => {
      return new Promise<string[]>((resolve, reject) => {
        sftp.readdir(remotePath, (err, list) => {
          if (err)
            return reject(
              new VaultStorageError(
                `List failed: ${err.message}`,
                tenantId,
                dirPath,
                'list',
                err,
              ),
            );
          resolve(list.map((item) => item.filename));
        });
      });
    });
  }

  async writeFiles(
    tenantId: string,
    files: Array<{ path: string; content: string }>,
  ): Promise<void> {
    // Single SSH connection for batch writes
    const config = this.getConfig(tenantId);
    const conn = new Client();

    return new Promise<void>((resolve, reject) => {
      conn
        .on('ready', () => {
          conn.sftp(async (err, sftp) => {
            if (err) {
              conn.end();
              return reject(
                new VaultStorageError(
                  `SFTP session failed: ${err.message}`,
                  tenantId,
                  '',
                  'writeFiles',
                  err,
                ),
              );
            }
            try {
              for (const file of files) {
                const remotePath = this.resolvePath(tenantId, file.path);
                await new Promise<void>((res, rej) => {
                  const stream = sftp.createWriteStream(remotePath);
                  stream.on('close', () => res());
                  stream.on('error', (e: Error) => rej(e));
                  stream.end(file.content);
                });
              }
              conn.end();
              resolve();
            } catch (writeErr) {
              conn.end();
              reject(writeErr);
            }
          });
        })
        .on('error', (connErr) => {
          reject(
            new VaultStorageError(
              `SSH connection failed: ${connErr.message}`,
              tenantId,
              '',
              'writeFiles',
              connErr,
            ),
          );
        })
        .connect({
          host: config.sshHost,
          port: config.sshPort,
          username: config.sshUser,
          privateKey: fs.readFileSync(config.sshKeyPath),
        });
    });
  }

  async createDirectories(tenantId: string, dirs: string[]): Promise<void> {
    for (const dir of dirs) {
      this.sanitizePath(tenantId, dir);
      const config = this.getConfig(tenantId);
      const remotePath = `${config.tenantPath}/${dir}`;
      await this.withSftp(tenantId, 'mkdir', async (sftp) => {
        return new Promise<void>((resolve, reject) => {
          sftp.mkdir(remotePath, (err) => {
            if (err && (err as any).code !== 4) {
              // code 4 = already exists
              return reject(
                new VaultStorageError(
                  `mkdir failed: ${err.message}`,
                  tenantId,
                  dir,
                  'mkdir',
                  err,
                ),
              );
            }
            resolve();
          });
        });
      });
    }
  }
}
