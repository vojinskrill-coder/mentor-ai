import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { TenantDeletionController } from './tenant-deletion.controller';
import { TenantDeletionService } from './tenant-deletion.service';
import { DeletionThrottlerGuard } from './guards/deletion-throttler.guard';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import type { TenantDeletionStatusResponse, TenantStatus } from '@mentor-ai/shared/types';

const mockTenantDeletionService = {
  requestDeletion: jest.fn(),
  cancelDeletion: jest.fn(),
  getDeletionStatus: jest.fn(),
};

const mockAuthService = {
  getMfaStatus: jest.fn().mockResolvedValue({ enabled: true }),
};

const mockUser: CurrentUserPayload = {
  userId: 'usr_test_owner',
  email: 'owner@test.com',
  tenantId: 'tnt_test1',
  role: 'TENANT_OWNER',
  auth0Id: 'auth0|test123',
  department: null,
};

describe('TenantDeletionController', () => {
  let controller: TenantDeletionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'deletion-daily', ttl: 86400000, limit: 3 }])],
      controllers: [TenantDeletionController],
      providers: [
        { provide: TenantDeletionService, useValue: mockTenantDeletionService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        DeletionThrottlerGuard,
      ],
    }).compile();

    controller = module.get<TenantDeletionController>(TenantDeletionController);
    jest.clearAllMocks();
  });

  describe('requestDeletion', () => {
    it('should initiate deletion and return response with message', async () => {
      const deletionStatus: TenantDeletionStatusResponse = {
        status: 'PENDING_DELETION' as TenantStatus,
        requestedAt: new Date().toISOString(),
        gracePeriodEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        estimatedCompletionBy: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        canCancel: true,
      };
      mockTenantDeletionService.requestDeletion.mockResolvedValue(deletionStatus);

      const result = await controller.requestDeletion(mockUser, {
        workspaceName: 'Test Workspace',
      });

      expect(mockTenantDeletionService.requestDeletion).toHaveBeenCalledWith(
        mockUser.userId,
        mockUser.tenantId,
        'Test Workspace'
      );
      expect(result.data).toEqual(deletionStatus);
      expect(result.message).toContain('7 days to cancel');
    });
  });

  describe('cancelDeletion', () => {
    it('should cancel deletion and return response with message', async () => {
      const deletionStatus: TenantDeletionStatusResponse = {
        status: 'ACTIVE' as TenantStatus,
        requestedAt: null,
        gracePeriodEndsAt: null,
        estimatedCompletionBy: null,
        canCancel: false,
      };
      mockTenantDeletionService.cancelDeletion.mockResolvedValue(deletionStatus);

      const result = await controller.cancelDeletion(mockUser);

      expect(mockTenantDeletionService.cancelDeletion).toHaveBeenCalledWith(
        mockUser.userId,
        mockUser.tenantId
      );
      expect(result.data).toEqual(deletionStatus);
      expect(result.message).toContain('cancelled');
    });
  });

  describe('getDeletionStatus', () => {
    it('should return current deletion status', async () => {
      const deletionStatus: TenantDeletionStatusResponse = {
        status: 'PENDING_DELETION' as TenantStatus,
        requestedAt: new Date().toISOString(),
        gracePeriodEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        estimatedCompletionBy: new Date(Date.now() + 26 * 24 * 60 * 60 * 1000).toISOString(),
        canCancel: true,
      };
      mockTenantDeletionService.getDeletionStatus.mockResolvedValue(deletionStatus);

      const result = await controller.getDeletionStatus(mockUser);

      expect(mockTenantDeletionService.getDeletionStatus).toHaveBeenCalledWith(mockUser.tenantId);
      expect(result.data).toEqual(deletionStatus);
    });

    it('should return ACTIVE status for non-pending tenant', async () => {
      const deletionStatus: TenantDeletionStatusResponse = {
        status: 'ACTIVE' as TenantStatus,
        requestedAt: null,
        gracePeriodEndsAt: null,
        estimatedCompletionBy: null,
        canCancel: false,
      };
      mockTenantDeletionService.getDeletionStatus.mockResolvedValue(deletionStatus);

      const result = await controller.getDeletionStatus(mockUser);

      expect(result.data.status).toBe('ACTIVE');
      expect(result.data.canCancel).toBe(false);
    });
  });
});
