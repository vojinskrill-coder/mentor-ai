import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { EmailService } from '@mentor-ai/shared/email';

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockEmailService = {
  sendRemovalNotificationEmail: jest.fn(),
  sendBackupOwnerDesignationEmail: jest.fn(),
  sendRecoveryNotificationEmail: jest.fn(),
};

const TENANT_ID = 'tnt_123';
const OWNER_ID = 'usr_owner1';
const MEMBER_ID = 'usr_member1';

describe('TeamService', () => {
  let service: TeamService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<TeamService>(TeamService);

    jest.clearAllMocks();
  });

  describe('getTeamMembers', () => {
    it('should return active users for tenant ordered by createdAt asc', async () => {
      const mockUsers = [
        {
          id: OWNER_ID,
          email: 'owner@test.com',
          name: 'Owner',
          role: 'TENANT_OWNER',
          createdAt: new Date('2024-01-01'),
          invitationAccepted: { department: 'TECHNOLOGY' },
        },
        {
          id: MEMBER_ID,
          email: 'member@test.com',
          name: 'Member',
          role: 'MEMBER',
          createdAt: new Date('2024-02-01'),
          invitationAccepted: null,
        },
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.getTeamMembers(TENANT_ID);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: OWNER_ID,
        email: 'owner@test.com',
        name: 'Owner',
        role: 'TENANT_OWNER',
        department: 'TECHNOLOGY',
        createdAt: new Date('2024-01-01'),
      });
      expect(result[1]?.department).toBeNull();

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, isActive: true },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          invitationAccepted: { select: { department: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should return empty array when no active users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.getTeamMembers(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  describe('getMemberById', () => {
    it('should return a single active member', async () => {
      const mockUser = {
        id: MEMBER_ID,
        email: 'member@test.com',
        name: 'Member',
        role: 'MEMBER',
        createdAt: new Date('2024-02-01'),
        invitationAccepted: { department: 'FINANCE' },
      };

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.getMemberById(MEMBER_ID, TENANT_ID);

      expect(result.id).toBe(MEMBER_ID);
      expect(result.department).toBe('FINANCE');
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: MEMBER_ID, tenantId: TENANT_ID, isActive: true },
        select: expect.objectContaining({ id: true, email: true }),
      });
    });

    it('should throw NotFoundException when member not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.getMemberById('usr_nonexistent', TENANT_ID)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMember', () => {
    const mockMember = {
      id: MEMBER_ID,
      email: 'member@test.com',
      name: 'Member',
      role: 'MEMBER',
    };

    beforeEach(() => {
      mockPrisma.user.findFirst.mockResolvedValue(mockMember);
      mockPrisma.user.findUnique.mockResolvedValue({
        email: 'owner@test.com',
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'Test Tenant' });
      mockEmailService.sendRemovalNotificationEmail.mockResolvedValue({
        success: true,
      });
      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<void>) => {
        return cb(mockPrisma);
      });
    });

    it('should soft delete member with REASSIGN strategy', async () => {
      const result = await service.removeMember(
        MEMBER_ID,
        TENANT_ID,
        OWNER_ID,
        'REASSIGN'
      );

      expect(result).toEqual({
        removedUserId: MEMBER_ID,
        strategy: 'REASSIGN',
      });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: MEMBER_ID },
        data: {
          isActive: false,
          removedAt: expect.any(Date),
          removedById: OWNER_ID,
          removalReason: 'REASSIGN',
        },
      });
    });

    it('should soft delete member with ARCHIVE strategy', async () => {
      const result = await service.removeMember(
        MEMBER_ID,
        TENANT_ID,
        OWNER_ID,
        'ARCHIVE'
      );

      expect(result).toEqual({
        removedUserId: MEMBER_ID,
        strategy: 'ARCHIVE',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: MEMBER_ID },
        data: expect.objectContaining({
          isActive: false,
          removalReason: 'ARCHIVE',
        }),
      });
    });

    it('should send removal notification email after transaction', async () => {
      await service.removeMember(MEMBER_ID, TENANT_ID, OWNER_ID, 'REASSIGN');

      expect(
        mockEmailService.sendRemovalNotificationEmail
      ).toHaveBeenCalledWith({
        to: 'member@test.com',
        memberName: 'Member',
        tenantName: 'Test Tenant',
        strategy: 'REASSIGN',
        contactEmail: 'owner@test.com',
      });
    });

    it('should log warning but not throw when email fails', async () => {
      mockEmailService.sendRemovalNotificationEmail.mockResolvedValue({
        success: false,
      });

      // Should not throw
      const result = await service.removeMember(
        MEMBER_ID,
        TENANT_ID,
        OWNER_ID,
        'REASSIGN'
      );

      expect(result.removedUserId).toBe(MEMBER_ID);
    });

    it('should throw NotFoundException when member does not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.removeMember('usr_nonexistent', TENANT_ID, OWNER_ID, 'REASSIGN')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for self-removal when only owner', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: OWNER_ID,
        email: 'owner@test.com',
        name: 'Owner',
        role: 'TENANT_OWNER',
      });
      mockPrisma.user.count.mockResolvedValue(1);

      await expect(
        service.removeMember(OWNER_ID, TENANT_ID, OWNER_ID, 'REASSIGN')
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.user.count).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          role: 'TENANT_OWNER',
          isActive: true,
        },
      });
    });

    it('should use $transaction for atomicity', async () => {
      await service.removeMember(MEMBER_ID, TENANT_ID, OWNER_ID, 'ARCHIVE');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should throw NotFoundException when member belongs to different tenant', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.removeMember(MEMBER_ID, 'tnt_other', OWNER_ID, 'REASSIGN')
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow self-removal when multiple owners exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: OWNER_ID,
        email: 'owner@test.com',
        name: 'Owner',
        role: 'TENANT_OWNER',
      });
      mockPrisma.user.count.mockResolvedValue(2);

      const result = await service.removeMember(
        OWNER_ID,
        TENANT_ID,
        OWNER_ID,
        'REASSIGN'
      );

      expect(result.removedUserId).toBe(OWNER_ID);
      expect(mockPrisma.user.count).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          role: 'TENANT_OWNER',
          isActive: true,
        },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('getBackupOwner', () => {
    it('should return backup owner when designated and active', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        backupOwner: {
          id: MEMBER_ID,
          email: 'member@test.com',
          name: 'Member',
          isActive: true,
        },
        backupOwnerDesignatedAt: new Date('2024-06-01'),
      });

      const result = await service.getBackupOwner(TENANT_ID);

      expect(result).toEqual({
        id: MEMBER_ID,
        email: 'member@test.com',
        name: 'Member',
        designatedAt: new Date('2024-06-01').toISOString(),
      });
    });

    it('should return null when no backup owner designated', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        backupOwner: null,
        backupOwnerDesignatedAt: null,
      });

      const result = await service.getBackupOwner(TENANT_ID);

      expect(result).toBeNull();
    });

    it('should return null when backup owner is inactive', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        backupOwner: {
          id: MEMBER_ID,
          email: 'member@test.com',
          name: 'Member',
          isActive: false,
        },
        backupOwnerDesignatedAt: new Date('2024-06-01'),
      });

      const result = await service.getBackupOwner(TENANT_ID);

      expect(result).toBeNull();
    });
  });

  describe('getEligibleBackupOwners', () => {
    it('should return active non-owner members', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        backupOwnerId: null,
      });
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: MEMBER_ID,
          email: 'member@test.com',
          name: 'Member',
          role: 'MEMBER',
          createdAt: new Date(),
          invitationAccepted: { department: 'FINANCE' },
        },
      ]);

      const result = await service.getEligibleBackupOwners(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe('MEMBER');
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            isActive: true,
            role: { not: 'TENANT_OWNER' },
          }),
        })
      );
    });

    it('should exclude current backup owner from eligible list', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        backupOwnerId: MEMBER_ID,
      });
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.getEligibleBackupOwners(TENANT_ID);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: MEMBER_ID },
          }),
        })
      );
    });
  });

  describe('designateBackupOwner', () => {
    const mockCandidate = {
      id: MEMBER_ID,
      email: 'member@test.com',
      name: 'Member',
      role: 'MEMBER',
    };

    beforeEach(() => {
      mockPrisma.user.findFirst.mockResolvedValue(mockCandidate);
      mockPrisma.tenant.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({
        name: 'Owner',
        email: 'owner@test.com',
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'Test Tenant' });
      mockEmailService.sendBackupOwnerDesignationEmail.mockResolvedValue({
        success: true,
      });
      mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => {
        return cb(mockPrisma);
      });
    });

    it('should designate backup owner in transaction and send email', async () => {
      const result = await service.designateBackupOwner(
        TENANT_ID,
        MEMBER_ID,
        OWNER_ID
      );

      expect(result.id).toBe(MEMBER_ID);
      expect(result.email).toBe('member@test.com');
      expect(result.designatedAt).toBeDefined();
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: TENANT_ID },
        data: {
          backupOwnerId: MEMBER_ID,
          backupOwnerDesignatedAt: expect.any(Date),
        },
      });
      expect(
        mockEmailService.sendBackupOwnerDesignationEmail
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'member@test.com',
          tenantName: 'Test Tenant',
        })
      );
    });

    it('should reject TENANT_OWNER as backup owner candidate', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...mockCandidate,
        role: 'TENANT_OWNER',
      });

      await expect(
        service.designateBackupOwner(TENANT_ID, MEMBER_ID, OWNER_ID)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when candidate not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.designateBackupOwner(TENANT_ID, 'usr_nonexistent', OWNER_ID)
      ).rejects.toThrow(NotFoundException);
    });

    it('should not throw when email fails', async () => {
      mockEmailService.sendBackupOwnerDesignationEmail.mockResolvedValue({
        success: false,
      });

      const result = await service.designateBackupOwner(
        TENANT_ID,
        MEMBER_ID,
        OWNER_ID
      );

      expect(result.id).toBe(MEMBER_ID);
    });
  });

  describe('removeBackupDesignation', () => {
    it('should clear backup owner fields', async () => {
      mockPrisma.tenant.update.mockResolvedValue({});

      await service.removeBackupDesignation(TENANT_ID);

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: TENANT_ID },
        data: {
          backupOwnerId: null,
          backupOwnerDesignatedAt: null,
        },
      });
    });
  });

  describe('initiateRecovery', () => {
    const BACKUP_OWNER_ID = 'usr_backup1';

    beforeEach(() => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        backupOwnerId: BACKUP_OWNER_ID,
        name: 'Test Tenant',
        backupOwner: { isActive: true },
      });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: OWNER_ID,
        email: 'owner@test.com',
        name: 'Owner',
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue({
        name: 'Backup Owner',
      });
      mockEmailService.sendRecoveryNotificationEmail.mockResolvedValue({
        success: true,
      });
    });

    it('should reset primary owner 2FA and send notification', async () => {
      const result = await service.initiateRecovery(
        TENANT_ID,
        BACKUP_OWNER_ID,
        '192.168.1.1'
      );

      expect(result.recoveredUserId).toBe(OWNER_ID);
      expect(result.message).toContain('Recovery completed');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: OWNER_ID },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      });
      expect(
        mockEmailService.sendRecoveryNotificationEmail
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@test.com',
          ipAddress: '192.168.1.1',
        })
      );
    });

    it('should throw ForbiddenException when caller is not backup owner', async () => {
      await expect(
        service.initiateRecovery(TENANT_ID, 'usr_random', '192.168.1.1')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when backup owner is inactive', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        backupOwnerId: BACKUP_OWNER_ID,
        name: 'Test Tenant',
        backupOwner: { isActive: false },
      });

      await expect(
        service.initiateRecovery(TENANT_ID, BACKUP_OWNER_ID, '192.168.1.1')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when no primary owner found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.initiateRecovery(TENANT_ID, BACKUP_OWNER_ID, '192.168.1.1')
      ).rejects.toThrow(NotFoundException);
    });

    it('should complete recovery even when notification email fails', async () => {
      mockEmailService.sendRecoveryNotificationEmail.mockResolvedValue({
        success: false,
      });

      const result = await service.initiateRecovery(
        TENANT_ID,
        BACKUP_OWNER_ID,
        '192.168.1.1'
      );

      expect(result.recoveredUserId).toBe(OWNER_ID);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: OWNER_ID },
        data: expect.objectContaining({ mfaEnabled: false }),
      });
    });
  });

  describe('getBackupOwnerStatus', () => {
    it('should return showWarning true when no backup and tenant > 30 days', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);

      mockPrisma.tenant.findUnique.mockResolvedValue({
        createdAt: oldDate,
        backupOwnerId: null,
        backupOwner: null,
      });

      const result = await service.getBackupOwnerStatus(TENANT_ID);

      expect(result.hasBackupOwner).toBe(false);
      expect(result.tenantAgeDays).toBeGreaterThanOrEqual(45);
      expect(result.showWarning).toBe(true);
    });

    it('should return showWarning false when backup owner exists', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);

      mockPrisma.tenant.findUnique.mockResolvedValue({
        createdAt: oldDate,
        backupOwnerId: MEMBER_ID,
        backupOwner: { isActive: true },
      });

      const result = await service.getBackupOwnerStatus(TENANT_ID);

      expect(result.hasBackupOwner).toBe(true);
      expect(result.showWarning).toBe(false);
    });

    it('should return showWarning false when tenant < 30 days', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10);

      mockPrisma.tenant.findUnique.mockResolvedValue({
        createdAt: recentDate,
        backupOwnerId: null,
        backupOwner: null,
      });

      const result = await service.getBackupOwnerStatus(TENANT_ID);

      expect(result.hasBackupOwner).toBe(false);
      expect(result.tenantAgeDays).toBeLessThan(30);
      expect(result.showWarning).toBe(false);
    });

    it('should throw NotFoundException when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.getBackupOwnerStatus(TENANT_ID)
      ).rejects.toThrow(NotFoundException);
    });

    it('should treat inactive backup owner as no backup owner', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);

      mockPrisma.tenant.findUnique.mockResolvedValue({
        createdAt: oldDate,
        backupOwnerId: MEMBER_ID,
        backupOwner: { isActive: false },
      });

      const result = await service.getBackupOwnerStatus(TENANT_ID);

      expect(result.hasBackupOwner).toBe(false);
      expect(result.showWarning).toBe(true);
    });
  });
});
