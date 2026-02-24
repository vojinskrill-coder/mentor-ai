import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsString, IsNotEmpty } from 'class-validator';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { generateUserId, generateTenantId } from '@mentor-ai/shared/utils';
import { TenantStatus, UserRole } from '@mentor-ai/shared/prisma';

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
}

interface GoogleIdTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
  given_name?: string;
  family_name?: string;
}

class GoogleCallbackDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  redirectUri!: string;

  @IsString()
  @IsNotEmpty()
  codeVerifier!: string;
}

@Controller('auth')
export class GoogleAuthController {
  private readonly logger = new Logger(GoogleAuthController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly prisma: PlatformPrismaService
  ) {}

  /**
   * Google OAuth callback - exchanges auth code for tokens and creates session
   */
  @Post('google/callback')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleGoogleCallback(@Body() dto: GoogleCallbackDto) {
    const { code, redirectUri, codeVerifier } = dto;

    this.logger.log({
      message: 'Google callback received',
      hasCode: !!code,
      redirectUri,
      hasCodeVerifier: !!codeVerifier,
      codeLength: code?.length ?? 0,
    });

    if (!code) {
      throw new BadRequestException({
        type: 'missing_auth_code',
        title: 'Bad Request',
        status: 400,
        detail: 'Authorization code is required. The Google OAuth redirect may have failed.',
      });
    }

    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const jwtSecret = this.configService.get<string>('JWT_SECRET');

    if (!clientId || !jwtSecret) {
      throw new BadRequestException('Google OAuth is not configured on the server');
    }

    // Exchange authorization code for tokens
    let tokenData: GoogleTokenResponse;
    try {
      const tokenParams: Record<string, string> = {
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      };

      // Include client_secret if available (required for Web app type)
      if (clientSecret && clientSecret !== 'REPLACE_WITH_YOUR_GOOGLE_CLIENT_SECRET') {
        tokenParams.client_secret = clientSecret;
      }

      const response = await axios.post<GoogleTokenResponse>(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams(tokenParams).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );
      tokenData = response.data;
    } catch (error: any) {
      const googleError = error?.response?.data;
      this.logger.error({
        message: 'Google token exchange failed',
        googleError,
        httpStatus: error?.response?.status,
        errorMessage: error?.message,
      });

      // Pass Google-specific error details so the frontend can show actionable info
      const googleErrorCode = googleError?.error ?? 'unknown';
      const googleErrorDesc = googleError?.error_description ?? error?.message ?? 'Unknown error';

      throw new UnauthorizedException({
        type: 'google_token_exchange_failed',
        title: 'Google Authentication Failed',
        status: 401,
        detail: `Google OAuth error: ${googleErrorCode} — ${googleErrorDesc}`,
      });
    }

    // Decode the ID token to get user info
    const idTokenPayload = jwt.decode(tokenData.id_token) as GoogleIdTokenPayload | null;
    if (!idTokenPayload || !idTokenPayload.email) {
      throw new UnauthorizedException('Invalid Google ID token');
    }

    // Find existing user by email
    const existingUser = await this.authService.findUserByEmail(idTokenPayload.email);

    let user: {
      userId: string;
      email: string;
      tenantId: string;
      role: string;
      department: string | null;
    };

    if (existingUser) {
      // Link Google ID if not already linked
      if (!existingUser.auth0Id) {
        await this.authService.linkAuth0Identity(existingUser.id, idTokenPayload.sub);

        if (existingUser.tenant.status === 'DRAFT') {
          await this.authService.updateTenantStatusToOnboarding(existingUser.tenantId);
        }
      }

      user = {
        userId: existingUser.id,
        email: existingUser.email,
        tenantId: existingUser.tenantId,
        role: existingUser.role,
        department: existingUser.department ?? null,
      };
    } else {
      // New user — auto-register with ONBOARDING status
      const tenantId = generateTenantId();
      const userId = generateUserId();
      const normalizedEmail = idTokenPayload.email.toLowerCase();
      const displayName = idTokenPayload.name || normalizedEmail.split('@')[0] || 'My Company';

      await this.prisma.$transaction(async (tx) => {
        await tx.tenant.create({
          data: {
            id: tenantId,
            name: displayName,
            industry: 'General',
            status: TenantStatus.ONBOARDING,
          },
        });

        await tx.user.create({
          data: {
            id: userId,
            email: normalizedEmail,
            auth0Id: idTokenPayload.sub,
            role: UserRole.TENANT_OWNER,
            tenantId,
          },
        });
      });

      this.logger.log({
        message: 'New user auto-registered via Google OAuth',
        userId,
        tenantId,
        email: normalizedEmail,
      });

      user = {
        userId,
        email: normalizedEmail,
        tenantId,
        role: UserRole.TENANT_OWNER,
        department: null,
      };
    }

    // MFA is currently disabled — skip MFA check entirely
    const requiresMfaSetup = false;

    // Sign our own JWT
    const appToken = jwt.sign(
      {
        sub: idTokenPayload.sub,
        email: user.email,
        userId: user.userId,
        tenantId: user.tenantId,
        role: user.role,
        department: user.department,
      },
      jwtSecret,
      { expiresIn: '24h', algorithm: 'HS256' }
    );

    return {
      status: 'success',
      message: requiresMfaSetup
        ? 'Authentication successful. Please set up 2FA.'
        : 'Authentication successful',
      user,
      token: appToken,
      requiresMfaSetup,
    };
  }
}
