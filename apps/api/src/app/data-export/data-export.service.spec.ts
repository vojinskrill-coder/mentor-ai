import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import {
  NotFoundException,
  ForbiddenException,
  GoneException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { DataExportService } from './data-export.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { EmailService } from '@mentor-ai/shared/email';
import { UserProfileCollector } from './collectors/user-profile.collector';
import { InvitationsCollector } from './collectors/invitations.collector';
import { JsonGenerator } from './generators/json.generator';
import { MarkdownGenerator } from './generators/markdown.generator';
import { PdfGenerator } from './generators/pdf.generator';

jest.mock('node:fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fsMock = require('node:fs') as {
  existsSync: jest.Mock;
  mkdirSync: jest.Mock;
  writeFileSync: jest.Mock;
  readFileSync: jest.Mock;
  unlinkSync: jest.Mock;
};

const USER_ID = 'usr_test1';
const TENANT_ID = 'tnt_test1';

const mockPrisma = {
  dataExport: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  user: { findUnique: jest.fn() },
  tenant: { findUnique: jest.fn() },
};

const mockQueue = {
  add: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue(undefined),
};

const mockEmailService = {
  sendDataExportCompleteEmail: jest.fn().mockResolvedValue({ success: true }),
};

const mockUserProfileCollector = {
  key: 'profile',
  title: 'User Profile',
  collect: jest.fn(),
};

const mockInvitationsCollector = {
  key: 'invitations',
  title: 'Invitation History',
  collect: jest.fn(),
};

const mockJsonGenerator = {
  formatKey: 'JSON',
  mimeType: 'application/json',
  fileExtension: '.json',
  generate: jest.fn(),
};

const mockMarkdownGenerator = {
  formatKey: 'MARKDOWN',
  mimeType: 'text/markdown',
  fileExtension: '.md',
  generate: jest.fn(),
};

const mockPdfGenerator = {
  formatKey: 'PDF',
  mimeType: 'application/pdf',
  fileExtension: '.pdf',
  generate: jest.fn(),
};

describe('DataExportService', () => {
  let service: DataExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataExportService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: getQueueToken('data-export'), useValue: mockQueue },
        { provide: UserProfileCollector, useValue: mockUserProfileCollector },
        { provide: InvitationsCollector, useValue: mockInvitationsCollector },
        { provide: JsonGenerator, useValue: mockJsonGenerator },
        { provide: MarkdownGenerator, useValue: mockMarkdownGenerator },
        { provide: PdfGenerator, useValue: mockPdfGenerator },
      ],
    }).compile();

    service = module.get<DataExportService>(DataExportService);
    jest.clearAllMocks();
    // Re-set default for existsSync after clearAllMocks
    fsMock.existsSync.mockReturnValue(true);
    mockQueue.add.mockResolvedValue({});
  });

  describe('onModuleInit', () => {
    it('should register the repeatable cleanup-expired job', async () => {
      mockQueue.add.mockResolvedValue({});

      await service.onModuleInit();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'cleanup-expired',
        {},
        {
          repeat: { every: 3600000 },
          jobId: 'cleanup-expired-exports',
        }
      );
    });
  });

  describe('requestExport', () => {
    it('should create a pending export and queue a job', async () => {
      const record = {
        id: 'exp_abc123',
        userId: USER_ID,
        tenantId: TENANT_ID,
        format: 'JSON',
        dataTypes: ['all'],
        status: 'PENDING',
        fileSize: null,
        requestedAt: new Date(),
        completedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
      };
      mockPrisma.dataExport.create.mockResolvedValue(record);
      mockQueue.add.mockResolvedValue({});

      const result = await service.requestExport(
        USER_ID,
        TENANT_ID,
        'JSON',
        ['all']
      );

      expect(mockPrisma.dataExport.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          tenantId: TENANT_ID,
          format: 'JSON',
          dataTypes: ['all'],
          status: 'PENDING',
        }),
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'generate-export',
        expect.objectContaining({
          exportId: record.id,
          userId: USER_ID,
          format: 'JSON',
        })
      );
      expect(result.exportId).toBe(record.id);
      expect(result.status).toBe('PENDING');
    });
  });

  describe('getUserExports', () => {
    it('should return exports for the user ordered by date', async () => {
      const exports = [
        {
          id: 'exp_1',
          status: 'COMPLETED',
          format: 'JSON',
          dataTypes: ['all'],
          fileSize: 1024,
          requestedAt: new Date(),
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
        },
        {
          id: 'exp_2',
          status: 'PENDING',
          format: 'PDF',
          dataTypes: ['profile'],
          fileSize: null,
          requestedAt: new Date(),
          completedAt: null,
          expiresAt: new Date(Date.now() + 86400000),
        },
      ];
      mockPrisma.dataExport.findMany.mockResolvedValue(exports);

      const result = await service.getUserExports(USER_ID, TENANT_ID);

      expect(mockPrisma.dataExport.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, tenantId: TENANT_ID },
        orderBy: { requestedAt: 'desc' },
        take: 20,
      });
      expect(result).toHaveLength(2);
      expect(result[0]!.exportId).toBe('exp_1');
      expect(result[0]!.downloadUrl).toContain('/download');
      expect(result[1]!.downloadUrl).toBeNull();
    });
  });

  describe('downloadExport', () => {
    it('should throw NotFoundException when export does not exist', async () => {
      mockPrisma.dataExport.findUnique.mockResolvedValue(null);

      await expect(
        service.downloadExport('exp_missing', USER_ID)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user does not own the export', async () => {
      mockPrisma.dataExport.findUnique.mockResolvedValue({
        id: 'exp_1',
        userId: 'usr_other',
        status: 'COMPLETED',
        filePath: '/some/path',
      });

      await expect(
        service.downloadExport('exp_1', USER_ID)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when export is not completed', async () => {
      mockPrisma.dataExport.findUnique.mockResolvedValue({
        id: 'exp_1',
        userId: USER_ID,
        status: 'PROCESSING',
        filePath: null,
      });

      await expect(
        service.downloadExport('exp_1', USER_ID)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw GoneException when export is expired', async () => {
      mockPrisma.dataExport.findUnique.mockResolvedValue({
        id: 'exp_1',
        userId: USER_ID,
        status: 'COMPLETED',
        filePath: '/some/path',
        expiresAt: new Date(Date.now() - 1000),
        encryptionIv: 'aa',
        encryptionTag: 'bb',
      });

      await expect(
        service.downloadExport('exp_1', USER_ID)
      ).rejects.toThrow(GoneException);
    });
  });

  describe('collectData', () => {
    it('should collect from all collectors when dataTypes includes "all"', async () => {
      const profileSection = {
        key: 'profile',
        title: 'User Profile',
        items: [{ email: 'test@test.com' }],
        itemCount: 1,
      };
      const invSection = {
        key: 'invitations',
        title: 'Invitation History',
        items: [],
        itemCount: 0,
      };
      mockUserProfileCollector.collect.mockResolvedValue(profileSection);
      mockInvitationsCollector.collect.mockResolvedValue(invSection);

      const result = await service.collectData(USER_ID, TENANT_ID, ['all']);

      expect(result).toHaveLength(2);
      expect(mockUserProfileCollector.collect).toHaveBeenCalled();
      expect(mockInvitationsCollector.collect).toHaveBeenCalled();
    });

    it('should collect only from selected collectors', async () => {
      const profileSection = {
        key: 'profile',
        title: 'User Profile',
        items: [{ email: 'test@test.com' }],
        itemCount: 1,
      };
      mockUserProfileCollector.collect.mockResolvedValue(profileSection);

      const result = await service.collectData(USER_ID, TENANT_ID, [
        'profile',
      ]);

      expect(result).toHaveLength(1);
      expect(mockUserProfileCollector.collect).toHaveBeenCalled();
      expect(mockInvitationsCollector.collect).not.toHaveBeenCalled();
    });
  });

  describe('processExport', () => {
    it('should process export, generate file, encrypt, and mark COMPLETED', async () => {
      const section = {
        key: 'profile',
        title: 'User Profile',
        items: [{ email: 'user@test.com' }],
        itemCount: 1,
      };
      mockUserProfileCollector.collect.mockResolvedValue(section);
      mockInvitationsCollector.collect.mockResolvedValue({
        key: 'invitations',
        title: 'Invitation History',
        items: [],
        itemCount: 0,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        name: 'Test User',
        email: 'user@test.com',
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'Test Corp' });
      mockJsonGenerator.generate.mockResolvedValue(
        Buffer.from('{"test":true}')
      );
      mockPrisma.dataExport.update.mockResolvedValue({});

      await service.processExport(
        'exp_123',
        USER_ID,
        TENANT_ID,
        'JSON',
        ['all']
      );

      // Should have been called twice: once for PROCESSING, once for COMPLETED
      expect(mockPrisma.dataExport.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.dataExport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'exp_123' },
          data: { status: 'PROCESSING' },
        })
      );
      expect(mockPrisma.dataExport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'exp_123' },
          data: expect.objectContaining({
            status: 'COMPLETED',
            fileSize: expect.any(Number),
            encryptionIv: expect.any(String),
            encryptionTag: expect.any(String),
          }),
        })
      );
      expect(fsMock.writeFileSync).toHaveBeenCalled();
    });

    it('should send email notification for large exports (>= 100 items)', async () => {
      // Create a section with >= 100 items to trigger email
      const largeItems = Array.from({ length: 100 }, (_, i) => ({
        id: `item_${i}`,
      }));
      mockUserProfileCollector.collect.mockResolvedValue({
        key: 'profile',
        title: 'User Profile',
        items: largeItems,
        itemCount: 100,
      });
      mockInvitationsCollector.collect.mockResolvedValue({
        key: 'invitations',
        title: 'Invitation History',
        items: [],
        itemCount: 0,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        name: 'Test User',
        email: 'user@test.com',
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'Test Corp' });
      mockJsonGenerator.generate.mockResolvedValue(
        Buffer.from('{"test":true}')
      );
      mockPrisma.dataExport.update.mockResolvedValue({});

      await service.processExport(
        'exp_large',
        USER_ID,
        TENANT_ID,
        'JSON',
        ['all']
      );

      expect(mockEmailService.sendDataExportCompleteEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          userName: 'Test User',
          format: 'JSON',
        })
      );
    });

    it('should NOT send email for small exports (< 100 items)', async () => {
      mockUserProfileCollector.collect.mockResolvedValue({
        key: 'profile',
        title: 'User Profile',
        items: [{ email: 'user@test.com' }],
        itemCount: 1,
      });
      mockInvitationsCollector.collect.mockResolvedValue({
        key: 'invitations',
        title: 'Invitation History',
        items: [],
        itemCount: 0,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        name: 'Test User',
        email: 'user@test.com',
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'Test Corp' });
      mockJsonGenerator.generate.mockResolvedValue(
        Buffer.from('{"test":true}')
      );
      mockPrisma.dataExport.update.mockResolvedValue({});

      await service.processExport(
        'exp_small',
        USER_ID,
        TENANT_ID,
        'JSON',
        ['all']
      );

      expect(
        mockEmailService.sendDataExportCompleteEmail
      ).not.toHaveBeenCalled();
    });

    it('should mark export as FAILED on error', async () => {
      mockPrisma.dataExport.update.mockResolvedValue({});
      mockUserProfileCollector.collect.mockRejectedValue(
        new Error('DB connection lost')
      );

      await expect(
        service.processExport('exp_fail', USER_ID, TENANT_ID, 'JSON', ['all'])
      ).rejects.toThrow('DB connection lost');

      expect(mockPrisma.dataExport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            errorMessage: 'DB connection lost',
          }),
        })
      );
    });
  });

  describe('cleanupExpiredExports', () => {
    it('should delete files and mark expired exports as EXPIRED', async () => {
      const expired = [
        { id: 'exp_old1', filePath: '/uploads/exports/exp_old1.enc' },
        { id: 'exp_old2', filePath: '/uploads/exports/exp_old2.enc' },
      ];
      mockPrisma.dataExport.findMany.mockResolvedValue(expired);
      mockPrisma.dataExport.update.mockResolvedValue({});
      fsMock.existsSync.mockReturnValue(true);

      const count = await service.cleanupExpiredExports();

      expect(count).toBe(2);
      expect(fsMock.unlinkSync).toHaveBeenCalledTimes(2);
      expect(mockPrisma.dataExport.update).toHaveBeenCalledTimes(2);
    });

    it('should return 0 when no expired exports exist', async () => {
      mockPrisma.dataExport.findMany.mockResolvedValue([]);

      const count = await service.cleanupExpiredExports();

      expect(count).toBe(0);
    });
  });
});

describe('AES-256-GCM encryption unit test', () => {
  it('should round-trip encrypt and decrypt data', () => {
    const key = crypto
      .createHash('sha256')
      .update('mentor-ai-dev-export-key')
      .digest();
    const iv = crypto.randomBytes(12);
    const data = Buffer.from('Hello, export test!');

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    expect(decrypted.toString()).toBe('Hello, export test!');
  });
});
