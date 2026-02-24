import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  GoneException,
} from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { EmailService } from '@mentor-ai/shared/email';
import { BrainSeedingService } from '../knowledge/services/brain-seeding.service';
import { InvitationStatus, Department } from '@mentor-ai/shared/prisma';

const mockPrisma = {
  user: { count: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
  invitation: {
    count: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  tenant: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};

const mockEmailService = {
  sendInvitationEmail: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: unknown) => {
    const config: Record<string, unknown> = {
      MAX_TEAM_MEMBERS: 5,
      FRONTEND_URL: 'http://localhost:4200',
    };
    return config[key] ?? defaultValue;
  }),
};

const mockBrainSeedingService = {
  seedPendingTasksForUser: jest.fn().mockResolvedValue([]),
};

describe('InvitationService', () => {
  let service: InvitationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: BrainSeedingService, useValue: mockBrainSeedingService },
      ],
    }).compile();

    service = module.get<InvitationService>(InvitationService);

    jest.clearAllMocks();
  });

  describe('checkUserLimit', () => {
    it('should allow when under limit', async () => {
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.invitation.count.mockResolvedValue(1);

      const result = await service.checkUserLimit('tnt_123');

      expect(result).toEqual({ allowed: true, currentCount: 3, limit: 5 });
    });

    it('should deny when at limit', async () => {
      mockPrisma.user.count.mockResolvedValue(4);
      mockPrisma.invitation.count.mockResolvedValue(1);

      const result = await service.checkUserLimit('tnt_123');

      expect(result).toEqual({ allowed: false, currentCount: 5, limit: 5 });
    });

    it('should deny when over limit', async () => {
      mockPrisma.user.count.mockResolvedValue(5);
      mockPrisma.invitation.count.mockResolvedValue(1);

      const result = await service.checkUserLimit('tnt_123');

      expect(result).toEqual({ allowed: false, currentCount: 6, limit: 5 });
    });
  });

  describe('createInvitation', () => {
    const dto = { email: 'test@example.com', department: Department.TECHNOLOGY };
    const inviterId = 'usr_owner1';
    const tenantId = 'tnt_123';

    beforeEach(() => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.invitation.count.mockResolvedValue(0);
      mockPrisma.invitation.findFirst.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({ name: 'Owner', email: 'owner@test.com' });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'Test Corp' });
      mockPrisma.invitation.create.mockImplementation(({ data }) =>
        Promise.resolve({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );
      mockEmailService.sendInvitationEmail.mockResolvedValue({ success: true });
    });

    it('should create invitation successfully', async () => {
      const result = await service.createInvitation(dto, inviterId, tenantId);

      expect(result.email).toBe('test@example.com');
      expect(result.department).toBe(Department.TECHNOLOGY);
      expect(result.status).toBe(InvitationStatus.PENDING);
      expect(result.id).toMatch(/^inv_/);
      expect(mockEmailService.sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          inviterName: 'Owner',
          tenantName: 'Test Corp',
          department: Department.TECHNOLOGY,
        })
      );
    });

    it('should normalize email to lowercase', async () => {
      const upperDto = { email: 'Test@Example.COM', department: Department.FINANCE };

      await service.createInvitation(upperDto, inviterId, tenantId);

      expect(mockPrisma.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'test@example.com' }),
        })
      );
    });

    it('should throw ForbiddenException when user limit reached', async () => {
      mockPrisma.user.count.mockResolvedValue(4);
      mockPrisma.invitation.count.mockResolvedValue(1);

      await expect(service.createInvitation(dto, inviterId, tenantId)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should throw ConflictException for duplicate pending invitation', async () => {
      mockPrisma.invitation.findFirst.mockResolvedValue({ id: 'inv_existing' });

      await expect(service.createInvitation(dto, inviterId, tenantId)).rejects.toThrow(
        ConflictException
      );
    });

    it('should throw ConflictException when email is already a member', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'usr_existing' });

      await expect(service.createInvitation(dto, inviterId, tenantId)).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('validateInviteToken', () => {
    const validInvitation = {
      id: 'inv_123',
      email: 'test@example.com',
      department: Department.MARKETING,
      role: 'MEMBER',
      status: InvitationStatus.PENDING,
      token: 'valid-token',
      expiresAt: new Date(Date.now() + 86400000), // tomorrow
      tenantId: 'tnt_123',
      invitedById: 'usr_owner',
      acceptedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tenant: { name: 'Test Corp' },
      invitedBy: { email: 'owner@test.com', name: 'Owner' },
    };

    it('should return valid invitation', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(validInvitation);

      const result = await service.validateInviteToken('valid-token');

      expect(result.id).toBe('inv_123');
      expect(result.status).toBe(InvitationStatus.PENDING);
    });

    it('should throw NotFoundException for unknown token', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(null);

      await expect(service.validateInviteToken('bad-token')).rejects.toThrow(NotFoundException);
    });

    it('should throw GoneException for revoked invitation', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue({
        ...validInvitation,
        status: InvitationStatus.REVOKED,
      });

      await expect(service.validateInviteToken('revoked-token')).rejects.toThrow(GoneException);
    });

    it('should throw GoneException for expired invitation', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue({
        ...validInvitation,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() - 86400000), // yesterday
      });
      mockPrisma.invitation.update.mockResolvedValue({});

      await expect(service.validateInviteToken('expired-token')).rejects.toThrow(GoneException);
    });

    it('should throw ConflictException for already accepted invitation', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue({
        ...validInvitation,
        status: InvitationStatus.ACCEPTED,
      });

      await expect(service.validateInviteToken('accepted-token')).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('acceptInvitation', () => {
    it('should accept invitation via transaction', async () => {
      const invitation = {
        id: 'inv_123',
        tenantId: 'tnt_123',
        status: InvitationStatus.PENDING,
        role: 'MEMBER',
        department: Department.OPERATIONS,
        expiresAt: new Date(Date.now() + 86400000),
        token: 'token123',
        tenant: { name: 'Test Corp' },
        invitedBy: { email: 'owner@test.com', name: 'Owner' },
        acceptedByUserId: null,
        email: 'invitee@test.com',
        invitedById: 'usr_owner',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.invitation.findUnique.mockResolvedValue(invitation);

      const txMock = {
        user: {
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({}),
        },
        invitation: { update: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)
      );

      const result = await service.acceptInvitation('token123', 'usr_new', 'invitee@test.com');

      expect(result.tenantId).toBe('tnt_123');
      expect(result.department).toBe(Department.OPERATIONS);
      expect(txMock.user.update).toHaveBeenCalledWith({
        where: { id: 'usr_new' },
        data: {
          tenantId: 'tnt_123',
          role: 'MEMBER',
          department: Department.OPERATIONS,
        },
      });
      expect(txMock.invitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: InvitationStatus.ACCEPTED,
            acceptedByUserId: 'usr_new',
          }),
        })
      );
    });
  });

  describe('revokeInvitation', () => {
    it('should revoke a pending invitation', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue({
        id: 'inv_123',
        tenantId: 'tnt_123',
        status: InvitationStatus.PENDING,
      });
      mockPrisma.invitation.update.mockResolvedValue({});

      await service.revokeInvitation('inv_123', 'tnt_123');

      expect(mockPrisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv_123' },
        data: { status: InvitationStatus.REVOKED },
      });
    });

    it('should throw NotFoundException for unknown invitation', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(null);

      await expect(service.revokeInvitation('inv_unknown', 'tnt_123')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw ForbiddenException for wrong tenant', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue({
        id: 'inv_123',
        tenantId: 'tnt_other',
        status: InvitationStatus.PENDING,
      });

      await expect(service.revokeInvitation('inv_123', 'tnt_123')).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should throw ConflictException for non-pending invitation', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue({
        id: 'inv_123',
        tenantId: 'tnt_123',
        status: InvitationStatus.ACCEPTED,
      });

      await expect(service.revokeInvitation('inv_123', 'tnt_123')).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('getPendingInvitations', () => {
    it('should auto-expire stale invitations and return pending ones', async () => {
      mockPrisma.invitation.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.invitation.findMany.mockResolvedValue([
        { id: 'inv_1', status: InvitationStatus.PENDING },
      ]);

      const result = await service.getPendingInvitations('tnt_123');

      expect(mockPrisma.invitation.updateMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('getInvitationsByTenant', () => {
    it('should return all invitations ordered by createdAt desc', async () => {
      mockPrisma.invitation.findMany.mockResolvedValue([
        { id: 'inv_2', createdAt: new Date() },
        { id: 'inv_1', createdAt: new Date() },
      ]);

      const result = await service.getInvitationsByTenant('tnt_123');

      expect(result).toHaveLength(2);
      expect(mockPrisma.invitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tnt_123' },
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });
});
