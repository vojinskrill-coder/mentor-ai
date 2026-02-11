import { Test, TestingModule } from '@nestjs/testing';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MfaRequiredGuard } from '../auth/guards/mfa-required.guard';
import { AuthService } from '../auth/auth.service';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';

const mockTeamService = {
  getTeamMembers: jest.fn(),
  removeMember: jest.fn(),
  getMemberById: jest.fn(),
  getBackupOwner: jest.fn(),
  getEligibleBackupOwners: jest.fn(),
  designateBackupOwner: jest.fn(),
  removeBackupDesignation: jest.fn(),
  initiateRecovery: jest.fn(),
  getBackupOwnerStatus: jest.fn(),
};

const mockAuthService = {
  getMfaStatus: jest.fn().mockResolvedValue({ enabled: true }),
};

const mockOwner: CurrentUserPayload = {
  userId: 'usr_owner1',
  tenantId: 'tnt_123',
  role: 'TENANT_OWNER',
  email: 'owner@test.com',
  auth0Id: 'auth0|123',
};

describe('TeamController', () => {
  let controller: TeamController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeamController],
      providers: [
        { provide: TeamService, useValue: mockTeamService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<TeamController>(TeamController);

    jest.clearAllMocks();
  });

  describe('getMembers', () => {
    it('should return success with team members list', async () => {
      const members = [
        {
          id: 'usr_owner1',
          email: 'owner@test.com',
          name: 'Owner',
          role: 'TENANT_OWNER',
          department: null,
          createdAt: new Date(),
        },
        {
          id: 'usr_member1',
          email: 'member@test.com',
          name: 'Member',
          role: 'MEMBER',
          department: 'FINANCE',
          createdAt: new Date(),
        },
      ];

      mockTeamService.getTeamMembers.mockResolvedValue(members);

      const result = await controller.getMembers(mockOwner);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(members);
      expect(mockTeamService.getTeamMembers).toHaveBeenCalledWith('tnt_123');
    });

    it('should include correlationId when provided', async () => {
      mockTeamService.getTeamMembers.mockResolvedValue([]);

      const result = await controller.getMembers(mockOwner, 'corr_123');

      expect(result.correlationId).toBe('corr_123');
    });

    it('should not include correlationId when not provided', async () => {
      mockTeamService.getTeamMembers.mockResolvedValue([]);

      const result = await controller.getMembers(mockOwner);

      expect(result).not.toHaveProperty('correlationId');
    });
  });

  describe('removeMember', () => {
    it('should return success when member removed with REASSIGN', async () => {
      mockTeamService.removeMember.mockResolvedValue({
        removedUserId: 'usr_member1',
        strategy: 'REASSIGN',
      });

      const result = await controller.removeMember(
        'usr_member1',
        { strategy: 'REASSIGN' },
        mockOwner
      );

      expect(result.status).toBe('success');
      expect(result.data).toBeNull();
      expect(result.message).toBe('Member removed');
      expect(mockTeamService.removeMember).toHaveBeenCalledWith(
        'usr_member1',
        'tnt_123',
        'usr_owner1',
        'REASSIGN'
      );
    });

    it('should return success when member removed with ARCHIVE', async () => {
      mockTeamService.removeMember.mockResolvedValue({
        removedUserId: 'usr_member1',
        strategy: 'ARCHIVE',
      });

      const result = await controller.removeMember(
        'usr_member1',
        { strategy: 'ARCHIVE' },
        mockOwner
      );

      expect(result.status).toBe('success');
      expect(result.data).toBeNull();
      expect(result.message).toBe('Member removed');
    });

    it('should propagate ForbiddenException for self-removal', async () => {
      mockTeamService.removeMember.mockRejectedValue(
        new ForbiddenException({
          type: 'self_removal_denied',
          title: 'Cannot Remove Yourself',
          status: 403,
          detail:
            'You cannot remove yourself. Designate a backup Owner first.',
        })
      );

      await expect(
        controller.removeMember(
          'usr_owner1',
          { strategy: 'REASSIGN' },
          mockOwner
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should propagate NotFoundException when member not found', async () => {
      mockTeamService.removeMember.mockRejectedValue(
        new NotFoundException({
          type: 'member_not_found',
          title: 'Member Not Found',
          status: 404,
          detail: 'The specified team member was not found.',
        })
      );

      await expect(
        controller.removeMember(
          'usr_nonexistent',
          { strategy: 'REASSIGN' },
          mockOwner
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('should include correlationId when provided', async () => {
      mockTeamService.removeMember.mockResolvedValue({
        removedUserId: 'usr_member1',
        strategy: 'REASSIGN',
      });

      const result = await controller.removeMember(
        'usr_member1',
        { strategy: 'REASSIGN' },
        mockOwner,
        'corr_456'
      );

      expect(result.correlationId).toBe('corr_456');
    });
  });

  describe('getBackupOwner', () => {
    it('should return current backup owner', async () => {
      const backupOwner = {
        id: 'usr_member1',
        email: 'member@test.com',
        name: 'Member',
        designatedAt: new Date().toISOString(),
      };
      mockTeamService.getBackupOwner.mockResolvedValue(backupOwner);

      const result = await controller.getBackupOwner(mockOwner);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(backupOwner);
      expect(mockTeamService.getBackupOwner).toHaveBeenCalledWith('tnt_123');
    });

    it('should return null data when no backup owner', async () => {
      mockTeamService.getBackupOwner.mockResolvedValue(null);

      const result = await controller.getBackupOwner(mockOwner);

      expect(result.status).toBe('success');
      expect(result.data).toBeNull();
    });
  });

  describe('getEligibleBackupOwners', () => {
    it('should return eligible members list', async () => {
      const eligible = [
        {
          id: 'usr_member1',
          email: 'member@test.com',
          name: 'Member',
          role: 'MEMBER',
          department: 'FINANCE',
          createdAt: new Date(),
        },
      ];
      mockTeamService.getEligibleBackupOwners.mockResolvedValue(eligible);

      const result = await controller.getEligibleBackupOwners(mockOwner);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(eligible);
    });
  });

  describe('designateBackupOwner', () => {
    it('should designate backup owner and return result', async () => {
      const backupOwner = {
        id: 'usr_member1',
        email: 'member@test.com',
        name: 'Member',
        designatedAt: new Date().toISOString(),
      };
      mockTeamService.designateBackupOwner.mockResolvedValue(backupOwner);

      const result = await controller.designateBackupOwner(
        { backupOwnerId: 'usr_member1' },
        mockOwner
      );

      expect(result.status).toBe('success');
      expect(result.data).toEqual(backupOwner);
      expect(result.message).toBe('Backup owner designated');
      expect(mockTeamService.designateBackupOwner).toHaveBeenCalledWith(
        'tnt_123',
        'usr_member1',
        'usr_owner1'
      );
    });

    it('should propagate BadRequestException for invalid candidate', async () => {
      mockTeamService.designateBackupOwner.mockRejectedValue(
        new BadRequestException({
          type: 'invalid_backup_candidate',
          title: 'Invalid Backup Owner Candidate',
          status: 400,
          detail: 'A Tenant Owner cannot be designated as backup owner.',
        })
      );

      await expect(
        controller.designateBackupOwner(
          { backupOwnerId: 'usr_owner1' },
          mockOwner
        )
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeBackupDesignation', () => {
    it('should remove backup designation', async () => {
      mockTeamService.removeBackupDesignation.mockResolvedValue(undefined);

      const result = await controller.removeBackupDesignation(mockOwner);

      expect(result.status).toBe('success');
      expect(result.data).toBeNull();
      expect(result.message).toBe('Backup owner removed');
    });
  });

  describe('initiateRecovery', () => {
    const mockBackupOwner: CurrentUserPayload = {
      userId: 'usr_backup1',
      tenantId: 'tnt_123',
      role: 'ADMIN',
      email: 'backup@test.com',
      auth0Id: 'auth0|456',
    };

    const mockRequest = {
      headers: { 'x-forwarded-for': '10.0.0.1' },
      ip: '127.0.0.1',
    } as unknown as import('express').Request;

    it('should initiate recovery and return result', async () => {
      mockTeamService.initiateRecovery.mockResolvedValue({
        recoveredUserId: 'usr_owner1',
        message: 'Recovery completed. Primary owner 2FA has been reset.',
      });

      const result = await controller.initiateRecovery(
        mockBackupOwner,
        mockRequest
      );

      expect(result.status).toBe('success');
      expect(result.data.recoveredUserId).toBe('usr_owner1');
      expect(mockTeamService.initiateRecovery).toHaveBeenCalledWith(
        'tnt_123',
        'usr_backup1',
        '10.0.0.1'
      );
    });

    it('should use req.ip when x-forwarded-for is absent', async () => {
      const reqNoProxy = {
        headers: {},
        ip: '127.0.0.1',
      } as unknown as import('express').Request;

      mockTeamService.initiateRecovery.mockResolvedValue({
        recoveredUserId: 'usr_owner1',
        message: 'Recovery completed.',
      });

      await controller.initiateRecovery(mockBackupOwner, reqNoProxy);

      expect(mockTeamService.initiateRecovery).toHaveBeenCalledWith(
        'tnt_123',
        'usr_backup1',
        '127.0.0.1'
      );
    });

    it('should propagate ForbiddenException when not backup owner', async () => {
      mockTeamService.initiateRecovery.mockRejectedValue(
        new ForbiddenException({
          type: 'not_backup_owner',
          title: 'Not Authorized',
          status: 403,
          detail:
            'You are not the designated backup owner for this workspace.',
        })
      );

      await expect(
        controller.initiateRecovery(mockBackupOwner, mockRequest)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getBackupOwnerStatus', () => {
    it('should return backup owner status', async () => {
      const status = {
        hasBackupOwner: true,
        tenantAgeDays: 45,
        showWarning: false,
      };
      mockTeamService.getBackupOwnerStatus.mockResolvedValue(status);

      const result = await controller.getBackupOwnerStatus(mockOwner);

      expect(result.status).toBe('success');
      expect(result.data).toEqual(status);
    });

    it('should include correlationId when provided', async () => {
      mockTeamService.getBackupOwnerStatus.mockResolvedValue({
        hasBackupOwner: false,
        tenantAgeDays: 5,
        showWarning: false,
      });

      const result = await controller.getBackupOwnerStatus(
        mockOwner,
        'corr_789'
      );

      expect(result.correlationId).toBe('corr_789');
    });
  });
});
