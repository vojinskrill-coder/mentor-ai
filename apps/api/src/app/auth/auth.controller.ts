import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { AuthService, MfaStatus, LockoutStatus } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { CurrentUserPayload } from './strategies/jwt.strategy';
import { SkipMfa } from './decorators/skip-mfa.decorator';
import { VerifyTotpDto } from './dto/verify-totp.dto';
import { EnrollMfaDto, VerifyRecoveryCodeDto } from './dto/enroll-mfa.dto';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';

interface AuthCallbackResponse {
  status: 'success';
  message: string;
  user: {
    userId: string;
    email: string;
    tenantId: string;
    role: string;
  };
  requiresMfaSetup: boolean;
  correlationId?: string;
}

interface MfaEnrollResponse {
  status: 'success';
  qrCodeDataUrl: string;
  secret: string;
  recoveryCodes: string[];
  message: string;
  correlationId?: string;
}

interface MfaVerifyResponse {
  status: 'success';
  message: string;
  correlationId?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Auth0 callback endpoint - called after OAuth flow
   * Links Auth0 identity to existing user
   */
  @Post('callback')
  @UseGuards(JwtAuthGuard)
  @SkipMfa()
  @HttpCode(HttpStatus.OK)
  async handleCallback(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<AuthCallbackResponse> {
    // Check if user exists by email
    const existingUser = await this.authService.findUserByEmail(user.email);

    if (!existingUser) {
      throw new UnauthorizedException({
        type: 'user_not_found',
        title: 'User Not Found',
        status: 401,
        detail: 'Please register before logging in',
        correlationId,
      });
    }

    // Link Auth0 ID if not already linked
    if (!existingUser.auth0Id) {
      await this.authService.linkAuth0Identity(existingUser.id, user.auth0Id);

      // Update tenant status to ONBOARDING after first OAuth
      if (existingUser.tenant.status === 'DRAFT') {
        await this.authService.updateTenantStatusToOnboarding(existingUser.tenantId);
      }
    }

    // Check MFA status
    const mfaStatus = await this.authService.getMfaStatus(existingUser.id);

    const response: AuthCallbackResponse = {
      status: 'success',
      message: mfaStatus.enabled
        ? 'Authentication successful'
        : 'Authentication successful. Please set up 2FA.',
      user: {
        userId: existingUser.id,
        email: existingUser.email,
        tenantId: existingUser.tenantId,
        role: existingUser.role,
      },
      requiresMfaSetup: !mfaStatus.enabled,
    };

    if (correlationId) {
      response.correlationId = correlationId;
    }

    return response;
  }

  /**
   * Get current user's MFA status
   */
  @Get('2fa/status')
  @UseGuards(JwtAuthGuard)
  @SkipMfa()
  async getMfaStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<MfaStatus & { correlationId?: string }> {
    const status = await this.authService.getMfaStatus(user.userId);
    return { ...status, correlationId };
  }

  /**
   * Initiate MFA enrollment - generates secret and QR code
   */
  @Post('2fa/enroll')
  @UseGuards(JwtAuthGuard)
  @SkipMfa()
  @HttpCode(HttpStatus.OK)
  async enrollMfa(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<MfaEnrollResponse> {
    // Check if already enrolled
    const status = await this.authService.getMfaStatus(user.userId);
    if (status.enabled) {
      throw new BadRequestException({
        type: 'mfa_already_enabled',
        title: 'MFA Already Enabled',
        status: 400,
        detail: 'Two-factor authentication is already enabled for your account',
        correlationId,
      });
    }

    // Generate recovery codes and TOTP secret
    const { codes, hashedCodes } = await this.authService.generateRecoveryCodes();
    const secret = `MENTOR${createId().slice(0, 12).toUpperCase()}`;

    // Generate QR code URL (otpauth format)
    const appName = 'MentorAI';
    const qrCodeDataUrl = `otpauth://totp/${appName}:${user.email}?secret=${secret}&issuer=${appName}`;

    // Persist secret and hashed recovery codes to DB during enrollment
    await this.authService.storePendingMfaEnrollment(
      user.userId,
      secret,
      hashedCodes
    );

    const response: MfaEnrollResponse = {
      status: 'success',
      qrCodeDataUrl,
      secret,
      recoveryCodes: codes,
      message: 'Scan the QR code with your authenticator app and enter the code to verify',
    };

    if (correlationId) {
      response.correlationId = correlationId;
    }

    return response;
  }

  /**
   * Verify TOTP code and complete MFA enrollment
   */
  @Post('2fa/verify')
  @UseGuards(JwtAuthGuard)
  @SkipMfa()
  @HttpCode(HttpStatus.OK)
  async verifyMfaEnrollment(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: EnrollMfaDto,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<MfaVerifyResponse> {
    // Verify the TOTP code against stored secret
    const secret = await this.authService.getMfaSecret(user.userId);
    if (!secret) {
      throw new BadRequestException({
        type: 'mfa_not_enrolled',
        title: 'MFA Not Enrolled',
        status: 400,
        detail: 'Please initiate MFA enrollment first',
        correlationId,
      });
    }

    // Validate code format (6-digit numeric)
    const isValidFormat = dto.code.length === 6 && /^\d{6}$/.test(dto.code);
    if (!isValidFormat) {
      throw new BadRequestException({
        type: 'invalid_totp_format',
        title: 'Invalid Code Format',
        status: 400,
        detail: 'Verification code must be a 6-digit number',
        correlationId,
      });
    }

    // TODO: Implement proper TOTP verification with otplib
    // For MVP, accept any valid-format 6-digit code
    // In production: authenticator.verify({ token: dto.code, secret })

    // Enable MFA for user (recovery codes already stored during enrollment)
    await this.authService.enableMfa(user.userId);

    const response: MfaVerifyResponse = {
      status: 'success',
      message: 'Two-factor authentication has been enabled successfully',
    };

    if (correlationId) {
      response.correlationId = correlationId;
    }

    return response;
  }

  /**
   * Verify TOTP code during login
   */
  @Post('2fa/verify-login')
  @UseGuards(JwtAuthGuard)
  @SkipMfa()
  @HttpCode(HttpStatus.OK)
  async verifyLoginTotp(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: VerifyTotpDto,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<MfaVerifyResponse> {
    // Check if account is locked
    await this.authService.checkAccountLocked(user.userId);

    // Validate code format (6-digit numeric)
    const isValidFormat = dto.code.length === 6 && /^\d{6}$/.test(dto.code);

    // TODO: Implement proper TOTP verification with otplib
    // For MVP, accept any valid-format 6-digit code
    // In production: authenticator.verify({ token: dto.code, secret })
    const secret = await this.authService.getMfaSecret(user.userId);
    const isValidCode = isValidFormat && !!secret;

    if (!isValidCode) {
      const lockoutStatus = await this.authService.recordFailedAttempt(user.userId);

      throw new UnauthorizedException({
        type: 'invalid_totp',
        title: 'Invalid Verification Code',
        status: 401,
        detail: lockoutStatus.locked
          ? 'Your account has been locked due to too many failed attempts'
          : `The verification code you entered is incorrect. You have ${lockoutStatus.attemptsRemaining} attempts remaining.`,
        attemptsRemaining: lockoutStatus.attemptsRemaining,
        locked: lockoutStatus.locked,
        lockoutUntil: lockoutStatus.lockoutUntil?.toISOString(),
        correlationId,
      });
    }

    // Reset failed attempts on success
    await this.authService.resetFailedAttempts(user.userId);

    const response: MfaVerifyResponse = {
      status: 'success',
      message: 'Verification successful',
    };

    if (correlationId) {
      response.correlationId = correlationId;
    }

    return response;
  }

  /**
   * Verify recovery code
   */
  @Post('2fa/recovery')
  @UseGuards(JwtAuthGuard)
  @SkipMfa()
  @HttpCode(HttpStatus.OK)
  async verifyRecoveryCode(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: VerifyRecoveryCodeDto,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<MfaVerifyResponse> {
    const result = await this.authService.verifyRecoveryCode(
      user.userId,
      dto.recoveryCode
    );

    if (!result.valid) {
      throw new UnauthorizedException({
        type: 'invalid_recovery_code',
        title: 'Invalid Recovery Code',
        status: 401,
        detail: 'The recovery code you entered is invalid or has already been used',
        correlationId,
      });
    }

    const response: MfaVerifyResponse = {
      status: 'success',
      message: 'Recovery code verified. You are now logged in.',
    };

    if (correlationId) {
      response.correlationId = correlationId;
    }

    return response;
  }

  /**
   * Get account lockout status
   */
  @Get('lockout-status')
  @UseGuards(JwtAuthGuard)
  @SkipMfa()
  async getLockoutStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<LockoutStatus & { correlationId?: string }> {
    const status = await this.authService.getLockoutStatus(user.userId);
    return { ...status, correlationId };
  }

  /**
   * Unlock account (admin only)
   */
  @Post('unlock/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_OWNER', 'TENANT_OWNER')
  @HttpCode(HttpStatus.OK)
  async unlockAccount(
    @Param('userId') targetUserId: string,
    @CurrentUser() admin: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<MfaVerifyResponse> {
    await this.authService.unlockAccount(targetUserId);

    const response: MfaVerifyResponse = {
      status: 'success',
      message: 'Account has been unlocked',
    };

    if (correlationId) {
      response.correlationId = correlationId;
    }

    return response;
  }

  /**
   * Logout endpoint - invalidates session
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @SkipMfa()
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<MfaVerifyResponse> {
    // In production, you would invalidate the session in Redis
    // For now, Auth0 handles session invalidation on the frontend

    const response: MfaVerifyResponse = {
      status: 'success',
      message: 'Logged out successfully',
    };

    if (correlationId) {
      response.correlationId = correlationId;
    }

    return response;
  }
}
