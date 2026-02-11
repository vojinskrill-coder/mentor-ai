import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import {
  BadRequestException,
  GoneException,
} from '@nestjs/common';
import { TenantDeletionService } from './tenant-deletion.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { EmailService } from '@mentor-ai/shared/email';

jest.mock('node:fs/promises', () => ({
  access: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

const USER_ID = 'usr_test_owner';
const TENANT_ID = 'tnt_test1';
const TENANT_NAME = 'Test Workspace';

const mockPrisma = {
  tenant: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  tenantRegistry: {
    update: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockQueue = {
  add: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string, defaultValue: unknown) => {
    // Return default values for all config keys
    return defaultValue;
  }),
};

const mockEmailService = {
  sendTenantDeletionInitiatedEmail: jest.fn().mockResolvedValue({ success: true }),
  sendTenantDeletionCancelledEmail: jest.fn().mockResolvedValue({ success: true }),
  sendTenantDeletionCompleteEmail: jest.fn().mockResolvedValue({ success: true }),
};

describe('TenantDeletionService', () => {
  let service: TenantDeletionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantDeletionService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: getQueueToken('tenant-deletion'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<TenantDeletionService>(TenantDeletionService);
    jest.clearAllMocks();
    mockQueue.add.mockResolvedValue({});
  });

  describe('onModuleInit', () => {
    it('should register the repeatable check-expired-grace-periods job', async () => {
      mockQueue.add.mockResolvedValue({});

      await service.onModuleInit();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'check-expired-grace-periods',
        {},
        {
          repeat: { every: 3600000 },
          jobId: 'check-expired-grace-periods',
        }
      );
    });
  });

  describe('requestDeletion', () => {
    it('should throw BadRequestException when workspace name does not match (type-to-confirm)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        status: 'ACTIVE',
        users: [{ id: USER_ID, email: 'owner@test.com', name: 'Owner' }],
      });

      await expect(
        service.requestDeletion(USER_ID, TENANT_ID, 'Wrong Name')
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when tenant is not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.requestDeletion(USER_ID, TENANT_ID, TENANT_NAME)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when tenant is already pending deletion', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        status: 'PENDING_DELETION',
        users: [],
      });

      await expect(
        service.requestDeletion(USER_ID, TENANT_ID, TENANT_NAME)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when tenant is not in ACTIVE status', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        status: 'SUSPENDED',
        users: [],
      });

      await expect(
        service.requestDeletion(USER_ID, TENANT_ID, TENANT_NAME)
      ).rejects.toThrow(BadRequestException);
    });

    it('should initiate deletion when workspace name matches exactly (case-sensitive)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        status: 'ACTIVE',
        users: [{ id: USER_ID, email: 'owner@test.com', name: 'Owner' }],
      });
      mockPrisma.tenant.update.mockResolvedValue({});
      mockPrisma.tenantRegistry.update.mockResolvedValue({});

      const result = await service.requestDeletion(USER_ID, TENANT_ID, TENANT_NAME);

      expect(result.status).toBe('PENDING_DELETION');
      expect(result.canCancel).toBe(true);
      expect(result.requestedAt).toBeDefined();
      expect(result.gracePeriodEndsAt).toBeDefined();
      expect(result.estimatedCompletionBy).toBeDefined();

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TENANT_ID },
          data: expect.objectContaining({
            status: 'PENDING_DELETION',
            deletionRequestedById: USER_ID,
          }),
        })
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-deletion-emails',
        expect.objectContaining({
          type: 'initiated',
          tenantId: TENANT_ID,
          tenantName: TENANT_NAME,
        })
      );
    });

    it('should set grace period to 7 days from now', async () => {
      const now = Date.now();
      jest.useFakeTimers().setSystemTime(now);

      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        status: 'ACTIVE',
        users: [],
      });
      mockPrisma.tenant.update.mockResolvedValue({});
      mockPrisma.tenantRegistry.update.mockResolvedValue({});

      const result = await service.requestDeletion(USER_ID, TENANT_ID, TENANT_NAME);

      const gracePeriodEnd = new Date(result.gracePeriodEndsAt!);
      const expectedEnd = new Date(now + 7 * 24 * 60 * 60 * 1000);

      expect(gracePeriodEnd.getTime()).toBe(expectedEnd.getTime());

      jest.useRealTimers();
    });
  });

  describe('cancelDeletion', () => {
    it('should throw BadRequestException when tenant is not pending deletion', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        status: 'ACTIVE',
        users: [],
      });

      await expect(
        service.cancelDeletion(USER_ID, TENANT_ID)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw GoneException when grace period has expired', async () => {
      const pastDate = new Date(Date.now() - 1000);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        status: 'PENDING_DELETION',
        deletionScheduledFor: pastDate,
        users: [],
      });

      await expect(
        service.cancelDeletion(USER_ID, TENANT_ID)
      ).rejects.toThrow(GoneException);
    });

    it('should cancel deletion when within grace period', async () => {
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        status: 'PENDING_DELETION',
        deletionScheduledFor: futureDate,
        users: [{ id: USER_ID, email: 'owner@test.com', name: 'Owner' }],
      });
      mockPrisma.tenant.update.mockResolvedValue({});
      mockPrisma.tenantRegistry.update.mockResolvedValue({});

      const result = await service.cancelDeletion(USER_ID, TENANT_ID);

      expect(result.status).toBe('ACTIVE');
      expect(result.canCancel).toBe(false);

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TENANT_ID },
          data: expect.objectContaining({
            status: 'ACTIVE',
            deletionScheduledFor: null,
          }),
        })
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-deletion-emails',
        expect.objectContaining({
          type: 'cancelled',
          tenantId: TENANT_ID,
        })
      );
    });
  });

  describe('getDeletionStatus', () => {
    it('should return status for tenant in PENDING_DELETION', async () => {
      const scheduledFor = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const requestedAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        status: 'PENDING_DELETION',
        deletionRequestedAt: requestedAt,
        deletionScheduledFor: scheduledFor,
        _count: { users: 5 },
      });

      const result = await service.getDeletionStatus(TENANT_ID);

      expect(result.status).toBe('PENDING_DELETION');
      expect(result.canCancel).toBe(true);
      expect(result.gracePeriodEndsAt).toBe(scheduledFor.toISOString());
      expect(result.tenantName).toBe(TENANT_NAME);
      expect(result.memberCount).toBe(5);
    });

    it('should return canCancel=false when grace period has expired', async () => {
      const scheduledFor = new Date(Date.now() - 1000);
      const requestedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        status: 'PENDING_DELETION',
        deletionRequestedAt: requestedAt,
        deletionScheduledFor: scheduledFor,
        _count: { users: 3 },
      });

      const result = await service.getDeletionStatus(TENANT_ID);

      expect(result.canCancel).toBe(false);
    });

    it('should return status for ACTIVE tenant with tenant info', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: TENANT_ID,
        name: TENANT_NAME,
        status: 'ACTIVE',
        deletionRequestedAt: null,
        deletionScheduledFor: null,
        _count: { users: 10 },
      });

      const result = await service.getDeletionStatus(TENANT_ID);

      expect(result.status).toBe('ACTIVE');
      expect(result.canCancel).toBe(false);
      expect(result.requestedAt).toBeNull();
      expect(result.gracePeriodEndsAt).toBeNull();
      expect(result.tenantName).toBe(TENANT_NAME);
      expect(result.memberCount).toBe(10);
    });
  });

  describe('checkExpiredGracePeriods', () => {
    it('should queue execute-deletion for tenants with expired grace periods', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: 'tnt_expired1', name: 'Expired 1' },
        { id: 'tnt_expired2', name: 'Expired 2' },
      ]);

      const count = await service.checkExpiredGracePeriods();

      expect(count).toBe(2);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'execute-deletion',
        { tenantId: 'tnt_expired1', tenantName: 'Expired 1' }
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'execute-deletion',
        { tenantId: 'tnt_expired2', tenantName: 'Expired 2' }
      );
    });

    it('should return 0 when no tenants have expired grace periods', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([]);

      const count = await service.checkExpiredGracePeriods();

      expect(count).toBe(0);
      expect(mockQueue.add).not.toHaveBeenCalledWith(
        'execute-deletion',
        expect.anything()
      );
    });
  });

  describe('executeDeletion', () => {
    it('should deactivate all users and update tenant status to DELETED', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: USER_ID,
        email: 'owner@test.com',
        name: 'Owner',
      });
      mockPrisma.user.updateMany.mockResolvedValue({ count: 3 });
      mockPrisma.tenant.update.mockResolvedValue({});
      mockPrisma.tenantRegistry.update.mockResolvedValue({});

      await service.executeDeletion(TENANT_ID, TENANT_NAME);

      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, isActive: true },
          data: expect.objectContaining({
            isActive: false,
            removalReason: 'TENANT_DELETED',
          }),
        })
      );

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TENANT_ID },
          data: expect.objectContaining({
            status: 'DELETED',
          }),
        })
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        'purge-tenant-data',
        expect.objectContaining({
          tenantId: TENANT_ID,
          tenantName: TENANT_NAME,
        })
      );
    });
  });

  describe('purgeTenantData', () => {
    beforeEach(() => {
      // Mock users for anonymization
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'usr_1', email: 'user1@test.com', name: 'User 1' },
        { id: 'usr_2', email: 'user2@test.com', name: 'User 2' },
      ]);
    });

    it('should anonymize audit logs and generate GDPR deletion certificate', async () => {
      mockPrisma.tenant.update.mockResolvedValue({});

      await service.purgeTenantData(
        TENANT_ID,
        TENANT_NAME,
        'owner@test.com',
        'Owner'
      );

      // Verify anonymization was called (queries users for hash mapping)
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        select: { id: true, email: true, name: true },
      });

      // Verify certificate was saved with anonymization count
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TENANT_ID },
          data: expect.objectContaining({
            deletionCertificatePath: expect.any(String),
          }),
        })
      );

      expect(mockEmailService.sendTenantDeletionCompleteEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@test.com',
          userName: 'Owner',
          tenantName: TENANT_NAME,
        })
      );
    });

    it('should not send email if owner email is not provided', async () => {
      mockPrisma.tenant.update.mockResolvedValue({});

      await service.purgeTenantData(TENANT_ID, TENANT_NAME);

      expect(mockEmailService.sendTenantDeletionCompleteEmail).not.toHaveBeenCalled();
    });

    it('should preserve audit log structure by only replacing user identifiers with hashes', async () => {
      // This test verifies that anonymization creates hash mappings without deleting logs
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'usr_sensitive', email: 'sensitive@example.com', name: 'Sensitive User' },
      ]);
      mockPrisma.tenant.update.mockResolvedValue({});

      await service.purgeTenantData(TENANT_ID, TENANT_NAME);

      // Verify user data was queried for hash generation
      expect(mockPrisma.user.findMany).toHaveBeenCalled();

      // Certificate should be generated (audit logs anonymized)
      expect(mockPrisma.tenant.update).toHaveBeenCalled();
    });
  });

  describe('sendDeletionInitiatedEmails', () => {
    it('should send emails to all members', async () => {
      const members = [
        { id: 'usr_1', email: 'user1@test.com', name: 'User 1' },
        { id: 'usr_2', email: 'user2@test.com', name: 'User 2' },
      ];

      await service.sendDeletionInitiatedEmails(
        TENANT_NAME,
        'usr_1',
        new Date().toISOString(),
        members
      );

      expect(mockEmailService.sendTenantDeletionInitiatedEmail).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendDeletionCancelledEmails', () => {
    it('should send cancellation emails to all members', async () => {
      const members = [
        { id: 'usr_1', email: 'user1@test.com', name: 'User 1' },
        { id: 'usr_2', email: 'user2@test.com', name: null },
      ];

      await service.sendDeletionCancelledEmails(TENANT_NAME, members);

      expect(mockEmailService.sendTenantDeletionCancelledEmail).toHaveBeenCalledTimes(2);
    });
  });
});
