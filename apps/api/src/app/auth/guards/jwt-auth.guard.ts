import { ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaClient } from '@mentor-ai/shared/prisma';

/** Static fallback when no active tenant exists yet (fresh DB) */
const DEV_USER_FALLBACK = {
  userId: 'dev-user-001',
  tenantId: 'dev-tenant-001',
  email: 'dev@mentor-ai.local',
  role: 'PLATFORM_OWNER' as const,
  department: null as string | null,
  permissions: ['*'],
};

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);
  /** Cached dev user resolved from DB (avoids repeat queries) */
  private resolvedDevUser: typeof DEV_USER_FALLBACK | null = null;

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

      // Resolve real tenant/user from DB (cached after first lookup)
      request.user = await this.getDevUser();
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
  }

  /**
   * Resolves a real active tenant and its owner for dev mode.
   * Uses a standalone PrismaClient to avoid DI module dependency issues.
   * Falls back to static IDs if no active tenant exists yet.
   * Result is cached so DB is only queried once per server start.
   */
  private async getDevUser(): Promise<typeof DEV_USER_FALLBACK> {
    if (this.resolvedDevUser) return this.resolvedDevUser;

    const prisma = new PrismaClient();
    try {
      const tenant = await prisma.tenant.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (tenant) {
        const user = await prisma.user.findFirst({
          where: { tenantId: tenant.id, isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true, email: true, role: true, department: true },
        });

        if (user) {
          this.resolvedDevUser = {
            userId: user.id,
            tenantId: tenant.id,
            email: user.email,
            role: 'PLATFORM_OWNER' as const,
            department: user.department,
            permissions: ['*'],
          };
          this.logger.log({
            message: 'Dev mode: resolved real tenant/user',
            tenantId: tenant.id,
            userId: user.id,
          });
          return this.resolvedDevUser;
        }
      }
    } catch (err) {
      this.logger.warn({
        message: 'Dev mode: failed to resolve tenant, using fallback',
        error: err instanceof Error ? err.message : 'Unknown',
      });
    } finally {
      await prisma.$disconnect();
    }

    this.resolvedDevUser = DEV_USER_FALLBACK;
    return this.resolvedDevUser;
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
