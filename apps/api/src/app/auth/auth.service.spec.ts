import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService, MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_MINUTES } from './auth.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_value'),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<PlatformPrismaService>;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    tenant: {
      update: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-value'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PlatformPrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PlatformPrismaService);
  });

  describe('getMfaStatus', () => {
    it('should return disabled status when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.getMfaStatus('usr_nonexistent');

      expect(result).toEqual({ enabled: false });
    });

    it('should return enabled status with enrolledAt when MFA is enabled', async () => {
      const enrolledDate = new Date('2024-01-15T10:00:00Z');
      mockPrismaService.user.findUnique.mockResolvedValue({
        mfaEnabled: true,
        updatedAt: enrolledDate,
      });

      const result = await service.getMfaStatus('usr_test123');

      expect(result).toEqual({
        enabled: true,
        enrolledAt: enrolledDate,
      });
    });

    it('should return disabled status without enrolledAt when MFA is disabled', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        mfaEnabled: false,
        updatedAt: new Date(),
      });

      const result = await service.getMfaStatus('usr_test123');

      expect(result).toEqual({
        enabled: false,
        enrolledAt: undefined,
      });
    });
  });

  describe('getLockoutStatus', () => {
    it('should return unlocked status for non-existent user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.getLockoutStatus('usr_nonexistent');

      expect(result).toEqual({
        locked: false,
        attemptsRemaining: 5,
      });
    });

    it('should return locked status when lockoutUntil is in the future', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      mockPrismaService.user.findUnique.mockResolvedValue({
        failedLoginAttempts: 5,
        lockoutUntil: futureDate,
      });

      const result = await service.getLockoutStatus('usr_test123');

      expect(result).toEqual({
        locked: true,
        lockoutUntil: futureDate,
        attemptsRemaining: 0,
      });
    });

    it('should reset attempts when lockout has expired', async () => {
      const pastDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      mockPrismaService.user.findUnique.mockResolvedValue({
        failedLoginAttempts: 5,
        lockoutUntil: pastDate,
      });
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.getLockoutStatus('usr_test123');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr_test123' },
        data: { failedLoginAttempts: 0, lockoutUntil: null },
      });
      expect(result).toEqual({
        locked: false,
        attemptsRemaining: 5,
      });
    });

    it('should return correct attempts remaining', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        failedLoginAttempts: 3,
        lockoutUntil: null,
      });

      const result = await service.getLockoutStatus('usr_test123');

      expect(result).toEqual({
        locked: false,
        attemptsRemaining: 2,
      });
    });
  });

  describe('checkAccountLocked', () => {
    it('should not throw when account is not locked', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        failedLoginAttempts: 0,
        lockoutUntil: null,
      });

      await expect(service.checkAccountLocked('usr_test123')).resolves.not.toThrow();
    });

    it('should throw ForbiddenException when account is locked', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000);
      mockPrismaService.user.findUnique.mockResolvedValue({
        failedLoginAttempts: 5,
        lockoutUntil: futureDate,
      });

      await expect(service.checkAccountLocked('usr_test123')).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('recordFailedAttempt', () => {
    it('should throw UnauthorizedException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.recordFailedAttempt('usr_nonexistent')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should increment failed attempts without locking when under threshold', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        failedLoginAttempts: 2,
        email: 'test@example.com',
      });
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.recordFailedAttempt('usr_test123');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr_test123' },
        data: { failedLoginAttempts: 3 },
      });
      expect(result).toEqual({
        locked: false,
        attemptsRemaining: 2,
      });
    });

    it('should lock account when max attempts reached', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        failedLoginAttempts: 4,
        email: 'test@example.com',
      });
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.recordFailedAttempt('usr_test123');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr_test123' },
        data: {
          failedLoginAttempts: 5,
          lockoutUntil: expect.any(Date),
        },
      });
      expect(result.locked).toBe(true);
      expect(result.attemptsRemaining).toBe(0);
      expect(result.lockoutUntil).toBeDefined();
    });
  });

  describe('resetFailedAttempts', () => {
    it('should reset failed attempts and lockout', async () => {
      mockPrismaService.user.update.mockResolvedValue({});

      await service.resetFailedAttempts('usr_test123');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr_test123' },
        data: {
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      });
    });
  });

  describe('generateRecoveryCodes', () => {
    it('should generate 8 recovery codes', async () => {
      const result = await service.generateRecoveryCodes();

      expect(result.codes).toHaveLength(8);
      expect(result.hashedCodes).toHaveLength(8);
    });

    it('should generate uppercase 10-character codes', async () => {
      const result = await service.generateRecoveryCodes();

      result.codes.forEach((code) => {
        expect(code).toHaveLength(10);
        expect(code).toBe(code.toUpperCase());
      });
    });

    it('should hash all codes', async () => {
      const result = await service.generateRecoveryCodes();

      expect(bcrypt.hash).toHaveBeenCalledTimes(8);
      result.hashedCodes.forEach((hash) => {
        expect(hash).toBe('hashed_value');
      });
    });
  });

  describe('verifyRecoveryCode', () => {
    it('should return invalid when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.verifyRecoveryCode('usr_nonexistent', 'CODE123456');

      expect(result).toEqual({ valid: false, usedIndex: -1 });
    });

    it('should return invalid when no recovery codes exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        recoveryCodesHash: [],
      });

      const result = await service.verifyRecoveryCode('usr_test123', 'CODE123456');

      expect(result).toEqual({ valid: false, usedIndex: -1 });
    });

    it('should return valid and remove used code when code matches', async () => {
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      mockPrismaService.user.findUnique.mockResolvedValue({
        recoveryCodesHash: ['hash1', 'hash2', 'hash3'],
      });
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.verifyRecoveryCode('usr_test123', 'CODE123456');

      expect(result).toEqual({ valid: true, usedIndex: 1 });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr_test123' },
        data: { recoveryCodesHash: ['hash1', 'hash3'] },
      });
    });

    it('should reset failed attempts on successful recovery', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      mockPrismaService.user.findUnique.mockResolvedValue({
        recoveryCodesHash: ['hash1'],
      });
      mockPrismaService.user.update.mockResolvedValue({});

      await service.verifyRecoveryCode('usr_test123', 'CODE123456');

      // Should be called twice: once to remove code, once to reset attempts
      expect(mockPrismaService.user.update).toHaveBeenCalledTimes(2);
    });

    it('should return invalid when code does not match', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      mockPrismaService.user.findUnique.mockResolvedValue({
        recoveryCodesHash: ['hash1', 'hash2'],
      });

      const result = await service.verifyRecoveryCode('usr_test123', 'WRONGCODE1');

      expect(result).toEqual({ valid: false, usedIndex: -1 });
    });
  });

  describe('storePendingMfaEnrollment', () => {
    it('should store secret and hashed recovery codes', async () => {
      mockPrismaService.user.update.mockResolvedValue({});

      await service.storePendingMfaEnrollment('usr_test123', 'MENTORSECRET123', ['hash1', 'hash2']);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr_test123' },
        data: {
          mfaSecret: 'MENTORSECRET123',
          recoveryCodesHash: ['hash1', 'hash2'],
        },
      });
    });
  });

  describe('enableMfa', () => {
    it('should set mfaEnabled to true', async () => {
      mockPrismaService.user.update.mockResolvedValue({});

      await service.enableMfa('usr_test123');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr_test123' },
        data: { mfaEnabled: true },
      });
    });
  });

  describe('getMfaSecret', () => {
    it('should return secret when user has one', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        mfaSecret: 'MENTORSECRET123',
      });

      const result = await service.getMfaSecret('usr_test123');

      expect(result).toBe('MENTORSECRET123');
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'usr_test123' },
        select: { mfaSecret: true },
      });
    });

    it('should return null when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.getMfaSecret('usr_nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when user has no secret', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        mfaSecret: null,
      });

      const result = await service.getMfaSecret('usr_test123');

      expect(result).toBeNull();
    });
  });

  describe('linkAuth0Identity', () => {
    it('should link Auth0 ID to user', async () => {
      mockPrismaService.user.update.mockResolvedValue({});

      await service.linkAuth0Identity('usr_test123', 'google-oauth2|123456');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr_test123' },
        data: { auth0Id: 'google-oauth2|123456' },
      });
    });
  });

  describe('findUserByAuth0Id', () => {
    it('should find user by Auth0 ID', async () => {
      const mockUser = { id: 'usr_test123', email: 'test@example.com' };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findUserByAuth0Id('google-oauth2|123456');

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { auth0Id: 'google-oauth2|123456' },
        include: { tenant: true },
      });
    });
  });

  describe('findUserByEmail', () => {
    it('should find user by email', async () => {
      const mockUser = { id: 'usr_test123', email: 'test@example.com' };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findUserByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        include: { tenant: true },
      });
    });
  });

  describe('updateTenantStatusToOnboarding', () => {
    it('should update tenant status to ONBOARDING', async () => {
      mockPrismaService.tenant.update.mockResolvedValue({});

      await service.updateTenantStatusToOnboarding('tnt_test123');

      expect(mockPrismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tnt_test123' },
        data: { status: 'ONBOARDING' },
      });
    });
  });

  describe('unlockAccount', () => {
    it('should reset failed attempts and clear lockout', async () => {
      mockPrismaService.user.update.mockResolvedValue({});

      await service.unlockAccount('usr_test123');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr_test123' },
        data: {
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      });
    });
  });
});
