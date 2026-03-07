import { NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { PlatformPrismaService } from './platform-prisma.service';
export declare const TENANT_ID_HEADER = "x-tenant-id";
export declare const TENANT_ID_KEY = "tenantId";
declare global {
    namespace Express {
        interface Request {
            tenantId?: string;
        }
    }
}
export declare class TenantMiddleware implements NestMiddleware {
    private readonly platformPrisma;
    private readonly configService;
    private readonly excludedPaths;
    /** Cached dev tenant ID resolved from DB */
    private resolvedDevTenantId;
    constructor(platformPrisma: PlatformPrismaService, configService: ConfigService);
    /**
     * Resolves the real active tenant ID for DEV_MODE, matching JwtAuthGuard.getDevUser().
     * Caches the result for server lifetime. Falls back to 'dev-tenant-001' if DB query fails.
     */
    private resolveDevTenantId;
    use(req: Request, res: Response, next: NextFunction): Promise<void>;
    private isExcludedPath;
    private createRfc7807Error;
}
