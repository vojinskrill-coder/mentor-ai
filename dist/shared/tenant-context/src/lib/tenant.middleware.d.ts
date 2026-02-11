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
    constructor(platformPrisma: PlatformPrismaService, configService: ConfigService);
    use(req: Request, res: Response, next: NextFunction): Promise<void>;
    private isExcludedPath;
    private createRfc7807Error;
}
