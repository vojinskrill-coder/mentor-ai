"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "TenantPrismaService", {
    enumerable: true,
    get: function() {
        return TenantPrismaService;
    }
});
const _ts_decorate = require("@swc/helpers/_/_ts_decorate");
const _ts_metadata = require("@swc/helpers/_/_ts_metadata");
const _common = require("@nestjs/common");
const _config = require("@nestjs/config");
const _client = require("@prisma/client");
const DEFAULT_POOL_CONFIG = {
    max: 10,
    idleTimeoutMs: 30000,
    acquireTimeoutMs: 5000
};
let TenantPrismaService = class TenantPrismaService {
    /**
   * Get or create a PrismaClient for the given tenant
   * Uses lazy initialization and connection pooling
   */ async getClient(tenantId) {
        const existing = this.clients.get(tenantId);
        if (existing) {
            existing.lastUsed = Date.now();
            return existing.client;
        }
        return this.createClient(tenantId);
    }
    /**
   * Get a PrismaClient synchronously (for middleware use)
   * Note: Will create connection if not exists
   */ getClientSync(tenantId) {
        const existing = this.clients.get(tenantId);
        if (existing) {
            existing.lastUsed = Date.now();
            return existing.client;
        }
        const client = this.createClientSync(tenantId);
        return client;
    }
    async createClient(tenantId) {
        const dbUrl = this.getTenantDbUrl(tenantId);
        const client = new _client.PrismaClient({
            datasources: {
                db: {
                    url: dbUrl
                }
            }
        });
        try {
            // Connect with timeout
            const connectPromise = client.$connect();
            const timeoutPromise = new Promise((_, reject)=>{
                setTimeout(()=>{
                    reject(new Error(`Connection acquisition timeout after ${this.poolConfig.acquireTimeoutMs}ms for tenant ${tenantId}`));
                }, this.poolConfig.acquireTimeoutMs);
            });
            await Promise.race([
                connectPromise,
                timeoutPromise
            ]);
            this.clients.set(tenantId, {
                client,
                lastUsed: Date.now()
            });
            return client;
        } catch (error) {
            // Clean up the client on connection failure to prevent memory leak
            await client.$disconnect().catch(()=>{
            // Ignore disconnect errors during cleanup
            });
            throw error;
        }
    }
    createClientSync(tenantId) {
        const dbUrl = this.getTenantDbUrl(tenantId);
        const client = new _client.PrismaClient({
            datasources: {
                db: {
                    url: dbUrl
                }
            }
        });
        this.clients.set(tenantId, {
            client,
            lastUsed: Date.now()
        });
        // Connect in background - client will auto-connect on first query
        return client;
    }
    getTenantDbUrl(tenantId) {
        // Dev mode: use the platform DATABASE_URL for all tenants (single-database mode)
        const devMode = this.configService.get('DEV_MODE') === 'true';
        if (devMode) {
            const platformUrl = this.configService.get('DATABASE_URL');
            if (platformUrl) {
                return platformUrl;
            }
        }
        var _this_configService_get;
        const host = (_this_configService_get = this.configService.get('TENANT_DB_HOST')) != null ? _this_configService_get : 'localhost';
        var _this_configService_get1;
        const port = (_this_configService_get1 = this.configService.get('TENANT_DB_PORT')) != null ? _this_configService_get1 : 5432;
        var _this_configService_get2;
        const user = (_this_configService_get2 = this.configService.get('TENANT_DB_USER')) != null ? _this_configService_get2 : 'postgres';
        var _this_configService_get3;
        const password = (_this_configService_get3 = this.configService.get('TENANT_DB_PASSWORD')) != null ? _this_configService_get3 : 'postgres';
        // Tenant database name follows convention: tenant_{tenantId without prefix}
        const dbName = `tenant_${tenantId.replace('tnt_', '')}`;
        // URL-encode credentials to handle special characters (e.g., @, :, /)
        const encodedUser = encodeURIComponent(user);
        const encodedPassword = encodeURIComponent(password);
        return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${dbName}?connection_limit=${this.poolConfig.max}`;
    }
    startIdleCleanup() {
        // Run cleanup every minute
        this.cleanupInterval = setInterval(()=>{
            this.cleanupIdleConnections();
        }, 60000);
    }
    cleanupIdleConnections() {
        const now = Date.now();
        for (const [tenantId, connection] of this.clients.entries()){
            if (now - connection.lastUsed > this.poolConfig.idleTimeoutMs) {
                connection.client.$disconnect().catch(()=>{
                // Ignore disconnect errors during cleanup
                });
                this.clients.delete(tenantId);
            }
        }
    }
    /**
   * Disconnect a specific tenant's client
   */ async disconnectTenant(tenantId) {
        const connection = this.clients.get(tenantId);
        if (connection) {
            await connection.client.$disconnect();
            this.clients.delete(tenantId);
        }
    }
    /**
   * Get the number of active connections
   */ getActiveConnectionCount() {
        return this.clients.size;
    }
    /**
   * Check if a tenant has an active connection
   */ hasConnection(tenantId) {
        return this.clients.has(tenantId);
    }
    async onModuleDestroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        // Disconnect all clients
        const disconnectPromises = Array.from(this.clients.values()).map((connection)=>connection.client.$disconnect());
        await Promise.all(disconnectPromises);
        this.clients.clear();
    }
    constructor(configService){
        this.configService = configService;
        this.clients = new Map();
        this.cleanupInterval = null;
        var _this_configService_get, _this_configService_get1, _this_configService_get2;
        this.poolConfig = {
            max: (_this_configService_get = this.configService.get('TENANT_DB_POOL_MAX')) != null ? _this_configService_get : DEFAULT_POOL_CONFIG.max,
            idleTimeoutMs: (_this_configService_get1 = this.configService.get('TENANT_DB_IDLE_TIMEOUT_MS')) != null ? _this_configService_get1 : DEFAULT_POOL_CONFIG.idleTimeoutMs,
            acquireTimeoutMs: (_this_configService_get2 = this.configService.get('TENANT_DB_ACQUIRE_TIMEOUT_MS')) != null ? _this_configService_get2 : DEFAULT_POOL_CONFIG.acquireTimeoutMs
        };
        this.startIdleCleanup();
    }
};
TenantPrismaService = _ts_decorate._([
    (0, _common.Injectable)(),
    _ts_metadata._("design:type", Function),
    _ts_metadata._("design:paramtypes", [
        typeof _config.ConfigService === "undefined" ? Object : _config.ConfigService
    ])
], TenantPrismaService);

//# sourceMappingURL=tenant-prisma.service.js.map