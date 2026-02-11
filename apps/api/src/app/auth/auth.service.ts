import {
  Injectable,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createId } from '@paralleldrive/cuid2';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

export interface MfaStatus {
  enabled: boolean;
  enrolledAt?: Date;
}

export interface MfaEnrollmentResult {
  secret: string;
  qrCodeUrl: string;
  recoveryCodes: string[];
}

export interface LockoutStatus {
  locked: boolean;
  lockoutUntil?: Date;
  attemptsRemaining: number;
}

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;
const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PlatformPrismaService
  ) {}

  /**
   * Get MFA status for a user
   */
  async getMfaStatus(userId: string): Promise<MfaStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, updatedAt: true },
    });

    if (!user) {
      return { enabled: false };
    }

    return {
      enabled: user.mfaEnabled,
      enrolledAt: user.mfaEnabled ? user.updatedAt : undefined,
    };
  }

  /**
   * Get account lockout status
   */
  async getLockoutStatus(userId: string): Promise<LockoutStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { failedLoginAttempts: true, lockoutUntil: true },
    });

    if (!user) {
      return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS };
    }

    const now = new Date();
    const isLocked = user.lockoutUntil && user.lockoutUntil > now;

    if (isLocked) {
      return {
        locked: true,
        lockoutUntil: user.lockoutUntil!,
        attemptsRemaining: 0,
      };
    }

    // If lockout has expired, reset attempts
    if (user.lockoutUntil && user.lockoutUntil <= now) {
      await this.resetFailedAttempts(userId);
      return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS };
    }

    return {
      locked: false,
      attemptsRemaining: MAX_FAILED_ATTEMPTS - user.failedLoginAttempts,
    };
  }

  /**
   * Check if account is locked
   */
  async checkAccountLocked(userId: string): Promise<void> {
    const status = await this.getLockoutStatus(userId);

    if (status.locked) {
      throw new ForbiddenException({
        type: 'account_locked',
        title: 'Account Temporarily Locked',
        status: 403,
        detail: `Your account has been locked due to too many failed login attempts. Please try again in ${LOCKOUT_DURATION_MINUTES} minutes.`,
        lockoutUntil: status.lockoutUntil?.toISOString(),
      });
    }
  }

  /**
   * Record a failed login attempt
   */
  async recordFailedAttempt(userId: string): Promise<LockoutStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { failedLoginAttempts: true, email: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const newAttempts = user.failedLoginAttempts + 1;

    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      // Lock the account
      const lockoutUntil = new Date();
      lockoutUntil.setMinutes(lockoutUntil.getMinutes() + LOCKOUT_DURATION_MINUTES);

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginAttempts: newAttempts,
          lockoutUntil,
        },
      });

      // TODO: Send email notification about account lockout
      // await this.sendLockoutNotification(user.email);

      return {
        locked: true,
        lockoutUntil,
        attemptsRemaining: 0,
      };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: newAttempts },
    });

    return {
      locked: false,
      attemptsRemaining: MAX_FAILED_ATTEMPTS - newAttempts,
    };
  }

  /**
   * Reset failed login attempts after successful login
   */
  async resetFailedAttempts(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
    });
  }

  /**
   * Generate 8 recovery codes
   */
  async generateRecoveryCodes(): Promise<{
    codes: string[];
    hashedCodes: string[];
  }> {
    const codes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < 8; i++) {
      // Generate 10-character alphanumeric code
      const code = createId().slice(0, 10).toUpperCase();
      codes.push(code);
      hashedCodes.push(await bcrypt.hash(code, BCRYPT_SALT_ROUNDS));
    }

    return { codes, hashedCodes };
  }

  /**
   * Verify a recovery code
   */
  async verifyRecoveryCode(
    userId: string,
    code: string
  ): Promise<{ valid: boolean; usedIndex: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { recoveryCodesHash: true },
    });

    if (!user || !user.recoveryCodesHash.length) {
      return { valid: false, usedIndex: -1 };
    }

    for (let i = 0; i < user.recoveryCodesHash.length; i++) {
      const hashedCode = user.recoveryCodesHash[i];
      if (!hashedCode) continue;
      const isValid = await bcrypt.compare(code, hashedCode);
      if (isValid) {
        // Remove the used recovery code
        const updatedCodes = [...user.recoveryCodesHash];
        updatedCodes.splice(i, 1);

        await this.prisma.user.update({
          where: { id: userId },
          data: { recoveryCodesHash: updatedCodes },
        });

        // Reset failed attempts on successful recovery
        await this.resetFailedAttempts(userId);

        return { valid: true, usedIndex: i };
      }
    }

    return { valid: false, usedIndex: -1 };
  }

  /**
   * Store pending MFA enrollment data (secret + recovery codes)
   */
  async storePendingMfaEnrollment(
    userId: string,
    secret: string,
    hashedRecoveryCodes: string[]
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecret: secret,
        recoveryCodesHash: hashedRecoveryCodes,
      },
    });
  }

  /**
   * Enable MFA for a user (called after successful TOTP verification)
   */
  async enableMfa(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });
  }

  /**
   * Get stored TOTP secret for verification
   */
  async getMfaSecret(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true },
    });
    return user?.mfaSecret ?? null;
  }

  /**
   * Link Auth0 identity to user
   */
  async linkAuth0Identity(userId: string, auth0Id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { auth0Id },
    });
  }

  /**
   * Find user by Auth0 ID
   */
  async findUserByAuth0Id(auth0Id: string) {
    return this.prisma.user.findUnique({
      where: { auth0Id },
      include: { tenant: true },
    });
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { tenant: true },
    });
  }

  /**
   * Update tenant status after first OAuth
   */
  async updateTenantStatusToOnboarding(tenantId: string): Promise<void> {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ONBOARDING' },
    });
  }

  /**
   * Unlock a user account (admin function)
   */
  async unlockAccount(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
    });
  }
}
