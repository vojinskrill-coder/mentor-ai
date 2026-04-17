import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { LocalVaultStorage } from './local-vault-storage';
import { SshVaultStorage } from './ssh-vault-storage';
import { VaultStorageError } from './vault-storage.error';
import { createVaultStorage } from './vault-storage.factory';

describe('VaultStorage', () => {
  let tmpDir: string;
  let storage: LocalVaultStorage;
  const tenantId = 'test-tenant-001';

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-test-'));
    storage = new LocalVaultStorage(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── LocalVaultStorage ──────────────────────────────────────────────

  describe('LocalVaultStorage', () => {
    it('should write and read a file round-trip', async () => {
      const content = 'Hello, vault!';
      await storage.writeFile(tenantId, 'docs/readme.txt', content);
      const result = await storage.readFile(tenantId, 'docs/readme.txt');
      expect(result).toBe(content);
    });

    it('should report fileExists=false before write, true after', async () => {
      expect(await storage.fileExists(tenantId, 'nope.txt')).toBe(false);
      await storage.writeFile(tenantId, 'nope.txt', 'now exists');
      expect(await storage.fileExists(tenantId, 'nope.txt')).toBe(true);
    });

    it('should list files in a directory', async () => {
      await storage.writeFile(tenantId, 'wiki/a.md', 'aaa');
      await storage.writeFile(tenantId, 'wiki/b.md', 'bbb');
      await storage.writeFile(tenantId, 'wiki/c.md', 'ccc');
      const files = await storage.listFiles(tenantId, 'wiki');
      expect(files.sort()).toEqual(['a.md', 'b.md', 'c.md']);
    });

    it('should return empty array for listFiles on non-existent dir', async () => {
      const files = await storage.listFiles(tenantId, 'nonexistent');
      expect(files).toEqual([]);
    });

    it('should write multiple files via writeFiles', async () => {
      const fileMap = new Map<string, string>();
      fileMap.set('batch/one.txt', 'first');
      fileMap.set('batch/two.txt', 'second');
      fileMap.set('other/three.txt', 'third');

      await storage.writeFiles(tenantId, fileMap);

      expect(await storage.readFile(tenantId, 'batch/one.txt')).toBe('first');
      expect(await storage.readFile(tenantId, 'batch/two.txt')).toBe('second');
      expect(await storage.readFile(tenantId, 'other/three.txt')).toBe('third');
    });

    it('should create directories', async () => {
      await storage.createDirectories(tenantId, ['alpha/beta', 'gamma']);

      // Verify by writing files into those dirs
      await storage.writeFile(tenantId, 'alpha/beta/test.txt', 'ok');
      expect(await storage.readFile(tenantId, 'alpha/beta/test.txt')).toBe('ok');
    });
  });

  // ── Path sanitisation ──────────────────────────────────────────────

  describe('path sanitisation', () => {
    it('should throw VaultStorageError on path traversal (..)', async () => {
      await expect(storage.readFile(tenantId, '../../secret')).rejects.toThrow(VaultStorageError);
      await expect(storage.readFile(tenantId, '../../secret')).rejects.toThrow(/Path traversal/);
    });

    it('should throw VaultStorageError on absolute path', async () => {
      await expect(storage.readFile(tenantId, '/etc/passwd')).rejects.toThrow(VaultStorageError);
      await expect(storage.readFile(tenantId, '/etc/passwd')).rejects.toThrow(/Absolute paths/);
    });

    it('should throw VaultStorageError on traversal in writeFile', async () => {
      await expect(storage.writeFile(tenantId, '../escape/file.txt', 'bad')).rejects.toThrow(VaultStorageError);
    });

    it('should throw VaultStorageError on absolute path in writeFiles', async () => {
      const files = new Map<string, string>();
      files.set('/tmp/evil.txt', 'bad');
      await expect(storage.writeFiles(tenantId, files)).rejects.toThrow(VaultStorageError);
    });

    it('should throw VaultStorageError on traversal in createDirectories', async () => {
      await expect(storage.createDirectories(tenantId, ['../../root'])).rejects.toThrow(VaultStorageError);
    });
  });

  // ── VaultStorageError structure ────────────────────────────────────

  describe('VaultStorageError', () => {
    it('should carry context fields', () => {
      const cause = new Error('original');
      const err = new VaultStorageError('boom', 'tid', '/p', 'read', cause);
      expect(err.tenantId).toBe('tid');
      expect(err.path).toBe('/p');
      expect(err.operation).toBe('read');
      expect(err.cause).toBe(cause);
      expect(err).toBeInstanceOf(VaultStorageError);
      expect(err).toBeInstanceOf(Error);
    });
  });

  // ── VaultStorageFactory ────────────────────────────────────────────

  describe('createVaultStorage', () => {
    it('should return LocalVaultStorage when backend=local', () => {
      const vs = createVaultStorage({ storageBackend: 'local' });
      expect(vs).toBeInstanceOf(LocalVaultStorage);
    });

    it('should return LocalVaultStorage when NODE_ENV=test regardless of config', () => {
      const original = process.env['NODE_ENV'];
      try {
        process.env['NODE_ENV'] = 'test';
        const vs = createVaultStorage({
          storageBackend: 'ssh',
          ssh: { host: '1.2.3.4', username: 'root' },
        });
        expect(vs).toBeInstanceOf(LocalVaultStorage);
      } finally {
        process.env['NODE_ENV'] = original;
      }
    });

    it('should return SshVaultStorage when backend=ssh and NODE_ENV is not test', () => {
      const original = process.env['NODE_ENV'];
      try {
        process.env['NODE_ENV'] = 'production';
        const vs = createVaultStorage({
          storageBackend: 'ssh',
          ssh: { host: '1.2.3.4', username: 'root' },
          basePath: '/root',
        });
        expect(vs).toBeInstanceOf(SshVaultStorage);
      } finally {
        process.env['NODE_ENV'] = original;
      }
    });

    it('should throw if backend=ssh but no ssh config provided', () => {
      const original = process.env['NODE_ENV'];
      try {
        process.env['NODE_ENV'] = 'production';
        expect(() => createVaultStorage({ storageBackend: 'ssh' })).toThrow(/SSH config is required/);
      } finally {
        process.env['NODE_ENV'] = original;
      }
    });
  });
});
