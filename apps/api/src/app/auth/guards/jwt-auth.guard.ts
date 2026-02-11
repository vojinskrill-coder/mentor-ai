import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/** Dev mode mock user for local development (fallback when no real JWT) */
const DEV_USER = {
  userId: 'dev-user-001',
  tenantId: 'dev-tenant-001',
  email: 'dev@mentor-ai.local',
  role: 'PLATFORM_OWNER' as const,
  permissions: ['*'],
};

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private reflector: Reflector,
    private configService: ConfigService
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const devMode = this.configService.get<string>('DEV_MODE') === 'true';

    if (devMode) {
      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers?.authorization as string | undefined;

      // If a real Bearer token is present (not the dev-mode-token placeholder),
      // try to validate it so each user gets their own identity
      if (authHeader?.startsWith('Bearer ') && !authHeader.includes('dev-mode-token')) {
        try {
          const result = await (super.canActivate(context) as Promise<boolean>);
          if (result && request.user) {
            this.logger.debug(`Dev mode: authenticated real user ${request.user.email}`);
            return true;
          }
        } catch {
          // Token invalid or expired - fall back to dev user
          this.logger.debug('Dev mode: JWT validation failed, using dev user fallback');
        }
      }

      // No real token or validation failed - use dev fallback
      request.user = DEV_USER;
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest<TUser>(err: Error | null, user: TUser, info: Error): TUser {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException({
          type: 'unauthorized',
          title: 'Authentication Required',
          status: 401,
          detail: info?.message || 'You must be logged in to access this resource',
        })
      );
    }
    return user;
  }
}
