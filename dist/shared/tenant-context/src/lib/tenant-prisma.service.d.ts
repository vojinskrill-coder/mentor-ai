import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PlatformPrismaService } from './platform-prisma.service';
export declare class TenantPrismaService implements OnModuleDestroy {
    private readonly configService;
    private readonly platformPrisma;
    private readonly clients;
    private readonly poolConfig;
    private cleanupInterval;
    constructor(configService: ConfigService, platformPrisma: PlatformPrismaService);
    /**
     * Get or create a PrismaClient for the given tenant
     * Uses lazy initialization and connection pooling
     */
    getClient(tenantId: string): Promise<PrismaClient>;
    /**
     * Get a PrismaClient synchronously (for middleware use)
     * Note: Will create connection if not exists
     */
    getClientSync(tenantId: string): PrismaClient;
    private createClient;
    private createClientSync;
    /** Cache of tenant DB URLs resolved from registry */
    private readonly dbUrlCache;
    private getTenantDbUrlAsync;
    private getTenantDbUrl;
    private buildTenantDbUrl;
    private startIdleCleanup;
    private cleanupIdleConnections;
    /**
     * Disconnect a specific tenant's client
     */
    disconnectTenant(tenantId: string): Promise<void>;
    /**
     * Get the number of active connections
     */
    getActiveConnectionCount(): number;
    /**
     * Check if a tenant has an active connection
     */
    hasConnection(tenantId: string): boolean;
    onModuleDestroy(): Promise<void>;
}
