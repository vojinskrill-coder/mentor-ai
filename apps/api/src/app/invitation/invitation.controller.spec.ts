import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { Department, InvitationStatus } from '@mentor-ai/shared/prisma';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';

const mockInvitationService = {
  createInvitation: jest.fn(),
  getInvitationsByTenant: jest.fn(),
  validateInviteToken: jest.fn(),
  acceptInvitation: jest.fn(),
  revokeInvitation: jest.fn(),
};

const mockUser: CurrentUserPayload = {
  userId: 'usr_owner1',
  tenantId: 'tnt_123',
  role: 'TENANT_OWNER',
  email: 'owner@test.com',
  auth0Id: 'auth0|123',
};

describe('InvitationController', () => {
  let controller: InvitationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvitationController],
      providers: [
        { provide: InvitationService, useValue: mockInvitationService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<InvitationController>(InvitationController);

    jest.clearAllMocks();
  });

  describe('createInvitation', () => {
    it('should create invitation and return success', async () => {
      const dto = { email: 'new@test.com', department: Department.FINANCE };
      const invitationResult = {
        id: 'inv_123',
        email: 'new@test.com',
        department: Department.FINANCE,
        status: InvitationStatus.PENDING,
        token: 'token123',
        expiresAt: new Date(),
        tenantId: 'tnt_123',
        invitedById: 'usr_owner1',
        createdAt: new Date(),
      };

      mockInvitationService.createInvitation.mockResolvedValue(invitationResult);

      const result = await controller.createInvitation(dto, mockUser, 'corr_1');

      expect(result.status).toBe('success');
      expect(result.data).toEqual(invitationResult);
      expect(result.correlationId).toBe('corr_1');
      expect(mockInvitationService.createInvitation).toHaveBeenCalledWith(
        dto,
        'usr_owner1',
        'tnt_123'
      );
    });

    it('should omit correlationId when not provided', async () => {
      mockInvitationService.createInvitation.mockResolvedValue({ id: 'inv_123' });

      const result = await controller.createInvitation(
        { email: 'test@test.com', department: Department.MARKETING },
        mockUser,
        undefined
      );

      expect(result.correlationId).toBeUndefined();
    });
  });

  describe('listInvitations', () => {
    it('should return all invitations for tenant', async () => {
      const invitations = [
        { id: 'inv_1', email: 'a@test.com' },
        { id: 'inv_2', email: 'b@test.com' },
      ];
      mockInvitationService.getInvitationsByTenant.mockResolvedValue(invitations);

      const result = await controller.listInvitations(mockUser, 'corr_2');

      expect(result.status).toBe('success');
      expect(result.data).toHaveLength(2);
      expect(mockInvitationService.getInvitationsByTenant).toHaveBeenCalledWith('tnt_123');
    });
  });

  describe('validateToken', () => {
    it('should return invitation details for valid token', async () => {
      const invitation = {
        id: 'inv_123',
        email: 'invitee@test.com',
        department: Department.TECHNOLOGY,
        role: 'MEMBER',
        tenant: { name: 'Test Corp' },
        expiresAt: new Date(),
      };
      mockInvitationService.validateInviteToken.mockResolvedValue(invitation);

      const result = await controller.validateToken('valid-token');

      expect(result.status).toBe('success');
      expect(result.data.tenantName).toBe('Test Corp');
      expect(result.data.department).toBe(Department.TECHNOLOGY);
    });
  });

  describe('acceptInvitation', () => {
    it('should accept invitation and return tenant info', async () => {
      const acceptResult = {
        tenantId: 'tnt_123',
        role: 'MEMBER',
        department: Department.OPERATIONS,
      };
      mockInvitationService.acceptInvitation.mockResolvedValue(acceptResult);

      const result = await controller.acceptInvitation('token123', mockUser, 'corr_3');

      expect(result.status).toBe('success');
      expect(result.data.tenantId).toBe('tnt_123');
      expect(mockInvitationService.acceptInvitation).toHaveBeenCalledWith(
        'token123',
        'usr_owner1',
        'owner@test.com'
      );
    });
  });

  describe('revokeInvitation', () => {
    it('should revoke invitation and return success', async () => {
      mockInvitationService.revokeInvitation.mockResolvedValue(undefined);

      const result = await controller.revokeInvitation('inv_123', mockUser, 'corr_4');

      expect(result.status).toBe('success');
      expect(result.message).toBe('Invitation revoked');
      expect(mockInvitationService.revokeInvitation).toHaveBeenCalledWith(
        'inv_123',
        'tnt_123'
      );
    });
  });
});
