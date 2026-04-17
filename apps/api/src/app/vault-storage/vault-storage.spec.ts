import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LocalVaultStorage } from './local-vault-storage';
import { VaultStorageError } from './vault-storage.error';
import { vaultStorageFactory } from './vault-storage.factory';
import { PlatformConfigService } from '../platform-config/platform-config.service';

describe('LocalVaultStorage', () => {
  let storage: LocalVaultStorage;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
    storage = new LocalVaultStorage(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should write and read a file', async () => {
    await storage.writeFile('tenant-1', 'test.md', '# Hello');
    const content = await storage.readFile('tenant-1', 'test.md');
    expect(content).toBe('# Hello');
  });

  it('should check file existence', async () => {
    expect(await storage.fileExists('tenant-1', 'nope.md')).toBe(false);
    await storage.writeFile('tenant-1', 'exists.md', 'content');
    expect(await storage.fileExists('tenant-1', 'exists.md')).toBe(true);
  });

  it('should list files in directory', async () => {
    await storage.writeFile('tenant-1', 'dir/a.md', 'a');
    await storage.writeFile('tenant-1', 'dir/b.md', 'b');
    const files = await storage.listFiles('tenant-1', 'dir');
    expect(files.sort()).toEqual(['a.md', 'b.md']);
  });

  it('should write multiple files', async () => {
    await storage.writeFiles('tenant-1', [
      { path: 'f1.md', content: 'file1' },
      { path: 'f2.md', content: 'file2' },
    ]);
    expect(await storage.readFile('tenant-1', 'f1.md')).toBe('file1');
    expect(await storage.readFile('tenant-1', 'f2.md')).toBe('file2');
  });

  it('should create directories', async () => {
    await storage.createDirectories('tenant-1', ['subdir/nested']);
    const dirPath = path.join(tmpDir, 'tenant-1', 'subdir', 'nested');
    expect(fs.existsSync(dirPath)).toBe(true);
  });

  it('should reject path traversal with ..', async () => {
    await expect(
      storage.writeFile('tenant-1', '../escape.md', 'bad'),
    ).rejects.toThrow(VaultStorageError);
  });

  it('should reject absolute paths', async () => {
    await expect(
      storage.writeFile('tenant-1', '/etc/passwd', 'bad'),
    ).rejects.toThrow(VaultStorageError);
  });

  it('should reject Windows absolute paths', async () => {
    await expect(
      storage.writeFile('tenant-1', 'C:\\Windows\\bad.md', 'bad'),
    ).rejects.toThrow(VaultStorageError);
  });

  it('should throw VaultStorageError on read of nonexistent file', async () => {
    await expect(
      storage.readFile('tenant-1', 'missing.md'),
    ).rejects.toThrow(VaultStorageError);
  });

  it('should throw VaultStorageError on list of nonexistent dir', async () => {
    await expect(
      storage.listFiles('tenant-1', 'nodir'),
    ).rejects.toThrow(VaultStorageError);
  });

  it('should create nested directories on write', async () => {
    await storage.writeFile('tenant-1', 'deep/nested/file.md', 'ok');
    const content = await storage.readFile('tenant-1', 'deep/nested/file.md');
    expect(content).toBe('ok');
  });

  it('should isolate tenants', async () => {
    await storage.writeFile('tenant-a', 'secret.md', 'secret-a');
    await storage.writeFile('tenant-b', 'secret.md', 'secret-b');
    const a = await storage.readFile('tenant-a', 'secret.md');
    const b = await storage.readFile('tenant-b', 'secret.md');
    expect(a).toBe('secret-a');
    expect(b).toBe('secret-b');
  });
});

describe('VaultStorageError', () => {
  it('should capture error details', () => {
    const cause = new Error('underlying');
    const err = new VaultStorageError(
      'test error',
      'tenant-1',
      'file.md',
      'write',
      cause,
    );
    expect(err.name).toBe('VaultStorageError');
    expect(err.tenantId).toBe('tenant-1');
    expect(err.path).toBe('file.md');
    expect(err.operation).toBe('write');
    expect(err.cause).toBe(cause);
  });
});

describe('vaultStorageFactory', () => {
  it('should return LocalVaultStorage when mode is local', () => {
    const mockConfig = {
      getVaultConfig: jest.fn().mockReturnValue({
        basePath: '/tmp/test',
        mode: 'local',
      }),
    } as unknown as PlatformConfigService;
    const storage = vaultStorageFactory(mockConfig);
    expect(storage).toBeDefined();
    expect(storage.constructor.name).toBe('LocalVaultStorage');
  });

  it('should return SshVaultStorage when mode is ssh', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const mockConfig = {
      getVaultConfig: jest.fn().mockReturnValue({
        basePath: '/root/.openclaw',
        mode: 'ssh',
        sshHost: 'localhost',
        sshPort: 22,
        sshUser: 'root',
        sshKeyPath: '/tmp/key',
      }),
    } as unknown as PlatformConfigService;
    const storage = vaultStorageFactory(mockConfig);
    expect(storage.constructor.name).toBe('SshVaultStorage');
    process.env.NODE_ENV = originalEnv;
  });

  it('should return LocalVaultStorage in test environment', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const mockConfig = {
      getVaultConfig: jest.fn().mockReturnValue({
        basePath: '/tmp/test',
        mode: 'ssh',
      }),
    } as unknown as PlatformConfigService;
    const storage = vaultStorageFactory(mockConfig);
    expect(storage.constructor.name).toBe('LocalVaultStorage');
    process.env.NODE_ENV = originalEnv;
  });
});
