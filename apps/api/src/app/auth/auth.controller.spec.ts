import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CurrentUserPayload } from './strategies/jwt.strategy';

// Mock @paralleldrive/cuid2
jest.mock('@paralleldrive/cuid2', () => ({
  createId: jest.fn().mockReturnValue('mockcuid12345678'),
}));

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const mockAuthService = {
    findUserByEmail: jest.fn(),
    linkAuth0Identity: jest.fn(),
    updateTenantStatusToOnboarding: jest.fn(),
    getMfaStatus: jest.fn(),
    getMfaSecret: jest.fn(),
    generateRecoveryCodes: jest.fn(),
    storePendingMfaEnrollment: jest.fn(),
    enableMfa: jest.fn(),
    checkAccountLocked: jest.fn(),
    recordFailedAttempt: jest.fn(),
    resetFailedAttempts: jest.fn(),
    verifyRecoveryCode: jest.fn(),
    getLockoutStatus: jest.fn(),
    unlockAccount: jest.fn(),
  };

  const mockUser: CurrentUserPayload = {
    userId: 'usr_test123',
    email: 'test@example.com',
    auth0Id: 'google-oauth2|123456',
    tenantId: 'tnt_test456',
    role: 'TENANT_OWNER',
  };

  const correlationId = 'corr_test789';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  describe('handleCallback', () => {
    const existingUser = {
      id: 'usr_test123',
      email: 'test@example.com',
      tenantId: 'tnt_test456',
      role: 'TENANT_OWNER',
      auth0Id: null,
      tenant: { status: 'DRAFT' },
    };

    it('should throw UnauthorizedException when user not found', async () => {
      mockAuthService.findUserByEmail.mockResolvedValue(null);

      await expect(
        controller.handleCallback(mockUser, correlationId)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should link Auth0 identity for first-time login', async () => {
      mockAuthService.findUserByEmail.mockResolvedValue(existingUser);
      mockAuthService.linkAuth0Identity.mockResolvedValue(undefined);
      mockAuthService.updateTenantStatusToOnboarding.mockResolvedValue(undefined);
      mockAuthService.getMfaStatus.mockResolvedValue({ enabled: false });

      await controller.handleCallback(mockUser, correlationId);

      expect(mockAuthService.linkAuth0Identity).toHaveBeenCalledWith(
        'usr_test123',
        'google-oauth2|123456'
      );
    });

    it('should update tenant status to ONBOARDING on first OAuth', async () => {
      mockAuthService.findUserByEmail.mockResolvedValue(existingUser);
      mockAuthService.linkAuth0Identity.mockResolvedValue(undefined);
      mockAuthService.updateTenantStatusToOnboarding.mockResolvedValue(undefined);
      mockAuthService.getMfaStatus.mockResolvedValue({ enabled: false });

      await controller.handleCallback(mockUser, correlationId);

      expect(mockAuthService.updateTenantStatusToOnboarding).toHaveBeenCalledWith('tnt_test456');
    });

    it('should not link Auth0 if already linked', async () => {
      const linkedUser = { ...existingUser, auth0Id: 'google-oauth2|existing' };
      mockAuthService.findUserByEmail.mockResolvedValue(linkedUser);
      mockAuthService.getMfaStatus.mockResolvedValue({ enabled: true });

      await controller.handleCallback(mockUser, correlationId);

      expect(mockAuthService.linkAuth0Identity).not.toHaveBeenCalled();
    });

    it('should return requiresMfaSetup true when MFA not enabled', async () => {
      mockAuthService.findUserByEmail.mockResolvedValue({
        ...existingUser,
        auth0Id: 'google-oauth2|123',
      });
      mockAuthService.getMfaStatus.mockResolvedValue({ enabled: false });

      const result = await controller.handleCallback(mockUser, correlationId);

      expect(result.requiresMfaSetup).toBe(true);
      expect(result.message).toContain('Please set up 2FA');
    });

    it('should return requiresMfaSetup false when MFA enabled', async () => {
      mockAuthService.findUserByEmail.mockResolvedValue({
        ...existingUser,
        auth0Id: 'google-oauth2|123',
      });
      mockAuthService.getMfaStatus.mockResolvedValue({ enabled: true });

      const result = await controller.handleCallback(mockUser, correlationId);

      expect(result.requiresMfaSetup).toBe(false);
      expect(result.correlationId).toBe(correlationId);
    });

    it('should include correlationId in response when provided', async () => {
      mockAuthService.findUserByEmail.mockResolvedValue({
        ...existingUser,
        auth0Id: 'google-oauth2|123',
      });
      mockAuthService.getMfaStatus.mockResolvedValue({ enabled: true });

      const result = await controller.handleCallback(mockUser, correlationId);

      expect(result.correlationId).toBe(correlationId);
    });

    it('should not include correlationId when not provided', async () => {
      mockAuthService.findUserByEmail.mockResolvedValue({
        ...existingUser,
        auth0Id: 'google-oauth2|123',
      });
      mockAuthService.getMfaStatus.mockResolvedValue({ enabled: true });

      const result = await controller.handleCallback(mockUser, undefined);

      expect(result.correlationId).toBeUndefined();
    });
  });

  describe('getMfaStatus', () => {
    it('should return MFA status for user', async () => {
      mockAuthService.getMfaStatus.mockResolvedValue({ enabled: true, enrolledAt: new Date() });

      const result = await controller.getMfaStatus(mockUser, correlationId);

      expect(result.enabled).toBe(true);
      expect(result.correlationId).toBe(correlationId);
      expect(mockAuthService.getMfaStatus).toHaveBeenCalledWith('usr_test123');
    });
  });

  describe('enrollMfa', () => {
    it('should throw BadRequestException when MFA already enabled', async () => {
      mockAuthService.getMfaStatus.mockResolvedValue({ enabled: true });

      await expect(
        controller.enrollMfa(mockUser, correlationId)
      ).rejects.toThrow(BadRequestException);
    });

    it('should generate secret, recovery codes, and store them', async () => {
      mockAuthService.getMfaStatus.mockResolvedValue({ enabled: false });
      mockAuthService.generateRecoveryCodes.mockResolvedValue({
        codes: ['CODE1', 'CODE2'],
        hashedCodes: ['hash1', 'hash2'],
      });
      mockAuthService.storePendingMfaEnrollment.mockResolvedValue(undefined);

      const result = await controller.enrollMfa(mockUser, correlationId);

      expect(result.status).toBe('success');
      expect(result.secret).toBeDefined();
      expect(result.recoveryCodes).toEqual(['CODE1', 'CODE2']);
      expect(result.qrCodeDataUrl).toContain('otpauth://totp/');
      expect(result.qrCodeDataUrl).toContain(mockUser.email);
      expect(mockAuthService.storePendingMfaEnrollment).toHaveBeenCalledWith(
        'usr_test123',
        expect.any(String),
        ['hash1', 'hash2']
      );
    });
  });

  describe('verifyMfaEnrollment', () => {
    const validDto = { code: '123456' };

    it('should throw BadRequestException when no secret stored', async () => {
      mockAuthService.getMfaSecret.mockResolvedValue(null);

      await expect(
        controller.verifyMfaEnrollment(mockUser, validDto as any, correlationId)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid code format', async () => {
      mockAuthService.getMfaSecret.mockResolvedValue('MENTORSECRET123');

      await expect(
        controller.verifyMfaEnrollment(mockUser, { code: 'abc' } as any, correlationId)
      ).rejects.toThrow(BadRequestException);
    });

    it('should enable MFA on valid code', async () => {
      mockAuthService.getMfaSecret.mockResolvedValue('MENTORSECRET123');
      mockAuthService.enableMfa.mockResolvedValue(undefined);

      const result = await controller.verifyMfaEnrollment(mockUser, validDto as any, correlationId);

      expect(result.status).toBe('success');
      expect(mockAuthService.enableMfa).toHaveBeenCalledWith('usr_test123');
    });
  });

  describe('verifyLoginTotp', () => {
    const validDto = { code: '123456' };

    it('should check if account is locked first', async () => {
      mockAuthService.checkAccountLocked.mockResolvedValue(undefined);
      mockAuthService.getMfaSecret.mockResolvedValue('MENTORSECRET123');
      mockAuthService.resetFailedAttempts.mockResolvedValue(undefined);

      await controller.verifyLoginTotp(mockUser, validDto as any, correlationId);

      expect(mockAuthService.checkAccountLocked).toHaveBeenCalledWith('usr_test123');
    });

    it('should reject invalid code format', async () => {
      mockAuthService.checkAccountLocked.mockResolvedValue(undefined);
      mockAuthService.getMfaSecret.mockResolvedValue('MENTORSECRET123');
      mockAuthService.recordFailedAttempt.mockResolvedValue({
        locked: false,
        attemptsRemaining: 4,
      });

      await expect(
        controller.verifyLoginTotp(mockUser, { code: 'abc123' } as any, correlationId)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject when no secret stored', async () => {
      mockAuthService.checkAccountLocked.mockResolvedValue(undefined);
      mockAuthService.getMfaSecret.mockResolvedValue(null);
      mockAuthService.recordFailedAttempt.mockResolvedValue({
        locked: false,
        attemptsRemaining: 4,
      });

      await expect(
        controller.verifyLoginTotp(mockUser, validDto as any, correlationId)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reset failed attempts on success', async () => {
      mockAuthService.checkAccountLocked.mockResolvedValue(undefined);
      mockAuthService.getMfaSecret.mockResolvedValue('MENTORSECRET123');
      mockAuthService.resetFailedAttempts.mockResolvedValue(undefined);

      const result = await controller.verifyLoginTotp(mockUser, validDto as any, correlationId);

      expect(result.status).toBe('success');
      expect(mockAuthService.resetFailedAttempts).toHaveBeenCalledWith('usr_test123');
    });

    it('should include lockout info in error when account gets locked', async () => {
      mockAuthService.checkAccountLocked.mockResolvedValue(undefined);
      mockAuthService.getMfaSecret.mockResolvedValue(null);
      const lockoutDate = new Date();
      mockAuthService.recordFailedAttempt.mockResolvedValue({
        locked: true,
        lockoutUntil: lockoutDate,
        attemptsRemaining: 0,
      });

      try {
        await controller.verifyLoginTotp(mockUser, validDto as any, correlationId);
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const response = (err as UnauthorizedException).getResponse() as Record<string, unknown>;
        expect(response['locked']).toBe(true);
        expect(response['attemptsRemaining']).toBe(0);
      }
    });
  });

  describe('verifyRecoveryCode', () => {
    const validDto = { recoveryCode: 'CODE123456' };

    it('should throw UnauthorizedException for invalid recovery code', async () => {
      mockAuthService.verifyRecoveryCode.mockResolvedValue({
        valid: false,
        usedIndex: -1,
      });

      await expect(
        controller.verifyRecoveryCode(mockUser, validDto as any, correlationId)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return success for valid recovery code', async () => {
      mockAuthService.verifyRecoveryCode.mockResolvedValue({
        valid: true,
        usedIndex: 0,
      });

      const result = await controller.verifyRecoveryCode(mockUser, validDto as any, correlationId);

      expect(result.status).toBe('success');
      expect(result.correlationId).toBe(correlationId);
    });
  });

  describe('getLockoutStatus', () => {
    it('should return lockout status for user', async () => {
      mockAuthService.getLockoutStatus.mockResolvedValue({
        locked: false,
        attemptsRemaining: 5,
      });

      const result = await controller.getLockoutStatus(mockUser, correlationId);

      expect(result.locked).toBe(false);
      expect(result.attemptsRemaining).toBe(5);
      expect(result.correlationId).toBe(correlationId);
    });
  });

  describe('unlockAccount', () => {
    it('should call unlockAccount with target userId', async () => {
      mockAuthService.unlockAccount.mockResolvedValue(undefined);

      const result = await controller.unlockAccount('usr_target456', mockUser, correlationId);

      expect(mockAuthService.unlockAccount).toHaveBeenCalledWith('usr_target456');
      expect(result.status).toBe('success');
      expect(result.message).toBe('Account has been unlocked');
    });
  });

  describe('logout', () => {
    it('should return success response', async () => {
      const result = await controller.logout(mockUser, correlationId);

      expect(result.status).toBe('success');
      expect(result.message).toBe('Logged out successfully');
      expect(result.correlationId).toBe(correlationId);
    });
  });
});
