import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { PlatformPrismaService } from './platform-prisma.service';
import { TenantStatus } from '@prisma/client';

export const TENANT_ID_HEADER = 'x-tenant-id';
export const TENANT_ID_KEY = 'tenantId';

// Extend Express Request to include tenant context
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

interface Rfc7807Error {
  type: string;
  title: string;
  status: number;
  detail: string;
  correlationId?: string;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  // Paths that don't require tenant context (e.g., health checks, platform admin)
  private readonly excludedPaths = [
    '/health',
    '/api/health',
    '/api/v1/health',
  ];

  constructor(
    private readonly platformPrisma: PlatformPrismaService,
    private readonly configService: ConfigService
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Skip tenant validation for excluded paths
    if (this.isExcludedPath(req.path)) {
      return next();
    }

    // Dev mode: try to extract tenantId from JWT if a real token is present,
    // otherwise fall back to dev-tenant-001
    if (this.configService.get<string>('DEV_MODE') === 'true') {
      const authHeader = req.headers?.authorization as string | undefined;
      if (authHeader?.startsWith('Bearer ') && !authHeader.includes('dev-mode-token')) {
        try {
          const token = authHeader.substring(7);
          const payloadBase64 = token.split('.')[1];
          if (payloadBase64) {
            const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
            if (payload.tenantId) {
              req.tenantId = payload.tenantId;
              return next();
            }
          }
        } catch {
          // Token decode failed - use dev fallback
        }
      }
      req.tenantId = 'dev-tenant-001';
      return next();
    }

    const tenantId = req.headers[TENANT_ID_HEADER] as string | undefined;
    const correlationId = req.headers['x-correlation-id'] as string | undefined;

    // Validate tenant ID is present
    if (!tenantId) {
      throw new ForbiddenException(this.createRfc7807Error(
        'tenant_id_missing',
        'Tenant ID Required',
        'X-Tenant-Id header is required for this request',
        correlationId
      ));
    }

    // Validate tenant ID format (must have tnt_ prefix)
    if (!tenantId.startsWith('tnt_')) {
      throw new ForbiddenException(this.createRfc7807Error(
        'invalid_tenant_id_format',
        'Invalid Tenant ID Format',
        'Tenant ID must start with "tnt_" prefix',
        correlationId
      ));
    }

    // Validate tenant exists and is active
    const tenant = await this.platformPrisma.tenantRegistry.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new ForbiddenException(this.createRfc7807Error(
        'tenant_not_found',
        'Tenant Not Found',
        'No tenant found for provided X-Tenant-Id header',
        correlationId
      ));
    }

    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new ForbiddenException(this.createRfc7807Error(
        'tenant_not_active',
        'Tenant Not Active',
        `Tenant is currently ${tenant.status.toLowerCase()}`,
        correlationId
      ));
    }

    // Attach tenant ID to request for downstream use
    req.tenantId = tenantId;

    next();
  }

  private isExcludedPath(path: string): boolean {
    return this.excludedPaths.some(
      (excluded) => path === excluded || path.startsWith(`${excluded}/`)
    );
  }

  private createRfc7807Error(
    type: string,
    title: string,
    detail: string,
    correlationId?: string
  ): Rfc7807Error {
    return {
      type,
      title,
      status: 403,
      detail,
      ...(correlationId && { correlationId }),
    };
  }
}
