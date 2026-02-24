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
      // validate it AND verify the user still exists in DB
      if (authHeader?.startsWith('Bearer ') && !authHeader.includes('dev-mode-token')) {
        try {
          const result = await (super.canActivate(context) as Promise<boolean>);
          if (result && request.user) {
            // Verify user still exists in DB (may have been deleted after cleanup)
            const userExists = await this.verifyUserExists(request.user.userId);
            if (userExists) {
              this.logger.debug(`Dev mode: authenticated real user ${request.user.email}`);
              return true;
            }
            // User deleted from DB — reject so frontend clears stale token
            this.logger.warn({
              message: 'JWT valid but user not found in DB — rejecting stale token',
              userId: request.user.userId,
            });
            throw new UnauthorizedException({
              type: 'user_not_found',
              title: 'Session Expired',
              status: 401,
              detail: 'Your session is no longer valid. Please log in again.',
            });
          }
        } catch (err) {
          if (err instanceof UnauthorizedException) throw err;
          // Token invalid or expired - fall back to dev user
          this.logger.debug('Dev mode: JWT validation failed, using dev user fallback');
        }
      }

      // No token or validation failed — resolve dev user from DB
      request.user = await this.getDevUser();
      return true;
    }

    // Production mode: validate JWT and verify user exists
    const result = await (super.canActivate(context) as Promise<boolean>);
    if (result) {
      const request = context.switchToHttp().getRequest();
      if (request.user?.userId) {
        const userExists = await this.verifyUserExists(request.user.userId);
        if (!userExists) {
          throw new UnauthorizedException({
            type: 'user_not_found',
            title: 'Session Expired',
            status: 401,
            detail: 'Your session is no longer valid. Please log in again.',
          });
        }
      }
    }
    return result;
  }

  /**
   * Verifies that a user exists in the DB. Returns false if deleted.
   * Uses a short-lived PrismaClient to avoid DI dependency issues.
   */
  private async verifyUserExists(userId: string): Promise<boolean> {
    const prisma = new PrismaClient();
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      return user !== null;
    } catch {
      // DB error — allow through to avoid blocking on transient failures
      return true;
    } finally {
      await prisma.$disconnect();
    }
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
