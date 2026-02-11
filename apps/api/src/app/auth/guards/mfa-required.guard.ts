import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { SKIP_MFA_KEY } from '../decorators/skip-mfa.decorator';
import { AuthService } from '../auth.service';
import { CurrentUserPayload } from '../strategies/jwt.strategy';

@Injectable()
export class MfaRequiredGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authService: AuthService,
    private configService: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Dev mode bypass - skip MFA check for local development
    if (this.configService.get<string>('DEV_MODE') === 'true') {
      return true;
    }

    // Check if MFA check should be skipped for this route
    const skipMfa = this.reflector.getAllAndOverride<boolean>(SKIP_MFA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipMfa) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: CurrentUserPayload = request.user;

    if (!user) {
      return true; // Let JwtAuthGuard handle authentication
    }

    // Check if user has MFA enabled
    const mfaStatus = await this.authService.getMfaStatus(user.userId);

    if (!mfaStatus.enabled) {
      throw new ForbiddenException({
        type: 'mfa_required',
        title: 'Two-Factor Authentication Required',
        status: 403,
        detail: 'Please complete 2FA setup to access your account',
        redirectTo: '/2fa-setup',
      });
    }

    return true;
  }
}
