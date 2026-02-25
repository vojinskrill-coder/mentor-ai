/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */,
/* 1 */
/***/ ((module) => {

module.exports = require("@nestjs/common");

/***/ }),
/* 2 */
/***/ ((module) => {

module.exports = require("@nestjs/core");

/***/ }),
/* 3 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const serve_static_1 = __webpack_require__(6);
const path_1 = __webpack_require__(7);
const fs_1 = __webpack_require__(8);
const tenant_context_1 = __webpack_require__(9);
const app_controller_1 = __webpack_require__(16);
const app_service_1 = __webpack_require__(17);
const health_module_1 = __webpack_require__(18);
const registration_module_1 = __webpack_require__(25);
const auth_module_1 = __webpack_require__(40);
const invitation_module_1 = __webpack_require__(59);
const team_module_1 = __webpack_require__(124);
const llm_config_module_1 = __webpack_require__(73);
const ai_gateway_module_1 = __webpack_require__(87);
const conversation_module_1 = __webpack_require__(129);
const onboarding_module_1 = __webpack_require__(155);
const personas_module_1 = __webpack_require__(162);
const knowledge_module_1 = __webpack_require__(72);
const memory_module_1 = __webpack_require__(134);
const qdrant_module_1 = __webpack_require__(165);
const web_search_module_1 = __webpack_require__(143);
const admin_module_1 = __webpack_require__(166);
// Serve Angular static files in production (combined deploy)
const staticPath = (0, path_1.join)(__dirname, '..', '..', 'web', 'browser');
const serveStaticImports = (0, fs_1.existsSync)(staticPath)
    ? [serve_static_1.ServeStaticModule.forRoot({
            rootPath: staticPath,
            exclude: ['/api/(.*)', '/ws/(.*)'],
        })]
    : [];
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: [
                    'apps/api/.env.local',
                    'apps/api/.env',
                    '.env.local',
                    '.env',
                ],
            }),
            ...serveStaticImports,
            qdrant_module_1.QdrantModule,
            tenant_context_1.TenantModule,
            health_module_1.HealthModule,
            registration_module_1.RegistrationModule,
            auth_module_1.AuthModule,
            invitation_module_1.InvitationModule,
            team_module_1.TeamModule,
            // TODO: Enable when Redis is available (BullMQ dependency)
            // DataExportModule,
            // TenantDeletionModule,
            llm_config_module_1.LlmConfigModule,
            ai_gateway_module_1.AiGatewayModule,
            conversation_module_1.ConversationModule,
            onboarding_module_1.OnboardingModule,
            personas_module_1.PersonasModule,
            knowledge_module_1.KnowledgeModule,
            memory_module_1.MemoryModule,
            web_search_module_1.WebSearchModule,
            admin_module_1.AdminModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);


/***/ }),
/* 4 */
/***/ ((module) => {

module.exports = require("tslib");

/***/ }),
/* 5 */
/***/ ((module) => {

module.exports = require("@nestjs/config");

/***/ }),
/* 6 */
/***/ ((module) => {

module.exports = require("@nestjs/serve-static");

/***/ }),
/* 7 */
/***/ ((module) => {

module.exports = require("path");

/***/ }),
/* 8 */
/***/ ((module) => {

module.exports = require("fs");

/***/ }),
/* 9 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


// Tenant Context Library
// Provides multi-tenant database routing and context management
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TenantModule = exports.TenantId = exports.TENANT_ID_KEY = exports.TENANT_ID_HEADER = exports.TenantMiddleware = exports.PlatformPrismaService = exports.TenantPrismaService = void 0;
// Services
var tenant_prisma_service_1 = __webpack_require__(10);
Object.defineProperty(exports, "TenantPrismaService", ({ enumerable: true, get: function () { return tenant_prisma_service_1.TenantPrismaService; } }));
var platform_prisma_service_1 = __webpack_require__(12);
Object.defineProperty(exports, "PlatformPrismaService", ({ enumerable: true, get: function () { return platform_prisma_service_1.PlatformPrismaService; } }));
// Middleware
var tenant_middleware_1 = __webpack_require__(13);
Object.defineProperty(exports, "TenantMiddleware", ({ enumerable: true, get: function () { return tenant_middleware_1.TenantMiddleware; } }));
Object.defineProperty(exports, "TENANT_ID_HEADER", ({ enumerable: true, get: function () { return tenant_middleware_1.TENANT_ID_HEADER; } }));
Object.defineProperty(exports, "TENANT_ID_KEY", ({ enumerable: true, get: function () { return tenant_middleware_1.TENANT_ID_KEY; } }));
// Decorators
var tenant_id_decorator_1 = __webpack_require__(14);
Object.defineProperty(exports, "TenantId", ({ enumerable: true, get: function () { return tenant_id_decorator_1.TenantId; } }));
// Module
var tenant_module_1 = __webpack_require__(15);
Object.defineProperty(exports, "TenantModule", ({ enumerable: true, get: function () { return tenant_module_1.TenantModule; } }));


/***/ }),
/* 10 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TenantPrismaService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const client_1 = __webpack_require__(11);
const DEFAULT_POOL_CONFIG = {
    max: 10,
    idleTimeoutMs: 30000,
    acquireTimeoutMs: 5000,
};
let TenantPrismaService = class TenantPrismaService {
    constructor(configService) {
        this.configService = configService;
        this.clients = new Map();
        this.cleanupInterval = null;
        this.poolConfig = {
            max: this.configService.get('TENANT_DB_POOL_MAX') ?? DEFAULT_POOL_CONFIG.max,
            idleTimeoutMs: this.configService.get('TENANT_DB_IDLE_TIMEOUT_MS') ?? DEFAULT_POOL_CONFIG.idleTimeoutMs,
            acquireTimeoutMs: this.configService.get('TENANT_DB_ACQUIRE_TIMEOUT_MS') ?? DEFAULT_POOL_CONFIG.acquireTimeoutMs,
        };
        this.startIdleCleanup();
    }
    /**
     * Get or create a PrismaClient for the given tenant
     * Uses lazy initialization and connection pooling
     */
    async getClient(tenantId) {
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
     */
    getClientSync(tenantId) {
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
        const client = new client_1.PrismaClient({
            datasources: {
                db: { url: dbUrl },
            },
        });
        try {
            // Connect with timeout
            const connectPromise = client.$connect();
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Connection acquisition timeout after ${this.poolConfig.acquireTimeoutMs}ms for tenant ${tenantId}`));
                }, this.poolConfig.acquireTimeoutMs);
            });
            await Promise.race([connectPromise, timeoutPromise]);
            this.clients.set(tenantId, {
                client,
                lastUsed: Date.now(),
            });
            return client;
        }
        catch (error) {
            // Clean up the client on connection failure to prevent memory leak
            await client.$disconnect().catch(() => {
                // Ignore disconnect errors during cleanup
            });
            throw error;
        }
    }
    createClientSync(tenantId) {
        const dbUrl = this.getTenantDbUrl(tenantId);
        const client = new client_1.PrismaClient({
            datasources: {
                db: { url: dbUrl },
            },
        });
        this.clients.set(tenantId, {
            client,
            lastUsed: Date.now(),
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
        const host = this.configService.get('TENANT_DB_HOST') ?? 'localhost';
        const port = this.configService.get('TENANT_DB_PORT') ?? 5432;
        const user = this.configService.get('TENANT_DB_USER') ?? 'postgres';
        const password = this.configService.get('TENANT_DB_PASSWORD') ?? 'postgres';
        // Tenant database name follows convention: tenant_{tenantId without prefix}
        const dbName = `tenant_${tenantId.replace('tnt_', '')}`;
        // URL-encode credentials to handle special characters (e.g., @, :, /)
        const encodedUser = encodeURIComponent(user);
        const encodedPassword = encodeURIComponent(password);
        return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${dbName}?connection_limit=${this.poolConfig.max}`;
    }
    startIdleCleanup() {
        // Run cleanup every minute
        this.cleanupInterval = setInterval(() => {
            this.cleanupIdleConnections();
        }, 60000);
    }
    cleanupIdleConnections() {
        const now = Date.now();
        for (const [tenantId, connection] of this.clients.entries()) {
            if (now - connection.lastUsed > this.poolConfig.idleTimeoutMs) {
                connection.client.$disconnect().catch(() => {
                    // Ignore disconnect errors during cleanup
                });
                this.clients.delete(tenantId);
            }
        }
    }
    /**
     * Disconnect a specific tenant's client
     */
    async disconnectTenant(tenantId) {
        const connection = this.clients.get(tenantId);
        if (connection) {
            await connection.client.$disconnect();
            this.clients.delete(tenantId);
        }
    }
    /**
     * Get the number of active connections
     */
    getActiveConnectionCount() {
        return this.clients.size;
    }
    /**
     * Check if a tenant has an active connection
     */
    hasConnection(tenantId) {
        return this.clients.has(tenantId);
    }
    async onModuleDestroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        // Disconnect all clients
        const disconnectPromises = Array.from(this.clients.values()).map((connection) => connection.client.$disconnect());
        await Promise.all(disconnectPromises);
        this.clients.clear();
    }
};
exports.TenantPrismaService = TenantPrismaService;
exports.TenantPrismaService = TenantPrismaService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], TenantPrismaService);


/***/ }),
/* 11 */
/***/ ((module) => {

module.exports = require("@prisma/client");

/***/ }),
/* 12 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PlatformPrismaService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const client_1 = __webpack_require__(11);
let PlatformPrismaService = class PlatformPrismaService extends client_1.PrismaClient {
    constructor(configService) {
        const databaseUrl = configService.get('DATABASE_URL');
        if (!databaseUrl) {
            throw new Error('DATABASE_URL environment variable is required but not set. ' +
                'Please configure DATABASE_URL in your .env file. ' +
                'Example: DATABASE_URL=postgresql://user:password@localhost:5432/mentor_ai_platform');
        }
        super({
            datasources: {
                db: { url: databaseUrl },
            },
        });
    }
    async onModuleInit() {
        await this.$connect();
    }
    async onModuleDestroy() {
        await this.$disconnect();
    }
};
exports.PlatformPrismaService = PlatformPrismaService;
exports.PlatformPrismaService = PlatformPrismaService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], PlatformPrismaService);


/***/ }),
/* 13 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TenantMiddleware = exports.TENANT_ID_KEY = exports.TENANT_ID_HEADER = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const platform_prisma_service_1 = __webpack_require__(12);
const client_1 = __webpack_require__(11);
exports.TENANT_ID_HEADER = 'x-tenant-id';
exports.TENANT_ID_KEY = 'tenantId';
let TenantMiddleware = class TenantMiddleware {
    constructor(platformPrisma, configService) {
        this.platformPrisma = platformPrisma;
        this.configService = configService;
        // Paths that don't require tenant context (e.g., health checks, platform admin)
        this.excludedPaths = [
            '/health',
            '/api/health',
            '/api/v1/health',
        ];
    }
    async use(req, res, next) {
        // Skip tenant validation for excluded paths
        if (this.isExcludedPath(req.path)) {
            return next();
        }
        // Dev mode: try to extract tenantId from JWT if a real token is present,
        // otherwise fall back to dev-tenant-001
        if (this.configService.get('DEV_MODE') === 'true') {
            const authHeader = req.headers?.authorization;
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
                }
                catch {
                    // Token decode failed - use dev fallback
                }
            }
            req.tenantId = 'dev-tenant-001';
            return next();
        }
        const tenantId = req.headers[exports.TENANT_ID_HEADER];
        const correlationId = req.headers['x-correlation-id'];
        // Validate tenant ID is present
        if (!tenantId) {
            throw new common_1.ForbiddenException(this.createRfc7807Error('tenant_id_missing', 'Tenant ID Required', 'X-Tenant-Id header is required for this request', correlationId));
        }
        // Validate tenant ID format (must have tnt_ prefix)
        if (!tenantId.startsWith('tnt_')) {
            throw new common_1.ForbiddenException(this.createRfc7807Error('invalid_tenant_id_format', 'Invalid Tenant ID Format', 'Tenant ID must start with "tnt_" prefix', correlationId));
        }
        // Validate tenant exists and is active
        const tenant = await this.platformPrisma.tenantRegistry.findUnique({
            where: { id: tenantId },
        });
        if (!tenant) {
            throw new common_1.ForbiddenException(this.createRfc7807Error('tenant_not_found', 'Tenant Not Found', 'No tenant found for provided X-Tenant-Id header', correlationId));
        }
        if (tenant.status !== client_1.TenantStatus.ACTIVE) {
            throw new common_1.ForbiddenException(this.createRfc7807Error('tenant_not_active', 'Tenant Not Active', `Tenant is currently ${tenant.status.toLowerCase()}`, correlationId));
        }
        // Attach tenant ID to request for downstream use
        req.tenantId = tenantId;
        next();
    }
    isExcludedPath(path) {
        return this.excludedPaths.some((excluded) => path === excluded || path.startsWith(`${excluded}/`));
    }
    createRfc7807Error(type, title, detail, correlationId) {
        return {
            type,
            title,
            status: 403,
            detail,
            ...(correlationId && { correlationId }),
        };
    }
};
exports.TenantMiddleware = TenantMiddleware;
exports.TenantMiddleware = TenantMiddleware = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof platform_prisma_service_1.PlatformPrismaService !== "undefined" && platform_prisma_service_1.PlatformPrismaService) === "function" ? _a : Object, typeof (_b = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _b : Object])
], TenantMiddleware);


/***/ }),
/* 14 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TenantId = void 0;
const common_1 = __webpack_require__(1);
/**
 * Parameter decorator to extract the tenant ID from the request context.
 * The tenant ID is set by TenantMiddleware after validation.
 *
 * @example
 * ```typescript
 * @Get('data')
 * getData(@TenantId() tenantId: string) {
 *   return this.myService.getData(tenantId);
 * }
 * ```
 */
exports.TenantId = (0, common_1.createParamDecorator)((data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    const tenantId = request.tenantId;
    if (!tenantId) {
        throw new common_1.ForbiddenException({
            type: 'tenant_context_missing',
            title: 'Tenant Context Missing',
            status: 403,
            detail: 'Tenant context not available. Ensure TenantMiddleware is configured.',
        });
    }
    return tenantId;
});


/***/ }),
/* 15 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TenantModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const tenant_prisma_service_1 = __webpack_require__(10);
const platform_prisma_service_1 = __webpack_require__(12);
const tenant_middleware_1 = __webpack_require__(13);
let TenantModule = class TenantModule {
    configure(consumer) {
        consumer.apply(tenant_middleware_1.TenantMiddleware).forRoutes('*');
    }
};
exports.TenantModule = TenantModule;
exports.TenantModule = TenantModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule],
        providers: [tenant_prisma_service_1.TenantPrismaService, platform_prisma_service_1.PlatformPrismaService, tenant_middleware_1.TenantMiddleware],
        exports: [tenant_prisma_service_1.TenantPrismaService, platform_prisma_service_1.PlatformPrismaService],
    })
], TenantModule);


/***/ }),
/* 16 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const app_service_1 = __webpack_require__(17);
let AppController = class AppController {
    constructor(appService) {
        this.appService = appService;
    }
    getData() {
        return this.appService.getData();
    }
};
exports.AppController = AppController;
tslib_1.__decorate([
    (0, common_1.Get)(),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", void 0)
], AppController.prototype, "getData", null);
exports.AppController = AppController = tslib_1.__decorate([
    (0, common_1.Controller)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof app_service_1.AppService !== "undefined" && app_service_1.AppService) === "function" ? _a : Object])
], AppController);


/***/ }),
/* 17 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AppService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
let AppService = class AppService {
    getData() {
        return { message: 'Hello API' };
    }
};
exports.AppService = AppService;
exports.AppService = AppService = tslib_1.__decorate([
    (0, common_1.Injectable)()
], AppService);


/***/ }),
/* 18 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HealthModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const terminus_1 = __webpack_require__(19);
const tenant_context_1 = __webpack_require__(9);
const health_controller_1 = __webpack_require__(20);
const health_service_1 = __webpack_require__(21);
const prisma_health_1 = __webpack_require__(23);
const memory_health_1 = __webpack_require__(24);
let HealthModule = class HealthModule {
};
exports.HealthModule = HealthModule;
exports.HealthModule = HealthModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [terminus_1.TerminusModule, tenant_context_1.TenantModule], // TenantModule provides PlatformPrismaService
        controllers: [health_controller_1.HealthController],
        providers: [health_service_1.HealthService, prisma_health_1.PrismaHealthIndicator, memory_health_1.MemoryHealthIndicator],
    })
], HealthModule);


/***/ }),
/* 19 */
/***/ ((module) => {

module.exports = require("@nestjs/terminus");

/***/ }),
/* 20 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c, _d, _e, _f, _g;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HealthController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const terminus_1 = __webpack_require__(19);
const health_service_1 = __webpack_require__(21);
const prisma_health_1 = __webpack_require__(23);
const memory_health_1 = __webpack_require__(24);
let HealthController = class HealthController {
    constructor(health, healthService, prismaHealth, memoryHealth) {
        this.health = health;
        this.healthService = healthService;
        this.prismaHealth = prismaHealth;
        this.memoryHealth = memoryHealth;
    }
    /**
     * GET /health
     * Basic health check endpoint returning status, timestamp, and version.
     * Response time should be < 100ms (no blocking operations).
     */
    getHealth(correlationId) {
        return {
            status: 'healthy',
            timestamp: this.healthService.getTimestamp(),
            version: this.healthService.getVersion(),
            ...(correlationId && { correlationId }),
        };
    }
    /**
     * GET /health/ready
     * Readiness probe checking all critical dependencies.
     * Returns 503 if any critical dependency fails.
     *
     * Checks performed:
     * - database: PostgreSQL via Prisma
     * - memory: Heap usage < 90% threshold
     *
     * TODO: Add Redis health indicator when Upstash is configured (Story 1.4 AC2 partial)
     */
    async getReadiness(correlationId) {
        const result = await this.health.check([
            () => this.prismaHealth.isHealthy('database'),
            () => this.memoryHealth.isHealthy('memory', { threshold: 0.9 }),
            // TODO: Add Redis check when Upstash is configured
            // () => this.redisHealth.isHealthy('redis'),
        ]);
        // Add correlation ID to response if provided
        if (correlationId) {
            result.correlationId =
                correlationId;
        }
        return result;
    }
    /**
     * GET /health/live
     * Liveness probe for Kubernetes.
     * Minimal payload, no external checks.
     */
    getLiveness() {
        return { status: 'ok' };
    }
};
exports.HealthController = HealthController;
tslib_1.__decorate([
    (0, common_1.Get)(),
    tslib_1.__param(0, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", typeof (_e = typeof health_service_1.HealthResponse !== "undefined" && health_service_1.HealthResponse) === "function" ? _e : Object)
], HealthController.prototype, "getHealth", null);
tslib_1.__decorate([
    (0, common_1.Get)('ready'),
    (0, terminus_1.HealthCheck)(),
    tslib_1.__param(0, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", typeof (_f = typeof Promise !== "undefined" && Promise) === "function" ? _f : Object)
], HealthController.prototype, "getReadiness", null);
tslib_1.__decorate([
    (0, common_1.Get)('live'),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", typeof (_g = typeof health_service_1.LiveResponse !== "undefined" && health_service_1.LiveResponse) === "function" ? _g : Object)
], HealthController.prototype, "getLiveness", null);
exports.HealthController = HealthController = tslib_1.__decorate([
    (0, common_1.Controller)('health'),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof terminus_1.HealthCheckService !== "undefined" && terminus_1.HealthCheckService) === "function" ? _a : Object, typeof (_b = typeof health_service_1.HealthService !== "undefined" && health_service_1.HealthService) === "function" ? _b : Object, typeof (_c = typeof prisma_health_1.PrismaHealthIndicator !== "undefined" && prisma_health_1.PrismaHealthIndicator) === "function" ? _c : Object, typeof (_d = typeof memory_health_1.MemoryHealthIndicator !== "undefined" && memory_health_1.MemoryHealthIndicator) === "function" ? _d : Object])
], HealthController);


/***/ }),
/* 21 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HealthService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
// Read version from package.json
// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = __webpack_require__(22);
let HealthService = class HealthService {
    getVersion() {
        return packageJson.version || '0.0.0';
    }
    getTimestamp() {
        return new Date().toISOString();
    }
};
exports.HealthService = HealthService;
exports.HealthService = HealthService = tslib_1.__decorate([
    (0, common_1.Injectable)()
], HealthService);


/***/ }),
/* 22 */
/***/ ((module) => {

module.exports = /*#__PURE__*/JSON.parse('{"name":"@mentor-ai/source","version":"0.0.0","license":"MIT","engines":{"node":">=22.0.0"},"scripts":{"prepare":"husky","lint":"nx run-many -t lint","format":"nx format:write","format:check":"nx format:check","prisma:generate":"cd apps/api && npx prisma generate","prisma:migrate":"cd apps/api && npx prisma migrate dev","prisma:seed":"cd apps/api && npx ts-node prisma/seed.ts","prisma:studio":"cd apps/api && npx prisma studio","db:reset":"cd apps/api && npx prisma migrate reset --force","test":"nx run-many -t test","test:affected":"nx affected -t test","test:coverage":"nx run-many -t test -- --coverage","test:api":"nx test api","test:web":"nx test web","e2e":"npx playwright test","e2e:ui":"npx playwright test --ui"},"lint-staged":{"*.{ts,tsx,js,jsx}":["eslint --fix","prettier --write"],"*.{json,md,html,css,scss}":["prettier --write"]},"private":true,"dependencies":{"@angular/common":"~21.1.0","@angular/compiler":"~21.1.0","@angular/core":"~21.1.0","@angular/forms":"~21.1.0","@angular/platform-browser":"~21.1.0","@angular/router":"~21.1.0","@auth0/auth0-angular":"^2.5.0","@nestjs-modules/mailer":"^2.0.2","@nestjs/bullmq":"^11.0.4","@nestjs/common":"^11.0.0","@nestjs/config":"^4.0.3","@nestjs/core":"^11.0.0","@nestjs/passport":"^11.0.5","@nestjs/platform-express":"^11.0.0","@nestjs/platform-socket.io":"^11.1.13","@nestjs/serve-static":"^5.0.4","@nestjs/terminus":"^11.0.0","@nestjs/throttler":"^6.5.0","@nestjs/websockets":"^11.1.13","@ng-icons/core":"^33.0.0","@ng-icons/lucide":"^33.0.0","@paralleldrive/cuid2":"^3.3.0","@prisma/client":"^5.22.0","@qdrant/js-client-rest":"^1.16.2","@spartan-ng/brain":"^0.0.1-alpha.614","@tailwindcss/postcss":"^4.1.18","@types/marked":"^6.0.0","@types/multer":"^2.0.0","@upstash/ratelimit":"^2.0.8","@upstash/redis":"^1.36.2","archiver":"^7.0.1","axios":"^1.6.0","bcrypt":"^6.0.0","bullmq":"^5.66.5","class-transformer":"^0.5.1","class-validator":"^0.14.3","dompurify":"^3.3.1","json2md":"^2.0.3","jsonwebtoken":"^9.0.3","jwks-rsa":"^3.2.2","marked":"^17.0.1","multer":"^2.0.2","nodemailer":"^8.0.0","passport":"^0.7.0","passport-jwt":"^4.0.1","pdf-parse":"^2.4.5","pdfmake":"^0.3.2","prisma":"^5.22.0","reflect-metadata":"^0.1.13","rxjs":"^7.8.0","socket.io":"^4.8.3","socket.io-client":"^4.8.3","tailwindcss":"^4.1.18"},"devDependencies":{"@analogjs/vite-plugin-angular":"~2.1.2","@analogjs/vitest-angular":"~2.1.2","@angular-devkit/core":"~21.1.0","@angular-devkit/schematics":"~21.1.0","@angular/build":"~21.1.0","@angular/cli":"~21.1.0","@angular/compiler-cli":"~21.1.0","@angular/language-service":"~21.1.0","@axe-core/playwright":"^4.11.1","@eslint/js":"^9.8.0","@nestjs/schematics":"^11.0.0","@nestjs/testing":"^11.0.0","@nx/angular":"^22.4.5","@nx/eslint":"22.4.5","@nx/eslint-plugin":"22.4.5","@nx/jest":"22.4.5","@nx/js":"22.4.5","@nx/nest":"22.4.5","@nx/node":"22.4.5","@nx/storybook":"^22.4.5","@nx/vite":"22.4.5","@nx/vitest":"22.4.5","@nx/web":"22.4.5","@nx/webpack":"22.4.5","@nx/workspace":"22.4.5","@schematics/angular":"~21.1.0","@spartan-ng/cli":"^0.0.1-alpha.614","@storybook/addon-a11y":"^10.2.6","@storybook/addon-essentials":"^8.6.14","@storybook/angular":"^10.2.6","@swc-node/register":"~1.9.1","@swc/cli":"~0.6.0","@swc/core":"~1.5.7","@swc/helpers":"~0.5.11","@swc/jest":"~0.2.38","@types/archiver":"^7.0.0","@types/bcrypt":"^6.0.0","@types/dompurify":"^3.2.0","@types/jest":"^30.0.0","@types/json2md":"^1.5.4","@types/jsonwebtoken":"^9.0.10","@types/node":"^22.0.0","@types/nodemailer":"^7.0.9","@types/passport-jwt":"^4.0.1","@types/pdfmake":"^0.3.0","@typescript-eslint/utils":"^8.40.0","@vitest/coverage-v8":"^4.0.0","@vitest/ui":"^4.0.8","angular-eslint":"^21.0.1","autoprefixer":"^10.4.0","axe-core":"^4.11.1","eslint":"^9.8.0","eslint-config-prettier":"^10.0.0","husky":"^9.1.7","jest":"^30.0.2","jest-environment-node":"^30.0.2","jest-util":"^30.0.2","jsdom":"^27.1.0","jsonc-eslint-parser":"^2.1.0","lint-staged":"^16.2.7","nx":"22.4.5","postcss":"^8.4.5","prettier":"~3.6.2","storybook":"^10.2.6","ts-jest":"^29.4.0","ts-node":"10.9.1","tslib":"^2.3.0","typescript":"~5.9.2","typescript-eslint":"^8.40.0","vite":"^7.0.0","vitest":"^4.0.8","webpack-cli":"^5.1.4"}}');

/***/ }),
/* 23 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PrismaHealthIndicator = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const terminus_1 = __webpack_require__(19);
const tenant_context_1 = __webpack_require__(9);
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds max
let PrismaHealthIndicator = class PrismaHealthIndicator extends terminus_1.HealthIndicator {
    constructor(prisma) {
        super();
        this.prisma = prisma;
    }
    /**
     * Check if Prisma/PostgreSQL connection is healthy.
     * Uses a simple SELECT 1 query with timeout handling.
     */
    async isHealthy(key) {
        try {
            await this.checkWithTimeout(() => this.prisma.$queryRaw `SELECT 1`, HEALTH_CHECK_TIMEOUT);
            return this.getStatus(key, true);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new terminus_1.HealthCheckError('Prisma check failed', this.getStatus(key, false, { message: errorMessage }));
        }
    }
    /**
     * Execute a health check with timeout.
     * Implements circuit breaker pattern to prevent cascading failures.
     */
    async checkWithTimeout(check, timeout) {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Health check timeout')), timeout);
        });
        try {
            const result = await Promise.race([check(), timeoutPromise]);
            return result;
        }
        finally {
            // Clean up timer to prevent memory leaks
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }
};
exports.PrismaHealthIndicator = PrismaHealthIndicator;
exports.PrismaHealthIndicator = PrismaHealthIndicator = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object])
], PrismaHealthIndicator);


/***/ }),
/* 24 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MemoryHealthIndicator = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const terminus_1 = __webpack_require__(19);
let MemoryHealthIndicator = class MemoryHealthIndicator extends terminus_1.HealthIndicator {
    /**
     * Check if memory usage is below the threshold.
     * @param key - The key which will be used for the health indicator result
     * @param options - Memory health check options
     */
    async isHealthy(key, options = {}) {
        const threshold = options.threshold ?? 0.9;
        const memoryUsage = process.memoryUsage();
        const heapTotal = memoryUsage.heapTotal;
        const heapUsed = memoryUsage.heapUsed;
        const usageRatio = heapUsed / heapTotal;
        const usagePercent = Math.round(usageRatio * 100);
        const isHealthy = usageRatio < threshold;
        const details = {
            heapUsed: this.formatBytes(heapUsed),
            heapTotal: this.formatBytes(heapTotal),
            usage: `${usagePercent}%`,
            threshold: `${Math.round(threshold * 100)}%`,
        };
        if (isHealthy) {
            return this.getStatus(key, true, details);
        }
        throw new terminus_1.HealthCheckError(`Memory usage (${usagePercent}%) exceeds threshold (${Math.round(threshold * 100)}%)`, this.getStatus(key, false, details));
    }
    /**
     * Format bytes to human readable string.
     */
    formatBytes(bytes) {
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(2)} MB`;
    }
};
exports.MemoryHealthIndicator = MemoryHealthIndicator;
exports.MemoryHealthIndicator = MemoryHealthIndicator = tslib_1.__decorate([
    (0, common_1.Injectable)()
], MemoryHealthIndicator);


/***/ }),
/* 25 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RegistrationModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const registration_controller_1 = __webpack_require__(26);
const registration_service_1 = __webpack_require__(28);
const file_upload_module_1 = __webpack_require__(39);
const tenant_context_1 = __webpack_require__(9);
let RegistrationModule = class RegistrationModule {
};
exports.RegistrationModule = RegistrationModule;
exports.RegistrationModule = RegistrationModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [file_upload_module_1.FileUploadModule, tenant_context_1.TenantModule], // TenantModule provides PlatformPrismaService
        controllers: [registration_controller_1.RegistrationController],
        providers: [registration_service_1.RegistrationService],
        exports: [registration_service_1.RegistrationService],
    })
], RegistrationModule);


/***/ }),
/* 26 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RegistrationController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const platform_express_1 = __webpack_require__(27);
const registration_service_1 = __webpack_require__(28);
const register_tenant_dto_1 = __webpack_require__(36);
const file_upload_service_1 = __webpack_require__(38);
let RegistrationController = class RegistrationController {
    constructor(registrationService, fileUploadService) {
        this.registrationService = registrationService;
        this.fileUploadService = fileUploadService;
    }
    async register(dto, correlationId, icon) {
        // Validate file upfront if provided (saveFile also validates, but fail fast)
        if (icon) {
            this.fileUploadService.validateFile(icon);
        }
        const result = await this.registrationService.registerTenant(dto);
        // Save file after tenant is created (we need the tenant ID for filename)
        if (icon) {
            let uploadResult;
            try {
                uploadResult = await this.fileUploadService.saveFile(icon, result.tenantId, false // Skip validation since we already validated above
                );
                // Update tenant with icon URL
                await this.registrationService.updateTenantIcon(result.tenantId, uploadResult.url);
                result.iconUrl = uploadResult.url;
            }
            catch (error) {
                // Clean up orphaned file if icon update fails
                if (uploadResult?.filename) {
                    await this.fileUploadService
                        .deleteFile(uploadResult.filename)
                        .catch(() => {
                        /* Ignore cleanup errors */
                    });
                }
                throw error;
            }
        }
        const response = {
            status: 'success',
            message: 'Registration successful. Please complete OAuth authentication.',
            ...result,
        };
        if (correlationId) {
            response.correlationId = correlationId;
        }
        return response;
    }
};
exports.RegistrationController = RegistrationController;
tslib_1.__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('icon')),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__param(1, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__param(2, (0, common_1.UploadedFile)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_c = typeof register_tenant_dto_1.RegisterTenantDto !== "undefined" && register_tenant_dto_1.RegisterTenantDto) === "function" ? _c : Object, String, typeof (_d = typeof file_upload_service_1.UploadedFileType !== "undefined" && file_upload_service_1.UploadedFileType) === "function" ? _d : Object]),
    tslib_1.__metadata("design:returntype", typeof (_e = typeof Promise !== "undefined" && Promise) === "function" ? _e : Object)
], RegistrationController.prototype, "register", null);
exports.RegistrationController = RegistrationController = tslib_1.__decorate([
    (0, common_1.Controller)('registration'),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof registration_service_1.RegistrationService !== "undefined" && registration_service_1.RegistrationService) === "function" ? _a : Object, typeof (_b = typeof file_upload_service_1.FileUploadService !== "undefined" && file_upload_service_1.FileUploadService) === "function" ? _b : Object])
], RegistrationController);


/***/ }),
/* 27 */
/***/ ((module) => {

module.exports = require("@nestjs/platform-express");

/***/ }),
/* 28 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RegistrationService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const utils_1 = __webpack_require__(29);
const prisma_1 = __webpack_require__(34);
let RegistrationService = class RegistrationService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async checkEmailExists(email) {
        const user = await this.prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });
        return user !== null;
    }
    async registerTenant(dto) {
        const normalizedEmail = dto.email.toLowerCase();
        // Check for existing email
        const emailExists = await this.checkEmailExists(normalizedEmail);
        if (emailExists) {
            throw new common_1.ConflictException({
                type: 'email_already_exists',
                title: 'Email Already Registered',
                status: 409,
                detail: 'An account with this email already exists',
            });
        }
        // Generate IDs with prefixes
        const tenantId = (0, utils_1.generateTenantId)();
        const userId = (0, utils_1.generateUserId)();
        // Create tenant and user in a transaction
        await this.prisma.$transaction(async (tx) => {
            // Create tenant in DRAFT state
            await tx.tenant.create({
                data: {
                    id: tenantId,
                    name: dto.companyName,
                    industry: dto.industry,
                    description: dto.description,
                    status: prisma_1.TenantStatus.DRAFT,
                },
            });
            // Create user with TENANT_OWNER role
            await tx.user.create({
                data: {
                    id: userId,
                    email: normalizedEmail,
                    role: prisma_1.UserRole.TENANT_OWNER,
                    tenantId: tenantId,
                },
            });
        });
        return {
            tenantId,
            userId,
            email: normalizedEmail,
            companyName: dto.companyName,
        };
    }
    async updateTenantIcon(tenantId, iconUrl) {
        await this.prisma.tenant.update({
            where: { id: tenantId },
            data: { iconUrl },
        });
    }
};
exports.RegistrationService = RegistrationService;
exports.RegistrationService = RegistrationService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object])
], RegistrationService);


/***/ }),
/* 29 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const tslib_1 = __webpack_require__(4);
tslib_1.__exportStar(__webpack_require__(30), exports);
tslib_1.__exportStar(__webpack_require__(31), exports);
tslib_1.__exportStar(__webpack_require__(33), exports);


/***/ }),
/* 30 */
/***/ ((__unused_webpack_module, exports) => {


/**
 * Shared utility functions for Mentor AI
 * These utilities are used across both frontend (Angular) and backend (NestJS)
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.generateId = generateId;
exports.isDefined = isDefined;
exports.safeJsonParse = safeJsonParse;
exports.delay = delay;
exports.truncate = truncate;
/** Generate a unique ID */
function generateId() {
    return crypto.randomUUID();
}
/** Check if a value is defined (not null or undefined) */
function isDefined(value) {
    return value !== null && value !== undefined;
}
/** Safely parse JSON with error handling */
function safeJsonParse(json, fallback) {
    try {
        return JSON.parse(json);
    }
    catch {
        return fallback;
    }
}
/** Delay execution for specified milliseconds */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** Truncate string to specified length with ellipsis */
function truncate(str, maxLength) {
    if (str.length <= maxLength) {
        return str;
    }
    return str.slice(0, maxLength - 3) + '...';
}


/***/ }),
/* 31 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


/**
 * Entity ID generators with prefixes
 * Uses cuid2 for collision-resistant, URL-safe IDs
 * Prefixes identify entity types: usr_ (user), tnt_ (tenant)
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ID_PREFIX = void 0;
exports.generateUserId = generateUserId;
exports.generateTenantId = generateTenantId;
exports.generateInvitationId = generateInvitationId;
exports.generateInviteToken = generateInviteToken;
exports.hasValidPrefix = hasValidPrefix;
exports.stripPrefix = stripPrefix;
const cuid2_1 = __webpack_require__(32);
/** Entity ID prefixes */
exports.ID_PREFIX = {
    USER: 'usr_',
    TENANT: 'tnt_',
    INVITATION: 'inv_',
};
/** Generate a user ID with usr_ prefix */
function generateUserId() {
    return `${exports.ID_PREFIX.USER}${(0, cuid2_1.createId)()}`;
}
/** Generate a tenant ID with tnt_ prefix */
function generateTenantId() {
    return `${exports.ID_PREFIX.TENANT}${(0, cuid2_1.createId)()}`;
}
/** Generate an invitation ID with inv_ prefix */
function generateInvitationId() {
    return `${exports.ID_PREFIX.INVITATION}${(0, cuid2_1.createId)()}`;
}
/** Generate a URL-safe invite token (no prefix, used in invite links) */
function generateInviteToken() {
    return (0, cuid2_1.createId)();
}
/** Validate that an ID has the expected prefix */
function hasValidPrefix(id, prefix) {
    return id.startsWith(prefix);
}
/** Extract the raw ID without prefix */
function stripPrefix(id) {
    const prefixMatch = Object.values(exports.ID_PREFIX).find((p) => id.startsWith(p));
    return prefixMatch ? id.slice(prefixMatch.length) : id;
}


/***/ }),
/* 32 */
/***/ ((module) => {

module.exports = require("@paralleldrive/cuid2");

/***/ }),
/* 33 */
/***/ ((__unused_webpack_module, exports) => {


/**
 * Industry options for tenant registration
 * These values are used in the registration form dropdown
 * and validated on the backend
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.INDUSTRIES = void 0;
exports.isValidIndustry = isValidIndustry;
exports.INDUSTRIES = [
    'Technology',
    'Healthcare',
    'Finance',
    'Retail',
    'Manufacturing',
    'Education',
    'Real Estate',
    'Legal',
    'Marketing',
    'Consulting',
    'Other',
];
/** Check if a value is a valid industry */
function isValidIndustry(value) {
    return exports.INDUSTRIES.includes(value);
}


/***/ }),
/* 34 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const tslib_1 = __webpack_require__(4);
tslib_1.__exportStar(__webpack_require__(35), exports);


/***/ }),
/* 35 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


// Re-export Prisma client and types from @prisma/client
// This provides a clean import path: @mentor-ai/shared/prisma
// The Prisma client is generated from apps/api/prisma/schema.prisma
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.NoteStatus = exports.NoteType = exports.NoteSource = exports.Department = exports.InvitationStatus = exports.UserRole = exports.TenantStatus = exports.Prisma = exports.PrismaClient = void 0;
var client_1 = __webpack_require__(11);
Object.defineProperty(exports, "PrismaClient", ({ enumerable: true, get: function () { return client_1.PrismaClient; } }));
Object.defineProperty(exports, "Prisma", ({ enumerable: true, get: function () { return client_1.Prisma; } }));
Object.defineProperty(exports, "TenantStatus", ({ enumerable: true, get: function () { return client_1.TenantStatus; } }));
Object.defineProperty(exports, "UserRole", ({ enumerable: true, get: function () { return client_1.UserRole; } }));
Object.defineProperty(exports, "InvitationStatus", ({ enumerable: true, get: function () { return client_1.InvitationStatus; } }));
Object.defineProperty(exports, "Department", ({ enumerable: true, get: function () { return client_1.Department; } }));
Object.defineProperty(exports, "NoteSource", ({ enumerable: true, get: function () { return client_1.NoteSource; } }));
Object.defineProperty(exports, "NoteType", ({ enumerable: true, get: function () { return client_1.NoteType; } }));
Object.defineProperty(exports, "NoteStatus", ({ enumerable: true, get: function () { return client_1.NoteStatus; } }));


/***/ }),
/* 36 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RegisterTenantDto = void 0;
const tslib_1 = __webpack_require__(4);
const class_validator_1 = __webpack_require__(37);
const utils_1 = __webpack_require__(29);
class RegisterTenantDto {
}
exports.RegisterTenantDto = RegisterTenantDto;
tslib_1.__decorate([
    (0, class_validator_1.IsEmail)({}, { message: 'Please provide a valid email address' }),
    tslib_1.__metadata("design:type", String)
], RegisterTenantDto.prototype, "email", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2, { message: 'Company name must be at least 2 characters' }),
    (0, class_validator_1.MaxLength)(100, { message: 'Company name cannot exceed 100 characters' }),
    tslib_1.__metadata("design:type", String)
], RegisterTenantDto.prototype, "companyName", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(utils_1.INDUSTRIES, { message: 'Please select a valid industry' }),
    tslib_1.__metadata("design:type", typeof (_a = typeof utils_1.Industry !== "undefined" && utils_1.Industry) === "function" ? _a : Object)
], RegisterTenantDto.prototype, "industry", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500, { message: 'Business description cannot exceed 500 characters' }),
    tslib_1.__metadata("design:type", String)
], RegisterTenantDto.prototype, "description", void 0);


/***/ }),
/* 37 */
/***/ ((module) => {

module.exports = require("class-validator");

/***/ }),
/* 38 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.FileUploadService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const cuid2_1 = __webpack_require__(32);
const fs = tslib_1.__importStar(__webpack_require__(8));
const path = tslib_1.__importStar(__webpack_require__(7));
const DEFAULT_OPTIONS = {
    maxSizeBytes: 2 * 1024 * 1024, // 2MB
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg'],
};
let FileUploadService = class FileUploadService {
    constructor() {
        // Use uploads directory in project root for development
        this.uploadDir = path.join(process.cwd(), 'uploads', 'icons');
        this.ensureUploadDirExists();
    }
    ensureUploadDirExists() {
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
    }
    validateFile(file, options = DEFAULT_OPTIONS) {
        // Check file size
        if (file.size > options.maxSizeBytes) {
            const maxSizeMB = options.maxSizeBytes / (1024 * 1024);
            throw new common_1.BadRequestException({
                type: 'validation_error',
                title: 'File Too Large',
                status: 400,
                detail: `Please upload a PNG or JPG image under ${maxSizeMB}MB`,
            });
        }
        // Check file type
        if (!options.allowedMimeTypes.includes(file.mimetype)) {
            throw new common_1.BadRequestException({
                type: 'validation_error',
                title: 'Invalid File Type',
                status: 400,
                detail: 'Please upload a PNG or JPG image under 2MB',
            });
        }
    }
    generateUniqueFilename(tenantId, originalName) {
        // Sanitize extension to prevent path traversal attacks
        const rawExt = path.extname(originalName).toLowerCase();
        const sanitizedExt = rawExt.replace(/[^a-z0-9.]/gi, '');
        const ext = sanitizedExt.startsWith('.') ? sanitizedExt : `.${sanitizedExt}`;
        const uniqueId = (0, cuid2_1.createId)();
        return `${tenantId}_${uniqueId}${ext}`;
    }
    async saveFile(file, tenantId, skipValidation = false) {
        // Validate file first (unless already validated)
        if (!skipValidation) {
            this.validateFile(file);
        }
        // Generate unique filename
        const filename = this.generateUniqueFilename(tenantId, file.originalname);
        const filePath = path.join(this.uploadDir, filename);
        // Save file to disk
        await fs.promises.writeFile(filePath, file.buffer);
        return {
            filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            url: `/uploads/icons/${filename}`,
        };
    }
    async deleteFile(filename) {
        const filePath = path.join(this.uploadDir, filename);
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
    }
    getFilePath(filename) {
        return path.join(this.uploadDir, filename);
    }
};
exports.FileUploadService = FileUploadService;
exports.FileUploadService = FileUploadService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [])
], FileUploadService);


/***/ }),
/* 39 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.FileUploadModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const file_upload_service_1 = __webpack_require__(38);
let FileUploadModule = class FileUploadModule {
};
exports.FileUploadModule = FileUploadModule;
exports.FileUploadModule = FileUploadModule = tslib_1.__decorate([
    (0, common_1.Module)({
        providers: [file_upload_service_1.FileUploadService],
        exports: [file_upload_service_1.FileUploadService],
    })
], FileUploadModule);


/***/ }),
/* 40 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AuthModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const passport_1 = __webpack_require__(41);
const config_1 = __webpack_require__(5);
const tenant_context_1 = __webpack_require__(9);
const auth_controller_1 = __webpack_require__(42);
const google_auth_controller_1 = __webpack_require__(55);
const auth_service_1 = __webpack_require__(43);
const jwt_strategy_1 = __webpack_require__(48);
const jwt_auth_guard_1 = __webpack_require__(45);
const roles_guard_1 = __webpack_require__(54);
const mfa_required_guard_1 = __webpack_require__(58);
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [
            passport_1.PassportModule.register({ defaultStrategy: 'jwt' }),
            config_1.ConfigModule,
            tenant_context_1.TenantModule, // Provides PlatformPrismaService
        ],
        controllers: [auth_controller_1.AuthController, google_auth_controller_1.GoogleAuthController],
        providers: [
            auth_service_1.AuthService,
            jwt_strategy_1.JwtStrategy,
            jwt_auth_guard_1.JwtAuthGuard,
            roles_guard_1.RolesGuard,
            mfa_required_guard_1.MfaRequiredGuard,
        ],
        exports: [auth_service_1.AuthService, jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard, mfa_required_guard_1.MfaRequiredGuard],
    })
], AuthModule);


/***/ }),
/* 41 */
/***/ ((module) => {

module.exports = require("@nestjs/passport");

/***/ }),
/* 42 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AuthController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const cuid2_1 = __webpack_require__(32);
const auth_service_1 = __webpack_require__(43);
const jwt_auth_guard_1 = __webpack_require__(45);
const current_user_decorator_1 = __webpack_require__(47);
const jwt_strategy_1 = __webpack_require__(48);
const skip_mfa_decorator_1 = __webpack_require__(50);
const verify_totp_dto_1 = __webpack_require__(51);
const enroll_mfa_dto_1 = __webpack_require__(52);
const roles_decorator_1 = __webpack_require__(53);
const roles_guard_1 = __webpack_require__(54);
let AuthController = class AuthController {
    constructor(authService) {
        this.authService = authService;
    }
    /**
     * Auth0 callback endpoint - called after OAuth flow
     * Links Auth0 identity to existing user
     */
    async handleCallback(user, correlationId) {
        // Check if user exists by email
        const existingUser = await this.authService.findUserByEmail(user.email);
        if (!existingUser) {
            throw new common_1.UnauthorizedException({
                type: 'user_not_found',
                title: 'User Not Found',
                status: 401,
                detail: 'Please register before logging in',
                correlationId,
            });
        }
        // Link Auth0 ID if not already linked
        if (!existingUser.auth0Id) {
            await this.authService.linkAuth0Identity(existingUser.id, user.auth0Id);
            // Update tenant status to ONBOARDING after first OAuth
            if (existingUser.tenant.status === 'DRAFT') {
                await this.authService.updateTenantStatusToOnboarding(existingUser.tenantId);
            }
        }
        // Check MFA status
        const mfaStatus = await this.authService.getMfaStatus(existingUser.id);
        const response = {
            status: 'success',
            message: mfaStatus.enabled
                ? 'Authentication successful'
                : 'Authentication successful. Please set up 2FA.',
            user: {
                userId: existingUser.id,
                email: existingUser.email,
                tenantId: existingUser.tenantId,
                role: existingUser.role,
            },
            requiresMfaSetup: !mfaStatus.enabled,
        };
        if (correlationId) {
            response.correlationId = correlationId;
        }
        return response;
    }
    /**
     * Get current user's MFA status
     */
    async getMfaStatus(user, correlationId) {
        const status = await this.authService.getMfaStatus(user.userId);
        return { ...status, correlationId };
    }
    /**
     * Initiate MFA enrollment - generates secret and QR code
     */
    async enrollMfa(user, correlationId) {
        // Check if already enrolled
        const status = await this.authService.getMfaStatus(user.userId);
        if (status.enabled) {
            throw new common_1.BadRequestException({
                type: 'mfa_already_enabled',
                title: 'MFA Already Enabled',
                status: 400,
                detail: 'Two-factor authentication is already enabled for your account',
                correlationId,
            });
        }
        // Generate recovery codes and TOTP secret
        const { codes, hashedCodes } = await this.authService.generateRecoveryCodes();
        const secret = `MENTOR${(0, cuid2_1.createId)().slice(0, 12).toUpperCase()}`;
        // Generate QR code URL (otpauth format)
        const appName = 'MentorAI';
        const qrCodeDataUrl = `otpauth://totp/${appName}:${user.email}?secret=${secret}&issuer=${appName}`;
        // Persist secret and hashed recovery codes to DB during enrollment
        await this.authService.storePendingMfaEnrollment(user.userId, secret, hashedCodes);
        const response = {
            status: 'success',
            qrCodeDataUrl,
            secret,
            recoveryCodes: codes,
            message: 'Scan the QR code with your authenticator app and enter the code to verify',
        };
        if (correlationId) {
            response.correlationId = correlationId;
        }
        return response;
    }
    /**
     * Verify TOTP code and complete MFA enrollment
     */
    async verifyMfaEnrollment(user, dto, correlationId) {
        // Verify the TOTP code against stored secret
        const secret = await this.authService.getMfaSecret(user.userId);
        if (!secret) {
            throw new common_1.BadRequestException({
                type: 'mfa_not_enrolled',
                title: 'MFA Not Enrolled',
                status: 400,
                detail: 'Please initiate MFA enrollment first',
                correlationId,
            });
        }
        // Validate code format (6-digit numeric)
        const isValidFormat = dto.code.length === 6 && /^\d{6}$/.test(dto.code);
        if (!isValidFormat) {
            throw new common_1.BadRequestException({
                type: 'invalid_totp_format',
                title: 'Invalid Code Format',
                status: 400,
                detail: 'Verification code must be a 6-digit number',
                correlationId,
            });
        }
        // TODO: Implement proper TOTP verification with otplib
        // For MVP, accept any valid-format 6-digit code
        // In production: authenticator.verify({ token: dto.code, secret })
        // Enable MFA for user (recovery codes already stored during enrollment)
        await this.authService.enableMfa(user.userId);
        const response = {
            status: 'success',
            message: 'Two-factor authentication has been enabled successfully',
        };
        if (correlationId) {
            response.correlationId = correlationId;
        }
        return response;
    }
    /**
     * Verify TOTP code during login
     */
    async verifyLoginTotp(user, dto, correlationId) {
        // Check if account is locked
        await this.authService.checkAccountLocked(user.userId);
        // Validate code format (6-digit numeric)
        const isValidFormat = dto.code.length === 6 && /^\d{6}$/.test(dto.code);
        // TODO: Implement proper TOTP verification with otplib
        // For MVP, accept any valid-format 6-digit code
        // In production: authenticator.verify({ token: dto.code, secret })
        const secret = await this.authService.getMfaSecret(user.userId);
        const isValidCode = isValidFormat && !!secret;
        if (!isValidCode) {
            const lockoutStatus = await this.authService.recordFailedAttempt(user.userId);
            throw new common_1.UnauthorizedException({
                type: 'invalid_totp',
                title: 'Invalid Verification Code',
                status: 401,
                detail: lockoutStatus.locked
                    ? 'Your account has been locked due to too many failed attempts'
                    : `The verification code you entered is incorrect. You have ${lockoutStatus.attemptsRemaining} attempts remaining.`,
                attemptsRemaining: lockoutStatus.attemptsRemaining,
                locked: lockoutStatus.locked,
                lockoutUntil: lockoutStatus.lockoutUntil?.toISOString(),
                correlationId,
            });
        }
        // Reset failed attempts on success
        await this.authService.resetFailedAttempts(user.userId);
        const response = {
            status: 'success',
            message: 'Verification successful',
        };
        if (correlationId) {
            response.correlationId = correlationId;
        }
        return response;
    }
    /**
     * Verify recovery code
     */
    async verifyRecoveryCode(user, dto, correlationId) {
        const result = await this.authService.verifyRecoveryCode(user.userId, dto.recoveryCode);
        if (!result.valid) {
            throw new common_1.UnauthorizedException({
                type: 'invalid_recovery_code',
                title: 'Invalid Recovery Code',
                status: 401,
                detail: 'The recovery code you entered is invalid or has already been used',
                correlationId,
            });
        }
        const response = {
            status: 'success',
            message: 'Recovery code verified. You are now logged in.',
        };
        if (correlationId) {
            response.correlationId = correlationId;
        }
        return response;
    }
    /**
     * Get account lockout status
     */
    async getLockoutStatus(user, correlationId) {
        const status = await this.authService.getLockoutStatus(user.userId);
        return { ...status, correlationId };
    }
    /**
     * Unlock account (admin only)
     */
    async unlockAccount(targetUserId, admin, correlationId) {
        await this.authService.unlockAccount(targetUserId);
        const response = {
            status: 'success',
            message: 'Account has been unlocked',
        };
        if (correlationId) {
            response.correlationId = correlationId;
        }
        return response;
    }
    /**
     * Logout endpoint - invalidates session
     */
    async logout(user, correlationId) {
        // In production, you would invalidate the session in Redis
        // For now, Auth0 handles session invalidation on the frontend
        const response = {
            status: 'success',
            message: 'Logged out successfully',
        };
        if (correlationId) {
            response.correlationId = correlationId;
        }
        return response;
    }
};
exports.AuthController = AuthController;
tslib_1.__decorate([
    (0, common_1.Post)('callback'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, skip_mfa_decorator_1.SkipMfa)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_b = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _b : Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_c = typeof Promise !== "undefined" && Promise) === "function" ? _c : Object)
], AuthController.prototype, "handleCallback", null);
tslib_1.__decorate([
    (0, common_1.Get)('2fa/status'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, skip_mfa_decorator_1.SkipMfa)(),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_d = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _d : Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_e = typeof Promise !== "undefined" && Promise) === "function" ? _e : Object)
], AuthController.prototype, "getMfaStatus", null);
tslib_1.__decorate([
    (0, common_1.Post)('2fa/enroll'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, skip_mfa_decorator_1.SkipMfa)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_f = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _f : Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_g = typeof Promise !== "undefined" && Promise) === "function" ? _g : Object)
], AuthController.prototype, "enrollMfa", null);
tslib_1.__decorate([
    (0, common_1.Post)('2fa/verify'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, skip_mfa_decorator_1.SkipMfa)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__param(2, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_h = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _h : Object, typeof (_j = typeof enroll_mfa_dto_1.EnrollMfaDto !== "undefined" && enroll_mfa_dto_1.EnrollMfaDto) === "function" ? _j : Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_k = typeof Promise !== "undefined" && Promise) === "function" ? _k : Object)
], AuthController.prototype, "verifyMfaEnrollment", null);
tslib_1.__decorate([
    (0, common_1.Post)('2fa/verify-login'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, skip_mfa_decorator_1.SkipMfa)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__param(2, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_l = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _l : Object, typeof (_m = typeof verify_totp_dto_1.VerifyTotpDto !== "undefined" && verify_totp_dto_1.VerifyTotpDto) === "function" ? _m : Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_o = typeof Promise !== "undefined" && Promise) === "function" ? _o : Object)
], AuthController.prototype, "verifyLoginTotp", null);
tslib_1.__decorate([
    (0, common_1.Post)('2fa/recovery'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, skip_mfa_decorator_1.SkipMfa)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__param(2, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_p = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _p : Object, typeof (_q = typeof enroll_mfa_dto_1.VerifyRecoveryCodeDto !== "undefined" && enroll_mfa_dto_1.VerifyRecoveryCodeDto) === "function" ? _q : Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_r = typeof Promise !== "undefined" && Promise) === "function" ? _r : Object)
], AuthController.prototype, "verifyRecoveryCode", null);
tslib_1.__decorate([
    (0, common_1.Get)('lockout-status'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, skip_mfa_decorator_1.SkipMfa)(),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_s = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _s : Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_t = typeof Promise !== "undefined" && Promise) === "function" ? _t : Object)
], AuthController.prototype, "getLockoutStatus", null);
tslib_1.__decorate([
    (0, common_1.Post)('unlock/:userId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('PLATFORM_OWNER', 'TENANT_OWNER'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, common_1.Param)('userId')),
    tslib_1.__param(1, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(2, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, typeof (_u = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _u : Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_v = typeof Promise !== "undefined" && Promise) === "function" ? _v : Object)
], AuthController.prototype, "unlockAccount", null);
tslib_1.__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, skip_mfa_decorator_1.SkipMfa)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_w = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _w : Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_x = typeof Promise !== "undefined" && Promise) === "function" ? _x : Object)
], AuthController.prototype, "logout", null);
exports.AuthController = AuthController = tslib_1.__decorate([
    (0, common_1.Controller)('auth'),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof auth_service_1.AuthService !== "undefined" && auth_service_1.AuthService) === "function" ? _a : Object])
], AuthController);


/***/ }),
/* 43 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AuthService = exports.LOCKOUT_DURATION_MINUTES = exports.MAX_FAILED_ATTEMPTS = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const bcrypt = tslib_1.__importStar(__webpack_require__(44));
const cuid2_1 = __webpack_require__(32);
const tenant_context_1 = __webpack_require__(9);
exports.MAX_FAILED_ATTEMPTS = 5;
exports.LOCKOUT_DURATION_MINUTES = 15;
const BCRYPT_SALT_ROUNDS = 10;
let AuthService = class AuthService {
    constructor(configService, prisma) {
        this.configService = configService;
        this.prisma = prisma;
    }
    /**
     * Get MFA status for a user
     */
    async getMfaStatus(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { mfaEnabled: true, updatedAt: true },
        });
        if (!user) {
            return { enabled: false };
        }
        return {
            enabled: user.mfaEnabled,
            enrolledAt: user.mfaEnabled ? user.updatedAt : undefined,
        };
    }
    /**
     * Get account lockout status
     */
    async getLockoutStatus(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { failedLoginAttempts: true, lockoutUntil: true },
        });
        if (!user) {
            return { locked: false, attemptsRemaining: exports.MAX_FAILED_ATTEMPTS };
        }
        const now = new Date();
        const isLocked = user.lockoutUntil && user.lockoutUntil > now;
        if (isLocked) {
            return {
                locked: true,
                lockoutUntil: user.lockoutUntil,
                attemptsRemaining: 0,
            };
        }
        // If lockout has expired, reset attempts
        if (user.lockoutUntil && user.lockoutUntil <= now) {
            await this.resetFailedAttempts(userId);
            return { locked: false, attemptsRemaining: exports.MAX_FAILED_ATTEMPTS };
        }
        return {
            locked: false,
            attemptsRemaining: exports.MAX_FAILED_ATTEMPTS - user.failedLoginAttempts,
        };
    }
    /**
     * Check if account is locked
     */
    async checkAccountLocked(userId) {
        const status = await this.getLockoutStatus(userId);
        if (status.locked) {
            throw new common_1.ForbiddenException({
                type: 'account_locked',
                title: 'Account Temporarily Locked',
                status: 403,
                detail: `Your account has been locked due to too many failed login attempts. Please try again in ${exports.LOCKOUT_DURATION_MINUTES} minutes.`,
                lockoutUntil: status.lockoutUntil?.toISOString(),
            });
        }
    }
    /**
     * Record a failed login attempt
     */
    async recordFailedAttempt(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { failedLoginAttempts: true, email: true },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('User not found');
        }
        const newAttempts = user.failedLoginAttempts + 1;
        if (newAttempts >= exports.MAX_FAILED_ATTEMPTS) {
            // Lock the account
            const lockoutUntil = new Date();
            lockoutUntil.setMinutes(lockoutUntil.getMinutes() + exports.LOCKOUT_DURATION_MINUTES);
            await this.prisma.user.update({
                where: { id: userId },
                data: {
                    failedLoginAttempts: newAttempts,
                    lockoutUntil,
                },
            });
            // TODO: Send email notification about account lockout
            // await this.sendLockoutNotification(user.email);
            return {
                locked: true,
                lockoutUntil,
                attemptsRemaining: 0,
            };
        }
        await this.prisma.user.update({
            where: { id: userId },
            data: { failedLoginAttempts: newAttempts },
        });
        return {
            locked: false,
            attemptsRemaining: exports.MAX_FAILED_ATTEMPTS - newAttempts,
        };
    }
    /**
     * Reset failed login attempts after successful login
     */
    async resetFailedAttempts(userId) {
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                failedLoginAttempts: 0,
                lockoutUntil: null,
            },
        });
    }
    /**
     * Generate 8 recovery codes
     */
    async generateRecoveryCodes() {
        const codes = [];
        const hashedCodes = [];
        for (let i = 0; i < 8; i++) {
            // Generate 10-character alphanumeric code
            const code = (0, cuid2_1.createId)().slice(0, 10).toUpperCase();
            codes.push(code);
            hashedCodes.push(await bcrypt.hash(code, BCRYPT_SALT_ROUNDS));
        }
        return { codes, hashedCodes };
    }
    /**
     * Verify a recovery code
     */
    async verifyRecoveryCode(userId, code) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { recoveryCodesHash: true },
        });
        if (!user || !user.recoveryCodesHash.length) {
            return { valid: false, usedIndex: -1 };
        }
        for (let i = 0; i < user.recoveryCodesHash.length; i++) {
            const hashedCode = user.recoveryCodesHash[i];
            if (!hashedCode)
                continue;
            const isValid = await bcrypt.compare(code, hashedCode);
            if (isValid) {
                // Remove the used recovery code
                const updatedCodes = [...user.recoveryCodesHash];
                updatedCodes.splice(i, 1);
                await this.prisma.user.update({
                    where: { id: userId },
                    data: { recoveryCodesHash: updatedCodes },
                });
                // Reset failed attempts on successful recovery
                await this.resetFailedAttempts(userId);
                return { valid: true, usedIndex: i };
            }
        }
        return { valid: false, usedIndex: -1 };
    }
    /**
     * Store pending MFA enrollment data (secret + recovery codes)
     */
    async storePendingMfaEnrollment(userId, secret, hashedRecoveryCodes) {
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                mfaSecret: secret,
                recoveryCodesHash: hashedRecoveryCodes,
            },
        });
    }
    /**
     * Enable MFA for a user (called after successful TOTP verification)
     */
    async enableMfa(userId) {
        await this.prisma.user.update({
            where: { id: userId },
            data: { mfaEnabled: true },
        });
    }
    /**
     * Get stored TOTP secret for verification
     */
    async getMfaSecret(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { mfaSecret: true },
        });
        return user?.mfaSecret ?? null;
    }
    /**
     * Link Auth0 identity to user
     */
    async linkAuth0Identity(userId, auth0Id) {
        await this.prisma.user.update({
            where: { id: userId },
            data: { auth0Id },
        });
    }
    /**
     * Find user by Auth0 ID
     */
    async findUserByAuth0Id(auth0Id) {
        return this.prisma.user.findUnique({
            where: { auth0Id },
            include: { tenant: true },
        });
    }
    /**
     * Find user by email
     */
    async findUserByEmail(email) {
        return this.prisma.user.findUnique({
            where: { email },
            include: { tenant: true },
        });
    }
    /**
     * Update tenant status after first OAuth
     */
    async updateTenantStatusToOnboarding(tenantId) {
        await this.prisma.tenant.update({
            where: { id: tenantId },
            data: { status: 'ONBOARDING' },
        });
    }
    /**
     * Unlock a user account (admin function)
     */
    async unlockAccount(userId) {
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                failedLoginAttempts: 0,
                lockoutUntil: null,
            },
        });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object, typeof (_b = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _b : Object])
], AuthService);


/***/ }),
/* 44 */
/***/ ((module) => {

module.exports = require("bcrypt");

/***/ }),
/* 45 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var JwtAuthGuard_1;
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.JwtAuthGuard = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const passport_1 = __webpack_require__(41);
const core_1 = __webpack_require__(2);
const public_decorator_1 = __webpack_require__(46);
const prisma_1 = __webpack_require__(34);
/** Static fallback when no active tenant exists yet (fresh DB) */
const DEV_USER_FALLBACK = {
    userId: 'dev-user-001',
    tenantId: 'dev-tenant-001',
    email: 'dev@mentor-ai.local',
    role: 'PLATFORM_OWNER',
    department: null,
    permissions: ['*'],
};
let JwtAuthGuard = JwtAuthGuard_1 = class JwtAuthGuard extends (0, passport_1.AuthGuard)('jwt') {
    constructor(reflector, configService) {
        super();
        this.reflector = reflector;
        this.configService = configService;
        this.logger = new common_1.Logger(JwtAuthGuard_1.name);
        /** Cached dev user resolved from DB (avoids repeat queries) */
        this.resolvedDevUser = null;
    }
    async canActivate(context) {
        // Check if route is marked as public
        const isPublic = this.reflector.getAllAndOverride(public_decorator_1.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }
        const devMode = this.configService.get('DEV_MODE') === 'true';
        if (devMode) {
            const request = context.switchToHttp().getRequest();
            const authHeader = request.headers?.authorization;
            // If a real Bearer token is present (not the dev-mode-token placeholder),
            // validate it AND verify the user still exists in DB
            if (authHeader?.startsWith('Bearer ') && !authHeader.includes('dev-mode-token')) {
                try {
                    const result = await super.canActivate(context);
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
                        throw new common_1.UnauthorizedException({
                            type: 'user_not_found',
                            title: 'Session Expired',
                            status: 401,
                            detail: 'Your session is no longer valid. Please log in again.',
                        });
                    }
                }
                catch (err) {
                    if (err instanceof common_1.UnauthorizedException)
                        throw err;
                    // Token invalid or expired - fall back to dev user
                    this.logger.debug('Dev mode: JWT validation failed, using dev user fallback');
                }
            }
            // No token or validation failed — resolve dev user from DB
            request.user = await this.getDevUser();
            return true;
        }
        // Production mode: validate JWT and verify user exists
        const result = await super.canActivate(context);
        if (result) {
            const request = context.switchToHttp().getRequest();
            if (request.user?.userId) {
                const userExists = await this.verifyUserExists(request.user.userId);
                if (!userExists) {
                    throw new common_1.UnauthorizedException({
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
    async verifyUserExists(userId) {
        const prisma = new prisma_1.PrismaClient();
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true },
            });
            return user !== null;
        }
        catch {
            // DB error — allow through to avoid blocking on transient failures
            return true;
        }
        finally {
            await prisma.$disconnect();
        }
    }
    /**
     * Resolves a real active tenant and its owner for dev mode.
     * Uses a standalone PrismaClient to avoid DI module dependency issues.
     * Falls back to static IDs if no active tenant exists yet.
     * Result is cached so DB is only queried once per server start.
     */
    async getDevUser() {
        if (this.resolvedDevUser)
            return this.resolvedDevUser;
        const prisma = new prisma_1.PrismaClient();
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
                        role: 'PLATFORM_OWNER',
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
        }
        catch (err) {
            this.logger.warn({
                message: 'Dev mode: failed to resolve tenant, using fallback',
                error: err instanceof Error ? err.message : 'Unknown',
            });
        }
        finally {
            await prisma.$disconnect();
        }
        this.resolvedDevUser = DEV_USER_FALLBACK;
        return this.resolvedDevUser;
    }
    handleRequest(err, user, info) {
        if (err || !user) {
            throw (err ||
                new common_1.UnauthorizedException({
                    type: 'unauthorized',
                    title: 'Authentication Required',
                    status: 401,
                    detail: info?.message || 'You must be logged in to access this resource',
                }));
        }
        return user;
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = JwtAuthGuard_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof core_1.Reflector !== "undefined" && core_1.Reflector) === "function" ? _a : Object, typeof (_b = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _b : Object])
], JwtAuthGuard);


/***/ }),
/* 46 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Public = exports.IS_PUBLIC_KEY = void 0;
const common_1 = __webpack_require__(1);
exports.IS_PUBLIC_KEY = 'isPublic';
const Public = () => (0, common_1.SetMetadata)(exports.IS_PUBLIC_KEY, true);
exports.Public = Public;


/***/ }),
/* 47 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CurrentUser = void 0;
const common_1 = __webpack_require__(1);
exports.CurrentUser = (0, common_1.createParamDecorator)((data, ctx) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
        return null;
    }
    return data ? user[data] : user;
});


/***/ }),
/* 48 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.JwtStrategy = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const passport_1 = __webpack_require__(41);
const passport_jwt_1 = __webpack_require__(49);
const config_1 = __webpack_require__(5);
let JwtStrategy = class JwtStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy) {
    constructor(configService) {
        const jwtSecret = configService.get('JWT_SECRET');
        if (!jwtSecret) {
            throw new Error('JWT_SECRET environment variable is not set');
        }
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: jwtSecret,
            algorithms: ['HS256'],
        });
        this.configService = configService;
    }
    validate(payload) {
        if (!payload.sub) {
            throw new common_1.UnauthorizedException('Invalid token: missing subject');
        }
        return {
            userId: payload.userId || payload.sub,
            tenantId: payload.tenantId || '',
            role: payload.role || 'MEMBER',
            email: payload.email,
            auth0Id: payload.sub,
            department: payload.department ?? null,
        };
    }
};
exports.JwtStrategy = JwtStrategy;
exports.JwtStrategy = JwtStrategy = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], JwtStrategy);


/***/ }),
/* 49 */
/***/ ((module) => {

module.exports = require("passport-jwt");

/***/ }),
/* 50 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SkipMfa = exports.SKIP_MFA_KEY = void 0;
const common_1 = __webpack_require__(1);
exports.SKIP_MFA_KEY = 'skipMfa';
const SkipMfa = () => (0, common_1.SetMetadata)(exports.SKIP_MFA_KEY, true);
exports.SkipMfa = SkipMfa;


/***/ }),
/* 51 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.VerifyTotpDto = void 0;
const tslib_1 = __webpack_require__(4);
const class_validator_1 = __webpack_require__(37);
class VerifyTotpDto {
}
exports.VerifyTotpDto = VerifyTotpDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(6, 6, { message: 'TOTP code must be exactly 6 digits' }),
    (0, class_validator_1.Matches)(/^\d{6}$/, { message: 'TOTP code must contain only digits' }),
    tslib_1.__metadata("design:type", String)
], VerifyTotpDto.prototype, "code", void 0);


/***/ }),
/* 52 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.VerifyRecoveryCodeDto = exports.EnrollMfaDto = void 0;
const tslib_1 = __webpack_require__(4);
const class_validator_1 = __webpack_require__(37);
class EnrollMfaDto {
}
exports.EnrollMfaDto = EnrollMfaDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(6, 6, { message: 'TOTP code must be exactly 6 digits' }),
    (0, class_validator_1.Matches)(/^\d{6}$/, { message: 'TOTP code must contain only digits' }),
    tslib_1.__metadata("design:type", String)
], EnrollMfaDto.prototype, "code", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], EnrollMfaDto.prototype, "secret", void 0);
class VerifyRecoveryCodeDto {
}
exports.VerifyRecoveryCodeDto = VerifyRecoveryCodeDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(10, 10, { message: 'Recovery code must be exactly 10 characters' }),
    (0, class_validator_1.Matches)(/^[A-Z0-9]{10}$/, { message: 'Invalid recovery code format' }),
    tslib_1.__metadata("design:type", String)
], VerifyRecoveryCodeDto.prototype, "recoveryCode", void 0);


/***/ }),
/* 53 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Roles = exports.ROLES_KEY = void 0;
const common_1 = __webpack_require__(1);
exports.ROLES_KEY = 'roles';
const Roles = (...roles) => (0, common_1.SetMetadata)(exports.ROLES_KEY, roles);
exports.Roles = Roles;


/***/ }),
/* 54 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RolesGuard = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const core_1 = __webpack_require__(2);
const roles_decorator_1 = __webpack_require__(53);
let RolesGuard = class RolesGuard {
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(context) {
        const requiredRoles = this.reflector.getAllAndOverride(roles_decorator_1.ROLES_KEY, [context.getHandler(), context.getClass()]);
        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user) {
            throw new common_1.ForbiddenException({
                type: 'forbidden',
                title: 'Access Denied',
                status: 403,
                detail: 'You do not have permission to access this resource',
            });
        }
        const hasRole = requiredRoles.some((role) => user.role === role);
        if (!hasRole) {
            throw new common_1.ForbiddenException({
                type: 'insufficient_permissions',
                title: 'Insufficient Permissions',
                status: 403,
                detail: `This action requires one of the following roles: ${requiredRoles.join(', ')}`,
            });
        }
        return true;
    }
};
exports.RolesGuard = RolesGuard;
exports.RolesGuard = RolesGuard = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof core_1.Reflector !== "undefined" && core_1.Reflector) === "function" ? _a : Object])
], RolesGuard);


/***/ }),
/* 55 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var GoogleAuthController_1;
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.GoogleAuthController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const class_validator_1 = __webpack_require__(37);
const axios_1 = tslib_1.__importDefault(__webpack_require__(56));
const jwt = tslib_1.__importStar(__webpack_require__(57));
const auth_service_1 = __webpack_require__(43);
const public_decorator_1 = __webpack_require__(46);
const tenant_context_1 = __webpack_require__(9);
const utils_1 = __webpack_require__(29);
const prisma_1 = __webpack_require__(34);
class GoogleCallbackDto {
}
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], GoogleCallbackDto.prototype, "code", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], GoogleCallbackDto.prototype, "redirectUri", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], GoogleCallbackDto.prototype, "codeVerifier", void 0);
let GoogleAuthController = GoogleAuthController_1 = class GoogleAuthController {
    constructor(configService, authService, prisma) {
        this.configService = configService;
        this.authService = authService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(GoogleAuthController_1.name);
    }
    /**
     * Google OAuth callback - exchanges auth code for tokens and creates session
     */
    async handleGoogleCallback(dto) {
        const { code, redirectUri, codeVerifier } = dto;
        this.logger.log({
            message: 'Google callback received',
            hasCode: !!code,
            redirectUri,
            hasCodeVerifier: !!codeVerifier,
            codeLength: code?.length ?? 0,
        });
        if (!code) {
            throw new common_1.BadRequestException({
                type: 'missing_auth_code',
                title: 'Bad Request',
                status: 400,
                detail: 'Authorization code is required. The Google OAuth redirect may have failed.',
            });
        }
        const clientId = this.configService.get('GOOGLE_CLIENT_ID');
        const clientSecret = this.configService.get('GOOGLE_CLIENT_SECRET');
        const jwtSecret = this.configService.get('JWT_SECRET');
        if (!clientId || !jwtSecret) {
            throw new common_1.BadRequestException('Google OAuth is not configured on the server');
        }
        // Exchange authorization code for tokens
        let tokenData;
        try {
            const tokenParams = {
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
            const response = await axios_1.default.post('https://oauth2.googleapis.com/token', new URLSearchParams(tokenParams).toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });
            tokenData = response.data;
        }
        catch (error) {
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
            throw new common_1.UnauthorizedException({
                type: 'google_token_exchange_failed',
                title: 'Google Authentication Failed',
                status: 401,
                detail: `Google OAuth error: ${googleErrorCode} — ${googleErrorDesc}`,
            });
        }
        // Decode the ID token to get user info
        const idTokenPayload = jwt.decode(tokenData.id_token);
        if (!idTokenPayload || !idTokenPayload.email) {
            throw new common_1.UnauthorizedException('Invalid Google ID token');
        }
        // Find existing user by email
        const existingUser = await this.authService.findUserByEmail(idTokenPayload.email);
        let user;
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
        }
        else {
            // New user — auto-register with ONBOARDING status
            const tenantId = (0, utils_1.generateTenantId)();
            const userId = (0, utils_1.generateUserId)();
            const normalizedEmail = idTokenPayload.email.toLowerCase();
            const displayName = idTokenPayload.name || normalizedEmail.split('@')[0] || 'My Company';
            await this.prisma.$transaction(async (tx) => {
                await tx.tenant.create({
                    data: {
                        id: tenantId,
                        name: displayName,
                        industry: 'General',
                        status: prisma_1.TenantStatus.ONBOARDING,
                    },
                });
                await tx.user.create({
                    data: {
                        id: userId,
                        email: normalizedEmail,
                        auth0Id: idTokenPayload.sub,
                        role: prisma_1.UserRole.TENANT_OWNER,
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
                role: prisma_1.UserRole.TENANT_OWNER,
                department: null,
            };
        }
        // MFA is currently disabled — skip MFA check entirely
        const requiresMfaSetup = false;
        // Sign our own JWT
        const appToken = jwt.sign({
            sub: idTokenPayload.sub,
            email: user.email,
            userId: user.userId,
            tenantId: user.tenantId,
            role: user.role,
            department: user.department,
        }, jwtSecret, { expiresIn: '24h', algorithm: 'HS256' });
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
};
exports.GoogleAuthController = GoogleAuthController;
tslib_1.__decorate([
    (0, common_1.Post)('google/callback'),
    (0, public_decorator_1.Public)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [GoogleCallbackDto]),
    tslib_1.__metadata("design:returntype", Promise)
], GoogleAuthController.prototype, "handleGoogleCallback", null);
exports.GoogleAuthController = GoogleAuthController = GoogleAuthController_1 = tslib_1.__decorate([
    (0, common_1.Controller)('auth'),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object, typeof (_b = typeof auth_service_1.AuthService !== "undefined" && auth_service_1.AuthService) === "function" ? _b : Object, typeof (_c = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _c : Object])
], GoogleAuthController);


/***/ }),
/* 56 */
/***/ ((module) => {

module.exports = require("axios");

/***/ }),
/* 57 */
/***/ ((module) => {

module.exports = require("jsonwebtoken");

/***/ }),
/* 58 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MfaRequiredGuard = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const core_1 = __webpack_require__(2);
const skip_mfa_decorator_1 = __webpack_require__(50);
const auth_service_1 = __webpack_require__(43);
let MfaRequiredGuard = class MfaRequiredGuard {
    constructor(reflector, authService, configService) {
        this.reflector = reflector;
        this.authService = authService;
        this.configService = configService;
    }
    async canActivate(context) {
        // Dev mode bypass - skip MFA check for local development
        if (this.configService.get('DEV_MODE') === 'true') {
            return true;
        }
        // Check if MFA check should be skipped for this route
        const skipMfa = this.reflector.getAllAndOverride(skip_mfa_decorator_1.SKIP_MFA_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (skipMfa) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user) {
            return true; // Let JwtAuthGuard handle authentication
        }
        // Check if user has MFA enabled
        const mfaStatus = await this.authService.getMfaStatus(user.userId);
        if (!mfaStatus.enabled) {
            throw new common_1.ForbiddenException({
                type: 'mfa_required',
                title: 'Two-Factor Authentication Required',
                status: 403,
                detail: 'Please complete 2FA setup to access your account',
                redirectTo: '/2fa-setup',
            });
        }
        return true;
    }
};
exports.MfaRequiredGuard = MfaRequiredGuard;
exports.MfaRequiredGuard = MfaRequiredGuard = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof core_1.Reflector !== "undefined" && core_1.Reflector) === "function" ? _a : Object, typeof (_b = typeof auth_service_1.AuthService !== "undefined" && auth_service_1.AuthService) === "function" ? _b : Object, typeof (_c = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _c : Object])
], MfaRequiredGuard);


/***/ }),
/* 59 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.InvitationModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const email_1 = __webpack_require__(60);
const tenant_context_1 = __webpack_require__(9);
const knowledge_module_1 = __webpack_require__(72);
const invitation_controller_1 = __webpack_require__(121);
const invitation_service_1 = __webpack_require__(122);
let InvitationModule = class InvitationModule {
};
exports.InvitationModule = InvitationModule;
exports.InvitationModule = InvitationModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, email_1.EmailModule, tenant_context_1.TenantModule, knowledge_module_1.KnowledgeModule],
        controllers: [invitation_controller_1.InvitationController],
        providers: [invitation_service_1.InvitationService],
        exports: [invitation_service_1.InvitationService],
    })
], InvitationModule);


/***/ }),
/* 60 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getInvitationEmailText = exports.getInvitationEmailHtml = exports.EmailModule = exports.EmailService = void 0;
var email_service_1 = __webpack_require__(61);
Object.defineProperty(exports, "EmailService", ({ enumerable: true, get: function () { return email_service_1.EmailService; } }));
var email_module_1 = __webpack_require__(71);
Object.defineProperty(exports, "EmailModule", ({ enumerable: true, get: function () { return email_module_1.EmailModule; } }));
var invitation_template_1 = __webpack_require__(63);
Object.defineProperty(exports, "getInvitationEmailHtml", ({ enumerable: true, get: function () { return invitation_template_1.getInvitationEmailHtml; } }));
Object.defineProperty(exports, "getInvitationEmailText", ({ enumerable: true, get: function () { return invitation_template_1.getInvitationEmailText; } }));


/***/ }),
/* 61 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var EmailService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.EmailService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const nodemailer = tslib_1.__importStar(__webpack_require__(62));
const invitation_template_1 = __webpack_require__(63);
const removal_template_1 = __webpack_require__(64);
const backup_owner_designation_template_1 = __webpack_require__(65);
const recovery_notification_template_1 = __webpack_require__(66);
const data_export_complete_template_1 = __webpack_require__(67);
const tenant_deletion_initiated_template_1 = __webpack_require__(68);
const tenant_deletion_cancelled_template_1 = __webpack_require__(69);
const tenant_deletion_complete_template_1 = __webpack_require__(70);
let EmailService = EmailService_1 = class EmailService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(EmailService_1.name);
        const host = this.configService.get('SMTP_HOST', 'localhost');
        const port = this.configService.get('SMTP_PORT', 587);
        const user = this.configService.get('SMTP_USER', '');
        const pass = this.configService.get('SMTP_PASS', '');
        this.fromAddress = this.configService.get('EMAIL_FROM', 'noreply@mentor-ai.com');
        this.transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: user ? { user, pass } : undefined,
        });
    }
    async sendInvitationEmail(params) {
        const { to, inviterName, tenantName, inviteLink, department } = params;
        const html = (0, invitation_template_1.getInvitationEmailHtml)({
            inviterName,
            tenantName,
            inviteLink,
            department,
            expiresInDays: 7,
        });
        const text = (0, invitation_template_1.getInvitationEmailText)({
            inviterName,
            tenantName,
            inviteLink,
            department,
            expiresInDays: 7,
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `You're invited to join ${tenantName} on Mentor AI`,
                html,
                text,
            });
            return { success: true, messageId: info.messageId };
        }
        catch (error) {
            this.logger.error(`Failed to send email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { success: false };
        }
    }
    async sendRemovalNotificationEmail(params) {
        const { to, memberName, tenantName, strategy, contactEmail } = params;
        const html = (0, removal_template_1.getRemovalEmailHtml)({
            memberName,
            tenantName,
            strategy,
            contactEmail,
        });
        const text = (0, removal_template_1.getRemovalEmailText)({
            memberName,
            tenantName,
            strategy,
            contactEmail,
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `Your access to ${tenantName} has been updated`,
                html,
                text,
            });
            return { success: true, messageId: info.messageId };
        }
        catch (error) {
            this.logger.error(`Failed to send removal notification to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { success: false };
        }
    }
    async sendBackupOwnerDesignationEmail(params) {
        const { to, tenantName, designatedBy, designatedName } = params;
        const html = (0, backup_owner_designation_template_1.getBackupOwnerDesignationEmailHtml)({
            designatedName,
            tenantName,
            designatedBy,
        });
        const text = (0, backup_owner_designation_template_1.getBackupOwnerDesignationEmailText)({
            designatedName,
            tenantName,
            designatedBy,
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `You've been designated as Backup Owner for ${tenantName}`,
                html,
                text,
            });
            return { success: true, messageId: info.messageId };
        }
        catch (error) {
            this.logger.error(`Failed to send backup owner designation email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { success: false };
        }
    }
    async sendRecoveryNotificationEmail(params) {
        const { to, ownerName, tenantName, backupOwnerName, recoveryTimestamp, ipAddress } = params;
        const html = (0, recovery_notification_template_1.getRecoveryNotificationEmailHtml)({
            ownerName,
            tenantName,
            backupOwnerName,
            recoveryTimestamp: recoveryTimestamp.toISOString(),
            ipAddress,
        });
        const text = (0, recovery_notification_template_1.getRecoveryNotificationEmailText)({
            ownerName,
            tenantName,
            backupOwnerName,
            recoveryTimestamp: recoveryTimestamp.toISOString(),
            ipAddress,
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `Account Recovery Action - ${tenantName}`,
                html,
                text,
            });
            return { success: true, messageId: info.messageId };
        }
        catch (error) {
            this.logger.error(`Failed to send recovery notification to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { success: false };
        }
    }
    async sendDataExportCompleteEmail(params) {
        const { to, userName, format, fileSize, downloadUrl, expiresAt } = params;
        const html = (0, data_export_complete_template_1.getDataExportCompleteEmailHtml)({
            userName,
            format,
            fileSize,
            downloadUrl,
            expiresAt,
        });
        const text = (0, data_export_complete_template_1.getDataExportCompleteEmailText)({
            userName,
            format,
            fileSize,
            downloadUrl,
            expiresAt,
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `Your data export is ready — Mentor AI`,
                html,
                text,
            });
            return { success: true, messageId: info.messageId };
        }
        catch (error) {
            this.logger.error(`Failed to send data export email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { success: false };
        }
    }
    async sendTenantDeletionInitiatedEmail(params) {
        const { to, userName, tenantName, requestedByName, requestedByEmail, gracePeriodEndsAt } = params;
        const html = (0, tenant_deletion_initiated_template_1.getTenantDeletionInitiatedEmailHtml)({
            userName,
            tenantName,
            requestedByName,
            requestedByEmail,
            gracePeriodEndsAt,
        });
        const text = (0, tenant_deletion_initiated_template_1.getTenantDeletionInitiatedEmailText)({
            userName,
            tenantName,
            requestedByName,
            requestedByEmail,
            gracePeriodEndsAt,
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `Important: ${tenantName} scheduled for deletion — Mentor AI`,
                html,
                text,
            });
            return { success: true, messageId: info.messageId };
        }
        catch (error) {
            this.logger.error(`Failed to send tenant deletion initiated email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { success: false };
        }
    }
    async sendTenantDeletionCancelledEmail(params) {
        const { to, userName, tenantName } = params;
        const html = (0, tenant_deletion_cancelled_template_1.getTenantDeletionCancelledEmailHtml)({
            userName,
            tenantName,
        });
        const text = (0, tenant_deletion_cancelled_template_1.getTenantDeletionCancelledEmailText)({
            userName,
            tenantName,
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `${tenantName} deletion cancelled — Mentor AI`,
                html,
                text,
            });
            return { success: true, messageId: info.messageId };
        }
        catch (error) {
            this.logger.error(`Failed to send tenant deletion cancelled email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { success: false };
        }
    }
    async sendTenantDeletionCompleteEmail(params) {
        const { to, userName, tenantName, certificateReference } = params;
        const html = (0, tenant_deletion_complete_template_1.getTenantDeletionCompleteEmailHtml)({
            userName,
            tenantName,
            certificateReference,
        });
        const text = (0, tenant_deletion_complete_template_1.getTenantDeletionCompleteEmailText)({
            userName,
            tenantName,
            certificateReference,
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `Your workspace has been deleted — Mentor AI`,
                html,
                text,
            });
            return { success: true, messageId: info.messageId };
        }
        catch (error) {
            this.logger.error(`Failed to send tenant deletion complete email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { success: false };
        }
    }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = EmailService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], EmailService);


/***/ }),
/* 62 */
/***/ ((module) => {

module.exports = require("nodemailer");

/***/ }),
/* 63 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getInvitationEmailHtml = getInvitationEmailHtml;
exports.getInvitationEmailText = getInvitationEmailText;
function getInvitationEmailHtml(data) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to join ${data.tenantName} on Mentor AI</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#18181b;padding:24px 32px;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Mentor AI</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="color:#18181b;margin:0 0 16px;">You're invited!</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                <strong>${data.inviterName}</strong> has invited you to join
                <strong>${data.tenantName}</strong> on Mentor AI as a Team Member
                in the <strong>${data.department}</strong> department.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="background-color:#18181b;border-radius:6px;padding:12px 32px;">
                    <a href="${data.inviteLink}" style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:0 0 8px;">
                This invitation expires in ${data.expiresInDays} days.
              </p>
              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:0;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f4f4f5;padding:16px 32px;text-align:center;">
              <p style="color:#a1a1aa;font-size:12px;margin:0;">
                &copy; ${new Date().getFullYear()} Mentor AI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
function getInvitationEmailText(data) {
    return [
        `You're invited to join ${data.tenantName} on Mentor AI!`,
        '',
        `${data.inviterName} has invited you to join ${data.tenantName} as a Team Member in the ${data.department} department.`,
        '',
        `Accept your invitation: ${data.inviteLink}`,
        '',
        `This invitation expires in ${data.expiresInDays} days.`,
        '',
        `If you didn't expect this invitation, you can safely ignore this email.`,
    ].join('\n');
}


/***/ }),
/* 64 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getRemovalEmailHtml = getRemovalEmailHtml;
exports.getRemovalEmailText = getRemovalEmailText;
function getRemovalEmailHtml(data) {
    const dataHandling = data.strategy === 'REASSIGN'
        ? 'Your notes and saved outputs have been reassigned to the workspace owner. Your conversations have been archived.'
        : 'Your data has been archived and retained securely.';
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your access to ${data.tenantName} has been removed</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#18181b;padding:24px 32px;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Mentor AI</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="color:#18181b;margin:0 0 16px;">Access Update</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Hi${data.memberName ? ` ${data.memberName}` : ''},
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Your access to <strong>${data.tenantName}</strong> on Mentor AI has been removed by the workspace owner.
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                <strong>Your data:</strong> ${dataHandling}
              </p>
              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:0;">
                If you have questions about this change, please contact your workspace administrator${data.contactEmail ? ` at ${data.contactEmail}` : ''}.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f4f4f5;padding:16px 32px;text-align:center;">
              <p style="color:#a1a1aa;font-size:12px;margin:0;">
                &copy; ${new Date().getFullYear()} Mentor AI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
function getRemovalEmailText(data) {
    const dataHandling = data.strategy === 'REASSIGN'
        ? 'Your notes and saved outputs have been reassigned to the workspace owner. Your conversations have been archived.'
        : 'Your data has been archived and retained securely.';
    return [
        `Access Update - ${data.tenantName}`,
        '',
        `Hi${data.memberName ? ` ${data.memberName}` : ''},`,
        '',
        `Your access to ${data.tenantName} on Mentor AI has been removed by the workspace owner.`,
        '',
        `Your data: ${dataHandling}`,
        '',
        `If you have questions about this change, please contact your workspace administrator${data.contactEmail ? ` at ${data.contactEmail}` : ''}.`,
    ].join('\n');
}


/***/ }),
/* 65 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getBackupOwnerDesignationEmailHtml = getBackupOwnerDesignationEmailHtml;
exports.getBackupOwnerDesignationEmailText = getBackupOwnerDesignationEmailText;
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function getBackupOwnerDesignationEmailHtml(data) {
    const name = escapeHtml(data.designatedName);
    const tenant = escapeHtml(data.tenantName);
    const by = escapeHtml(data.designatedBy);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've been designated as Backup Owner</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#18181b;padding:24px 32px;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Mentor AI</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="color:#18181b;margin:0 0 16px;">Backup Owner Designation</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Hi${name ? ` ${name}` : ''},
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                You have been designated as the <strong>Backup Owner</strong> for <strong>${tenant}</strong> by ${by}.
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                <strong>What this means:</strong> If the primary workspace owner loses access to their account (e.g., lost 2FA device), you can initiate account recovery to reset their two-factor authentication and restore their access.
              </p>
              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:0;">
                No action is needed from you at this time. You will only need to act if the primary owner requests account recovery assistance.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f4f4f5;padding:16px 32px;text-align:center;">
              <p style="color:#a1a1aa;font-size:12px;margin:0;">
                &copy; ${new Date().getFullYear()} Mentor AI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
function getBackupOwnerDesignationEmailText(data) {
    return [
        `Backup Owner Designation - ${data.tenantName}`,
        '',
        `Hi${data.designatedName ? ` ${data.designatedName}` : ''},`,
        '',
        `You have been designated as the Backup Owner for ${data.tenantName} by ${data.designatedBy}.`,
        '',
        'What this means: If the primary workspace owner loses access to their account (e.g., lost 2FA device), you can initiate account recovery to reset their two-factor authentication and restore their access.',
        '',
        'No action is needed from you at this time. You will only need to act if the primary owner requests account recovery assistance.',
    ].join('\n');
}


/***/ }),
/* 66 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getRecoveryNotificationEmailHtml = getRecoveryNotificationEmailHtml;
exports.getRecoveryNotificationEmailText = getRecoveryNotificationEmailText;
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function getRecoveryNotificationEmailHtml(data) {
    const owner = escapeHtml(data.ownerName);
    const tenant = escapeHtml(data.tenantName);
    const backup = escapeHtml(data.backupOwnerName);
    const timestamp = escapeHtml(data.recoveryTimestamp);
    const ip = escapeHtml(data.ipAddress);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Recovery Action Taken</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#18181b;padding:24px 32px;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Mentor AI</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="color:#dc2626;margin:0 0 16px;">Account Recovery Action</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Hi${owner ? ` ${owner}` : ''},
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Your two-factor authentication (2FA) for <strong>${tenant}</strong> has been reset by your designated Backup Owner, <strong>${backup}</strong>.
              </p>
              <table width="100%" cellpadding="8" cellspacing="0" style="background-color:#fef2f2;border-radius:4px;margin:0 0 16px;">
                <tr>
                  <td style="color:#3f3f46;font-size:14px;">
                    <strong>Recovery Details:</strong><br>
                    Initiated by: ${backup}<br>
                    Timestamp: ${timestamp}<br>
                    IP Address: ${ip}
                  </td>
                </tr>
              </table>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                <strong>What you need to do:</strong> On your next login, you will be prompted to set up a new 2FA method. Please do so immediately to secure your account.
              </p>
              <p style="color:#dc2626;font-size:14px;line-height:1.5;margin:0;">
                If you did not authorize this recovery, please contact support immediately.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f4f4f5;padding:16px 32px;text-align:center;">
              <p style="color:#a1a1aa;font-size:12px;margin:0;">
                &copy; ${new Date().getFullYear()} Mentor AI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
function getRecoveryNotificationEmailText(data) {
    return [
        `IMPORTANT: Account Recovery Action - ${data.tenantName}`,
        '',
        `Hi${data.ownerName ? ` ${data.ownerName}` : ''},`,
        '',
        `Your two-factor authentication (2FA) for ${data.tenantName} has been reset by your designated Backup Owner, ${data.backupOwnerName}.`,
        '',
        'Recovery Details:',
        `  Initiated by: ${data.backupOwnerName}`,
        `  Timestamp: ${data.recoveryTimestamp}`,
        `  IP Address: ${data.ipAddress}`,
        '',
        'What you need to do: On your next login, you will be prompted to set up a new 2FA method. Please do so immediately to secure your account.',
        '',
        'If you did not authorize this recovery, please contact support immediately.',
    ].join('\n');
}


/***/ }),
/* 67 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getDataExportCompleteEmailHtml = getDataExportCompleteEmailHtml;
exports.getDataExportCompleteEmailText = getDataExportCompleteEmailText;
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function getDataExportCompleteEmailHtml(data) {
    const name = escapeHtml(data.userName);
    const format = escapeHtml(data.format);
    const fileSize = escapeHtml(data.fileSize);
    const downloadUrl = escapeHtml(data.downloadUrl);
    const expiresAt = escapeHtml(data.expiresAt);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Data Export is Ready</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#18181b;padding:24px 32px;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Mentor AI</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="color:#18181b;margin:0 0 16px;">Your Data Export is Ready</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Hi${name ? ` ${name}` : ''},
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Your data export in <strong>${format}</strong> format is ready for download.
              </p>
              <table width="100%" cellpadding="8" cellspacing="0" style="background-color:#f0f9ff;border-radius:4px;margin:0 0 16px;">
                <tr>
                  <td style="color:#3f3f46;font-size:14px;">
                    <strong>Export Details:</strong><br>
                    Format: ${format}<br>
                    File Size: ${fileSize}<br>
                    Expires: ${expiresAt}
                  </td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
                <tr>
                  <td style="background-color:#3b82f6;border-radius:6px;padding:12px 24px;">
                    <a href="${downloadUrl}" style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">Download Export</a>
                  </td>
                </tr>
              </table>
              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:0;">
                This download link will expire in 24 hours. After that, you'll need to request a new export.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f4f4f5;padding:16px 32px;text-align:center;">
              <p style="color:#a1a1aa;font-size:12px;margin:0;">
                &copy; ${new Date().getFullYear()} Mentor AI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
function getDataExportCompleteEmailText(data) {
    return [
        `Your Data Export is Ready — Mentor AI`,
        '',
        `Hi${data.userName ? ` ${data.userName}` : ''},`,
        '',
        `Your data export in ${data.format} format is ready for download.`,
        '',
        'Export Details:',
        `  Format: ${data.format}`,
        `  File Size: ${data.fileSize}`,
        `  Expires: ${data.expiresAt}`,
        '',
        `Download: ${data.downloadUrl}`,
        '',
        'This download link will expire in 24 hours. After that, you will need to request a new export.',
    ].join('\n');
}


/***/ }),
/* 68 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getTenantDeletionInitiatedEmailHtml = getTenantDeletionInitiatedEmailHtml;
exports.getTenantDeletionInitiatedEmailText = getTenantDeletionInitiatedEmailText;
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function formatDate(isoDate) {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
    });
}
function getTenantDeletionInitiatedEmailHtml(data) {
    const name = escapeHtml(data.userName);
    const tenant = escapeHtml(data.tenantName);
    const requestedBy = escapeHtml(data.requestedByName);
    const requestedByEmail = escapeHtml(data.requestedByEmail);
    const gracePeriodEnds = formatDate(data.gracePeriodEndsAt);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Important: Workspace scheduled for deletion</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#dc2626;padding:24px 32px;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Mentor AI</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="color:#dc2626;margin:0 0 16px;">⚠️ Workspace Scheduled for Deletion</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Hi${name ? ` ${name}` : ''},
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                The workspace <strong>${tenant}</strong> has been scheduled for deletion by ${requestedBy}.
              </p>

              <div style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0;">
                <p style="color:#991b1b;font-size:16px;font-weight:bold;margin:0 0 8px;">What this means:</p>
                <ul style="color:#991b1b;font-size:14px;line-height:1.6;margin:0;padding-left:20px;">
                  <li>All workspace data will be permanently deleted</li>
                  <li>All team members will lose access</li>
                  <li>This action cannot be undone after the grace period</li>
                </ul>
              </div>

              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:16px 0 8px;">
                <strong>Deletion scheduled for:</strong>
              </p>
              <p style="color:#dc2626;font-size:18px;font-weight:bold;margin:0 0 16px;">
                ${gracePeriodEnds}
              </p>

              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                The workspace owner can cancel this deletion within the 7-day grace period. After this time, deletion will proceed automatically.
              </p>

              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:16px 0 0;">
                If you believe this was a mistake, please contact the workspace owner at ${requestedByEmail}.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f4f4f5;padding:16px 32px;text-align:center;">
              <p style="color:#a1a1aa;font-size:12px;margin:0;">
                &copy; ${new Date().getFullYear()} Mentor AI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
function getTenantDeletionInitiatedEmailText(data) {
    const gracePeriodEnds = formatDate(data.gracePeriodEndsAt);
    return [
        `IMPORTANT: ${data.tenantName} scheduled for deletion`,
        '',
        `Hi${data.userName ? ` ${data.userName}` : ''},`,
        '',
        `The workspace "${data.tenantName}" has been scheduled for deletion by ${data.requestedByName}.`,
        '',
        'What this means:',
        '- All workspace data will be permanently deleted',
        '- All team members will lose access',
        '- This action cannot be undone after the grace period',
        '',
        `Deletion scheduled for: ${gracePeriodEnds}`,
        '',
        'The workspace owner can cancel this deletion within the 7-day grace period. After this time, deletion will proceed automatically.',
        '',
        `If you believe this was a mistake, please contact the workspace owner at ${data.requestedByEmail}.`,
    ].join('\n');
}


/***/ }),
/* 69 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getTenantDeletionCancelledEmailHtml = getTenantDeletionCancelledEmailHtml;
exports.getTenantDeletionCancelledEmailText = getTenantDeletionCancelledEmailText;
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function getTenantDeletionCancelledEmailHtml(data) {
    const name = escapeHtml(data.userName);
    const tenant = escapeHtml(data.tenantName);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workspace deletion cancelled</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#16a34a;padding:24px 32px;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Mentor AI</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="color:#16a34a;margin:0 0 16px;">✓ Workspace Deletion Cancelled</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Hi${name ? ` ${name}` : ''},
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Good news! The scheduled deletion of <strong>${tenant}</strong> has been cancelled.
              </p>

              <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
                <p style="color:#166534;font-size:16px;margin:0;">
                  Your workspace has been fully restored. All data and team member access remain intact.
                </p>
              </div>

              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:16px 0 0;">
                No action is needed from you. You can continue using Mentor AI as normal.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f4f4f5;padding:16px 32px;text-align:center;">
              <p style="color:#a1a1aa;font-size:12px;margin:0;">
                &copy; ${new Date().getFullYear()} Mentor AI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
function getTenantDeletionCancelledEmailText(data) {
    return [
        `${data.tenantName} deletion cancelled`,
        '',
        `Hi${data.userName ? ` ${data.userName}` : ''},`,
        '',
        `Good news! The scheduled deletion of "${data.tenantName}" has been cancelled.`,
        '',
        'Your workspace has been fully restored. All data and team member access remain intact.',
        '',
        'No action is needed from you. You can continue using Mentor AI as normal.',
    ].join('\n');
}


/***/ }),
/* 70 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getTenantDeletionCompleteEmailHtml = getTenantDeletionCompleteEmailHtml;
exports.getTenantDeletionCompleteEmailText = getTenantDeletionCompleteEmailText;
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function getTenantDeletionCompleteEmailHtml(data) {
    const name = escapeHtml(data.userName);
    const tenant = escapeHtml(data.tenantName);
    const certRef = escapeHtml(data.certificateReference);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your workspace has been deleted</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#18181b;padding:24px 32px;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Mentor AI</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="color:#18181b;margin:0 0 16px;">Workspace Deletion Complete</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Hi${name ? ` ${name}` : ''},
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                As requested, the workspace <strong>${tenant}</strong> has been permanently deleted.
              </p>

              <div style="background-color:#f4f4f5;border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0;">
                <p style="color:#3f3f46;font-size:14px;margin:0 0 8px;">
                  <strong>GDPR Deletion Certificate Reference:</strong>
                </p>
                <p style="color:#71717a;font-size:14px;font-family:monospace;margin:0;">
                  ${certRef}
                </p>
              </div>

              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                In accordance with GDPR requirements:
              </p>
              <ul style="color:#3f3f46;font-size:14px;line-height:1.6;margin:0 0 16px;padding-left:20px;">
                <li>All personal data has been deleted or anonymized</li>
                <li>Audit logs have been anonymized and retained for compliance</li>
                <li>User identifiers have been replaced with cryptographic hashes</li>
              </ul>

              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:16px 0 0;">
                Thank you for using Mentor AI. If you have any questions about this deletion or need a copy of your GDPR deletion certificate, please contact support@mentor-ai.com with your certificate reference.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f4f4f5;padding:16px 32px;text-align:center;">
              <p style="color:#a1a1aa;font-size:12px;margin:0;">
                &copy; ${new Date().getFullYear()} Mentor AI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
function getTenantDeletionCompleteEmailText(data) {
    return [
        `Workspace Deletion Complete - ${data.tenantName}`,
        '',
        `Hi${data.userName ? ` ${data.userName}` : ''},`,
        '',
        `As requested, the workspace "${data.tenantName}" has been permanently deleted.`,
        '',
        `GDPR Deletion Certificate Reference: ${data.certificateReference}`,
        '',
        'In accordance with GDPR requirements:',
        '- All personal data has been deleted or anonymized',
        '- Audit logs have been anonymized and retained for compliance',
        '- User identifiers have been replaced with cryptographic hashes',
        '',
        'Thank you for using Mentor AI. If you have any questions about this deletion or need a copy of your GDPR deletion certificate, please contact support@mentor-ai.com with your certificate reference.',
    ].join('\n');
}


/***/ }),
/* 71 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.EmailModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const email_service_1 = __webpack_require__(61);
let EmailModule = class EmailModule {
};
exports.EmailModule = EmailModule;
exports.EmailModule = EmailModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule],
        providers: [email_service_1.EmailService],
        exports: [email_service_1.EmailService],
    })
], EmailModule);


/***/ }),
/* 72 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.KnowledgeModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const auth_module_1 = __webpack_require__(40);
const llm_config_module_1 = __webpack_require__(73);
const ai_gateway_module_1 = __webpack_require__(87);
const knowledge_controller_1 = __webpack_require__(103);
const concept_service_1 = __webpack_require__(104);
const concept_seed_service_1 = __webpack_require__(108);
const concept_matching_service_1 = __webpack_require__(109);
const citation_injector_service_1 = __webpack_require__(113);
const citation_service_1 = __webpack_require__(106);
const embedding_service_1 = __webpack_require__(110);
const curriculum_service_1 = __webpack_require__(107);
const concept_extraction_service_1 = __webpack_require__(114);
const brain_seeding_service_1 = __webpack_require__(116);
const business_context_service_1 = __webpack_require__(118);
const concept_relevance_service_1 = __webpack_require__(119);
const department_guard_1 = __webpack_require__(120);
/**
 * Module for business concepts knowledge base.
 * Provides services for querying, seeding, and citing concepts.
 *
 * Story 2.6: Added citation services for concept matching and injection.
 * Story 2.13: Added AiGatewayModule for dynamic relationship creation.
 * Story 3.2: Added BrainSeedingService + BusinessContextService.
 */
let KnowledgeModule = class KnowledgeModule {
};
exports.KnowledgeModule = KnowledgeModule;
exports.KnowledgeModule = KnowledgeModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [tenant_context_1.TenantModule, auth_module_1.AuthModule, llm_config_module_1.LlmConfigModule, ai_gateway_module_1.AiGatewayModule],
        controllers: [knowledge_controller_1.KnowledgeController],
        providers: [
            concept_service_1.ConceptService,
            concept_seed_service_1.ConceptSeedService,
            concept_matching_service_1.ConceptMatchingService,
            citation_injector_service_1.CitationInjectorService,
            citation_service_1.CitationService,
            embedding_service_1.EmbeddingService,
            curriculum_service_1.CurriculumService,
            concept_extraction_service_1.ConceptExtractionService,
            brain_seeding_service_1.BrainSeedingService,
            business_context_service_1.BusinessContextService,
            concept_relevance_service_1.ConceptRelevanceService,
            department_guard_1.DepartmentGuard,
        ],
        exports: [
            concept_service_1.ConceptService,
            concept_seed_service_1.ConceptSeedService,
            concept_matching_service_1.ConceptMatchingService,
            citation_injector_service_1.CitationInjectorService,
            citation_service_1.CitationService,
            embedding_service_1.EmbeddingService,
            curriculum_service_1.CurriculumService,
            concept_extraction_service_1.ConceptExtractionService,
            brain_seeding_service_1.BrainSeedingService,
            business_context_service_1.BusinessContextService,
            concept_relevance_service_1.ConceptRelevanceService,
            department_guard_1.DepartmentGuard,
        ],
    })
], KnowledgeModule);


/***/ }),
/* 73 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LlmConfigModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const tenant_context_1 = __webpack_require__(9);
const auth_module_1 = __webpack_require__(40);
const llm_config_controller_1 = __webpack_require__(74);
const llm_config_service_1 = __webpack_require__(75);
let LlmConfigModule = class LlmConfigModule {
};
exports.LlmConfigModule = LlmConfigModule;
exports.LlmConfigModule = LlmConfigModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, auth_module_1.AuthModule, tenant_context_1.TenantModule], // TenantModule provides PlatformPrismaService
        controllers: [llm_config_controller_1.LlmConfigController],
        providers: [llm_config_service_1.LlmConfigService],
        exports: [llm_config_service_1.LlmConfigService],
    })
], LlmConfigModule);


/***/ }),
/* 74 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LlmConfigController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const jwt_auth_guard_1 = __webpack_require__(45);
const roles_guard_1 = __webpack_require__(54);
const roles_decorator_1 = __webpack_require__(53);
const current_user_decorator_1 = __webpack_require__(47);
const llm_config_service_1 = __webpack_require__(75);
const update_llm_config_dto_1 = __webpack_require__(82);
const validate_provider_dto_1 = __webpack_require__(86);
/**
 * Controller for platform-level LLM provider configuration.
 * All endpoints require PLATFORM_OWNER role (via JWT claims).
 */
let LlmConfigController = class LlmConfigController {
    constructor(llmConfigService) {
        this.llmConfigService = llmConfigService;
    }
    /**
     * Get current LLM provider configuration.
     * API keys are masked in the response.
     */
    async getConfig() {
        const config = await this.llmConfigService.getConfig();
        return { data: config };
    }
    /**
     * Update LLM provider configuration.
     * API keys are encrypted before storage.
     * Changes are logged to audit trail.
     */
    async updateConfig(user, dto) {
        const config = await this.llmConfigService.updateConfig(user.userId, dto.primaryProvider, dto.fallbackProvider);
        return {
            data: config,
            message: 'LLM configuration updated successfully',
        };
    }
    /**
     * Validate provider credentials before saving.
     * For cloud providers, validates API key.
     * For local providers, checks endpoint health.
     */
    async validateProvider(dto) {
        const result = await this.llmConfigService.validateProvider(dto.type, dto.apiKey, dto.endpoint);
        return { data: result };
    }
};
exports.LlmConfigController = LlmConfigController;
tslib_1.__decorate([
    (0, common_1.Get)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, roles_decorator_1.Roles)('PLATFORM_OWNER'),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Promise)
], LlmConfigController.prototype, "getConfig", null);
tslib_1.__decorate([
    (0, common_1.Put)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, roles_decorator_1.Roles)('PLATFORM_OWNER'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, typeof (_b = typeof update_llm_config_dto_1.UpdateLlmConfigDto !== "undefined" && update_llm_config_dto_1.UpdateLlmConfigDto) === "function" ? _b : Object]),
    tslib_1.__metadata("design:returntype", Promise)
], LlmConfigController.prototype, "updateConfig", null);
tslib_1.__decorate([
    (0, common_1.Post)('validate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, roles_decorator_1.Roles)('PLATFORM_OWNER'),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_c = typeof validate_provider_dto_1.ValidateProviderDto !== "undefined" && validate_provider_dto_1.ValidateProviderDto) === "function" ? _c : Object]),
    tslib_1.__metadata("design:returntype", Promise)
], LlmConfigController.prototype, "validateProvider", null);
exports.LlmConfigController = LlmConfigController = tslib_1.__decorate([
    (0, common_1.Controller)('admin/llm-config'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof llm_config_service_1.LlmConfigService !== "undefined" && llm_config_service_1.LlmConfigService) === "function" ? _a : Object])
], LlmConfigController);


/***/ }),
/* 75 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var LlmConfigService_1;
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LlmConfigService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const crypto = tslib_1.__importStar(__webpack_require__(76));
const tenant_context_1 = __webpack_require__(9);
const openrouter_provider_1 = __webpack_require__(77);
const local_llama_provider_1 = __webpack_require__(78);
const openai_provider_1 = __webpack_require__(79);
const lm_studio_provider_1 = __webpack_require__(80);
const deepseek_provider_1 = __webpack_require__(81);
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const API_KEY_MASK = '***masked***';
/**
 * Service for managing LLM provider configuration at the platform level.
 * Handles provider CRUD operations, API key encryption, validation, and audit logging.
 */
let LlmConfigService = LlmConfigService_1 = class LlmConfigService {
    constructor(prisma, configService) {
        this.prisma = prisma;
        this.configService = configService;
        this.logger = new common_1.Logger(LlmConfigService_1.name);
        const keyHex = this.configService.get('LLM_CONFIG_ENCRYPTION_KEY');
        if (!keyHex) {
            this.logger.warn({
                message: 'LLM_CONFIG_ENCRYPTION_KEY not set, using default (not secure for production)',
            });
            // Generate a consistent default key for development (32 bytes = 64 hex chars)
            this.encryptionKey = Buffer.from('0'.repeat(64), 'hex');
        }
        else {
            this.encryptionKey = Buffer.from(keyHex, 'hex');
        }
    }
    /**
     * Retrieves the current LLM provider configuration.
     * API keys are masked in the response for security.
     * @returns Current primary and fallback provider configuration
     */
    async getConfig() {
        const configs = await this.prisma.llmProviderConfig.findMany({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
        });
        const primary = configs.find((c) => c.isPrimary) ?? null;
        const fallback = configs.find((c) => c.isFallback) ?? null;
        return {
            primaryProvider: primary ? this.mapToResponse(primary) : null,
            fallbackProvider: fallback ? this.mapToResponse(fallback) : null,
        };
    }
    /**
     * Updates the LLM provider configuration.
     * Encrypts API keys before storage and logs changes to audit trail.
     * @param userId - ID of the user making the change
     * @param primaryProvider - Primary provider configuration
     * @param fallbackProvider - Optional fallback provider configuration
     * @returns Updated configuration
     * @throws BadRequestException if primary provider validation fails
     */
    async updateConfig(userId, primaryProvider, fallbackProvider) {
        // Get current config for audit log
        const currentConfig = await this.getConfig();
        // Deactivate all existing configs
        await this.prisma.llmProviderConfig.updateMany({
            where: { isActive: true },
            data: { isActive: false },
        });
        // Create primary provider config
        const primaryConfig = await this.prisma.llmProviderConfig.create({
            data: {
                providerType: primaryProvider.type,
                apiKey: primaryProvider.apiKey ? this.encrypt(primaryProvider.apiKey) : null,
                endpoint: primaryProvider.endpoint,
                modelId: primaryProvider.modelId,
                isPrimary: true,
                isFallback: false,
                isActive: true,
            },
        });
        let fallbackConfig = null;
        if (fallbackProvider) {
            fallbackConfig = await this.prisma.llmProviderConfig.create({
                data: {
                    providerType: fallbackProvider.type,
                    apiKey: fallbackProvider.apiKey ? this.encrypt(fallbackProvider.apiKey) : null,
                    endpoint: fallbackProvider.endpoint,
                    modelId: fallbackProvider.modelId,
                    isPrimary: false,
                    isFallback: true,
                    isActive: true,
                },
            });
        }
        // Log the configuration change to audit trail
        await this.createAuditLog(currentConfig.primaryProvider ? 'UPDATE' : 'CREATE', userId, currentConfig, {
            primaryProvider: this.mapToResponse(primaryConfig),
            fallbackProvider: fallbackConfig ? this.mapToResponse(fallbackConfig) : null,
        });
        this.logger.log({
            message: 'LLM configuration updated',
            userId,
            primaryProvider: primaryProvider.type,
            fallbackProvider: fallbackProvider?.type ?? null,
        });
        return {
            primaryProvider: this.mapToResponse(primaryConfig),
            fallbackProvider: fallbackConfig ? this.mapToResponse(fallbackConfig) : null,
        };
    }
    /**
     * Validates provider credentials by testing connectivity.
     * For cloud providers, validates API key. For local providers, checks endpoint health.
     * @param type - Provider type to validate
     * @param apiKey - API key for cloud providers
     * @param endpoint - Endpoint URL for local providers
     * @returns Validation result with available models and resource info
     */
    async validateProvider(type, apiKey, endpoint) {
        try {
            const provider = this.createProvider(type, apiKey, endpoint);
            const isValid = await provider.validateCredentials();
            if (!isValid) {
                return {
                    valid: false,
                    models: [],
                    resourceInfo: null,
                    errorMessage: 'Invalid credentials or endpoint unreachable',
                };
            }
            const models = await provider.fetchModels();
            const resourceInfo = await provider.getResourceInfo();
            this.logger.log({
                message: 'Provider validation successful',
                providerType: type,
                modelCount: models.length,
            });
            return {
                valid: true,
                models,
                resourceInfo,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
            this.logger.warn({
                message: 'Provider validation failed',
                providerType: type,
                error: errorMessage,
            });
            return {
                valid: false,
                models: [],
                resourceInfo: null,
                errorMessage,
            };
        }
    }
    /**
     * Gets the decrypted API key for a provider (for internal use only).
     * @param providerType - Type of provider to get key for
     * @returns Decrypted API key or null if not found
     * @throws InternalServerErrorException if decryption fails
     */
    async getDecryptedApiKey(providerType) {
        const config = await this.prisma.llmProviderConfig.findFirst({
            where: {
                providerType,
                isActive: true,
            },
        });
        if (!config?.apiKey) {
            return null;
        }
        try {
            return this.decrypt(config.apiKey);
        }
        catch (error) {
            this.logger.error({
                message: 'Failed to decrypt API key',
                providerType,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new common_1.InternalServerErrorException({
                type: 'decryption_failed',
                title: 'Configuration Error',
                status: 500,
                detail: 'Failed to retrieve provider credentials',
            });
        }
    }
    /**
     * Gets the configured endpoint for a provider.
     * @param providerType - Type of provider to get endpoint for
     * @returns Endpoint URL or null if not found
     */
    async getProviderEndpoint(providerType) {
        const config = await this.prisma.llmProviderConfig.findFirst({
            where: {
                providerType,
                isActive: true,
            },
        });
        return config?.endpoint ?? null;
    }
    createProvider(type, apiKey, endpoint) {
        switch (type) {
            case 'OPENROUTER':
                if (!apiKey) {
                    throw new common_1.BadRequestException({
                        type: 'api_key_required',
                        title: 'API Key Required',
                        status: 400,
                        detail: 'OpenRouter requires an API key',
                    });
                }
                return new openrouter_provider_1.OpenRouterProvider({ apiKey });
            case 'LOCAL_LLAMA':
                return new local_llama_provider_1.LocalLlamaProvider({ endpoint });
            case 'OPENAI':
                if (!apiKey) {
                    throw new common_1.BadRequestException({
                        type: 'api_key_required',
                        title: 'API Key Required',
                        status: 400,
                        detail: 'OpenAI requires an API key',
                    });
                }
                return new openai_provider_1.OpenAIProvider({ apiKey });
            case 'LM_STUDIO':
                return new lm_studio_provider_1.LmStudioProvider({ endpoint: endpoint ?? 'http://localhost:1234', apiKey });
            case 'DEEPSEEK':
                if (!apiKey) {
                    throw new common_1.BadRequestException({
                        type: 'api_key_required',
                        title: 'API Key Required',
                        status: 400,
                        detail: 'DeepSeek requires an API key',
                    });
                }
                return new deepseek_provider_1.DeepSeekProvider({ apiKey });
            case 'ANTHROPIC':
                throw new common_1.BadRequestException({
                    type: 'provider_not_implemented',
                    title: 'Provider Not Available',
                    status: 400,
                    detail: `${type} provider is not yet implemented`,
                });
            default:
                throw new common_1.BadRequestException({
                    type: 'invalid_provider_type',
                    title: 'Invalid Provider',
                    status: 400,
                    detail: 'Unknown provider type',
                });
        }
    }
    mapToResponse(config) {
        return {
            id: config.id,
            providerType: config.providerType,
            apiKey: config.apiKey ? API_KEY_MASK : undefined,
            endpoint: config.endpoint ?? undefined,
            modelId: config.modelId,
            isPrimary: config.isPrimary,
            isFallback: config.isFallback,
            isActive: config.isActive,
            createdAt: config.createdAt.toISOString(),
            updatedAt: config.updatedAt.toISOString(),
        };
    }
    async createAuditLog(action, changedBy, previousVal, newVal) {
        await this.prisma.llmConfigAuditLog.create({
            data: {
                action,
                changedBy,
                previousVal: previousVal ? JSON.parse(JSON.stringify(previousVal)) : undefined,
                newVal: JSON.parse(JSON.stringify(newVal)),
            },
        });
        this.logger.log({
            message: 'LLM config audit log created',
            action,
            changedBy,
        });
    }
    /**
     * Encrypts a string using AES-256-GCM.
     * Returns format: iv:authTag:encryptedData (all hex encoded)
     */
    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    }
    /**
     * Decrypts a string encrypted with the encrypt method.
     * @throws Error if encrypted string format is invalid
     */
    decrypt(encrypted) {
        const parts = encrypted.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted string format');
        }
        const [ivHex, authTagHex, encryptedText] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
};
exports.LlmConfigService = LlmConfigService;
exports.LlmConfigService = LlmConfigService = LlmConfigService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object, typeof (_b = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _b : Object])
], LlmConfigService);


/***/ }),
/* 76 */
/***/ ((module) => {

module.exports = require("node:crypto");

/***/ }),
/* 77 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OpenRouterProvider = void 0;
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
/**
 * OpenRouter provider implementation.
 * Validates API keys and fetches available models from OpenRouter API.
 */
class OpenRouterProvider {
    constructor(options) {
        if (!options.apiKey) {
            throw new Error('OpenRouter requires an API key');
        }
        this.apiKey = options.apiKey;
    }
    /**
     * Validates the API key by making a test request to the models endpoint.
     * @returns true if the API key is valid
     */
    async validateCredentials() {
        try {
            const response = await fetch(`${OPENROUTER_API_BASE}/models`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    /**
     * Fetches available models from OpenRouter API.
     * Filters to include primarily Llama and other popular models.
     * @returns Array of available models with pricing
     */
    async fetchModels() {
        const response = await fetch(`${OPENROUTER_API_BASE}/models`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.statusText}`);
        }
        const data = (await response.json());
        // Filter and map models - focus on popular Llama and other models
        const popularPrefixes = [
            'meta-llama/',
            'anthropic/',
            'openai/',
            'mistralai/',
            'google/',
        ];
        return data.data
            .filter((model) => popularPrefixes.some((prefix) => model.id.startsWith(prefix)))
            .map((model) => ({
            id: model.id,
            name: model.name,
            costPer1kTokens: this.calculateCostPer1k(model.pricing),
            contextLength: model.context_length,
        }))
            .slice(0, 50); // Limit to 50 models for UI performance
    }
    /**
     * Returns null as OpenRouter is a cloud provider.
     */
    async getResourceInfo() {
        return null;
    }
    calculateCostPer1k(pricing) {
        if (!pricing?.prompt) {
            return null;
        }
        // OpenRouter pricing is per token, convert to per 1K tokens
        const promptCost = parseFloat(pricing.prompt) * 1000;
        return Math.round(promptCost * 10000) / 10000; // Round to 4 decimal places
    }
}
exports.OpenRouterProvider = OpenRouterProvider;


/***/ }),
/* 78 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LocalLlamaProvider = void 0;
const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
/**
 * Local Llama (Ollama) provider implementation.
 * Validates endpoint connectivity and fetches available models from local Ollama server.
 */
class LocalLlamaProvider {
    constructor(options) {
        this.endpoint = options.endpoint ?? DEFAULT_OLLAMA_ENDPOINT;
    }
    /**
     * Validates connectivity to the Ollama server by fetching the tags endpoint.
     * @returns true if the endpoint is reachable and responds correctly
     */
    async validateCredentials() {
        try {
            const response = await fetch(`${this.endpoint}/api/tags`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    /**
     * Fetches available models from the local Ollama server.
     * @returns Array of available models (cost is null for local models)
     */
    async fetchModels() {
        const response = await fetch(`${this.endpoint}/api/tags`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.statusText}`);
        }
        const data = (await response.json());
        return data.models.map((model) => ({
            id: model.name,
            name: this.formatModelName(model.name),
            costPer1kTokens: null, // Local models have no per-token cost
            contextLength: this.estimateContextLength(model.name),
        }));
    }
    /**
     * Gets resource information from the local Ollama server.
     * Attempts to determine GPU/CPU requirements based on available models.
     * @returns Resource requirements for running local models
     */
    async getResourceInfo() {
        try {
            // Get the first available model to check resource requirements
            const models = await this.fetchModels();
            const firstModel = models[0];
            if (!firstModel) {
                return this.getDefaultResourceInfo();
            }
            const showResponse = await fetch(`${this.endpoint}/api/show`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: firstModel.id }),
            });
            if (!showResponse.ok) {
                return this.getDefaultResourceInfo();
            }
            const showData = (await showResponse.json());
            return this.parseResourceRequirements(showData, firstModel.id);
        }
        catch {
            return this.getDefaultResourceInfo();
        }
    }
    formatModelName(modelId) {
        // Convert "llama3.1:8b" to "Llama 3.1 8B"
        return modelId
            .replace(/([a-z])(\d)/gi, '$1 $2')
            .replace(/:/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    estimateContextLength(modelId) {
        // Estimate context length based on model name patterns
        const lowerModel = modelId.toLowerCase();
        if (lowerModel.includes('llama3.1') || lowerModel.includes('llama-3.1')) {
            return 128000;
        }
        if (lowerModel.includes('llama3') || lowerModel.includes('llama-3')) {
            return 8192;
        }
        if (lowerModel.includes('mistral')) {
            return 32768;
        }
        if (lowerModel.includes('mixtral')) {
            return 32768;
        }
        return 4096; // Default context length
    }
    getDefaultResourceInfo() {
        return {
            gpuRequired: false,
            gpuMemoryGb: undefined,
            cpuCores: 4,
            ramGb: 8,
        };
    }
    parseResourceRequirements(showData, modelId) {
        const paramSize = showData.details?.parameter_size ?? '';
        const quantLevel = showData.details?.quantization_level ?? '';
        // Estimate GPU memory based on parameter count and quantization
        const gpuMemoryGb = this.estimateGpuMemory(paramSize, quantLevel, modelId);
        return {
            gpuRequired: gpuMemoryGb > 4,
            gpuMemoryGb: gpuMemoryGb > 0 ? gpuMemoryGb : undefined,
            cpuCores: gpuMemoryGb > 8 ? 8 : 4,
            ramGb: Math.max(8, gpuMemoryGb * 1.5),
        };
    }
    estimateGpuMemory(paramSize, quantLevel, modelId) {
        // Parse parameter size (e.g., "8B", "70B")
        const paramMatch = paramSize.match(/(\d+(?:\.\d+)?)\s*[Bb]/);
        let params = paramMatch?.[1] ? parseFloat(paramMatch[1]) : 0;
        // If not in paramSize, try to extract from model name
        if (params === 0) {
            const modelMatch = modelId.match(/(\d+)[Bb]/);
            params = modelMatch?.[1] ? parseFloat(modelMatch[1]) : 7; // Default to 7B
        }
        // Quantization factor (lower bits = less memory)
        let quantFactor = 2; // Default FP16
        if (quantLevel.includes('Q4') || quantLevel.includes('q4')) {
            quantFactor = 0.5;
        }
        else if (quantLevel.includes('Q8') || quantLevel.includes('q8')) {
            quantFactor = 1;
        }
        // Rough estimate: params in billions * bytes per param
        return Math.ceil(params * quantFactor);
    }
}
exports.LocalLlamaProvider = LocalLlamaProvider;


/***/ }),
/* 79 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OpenAIProvider = void 0;
const OPENAI_API_BASE = 'https://api.openai.com/v1';
/**
 * OpenAI provider implementation.
 * Validates API keys and fetches available models from OpenAI API.
 */
class OpenAIProvider {
    constructor(options) {
        if (!options.apiKey) {
            throw new Error('OpenAI requires an API key');
        }
        this.apiKey = options.apiKey;
    }
    async validateCredentials() {
        try {
            const response = await fetch(`${OPENAI_API_BASE}/models`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                },
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    async fetchModels() {
        const response = await fetch(`${OPENAI_API_BASE}/models`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
            },
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.statusText}`);
        }
        const data = (await response.json());
        // Filter to chat-capable models
        const chatModelPrefixes = ['gpt-4', 'gpt-3.5', 'chatgpt', 'o1', 'o3'];
        // Preferred models shown first
        const preferredOrder = [
            'gpt-4o',
            'gpt-4o-mini',
            'gpt-4-turbo',
            'gpt-4',
            'gpt-3.5-turbo',
            'o3',
            'o3-mini',
            'o1',
            'o1-mini',
            'chatgpt-4o-latest',
        ];
        return data.data
            .filter((model) => chatModelPrefixes.some((prefix) => model.id.startsWith(prefix)))
            .map((model) => ({
            id: model.id,
            name: model.id,
            costPer1kTokens: null,
            contextLength: undefined,
        }))
            .sort((a, b) => {
            const aIdx = preferredOrder.findIndex((p) => a.id.startsWith(p));
            const bIdx = preferredOrder.findIndex((p) => b.id.startsWith(p));
            const aPriority = aIdx >= 0 ? aIdx : 100;
            const bPriority = bIdx >= 0 ? bIdx : 100;
            if (aPriority !== bPriority)
                return aPriority - bPriority;
            return a.name.localeCompare(b.name);
        })
            .slice(0, 30);
    }
    async getResourceInfo() {
        return null;
    }
}
exports.OpenAIProvider = OpenAIProvider;


/***/ }),
/* 80 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LmStudioProvider = void 0;
const DEFAULT_LM_STUDIO_ENDPOINT = 'http://localhost:1234';
/**
 * LM Studio / OpenAI-compatible provider implementation.
 * Uses the OpenAI-compatible API at a configurable endpoint.
 * Supports optional API key authentication (needed for RunPod, vLLM, etc.).
 * No API key required by default (local LM Studio).
 */
class LmStudioProvider {
    constructor(options) {
        this.endpoint = options.endpoint ?? DEFAULT_LM_STUDIO_ENDPOINT;
        this.apiKey = options.apiKey;
    }
    getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        return headers;
    }
    async validateCredentials() {
        try {
            const response = await fetch(`${this.endpoint}/v1/models`, {
                method: 'GET',
                headers: this.getHeaders(),
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    async fetchModels() {
        const response = await fetch(`${this.endpoint}/v1/models`, {
            method: 'GET',
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.statusText}`);
        }
        const data = (await response.json());
        return data.data.map((model) => ({
            id: model.id,
            name: model.id,
            costPer1kTokens: null,
            contextLength: undefined,
        }));
    }
    async getResourceInfo() {
        return {
            gpuRequired: false,
            gpuMemoryGb: undefined,
            cpuCores: undefined,
            ramGb: undefined,
        };
    }
}
exports.LmStudioProvider = LmStudioProvider;


/***/ }),
/* 81 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DeepSeekProvider = void 0;
const DEEPSEEK_API_BASE = 'https://api.deepseek.com/v1';
/**
 * DeepSeek provider implementation.
 * Uses the OpenAI-compatible API at https://api.deepseek.com/v1.
 */
class DeepSeekProvider {
    constructor(options) {
        if (!options.apiKey) {
            throw new Error('DeepSeek requires an API key');
        }
        this.apiKey = options.apiKey;
    }
    async validateCredentials() {
        try {
            const response = await fetch(`${DEEPSEEK_API_BASE}/models`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                },
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    async fetchModels() {
        const response = await fetch(`${DEEPSEEK_API_BASE}/models`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
            },
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.statusText}`);
        }
        const data = (await response.json());
        return data.data.map((model) => ({
            id: model.id,
            name: model.id,
            costPer1kTokens: null,
            contextLength: undefined,
        }));
    }
    async getResourceInfo() {
        return null;
    }
}
exports.DeepSeekProvider = DeepSeekProvider;


/***/ }),
/* 82 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateLlmConfigDto = void 0;
const tslib_1 = __webpack_require__(4);
const class_validator_1 = __webpack_require__(37);
const class_transformer_1 = __webpack_require__(83);
const types_1 = __webpack_require__(84);
class ProviderConfigDto {
}
tslib_1.__decorate([
    (0, class_validator_1.IsEnum)(types_1.LlmProviderType, { message: 'Invalid provider type' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Provider type is required' }),
    tslib_1.__metadata("design:type", typeof (_a = typeof types_1.LlmProviderType !== "undefined" && types_1.LlmProviderType) === "function" ? _a : Object)
], ProviderConfigDto.prototype, "type", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)({ message: 'API key must be a string' }),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], ProviderConfigDto.prototype, "apiKey", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsUrl)({ require_tld: false }, { message: 'Endpoint must be a valid URL' }),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], ProviderConfigDto.prototype, "endpoint", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)({ message: 'Model ID must be a string' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Model ID is required' }),
    tslib_1.__metadata("design:type", String)
], ProviderConfigDto.prototype, "modelId", void 0);
class UpdateLlmConfigDto {
}
exports.UpdateLlmConfigDto = UpdateLlmConfigDto;
tslib_1.__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ProviderConfigDto),
    (0, class_validator_1.IsNotEmpty)({ message: 'Primary provider is required' }),
    tslib_1.__metadata("design:type", ProviderConfigDto)
], UpdateLlmConfigDto.prototype, "primaryProvider", void 0);
tslib_1.__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => ProviderConfigDto),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", Object)
], UpdateLlmConfigDto.prototype, "fallbackProvider", void 0);


/***/ }),
/* 83 */
/***/ ((module) => {

module.exports = require("class-transformer");

/***/ }),
/* 84 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const tslib_1 = __webpack_require__(4);
tslib_1.__exportStar(__webpack_require__(85), exports);


/***/ }),
/* 85 */
/***/ ((__unused_webpack_module, exports) => {


/**
 * Shared TypeScript interfaces for Mentor AI
 * These types are used across both frontend (Angular) and backend (NestJS)
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.NoteStatus = exports.NoteType = exports.MEMORY_TYPE_LABELS = exports.MEMORY_TYPE_COLORS = exports.MemorySource = exports.MemoryType = exports.ConceptSource = exports.RelationshipType = exports.ConceptCategory = exports.CONFIDENCE_COLORS = exports.ConfidenceLevel = exports.PERSONA_NAMES = exports.PERSONA_COLORS = exports.PersonaType = exports.CircuitBreakerState = exports.MessageRole = exports.LlmProviderType = exports.TenantStatus = exports.ExportStatus = exports.ExportFormat = exports.INDUSTRIES = exports.Department = exports.InvitationStatus = void 0;
/** Invitation status */
var InvitationStatus;
(function (InvitationStatus) {
    InvitationStatus["PENDING"] = "PENDING";
    InvitationStatus["ACCEPTED"] = "ACCEPTED";
    InvitationStatus["EXPIRED"] = "EXPIRED";
    InvitationStatus["REVOKED"] = "REVOKED";
})(InvitationStatus || (exports.InvitationStatus = InvitationStatus = {}));
/** Department assignment */
var Department;
(function (Department) {
    Department["FINANCE"] = "FINANCE";
    Department["MARKETING"] = "MARKETING";
    Department["TECHNOLOGY"] = "TECHNOLOGY";
    Department["OPERATIONS"] = "OPERATIONS";
    Department["LEGAL"] = "LEGAL";
    Department["CREATIVE"] = "CREATIVE";
    Department["STRATEGY"] = "STRATEGY";
    Department["SALES"] = "SALES";
})(Department || (exports.Department = Department = {}));
/** Full list of industries for onboarding */
exports.INDUSTRIES = [
    'Accounting & Finance',
    'Agriculture',
    'Automotive',
    'Construction & Real Estate',
    'Consulting',
    'Education',
    'Energy & Utilities',
    'Entertainment & Media',
    'Food & Beverage',
    'Government',
    'Healthcare',
    'Hospitality & Tourism',
    'Insurance',
    'Legal Services',
    'Manufacturing',
    'Non-Profit',
    'Professional Services',
    'Retail & E-Commerce',
    'SaaS & Technology',
    'Telecommunications',
    'Transportation & Logistics',
    'Other',
];
// ── Data Export Types ──
// NOTE: These enums intentionally mirror the Prisma schema enums (ExportFormat, ExportStatus).
// Prisma generates its own types from schema.prisma, but frontend cannot import @prisma/client.
// Keep values in sync with apps/api/prisma/schema.prisma.
/** Export format options */
var ExportFormat;
(function (ExportFormat) {
    ExportFormat["PDF"] = "PDF";
    ExportFormat["MARKDOWN"] = "MARKDOWN";
    ExportFormat["JSON"] = "JSON";
})(ExportFormat || (exports.ExportFormat = ExportFormat = {}));
/** Export status tracking */
var ExportStatus;
(function (ExportStatus) {
    ExportStatus["PENDING"] = "PENDING";
    ExportStatus["PROCESSING"] = "PROCESSING";
    ExportStatus["COMPLETED"] = "COMPLETED";
    ExportStatus["FAILED"] = "FAILED";
    ExportStatus["EXPIRED"] = "EXPIRED";
})(ExportStatus || (exports.ExportStatus = ExportStatus = {}));
// ── Tenant Deletion Types ──
// NOTE: TenantStatus intentionally mirrors the Prisma schema enum.
// Prisma generates its own types from schema.prisma, but frontend cannot import @prisma/client.
// Keep values in sync with apps/api/prisma/schema.prisma.
/** Tenant status tracking */
var TenantStatus;
(function (TenantStatus) {
    TenantStatus["DRAFT"] = "DRAFT";
    TenantStatus["ONBOARDING"] = "ONBOARDING";
    TenantStatus["ACTIVE"] = "ACTIVE";
    TenantStatus["SUSPENDED"] = "SUSPENDED";
    TenantStatus["PENDING_DELETION"] = "PENDING_DELETION";
    TenantStatus["DELETED"] = "DELETED";
})(TenantStatus || (exports.TenantStatus = TenantStatus = {}));
// ── LLM Provider Configuration Types ──
// NOTE: LlmProviderType intentionally mirrors the Prisma schema enum.
// Prisma generates its own types from schema.prisma, but frontend cannot import @prisma/client.
// Keep values in sync with apps/api/prisma/schema.prisma.
/** LLM provider types supported by the platform */
var LlmProviderType;
(function (LlmProviderType) {
    LlmProviderType["OPENROUTER"] = "OPENROUTER";
    LlmProviderType["LOCAL_LLAMA"] = "LOCAL_LLAMA";
    LlmProviderType["OPENAI"] = "OPENAI";
    LlmProviderType["ANTHROPIC"] = "ANTHROPIC";
    LlmProviderType["LM_STUDIO"] = "LM_STUDIO";
    LlmProviderType["DEEPSEEK"] = "DEEPSEEK";
})(LlmProviderType || (exports.LlmProviderType = LlmProviderType = {}));
// ── Chat Conversation Types (Story 2.1) ──
// NOTE: MessageRole intentionally mirrors the Prisma schema enum.
// Prisma generates its own types from schema.prisma, but frontend cannot import @prisma/client.
// Keep values in sync with apps/api/prisma/schema.prisma.
/** Message role in conversation */
var MessageRole;
(function (MessageRole) {
    MessageRole["USER"] = "USER";
    MessageRole["ASSISTANT"] = "ASSISTANT";
})(MessageRole || (exports.MessageRole = MessageRole = {}));
/** Circuit breaker states */
var CircuitBreakerState;
(function (CircuitBreakerState) {
    /** Normal operation - requests flow through */
    CircuitBreakerState["CLOSED"] = "CLOSED";
    /** Circuit tripped - all requests rejected */
    CircuitBreakerState["OPEN"] = "OPEN";
    /** Testing - allow one request to check if service recovered */
    CircuitBreakerState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitBreakerState || (exports.CircuitBreakerState = CircuitBreakerState = {}));
// ── Department Persona Types (Story 2.4) ──
// Types for department-specific AI personas
// NOTE: PersonaType intentionally mirrors the Prisma schema enum.
// Prisma generates its own types from schema.prisma, but frontend cannot import @prisma/client.
// Keep values in sync with apps/api/prisma/schema.prisma.
/** Persona type for department-specific AI responses */
var PersonaType;
(function (PersonaType) {
    PersonaType["CFO"] = "CFO";
    PersonaType["CMO"] = "CMO";
    PersonaType["CTO"] = "CTO";
    PersonaType["OPERATIONS"] = "OPERATIONS";
    PersonaType["LEGAL"] = "LEGAL";
    PersonaType["CREATIVE"] = "CREATIVE";
    PersonaType["CSO"] = "CSO";
    PersonaType["SALES"] = "SALES";
})(PersonaType || (exports.PersonaType = PersonaType = {}));
/**
 * Persona colors for UI theming (dark mode compatible).
 * Single source of truth for persona color values.
 */
exports.PERSONA_COLORS = {
    [PersonaType.CFO]: '#10B981', // Emerald green (financial stability)
    [PersonaType.CMO]: '#F59E0B', // Amber (energy, creativity)
    [PersonaType.CTO]: '#3B82F6', // Blue (technology, trust)
    [PersonaType.OPERATIONS]: '#8B5CF6', // Purple (efficiency, process)
    [PersonaType.LEGAL]: '#6B7280', // Gray (neutrality, formality)
    [PersonaType.CREATIVE]: '#EC4899', // Pink (creativity, innovation)
    [PersonaType.CSO]: '#F97316', // Orange (strategy, vision)
    [PersonaType.SALES]: '#06B6D4', // Cyan (sales, connection)
};
/**
 * Persona display names for UI.
 * Single source of truth for persona short names.
 */
exports.PERSONA_NAMES = {
    [PersonaType.CFO]: 'CFO',
    [PersonaType.CMO]: 'CMO',
    [PersonaType.CTO]: 'CTO',
    [PersonaType.OPERATIONS]: 'COO',
    [PersonaType.LEGAL]: 'Legal',
    [PersonaType.CREATIVE]: 'Creative',
    [PersonaType.CSO]: 'CSO',
    [PersonaType.SALES]: 'Sales',
};
// ── Confidence Scoring Types (Story 2.5) ──
// Types for AI response confidence scoring and improvement suggestions
/** Confidence level thresholds */
var ConfidenceLevel;
(function (ConfidenceLevel) {
    /** High confidence: 85-100% */
    ConfidenceLevel["HIGH"] = "HIGH";
    /** Medium confidence: 50-84% */
    ConfidenceLevel["MEDIUM"] = "MEDIUM";
    /** Low confidence: 0-49% */
    ConfidenceLevel["LOW"] = "LOW";
})(ConfidenceLevel || (exports.ConfidenceLevel = ConfidenceLevel = {}));
/**
 * Confidence level colors for UI theming.
 * Single source of truth for confidence indicator colors.
 */
exports.CONFIDENCE_COLORS = {
    [ConfidenceLevel.HIGH]: '#22C55E', // Green
    [ConfidenceLevel.MEDIUM]: '#EAB308', // Amber
    [ConfidenceLevel.LOW]: '#EF4444', // Red
};
// ── Business Concept Types (Story 3.1) ──
// Types for the business concepts knowledge base
// NOTE: RelationshipType and ConceptCategory intentionally mirror the Prisma schema.
// Keep values in sync with apps/api/prisma/schema.prisma.
/** Category for business concepts (matches departments) */
var ConceptCategory;
(function (ConceptCategory) {
    ConceptCategory["FINANCE"] = "Finance";
    ConceptCategory["MARKETING"] = "Marketing";
    ConceptCategory["TECHNOLOGY"] = "Technology";
    ConceptCategory["OPERATIONS"] = "Operations";
    ConceptCategory["LEGAL"] = "Legal";
    ConceptCategory["CREATIVE"] = "Creative";
    ConceptCategory["STRATEGY"] = "Strategy";
    ConceptCategory["SALES"] = "Sales";
})(ConceptCategory || (exports.ConceptCategory = ConceptCategory = {}));
/** Relationship type between concepts */
var RelationshipType;
(function (RelationshipType) {
    /** Must understand this concept first */
    RelationshipType["PREREQUISITE"] = "PREREQUISITE";
    /** Related topic */
    RelationshipType["RELATED"] = "RELATED";
    /** Deeper dive on this topic */
    RelationshipType["ADVANCED"] = "ADVANCED";
})(RelationshipType || (exports.RelationshipType = RelationshipType = {}));
/** Source tracking for how a concept was created (Story 2.15) */
var ConceptSource;
(function (ConceptSource) {
    /** Pre-loaded from seed JSON files */
    ConceptSource["SEED_DATA"] = "SEED_DATA";
    /** Created via curriculum tree UI */
    ConceptSource["CURRICULUM"] = "CURRICULUM";
    /** Automatically extracted from AI output */
    ConceptSource["AI_DISCOVERED"] = "AI_DISCOVERED";
})(ConceptSource || (exports.ConceptSource = ConceptSource = {}));
// ── Persistent Memory Types (Story 2.7) ──
// Types for AI memory persistence across conversations
// NOTE: MemoryType and MemorySource intentionally mirror the Prisma schema enums.
// Keep values in sync with apps/api/prisma/schema.prisma.
/** Type of memory stored */
var MemoryType;
(function (MemoryType) {
    /** Context about a specific client */
    MemoryType["CLIENT_CONTEXT"] = "CLIENT_CONTEXT";
    /** Context about a specific project */
    MemoryType["PROJECT_CONTEXT"] = "PROJECT_CONTEXT";
    /** User preferences and working style */
    MemoryType["USER_PREFERENCE"] = "USER_PREFERENCE";
    /** General factual statements */
    MemoryType["FACTUAL_STATEMENT"] = "FACTUAL_STATEMENT";
})(MemoryType || (exports.MemoryType = MemoryType = {}));
/** Source of the memory */
var MemorySource;
(function (MemorySource) {
    /** Automatically extracted from conversation by AI */
    MemorySource["AI_EXTRACTED"] = "AI_EXTRACTED";
    /** Explicitly stated by user */
    MemorySource["USER_STATED"] = "USER_STATED";
    /** Corrected by user after AI extraction */
    MemorySource["USER_CORRECTED"] = "USER_CORRECTED";
})(MemorySource || (exports.MemorySource = MemorySource = {}));
/**
 * Memory type colors for UI theming.
 * Single source of truth for memory type indicator colors.
 */
exports.MEMORY_TYPE_COLORS = {
    [MemoryType.CLIENT_CONTEXT]: '#3B82F6', // Blue (business relationships)
    [MemoryType.PROJECT_CONTEXT]: '#8B5CF6', // Purple (project work)
    [MemoryType.USER_PREFERENCE]: '#10B981', // Emerald (personal)
    [MemoryType.FACTUAL_STATEMENT]: '#6B7280', // Gray (neutral facts)
};
/**
 * Memory type display labels.
 * Single source of truth for memory type names.
 */
exports.MEMORY_TYPE_LABELS = {
    [MemoryType.CLIENT_CONTEXT]: 'Client',
    [MemoryType.PROJECT_CONTEXT]: 'Project',
    [MemoryType.USER_PREFERENCE]: 'Preference',
    [MemoryType.FACTUAL_STATEMENT]: 'Fact',
};
// ── Notes/Tasks Types ──
// Types for the conversation notes and task tracking system
/** Note type classification */
var NoteType;
(function (NoteType) {
    NoteType["TASK"] = "TASK";
    NoteType["NOTE"] = "NOTE";
    NoteType["SUMMARY"] = "SUMMARY";
    NoteType["COMMENT"] = "COMMENT";
})(NoteType || (exports.NoteType = NoteType = {}));
/** Task completion status */
var NoteStatus;
(function (NoteStatus) {
    NoteStatus["PENDING"] = "PENDING";
    NoteStatus["READY_FOR_REVIEW"] = "READY_FOR_REVIEW";
    NoteStatus["COMPLETED"] = "COMPLETED";
})(NoteStatus || (exports.NoteStatus = NoteStatus = {}));


/***/ }),
/* 86 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ValidateProviderDto = void 0;
const tslib_1 = __webpack_require__(4);
const class_validator_1 = __webpack_require__(37);
const types_1 = __webpack_require__(84);
class ValidateProviderDto {
}
exports.ValidateProviderDto = ValidateProviderDto;
tslib_1.__decorate([
    (0, class_validator_1.IsEnum)(types_1.LlmProviderType, { message: 'Invalid provider type' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Provider type is required' }),
    tslib_1.__metadata("design:type", typeof (_a = typeof types_1.LlmProviderType !== "undefined" && types_1.LlmProviderType) === "function" ? _a : Object)
], ValidateProviderDto.prototype, "type", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)({ message: 'API key must be a string' }),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], ValidateProviderDto.prototype, "apiKey", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsUrl)({ require_tld: false }, { message: 'Endpoint must be a valid URL' }),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], ValidateProviderDto.prototype, "endpoint", void 0);


/***/ }),
/* 87 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AiGatewayModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const tenant_context_1 = __webpack_require__(9);
const llm_config_module_1 = __webpack_require__(73);
const ai_gateway_service_1 = __webpack_require__(88);
const redis_service_1 = __webpack_require__(93);
const rate_limiter_service_1 = __webpack_require__(92);
const token_tracker_service_1 = __webpack_require__(97);
const quota_service_1 = __webpack_require__(96);
const request_queue_service_1 = __webpack_require__(101);
const circuit_breaker_service_1 = __webpack_require__(99);
const cost_calculator_service_1 = __webpack_require__(100);
const confidence_service_1 = __webpack_require__(89);
const improvement_suggestions_service_1 = __webpack_require__(102);
let AiGatewayModule = class AiGatewayModule {
};
exports.AiGatewayModule = AiGatewayModule;
exports.AiGatewayModule = AiGatewayModule = tslib_1.__decorate([
    (0, common_1.Module)({
        // TenantModule provides PlatformPrismaService used by TokenTrackerService and QuotaService
        imports: [config_1.ConfigModule, tenant_context_1.TenantModule, llm_config_module_1.LlmConfigModule],
        providers: [
            ai_gateway_service_1.AiGatewayService,
            redis_service_1.RedisService,
            rate_limiter_service_1.RateLimiterService,
            token_tracker_service_1.TokenTrackerService,
            quota_service_1.QuotaService,
            request_queue_service_1.RequestQueueService,
            circuit_breaker_service_1.CircuitBreakerService,
            cost_calculator_service_1.CostCalculatorService,
            confidence_service_1.ConfidenceService,
            improvement_suggestions_service_1.ImprovementSuggestionsService,
        ],
        exports: [
            ai_gateway_service_1.AiGatewayService,
            redis_service_1.RedisService,
            rate_limiter_service_1.RateLimiterService,
            token_tracker_service_1.TokenTrackerService,
            quota_service_1.QuotaService,
            request_queue_service_1.RequestQueueService,
            circuit_breaker_service_1.CircuitBreakerService,
            cost_calculator_service_1.CostCalculatorService,
            confidence_service_1.ConfidenceService,
            improvement_suggestions_service_1.ImprovementSuggestionsService,
        ],
    })
], AiGatewayModule);


/***/ }),
/* 88 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var AiGatewayService_1;
var _a, _b, _c, _d, _e, _f, _g, _h;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AiGatewayService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const llm_config_service_1 = __webpack_require__(75);
const types_1 = __webpack_require__(84);
const confidence_service_1 = __webpack_require__(89);
const persona_prompts_1 = __webpack_require__(91);
const rate_limiter_service_1 = __webpack_require__(92);
const quota_service_1 = __webpack_require__(96);
const circuit_breaker_service_1 = __webpack_require__(99);
const token_tracker_service_1 = __webpack_require__(97);
const cost_calculator_service_1 = __webpack_require__(100);
const cuid2_1 = __webpack_require__(32);
/**
 * Service for streaming AI completions from configured LLM providers.
 * Includes rate limiting, quota enforcement, circuit breaker, and cost tracking.
 */
let AiGatewayService = AiGatewayService_1 = class AiGatewayService {
    constructor(llmConfigService, configService, rateLimiterService, quotaService, circuitBreakerService, tokenTrackerService, costCalculatorService, confidenceService) {
        this.llmConfigService = llmConfigService;
        this.configService = configService;
        this.rateLimiterService = rateLimiterService;
        this.quotaService = quotaService;
        this.circuitBreakerService = circuitBreakerService;
        this.tokenTrackerService = tokenTrackerService;
        this.costCalculatorService = costCalculatorService;
        this.confidenceService = confidenceService;
        this.logger = new common_1.Logger(AiGatewayService_1.name);
        /** Request timeout in milliseconds (1 hour — large models like 72B can be slow) */
        this.requestTimeoutMs = 3600 * 1000;
    }
    /**
     * Streams a completion with full context including rate limiting, quota, and tracking.
     *
     * @param messages - Conversation history in chat format
     * @param options - Stream options including tenant/user context
     * @param onChunk - Callback for each streamed chunk
     * @returns Completion result with usage metrics
     * @throws HttpException for rate limits, quotas, or provider errors
     */
    async streamCompletionWithContext(messages, options, onChunk) {
        const correlationId = `cor_${(0, cuid2_1.createId)()}`;
        const { tenantId, userId, conversationId, personaType } = options;
        this.logger.log({
            message: 'Starting AI completion',
            correlationId,
            tenantId,
            userId,
            conversationId,
            personaType: personaType ?? 'none',
            messageCount: messages.length,
        });
        // Build combined system prompt: business context + persona
        let messagesWithPersona = messages;
        let systemPrompt = '';
        if (options.businessContext) {
            systemPrompt = options.businessContext;
            this.logger.log({
                message: 'Business context added to system prompt',
                correlationId,
                contextLength: options.businessContext.length,
            });
        }
        if (personaType) {
            const personaSystemPrompt = (0, persona_prompts_1.generateSystemPrompt)(personaType);
            if (personaSystemPrompt) {
                systemPrompt = systemPrompt
                    ? `${systemPrompt}\n\n${personaSystemPrompt}`
                    : personaSystemPrompt;
                this.logger.log({
                    message: 'Persona system prompt added',
                    correlationId,
                    personaType,
                    promptLength: personaSystemPrompt.length,
                });
            }
        }
        if (systemPrompt) {
            messagesWithPersona = [{ role: 'system', content: systemPrompt }, ...messages];
        }
        // Truncate messages to fit within model context window
        messagesWithPersona = this.truncateMessagesToFit(messagesWithPersona, correlationId);
        // Check rate limits
        let rateLimit;
        if (!options.skipRateLimit) {
            const rateLimitResult = await this.rateLimiterService.checkLimits(tenantId, userId);
            rateLimit = rateLimitResult;
            if (!rateLimitResult.allowed) {
                const headers = this.rateLimiterService.getHeaders(rateLimitResult);
                throw new common_1.HttpException({
                    type: 'rate_limit_exceeded',
                    title: 'Rate Limit Exceeded',
                    status: 429,
                    detail: `Rate limit exceeded for ${rateLimitResult.limitType}. Try again in ${rateLimitResult.retryAfter} seconds.`,
                    headers,
                }, common_1.HttpStatus.TOO_MANY_REQUESTS);
            }
        }
        // Check quota
        if (!options.skipQuotaCheck) {
            const quotaResult = await this.quotaService.checkQuota(tenantId);
            if (!quotaResult.allowed) {
                throw new common_1.HttpException({
                    type: 'quota_exceeded',
                    title: 'Token Quota Exceeded',
                    status: 402,
                    detail: `Monthly token quota exceeded. Used ${quotaResult.used} of ${quotaResult.limit} tokens.`,
                    upgrade_url: '/settings/billing',
                }, common_1.HttpStatus.PAYMENT_REQUIRED);
            }
        }
        // Get provider config
        const config = await this.llmConfigService.getConfig();
        if (!config.primaryProvider) {
            throw new common_1.InternalServerErrorException({
                type: 'no_provider_configured',
                title: 'AI Provider Not Configured',
                status: 500,
                detail: 'No AI provider has been configured. Please configure an LLM provider.',
            });
        }
        const providerType = config.primaryProvider.providerType;
        const modelId = config.primaryProvider.modelId;
        const providerId = `${providerType}:${modelId}`;
        // Check circuit breaker
        const isAllowed = await this.circuitBreakerService.isAllowed(providerId);
        if (!isAllowed && !config.fallbackProvider) {
            throw new common_1.HttpException({
                type: 'circuit_open',
                title: 'Service Temporarily Unavailable',
                status: 503,
                detail: 'AI service is temporarily unavailable due to recent failures. Please try again later.',
                correlationId,
            }, common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        let inputTokens = 0;
        let outputTokens = 0;
        let outputContent = '';
        try {
            // Estimate input tokens (rough approximation: 1 token ≈ 4 chars)
            inputTokens = Math.ceil(messagesWithPersona.reduce((acc, m) => acc + m.content.length, 0) / 4);
            // Stream with tracking
            const wrappedOnChunk = (chunk) => {
                outputContent += chunk;
                onChunk(chunk);
            };
            // Use circuit breaker status to decide provider
            if (!isAllowed && config.fallbackProvider) {
                this.logger.warn({
                    message: 'Primary provider circuit open, using fallback',
                    correlationId,
                    primaryProvider: providerId,
                    fallbackProvider: config.fallbackProvider.providerType,
                });
                await this.streamWithFallbackAndTimeout(config.fallbackProvider, messagesWithPersona, wrappedOnChunk, correlationId);
            }
            else {
                await this.streamWithTimeout(messagesWithPersona, providerType, modelId, config.primaryProvider.endpoint, wrappedOnChunk, correlationId);
            }
            // Record success with circuit breaker
            await this.circuitBreakerService.recordSuccess(providerId, correlationId);
            // Estimate output tokens
            outputTokens = Math.ceil(outputContent.length / 4);
            // Calculate cost
            const costResult = this.costCalculatorService.calculateCost(modelId, inputTokens, outputTokens);
            // Track token usage
            await this.tokenTrackerService.trackUsage(tenantId, userId, inputTokens, outputTokens, costResult.totalCost, modelId, conversationId, providerId);
            // Calculate confidence score (Story 2.5)
            const confidenceContext = {
                messageCount: options.messageCount ?? messages.length,
                hasClientContext: options.hasClientContext ?? false,
                hasSpecificData: options.hasSpecificData ?? false,
                personaType,
                userQuestion: options.userQuestion ?? '',
            };
            const confidence = this.confidenceService.calculateConfidence(outputContent, confidenceContext);
            this.logger.log({
                message: 'AI completion successful',
                correlationId,
                inputTokens,
                outputTokens,
                cost: costResult.totalCost,
                modelId,
                personaType: personaType ?? 'none',
                confidenceScore: confidence.score,
                confidenceLevel: confidence.level,
            });
            return {
                correlationId,
                success: true,
                inputTokens,
                outputTokens,
                cost: costResult.totalCost,
                rateLimit,
                personaType,
                confidence,
                responseContent: outputContent,
            };
        }
        catch (error) {
            // Record failure with circuit breaker
            await this.circuitBreakerService.recordFailure(providerId, correlationId);
            this.logger.error({
                message: 'AI completion failed',
                correlationId,
                error: error instanceof Error ? error.message : 'Unknown error',
                providerId,
            });
            // Try fallback if available
            if (config.fallbackProvider) {
                this.logger.warn({
                    message: 'Trying fallback provider',
                    correlationId,
                    fallbackProvider: config.fallbackProvider.providerType,
                });
                try {
                    outputContent = '';
                    const wrappedOnChunk = (chunk) => {
                        outputContent += chunk;
                        onChunk(chunk);
                    };
                    await this.streamWithFallbackAndTimeout(config.fallbackProvider, messagesWithPersona, wrappedOnChunk, correlationId);
                    outputTokens = Math.ceil(outputContent.length / 4);
                    const fallbackModelId = config.fallbackProvider.modelId;
                    const costResult = this.costCalculatorService.calculateCost(fallbackModelId, inputTokens, outputTokens);
                    await this.tokenTrackerService.trackUsage(tenantId, userId, inputTokens, outputTokens, costResult.totalCost, fallbackModelId, conversationId, `${config.fallbackProvider.providerType}:${fallbackModelId}`);
                    // Calculate confidence score for fallback response (Story 2.5)
                    const fallbackConfidenceContext = {
                        messageCount: options.messageCount ?? messages.length,
                        hasClientContext: options.hasClientContext ?? false,
                        hasSpecificData: options.hasSpecificData ?? false,
                        personaType,
                        userQuestion: options.userQuestion ?? '',
                    };
                    const fallbackConfidence = this.confidenceService.calculateConfidence(outputContent, fallbackConfidenceContext);
                    this.logger.log({
                        message: 'Fallback AI completion successful',
                        correlationId,
                        inputTokens,
                        outputTokens,
                        cost: costResult.totalCost,
                        modelId: fallbackModelId,
                        personaType: personaType ?? 'none',
                        confidenceScore: fallbackConfidence.score,
                        confidenceLevel: fallbackConfidence.level,
                    });
                    return {
                        correlationId,
                        success: true,
                        inputTokens,
                        outputTokens,
                        cost: costResult.totalCost,
                        rateLimit,
                        personaType,
                        confidence: fallbackConfidence,
                        responseContent: outputContent,
                    };
                }
                catch (fallbackError) {
                    const fallbackProviderId = `${config.fallbackProvider.providerType}:${config.fallbackProvider.modelId}`;
                    await this.circuitBreakerService.recordFailure(fallbackProviderId, correlationId);
                    this.logger.error({
                        message: 'Fallback provider also failed',
                        correlationId,
                        error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
                    });
                }
            }
            throw error;
        }
    }
    /**
     * Streams a completion from the configured AI provider.
     * Legacy method for backward compatibility.
     *
     * @param messages - Conversation history in chat format
     * @param onChunk - Callback for each streamed chunk
     * @throws InternalServerErrorException if no provider is configured or streaming fails
     */
    async streamCompletion(messages, onChunk) {
        const config = await this.llmConfigService.getConfig();
        if (!config.primaryProvider) {
            throw new common_1.InternalServerErrorException({
                type: 'no_provider_configured',
                title: 'AI Provider Not Configured',
                status: 500,
                detail: 'No AI provider has been configured. Please configure an LLM provider.',
            });
        }
        const providerType = config.primaryProvider.providerType;
        const modelId = config.primaryProvider.modelId;
        try {
            switch (providerType) {
                case 'OPENROUTER':
                    await this.streamFromOpenRouter(messages, modelId, onChunk);
                    break;
                case 'OPENAI':
                    await this.streamFromOpenAI(messages, modelId, onChunk);
                    break;
                case 'LOCAL_LLAMA':
                    await this.streamFromLocalLlama(messages, modelId, config.primaryProvider.endpoint ?? '', onChunk);
                    break;
                case 'LM_STUDIO':
                    await this.streamFromLmStudio(messages, modelId, config.primaryProvider.endpoint ?? '', onChunk);
                    break;
                case 'DEEPSEEK':
                    await this.streamFromDeepSeek(messages, modelId, onChunk);
                    break;
                case 'ANTHROPIC':
                    throw new common_1.InternalServerErrorException({
                        type: 'provider_not_implemented',
                        title: 'Provider Not Available',
                        status: 500,
                        detail: `${providerType} provider is not yet implemented`,
                    });
                default:
                    throw new common_1.InternalServerErrorException({
                        type: 'unknown_provider',
                        title: 'Unknown Provider',
                        status: 500,
                        detail: `Unknown provider type: ${providerType}`,
                    });
            }
            this.logger.log({
                message: 'AI completion streamed successfully',
                providerType,
                modelId,
                messageCount: messages.length,
            });
        }
        catch (error) {
            if (config.fallbackProvider) {
                this.logger.warn({
                    message: 'Primary provider failed, trying fallback',
                    primaryProvider: providerType,
                    fallbackProvider: config.fallbackProvider.providerType,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
                try {
                    await this.streamWithFallback(config.fallbackProvider, messages, onChunk);
                    return;
                }
                catch (fallbackError) {
                    this.logger.error({
                        message: 'Fallback provider also failed',
                        error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
                    });
                }
            }
            throw error;
        }
    }
    /**
     * Streams with timeout support.
     */
    async streamWithTimeout(messages, providerType, modelId, endpoint, onChunk, correlationId) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, this.requestTimeoutMs);
        try {
            switch (providerType) {
                case 'OPENROUTER':
                    await this.streamFromOpenRouter(messages, modelId, onChunk, controller.signal);
                    break;
                case 'OPENAI':
                    await this.streamFromOpenAI(messages, modelId, onChunk, controller.signal);
                    break;
                case 'LOCAL_LLAMA':
                    await this.streamFromLocalLlama(messages, modelId, endpoint ?? '', onChunk, controller.signal);
                    break;
                case 'LM_STUDIO':
                    await this.streamFromLmStudio(messages, modelId, endpoint ?? '', onChunk, controller.signal);
                    break;
                case 'DEEPSEEK':
                    await this.streamFromDeepSeek(messages, modelId, onChunk, controller.signal);
                    break;
                case 'ANTHROPIC':
                    throw new common_1.InternalServerErrorException({
                        type: 'provider_not_implemented',
                        title: 'Provider Not Available',
                        status: 500,
                        detail: `${providerType} provider is not yet implemented`,
                        correlationId,
                    });
                default:
                    throw new common_1.InternalServerErrorException({
                        type: 'unknown_provider',
                        title: 'Unknown Provider',
                        status: 500,
                        detail: `Unknown provider type: ${providerType}`,
                        correlationId,
                    });
            }
        }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new common_1.InternalServerErrorException({
                    type: 'request_timeout',
                    title: 'Request Timeout',
                    status: 504,
                    detail: `Request timed out after ${this.requestTimeoutMs / 1000} seconds`,
                    correlationId,
                });
            }
            throw error;
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    /**
     * Streams from fallback provider with timeout.
     */
    async streamWithFallbackAndTimeout(fallbackProvider, messages, onChunk, correlationId) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, this.requestTimeoutMs);
        try {
            switch (fallbackProvider.providerType) {
                case 'OPENROUTER':
                    await this.streamFromOpenRouter(messages, fallbackProvider.modelId, onChunk, controller.signal);
                    break;
                case 'OPENAI':
                    await this.streamFromOpenAI(messages, fallbackProvider.modelId, onChunk, controller.signal);
                    break;
                case 'LOCAL_LLAMA':
                    await this.streamFromLocalLlama(messages, fallbackProvider.modelId, fallbackProvider.endpoint ?? '', onChunk, controller.signal);
                    break;
                case 'LM_STUDIO':
                    await this.streamFromLmStudio(messages, fallbackProvider.modelId, fallbackProvider.endpoint ?? '', onChunk, controller.signal);
                    break;
                case 'DEEPSEEK':
                    await this.streamFromDeepSeek(messages, fallbackProvider.modelId, onChunk, controller.signal);
                    break;
                default:
                    throw new common_1.InternalServerErrorException({
                        type: 'fallback_not_supported',
                        title: 'Fallback Not Supported',
                        status: 500,
                        detail: `Fallback provider ${fallbackProvider.providerType} is not supported`,
                        correlationId,
                    });
            }
        }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new common_1.InternalServerErrorException({
                    type: 'request_timeout',
                    title: 'Request Timeout',
                    status: 504,
                    detail: `Fallback request timed out after ${this.requestTimeoutMs / 1000} seconds`,
                    correlationId,
                });
            }
            throw error;
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    async streamFromOpenRouter(messages, modelId, onChunk, signal) {
        const apiKey = await this.llmConfigService.getDecryptedApiKey(types_1.LlmProviderType.OPENROUTER);
        if (!apiKey) {
            throw new common_1.InternalServerErrorException({
                type: 'api_key_not_found',
                title: 'API Key Not Found',
                status: 500,
                detail: 'OpenRouter API key is not configured',
            });
        }
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                'HTTP-Referer': this.configService.get('APP_URL') ?? 'http://localhost:4200',
                'X-Title': 'Mentor AI',
            },
            body: JSON.stringify({
                model: modelId,
                messages,
                stream: true,
            }),
            signal,
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new common_1.InternalServerErrorException({
                type: 'openrouter_error',
                title: 'OpenRouter API Error',
                status: 500,
                detail: `OpenRouter returned ${response.status}: ${errorText}`,
            });
        }
        const reader = response.body?.getReader();
        if (!reader) {
            throw new common_1.InternalServerErrorException({
                type: 'stream_error',
                title: 'Stream Error',
                status: 500,
                detail: 'Failed to get response stream',
            });
        }
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]')
                            continue;
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices[0]?.delta?.content;
                            if (content) {
                                onChunk(content);
                            }
                        }
                        catch {
                            // Skip malformed JSON lines
                        }
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
    }
    async streamFromOpenAI(messages, modelId, onChunk, signal) {
        const apiKey = await this.llmConfigService.getDecryptedApiKey(types_1.LlmProviderType.OPENAI);
        if (!apiKey) {
            throw new common_1.InternalServerErrorException({
                type: 'api_key_not_found',
                title: 'API Key Not Found',
                status: 500,
                detail: 'OpenAI API key is not configured',
            });
        }
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: modelId,
                messages,
                stream: true,
            }),
            signal,
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new common_1.InternalServerErrorException({
                type: 'openai_error',
                title: 'OpenAI API Error',
                status: 500,
                detail: `OpenAI returned ${response.status}: ${errorText}`,
            });
        }
        const reader = response.body?.getReader();
        if (!reader) {
            throw new common_1.InternalServerErrorException({
                type: 'stream_error',
                title: 'Stream Error',
                status: 500,
                detail: 'Failed to get response stream',
            });
        }
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]')
                            continue;
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices[0]?.delta?.content;
                            if (content) {
                                onChunk(content);
                            }
                        }
                        catch {
                            // Skip malformed JSON lines
                        }
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
    }
    async streamFromDeepSeek(messages, modelId, onChunk, signal) {
        const apiKey = await this.llmConfigService.getDecryptedApiKey(types_1.LlmProviderType.DEEPSEEK);
        if (!apiKey) {
            throw new common_1.InternalServerErrorException({
                type: 'api_key_not_found',
                title: 'API Key Not Found',
                status: 500,
                detail: 'DeepSeek API key is not configured',
            });
        }
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: modelId,
                messages,
                stream: true,
            }),
            signal,
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new common_1.InternalServerErrorException({
                type: 'deepseek_error',
                title: 'DeepSeek API Error',
                status: 500,
                detail: `DeepSeek returned ${response.status}: ${errorText}`,
            });
        }
        const reader = response.body?.getReader();
        if (!reader) {
            throw new common_1.InternalServerErrorException({
                type: 'stream_error',
                title: 'Stream Error',
                status: 500,
                detail: 'Failed to get response stream from DeepSeek',
            });
        }
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]')
                            continue;
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices[0]?.delta?.content;
                            if (content) {
                                onChunk(content);
                            }
                        }
                        catch {
                            // Skip malformed JSON lines
                        }
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
    }
    async streamFromLocalLlama(messages, modelId, endpoint, onChunk, signal) {
        const baseUrl = endpoint || 'http://localhost:11434';
        const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelId,
                messages,
                stream: true,
            }),
            signal,
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new common_1.InternalServerErrorException({
                type: 'local_llama_error',
                title: 'Local Llama Error',
                status: 500,
                detail: `Local Llama returned ${response.status}: ${errorText}`,
            });
        }
        const reader = response.body?.getReader();
        if (!reader) {
            throw new common_1.InternalServerErrorException({
                type: 'stream_error',
                title: 'Stream Error',
                status: 500,
                detail: 'Failed to get response stream',
            });
        }
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const parsed = JSON.parse(line);
                            const content = parsed.message?.content;
                            if (content) {
                                onChunk(content);
                            }
                        }
                        catch {
                            // Skip malformed JSON lines
                        }
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
    }
    async streamWithFallback(fallbackProvider, messages, onChunk) {
        switch (fallbackProvider.providerType) {
            case 'OPENROUTER':
                await this.streamFromOpenRouter(messages, fallbackProvider.modelId, onChunk);
                break;
            case 'OPENAI':
                await this.streamFromOpenAI(messages, fallbackProvider.modelId, onChunk);
                break;
            case 'LOCAL_LLAMA':
                await this.streamFromLocalLlama(messages, fallbackProvider.modelId, fallbackProvider.endpoint ?? '', onChunk);
                break;
            case 'LM_STUDIO':
                await this.streamFromLmStudio(messages, fallbackProvider.modelId, fallbackProvider.endpoint ?? '', onChunk);
                break;
            case 'DEEPSEEK':
                await this.streamFromDeepSeek(messages, fallbackProvider.modelId, onChunk);
                break;
            default:
                throw new common_1.InternalServerErrorException({
                    type: 'fallback_not_supported',
                    title: 'Fallback Not Supported',
                    status: 500,
                    detail: `Fallback provider ${fallbackProvider.providerType} is not supported`,
                });
        }
    }
    async streamFromLmStudio(messages, modelId, endpoint, onChunk, signal) {
        const baseUrl = endpoint || 'http://localhost:1234';
        const url = `${baseUrl}/v1/chat/completions`;
        this.logger.log({
            message: 'LM Studio request starting (SSE streaming)',
            url,
            modelId,
            messageCount: messages.length,
        });
        // Build headers — include API key if configured (needed for RunPod, vLLM, etc.)
        const headers = {
            'Content-Type': 'application/json',
        };
        const apiKey = await this.llmConfigService.getDecryptedApiKey(types_1.LlmProviderType.LM_STUDIO);
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: modelId,
                messages,
                stream: true,
            }),
            signal,
        });
        if (!response.ok) {
            const errorText = await response.text();
            this.logger.error({
                message: 'LM Studio error response',
                status: response.status,
                errorText,
            });
            throw new common_1.InternalServerErrorException({
                type: 'lm_studio_error',
                title: 'LM Studio Error',
                status: 500,
                detail: `LM Studio returned ${response.status}: ${errorText}`,
            });
        }
        const reader = response.body?.getReader();
        if (!reader) {
            throw new common_1.InternalServerErrorException({
                type: 'stream_error',
                title: 'Stream Error',
                status: 500,
                detail: 'Failed to get response stream from LM Studio / vLLM',
            });
        }
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]')
                            continue;
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices[0]?.delta?.content;
                            if (content) {
                                onChunk(content);
                            }
                        }
                        catch {
                            // Skip malformed JSON lines
                        }
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
        this.logger.log({
            message: 'LM Studio streaming completed',
            modelId,
        });
    }
    /**
     * Truncates conversation messages to fit within the model's context window.
     * Preserves the system message and the latest user message, dropping oldest
     * conversation history first. Uses rough token estimation (1 token ≈ 4 chars).
     *
     * Budget: 8192 max - 1500 reserved for output = 6692 input tokens.
     */
    truncateMessagesToFit(messages, correlationId) {
        const MAX_CONTEXT_TOKENS = 8192;
        const RESERVED_FOR_OUTPUT = 1500;
        const MAX_INPUT_TOKENS = MAX_CONTEXT_TOKENS - RESERVED_FOR_OUTPUT;
        const estimateTokens = (text) => Math.ceil(text.length / 4);
        const totalTokens = messages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
        if (totalTokens <= MAX_INPUT_TOKENS) {
            return messages;
        }
        this.logger.warn({
            message: 'Messages exceed context window, truncating',
            correlationId,
            totalTokens,
            maxInputTokens: MAX_INPUT_TOKENS,
            messageCount: messages.length,
        });
        // Separate system message from conversation
        const systemMessage = messages[0]?.role === 'system' ? messages[0] : null;
        const conversationMessages = systemMessage ? messages.slice(1) : [...messages];
        // If system message alone exceeds budget, truncate its content
        let systemTokens = systemMessage ? estimateTokens(systemMessage.content) : 0;
        let truncatedSystem = systemMessage;
        if (systemTokens > MAX_INPUT_TOKENS * 0.6) {
            // Cap system message at 60% of budget
            const maxSystemChars = Math.floor(MAX_INPUT_TOKENS * 0.6 * 4);
            truncatedSystem = {
                role: 'system',
                content: systemMessage.content.substring(0, maxSystemChars) +
                    '\n[...context trimmed to fit model limits]',
            };
            systemTokens = estimateTokens(truncatedSystem.content);
            this.logger.warn({
                message: 'System prompt truncated to fit context window',
                correlationId,
                originalTokens: estimateTokens(systemMessage.content),
                truncatedTokens: systemTokens,
            });
        }
        const remainingBudget = MAX_INPUT_TOKENS - systemTokens;
        // Always keep the latest message (the user's current question)
        // Build from newest to oldest until budget is exhausted
        const result = [];
        let usedTokens = 0;
        for (let i = conversationMessages.length - 1; i >= 0; i--) {
            const msg = conversationMessages[i];
            const msgTokens = estimateTokens(msg.content);
            if (usedTokens + msgTokens > remainingBudget) {
                break;
            }
            result.unshift(msg);
            usedTokens += msgTokens;
        }
        // Ensure at least the latest message is included even if it's large
        if (result.length === 0 && conversationMessages.length > 0) {
            const lastMsg = conversationMessages[conversationMessages.length - 1];
            const maxChars = remainingBudget * 4;
            const truncatedMsg = {
                role: lastMsg.role,
                content: lastMsg.content.substring(0, maxChars),
            };
            result.push(truncatedMsg);
            usedTokens = estimateTokens(truncatedMsg.content);
        }
        const finalMessages = truncatedSystem ? [truncatedSystem, ...result] : result;
        const droppedCount = messages.length - finalMessages.length;
        this.logger.log({
            message: 'Messages truncated to fit context window',
            correlationId,
            originalMessages: messages.length,
            keptMessages: finalMessages.length,
            droppedMessages: droppedCount,
            estimatedInputTokens: systemTokens + usedTokens,
            maxInputTokens: MAX_INPUT_TOKENS,
        });
        return finalMessages;
    }
};
exports.AiGatewayService = AiGatewayService;
exports.AiGatewayService = AiGatewayService = AiGatewayService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof llm_config_service_1.LlmConfigService !== "undefined" && llm_config_service_1.LlmConfigService) === "function" ? _a : Object, typeof (_b = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _b : Object, typeof (_c = typeof rate_limiter_service_1.RateLimiterService !== "undefined" && rate_limiter_service_1.RateLimiterService) === "function" ? _c : Object, typeof (_d = typeof quota_service_1.QuotaService !== "undefined" && quota_service_1.QuotaService) === "function" ? _d : Object, typeof (_e = typeof circuit_breaker_service_1.CircuitBreakerService !== "undefined" && circuit_breaker_service_1.CircuitBreakerService) === "function" ? _e : Object, typeof (_f = typeof token_tracker_service_1.TokenTrackerService !== "undefined" && token_tracker_service_1.TokenTrackerService) === "function" ? _f : Object, typeof (_g = typeof cost_calculator_service_1.CostCalculatorService !== "undefined" && cost_calculator_service_1.CostCalculatorService) === "function" ? _g : Object, typeof (_h = typeof confidence_service_1.ConfidenceService !== "undefined" && confidence_service_1.ConfidenceService) === "function" ? _h : Object])
], AiGatewayService);


/***/ }),
/* 89 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var ConfidenceService_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConfidenceService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const types_1 = __webpack_require__(84);
const hedging_detector_1 = __webpack_require__(90);
/**
 * Configuration for confidence factor weights.
 * Weights must sum to 1.0.
 */
const FACTOR_WEIGHTS = {
    hedging: 0.35,
    context: 0.35,
    specificity: 0.3,
};
/**
 * Service for calculating AI response confidence scores.
 * Uses multi-factor analysis including hedging language, context depth, and response specificity.
 */
let ConfidenceService = ConfidenceService_1 = class ConfidenceService {
    constructor() {
        this.logger = new common_1.Logger(ConfidenceService_1.name);
    }
    /**
     * Calculates confidence score for an AI response.
     *
     * @param response - The AI-generated response text
     * @param context - Context information for the calculation
     * @returns ConfidenceScore with overall score, level, and factor breakdown
     */
    calculateConfidence(response, context) {
        const factors = [];
        // Factor 1: Hedging language analysis
        const hedgingScore = this.calculateHedgingFactor(response);
        factors.push(hedgingScore);
        // Factor 2: Context depth analysis
        const contextScore = this.calculateContextFactor(context);
        factors.push(contextScore);
        // Factor 3: Response specificity analysis
        const specificityScore = this.calculateSpecificityFactor(response);
        factors.push(specificityScore);
        // Calculate weighted average
        const totalScore = factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0);
        const level = this.getConfidenceLevel(totalScore);
        const result = {
            score: Math.round(totalScore * 100) / 100, // Round to 2 decimal places
            level,
            factors,
        };
        this.logger.log({
            message: 'Confidence calculated',
            score: result.score,
            level: result.level,
            factorScores: factors.map((f) => ({ name: f.name, score: f.score })),
        });
        return result;
    }
    /**
     * Calculates confidence for a multi-section response.
     * Each section gets its own score, and overall is the weighted average.
     *
     * @param sections - Array of response sections to analyze
     * @param context - Context information for the calculation
     * @returns Array of section scores and overall average
     */
    calculateMultiSectionConfidence(sections, context) {
        const sectionScores = sections.map((section) => this.calculateConfidence(section, context));
        // Calculate weighted average based on section length
        const totalLength = sections.reduce((sum, s) => sum + s.length, 0);
        let weightedSum = 0;
        for (let i = 0; i < sections.length; i++) {
            const weight = sections[i].length / totalLength;
            weightedSum += sectionScores[i].score * weight;
        }
        // Build overall score by averaging factors
        const avgFactors = this.averageFactors(sectionScores.map((s) => s.factors));
        const overall = {
            score: Math.round(weightedSum * 100) / 100,
            level: this.getConfidenceLevel(weightedSum),
            factors: avgFactors,
        };
        return { sectionScores, overall };
    }
    /**
     * Calculates the hedging language factor.
     *
     * @param response - Response text to analyze
     * @returns Hedging confidence factor
     */
    calculateHedgingFactor(response) {
        const hedgingScore = (0, hedging_detector_1.getHedgingConfidenceScore)(response);
        const analysis = (0, hedging_detector_1.analyzeHedging)(response);
        return {
            name: 'hedging_language',
            score: hedgingScore,
            weight: FACTOR_WEIGHTS.hedging,
            description: `Hedging word count: ${analysis.hedgingCount}. Lower hedging indicates higher confidence.`,
        };
    }
    /**
     * Calculates the context depth factor.
     *
     * @param context - Context information
     * @returns Context depth confidence factor
     */
    calculateContextFactor(context) {
        let score = 0.5; // Base score
        // More conversation history = more context = higher confidence
        if (context.messageCount > 10) {
            score += 0.2;
        }
        else if (context.messageCount > 5) {
            score += 0.15;
        }
        else if (context.messageCount > 2) {
            score += 0.1;
        }
        // Client context available = higher confidence
        if (context.hasClientContext) {
            score += 0.15;
        }
        // Specific data provided = higher confidence
        if (context.hasSpecificData) {
            score += 0.15;
        }
        // Cap at 1.0
        score = Math.min(1.0, score);
        const description = this.buildContextDescription(context);
        return {
            name: 'context_depth',
            score,
            weight: FACTOR_WEIGHTS.context,
            description,
        };
    }
    /**
     * Calculates the response specificity factor.
     * Specific responses with numbers, dates, and concrete terms score higher.
     *
     * @param response - Response text to analyze
     * @returns Specificity confidence factor
     */
    calculateSpecificityFactor(response) {
        let score = 0.6; // Base score
        // Count specific indicators
        const numberMatches = response.match(/\d+(\.\d+)?%?/g) ?? [];
        const currencyMatches = response.match(/\$[\d,]+(\.\d{2})?/g) ?? [];
        const dateMatches = response.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|\d{4}|Q[1-4])\b/gi) ??
            [];
        // Increase score based on specificity indicators
        if (numberMatches.length > 3) {
            score += 0.2;
        }
        else if (numberMatches.length > 0) {
            score += 0.1;
        }
        if (currencyMatches.length > 0) {
            score += 0.1;
        }
        if (dateMatches.length > 0) {
            score += 0.1;
        }
        // Cap at 1.0
        score = Math.min(1.0, score);
        return {
            name: 'response_specificity',
            score,
            weight: FACTOR_WEIGHTS.specificity,
            description: `Found ${numberMatches.length} numbers, ${currencyMatches.length} currencies, ${dateMatches.length} dates. Specific recommendations score higher.`,
        };
    }
    /**
     * Determines confidence level from numeric score.
     *
     * @param score - Numeric score (0.0-1.0)
     * @returns Confidence level enum
     */
    getConfidenceLevel(score) {
        if (score >= 0.85) {
            return types_1.ConfidenceLevel.HIGH;
        }
        if (score >= 0.5) {
            return types_1.ConfidenceLevel.MEDIUM;
        }
        return types_1.ConfidenceLevel.LOW;
    }
    /**
     * Builds a description for the context factor.
     */
    buildContextDescription(context) {
        const parts = [];
        if (context.messageCount > 0) {
            parts.push(`${context.messageCount} messages in history`);
        }
        if (context.hasClientContext) {
            parts.push('client context available');
        }
        if (context.hasSpecificData) {
            parts.push('specific data provided');
        }
        if (parts.length === 0) {
            return 'Limited context available for this response.';
        }
        return `Context: ${parts.join(', ')}. More context improves confidence.`;
    }
    /**
     * Averages factors across multiple confidence scores.
     */
    averageFactors(factorArrays) {
        if (factorArrays.length === 0)
            return [];
        const firstFactors = factorArrays[0];
        return firstFactors.map((factor, index) => {
            const avgScore = factorArrays.reduce((sum, factors) => sum + (factors[index]?.score ?? 0), 0) /
                factorArrays.length;
            return {
                name: factor.name,
                score: Math.round(avgScore * 100) / 100,
                weight: factor.weight,
                description: `Average across ${factorArrays.length} sections.`,
            };
        });
    }
};
exports.ConfidenceService = ConfidenceService;
exports.ConfidenceService = ConfidenceService = ConfidenceService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)()
], ConfidenceService);


/***/ }),
/* 90 */
/***/ ((__unused_webpack_module, exports) => {


/**
 * Hedging language detector for confidence scoring.
 * Analyzes AI response text for uncertainty markers.
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.analyzeHedging = analyzeHedging;
exports.getHedgingConfidenceScore = getHedgingConfidenceScore;
/**
 * Hedging language patterns with uncertainty weights.
 * Higher weight = more uncertainty impact.
 */
const HEDGING_PATTERNS = [
    // Possibility hedges (moderate uncertainty)
    {
        pattern: /\b(might|may|could|possibly|perhaps)\b/gi,
        weight: 0.5,
        category: 'possibility',
    },
    // Approximation hedges (lower uncertainty)
    {
        pattern: /\b(approximately|roughly|around|about|nearly|almost)\b/gi,
        weight: 0.3,
        category: 'approximation',
    },
    // Uncertainty markers (high uncertainty)
    {
        pattern: /\b(uncertain|unclear|unsure|not sure|hard to say|difficult to determine)\b/gi,
        weight: 0.8,
        category: 'uncertainty',
    },
    // Qualification hedges (lower uncertainty)
    {
        pattern: /\b(generally|usually|typically|often|sometimes|frequently)\b/gi,
        weight: 0.2,
        category: 'qualification',
    },
    // Disclaimer phrases (high uncertainty)
    {
        pattern: /\b(this is just|this is only|limited data|not financial advice|not legal advice|consult a professional)\b/gi,
        weight: 0.6,
        category: 'disclaimer',
    },
    // Conditional phrases (moderate uncertainty)
    {
        pattern: /\b(if|depending on|it depends|would depend)\b/gi,
        weight: 0.4,
        category: 'conditional',
    },
    // Weak assertions (moderate uncertainty)
    {
        pattern: /\b(seems|appears|suggests|indicates|implies)\b/gi,
        weight: 0.4,
        category: 'weak_assertion',
    },
    // Probability words (lower uncertainty)
    {
        pattern: /\b(likely|probably|presumably|presumably)\b/gi,
        weight: 0.3,
        category: 'probability',
    },
];
/**
 * Analyzes text for hedging language to determine uncertainty level.
 *
 * @param text - Text content to analyze
 * @returns Analysis result with uncertainty metrics
 */
function analyzeHedging(text) {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;
    if (wordCount === 0) {
        return {
            uncertaintyRatio: 0,
            hedgingCount: 0,
            wordCount: 0,
            categories: {},
            positionWeightedScore: 0,
        };
    }
    const categories = {};
    let totalHedgingCount = 0;
    let weightedSum = 0;
    let positionWeightedSum = 0;
    for (const { pattern, weight, category } of HEDGING_PATTERNS) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
            totalHedgingCount++;
            weightedSum += weight;
            // Track category counts
            categories[category] = (categories[category] ?? 0) + 1;
            // Position weighting: hedging in first 20% of text has 2x impact
            if (match.index !== undefined) {
                const position = match.index / text.length;
                const positionMultiplier = position < 0.2 ? 2.0 : position < 0.5 ? 1.5 : 1.0;
                positionWeightedSum += weight * positionMultiplier;
            }
            else {
                positionWeightedSum += weight;
            }
        }
    }
    // Calculate uncertainty ratio (normalize by word count)
    // More hedging words relative to total words = higher uncertainty
    const normalizedHedgingDensity = totalHedgingCount / wordCount;
    // Cap at 1.0 and scale appropriately
    // A density of 0.1 (10% hedging words) would be quite high
    const uncertaintyRatio = Math.min(1.0, normalizedHedgingDensity * 10);
    // Position-weighted score normalized similarly
    const positionWeightedScore = Math.min(1.0, (positionWeightedSum / wordCount) * 10);
    return {
        uncertaintyRatio,
        hedgingCount: totalHedgingCount,
        wordCount,
        categories,
        positionWeightedScore,
    };
}
/**
 * Gets confidence score from hedging analysis.
 * Inverts uncertainty to confidence (less hedging = higher confidence).
 *
 * @param text - Text to analyze
 * @returns Confidence score (0.0-1.0)
 */
function getHedgingConfidenceScore(text) {
    const analysis = analyzeHedging(text);
    // Use position-weighted score for more nuanced result
    // Invert: high uncertainty = low confidence
    return 1 - analysis.positionWeightedScore;
}


/***/ }),
/* 91 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PERSONA_PROMPTS = void 0;
exports.getPersonaSystemPrompt = getPersonaSystemPrompt;
exports.generateSystemPrompt = generateSystemPrompt;
/**
 * CFO Persona System Prompt (~500 tokens)
 * Financial expertise, ROI focus, and metrics-driven responses
 */
const CFO_SYSTEM_PROMPT = {
    type: 'CFO',
    systemPrompt: `You are a Chief Financial Officer (CFO) AI persona for Mentor AI, a business intelligence platform.

EXPERTISE:
- Financial strategy and planning
- Budgeting, forecasting, and financial modeling
- Cash flow management and optimization
- Investment analysis and ROI calculations
- Financial reporting and compliance
- Risk assessment and mitigation
- Cost management and efficiency

COMMUNICATION STYLE:
- Data-driven and metrics-focused
- Clear financial terminology
- ROI and impact-oriented recommendations
- Risk-aware decision making
- Quantitative analysis with qualitative context

RESPONSE FORMAT:
- Lead with financial implications and key metrics
- Include relevant KPIs and benchmarks
- Provide cost-benefit analysis when applicable
- Cite sources using [[Concept Name]] format when referencing business concepts
- Present actionable recommendations with expected outcomes

FORMATIRANJE (STROGO OBAVEZNO — svaki odgovor MORA koristiti ove formate):

1. SEKCIJE: Organizuj svaki odgovor sa ## naslovom za svaku sekciju.

2. CALLOUT BLOKOVI (koristi MINIMUM 2 različita tipa po odgovoru):
> **Ključni uvid:** Ovde ide najvažniji zaključak ili preporuka.

> **Upozorenje:** Ovde ide rizik, opasnost ili problem.

> **Metrika:** Prihod: 450.000€ (+12%) | Konverzija: 3.2% | ROI: 280%

> **Rezime:** Kratki zaključak sa konkretnom preporukom.

3. TABELE SA BROJEVIMA (OBAVEZNO kad god imaš numeričke podatke):
| Kategorija | Vrednost | Promena |
|------------|----------|---------|
| Primer     | 100.000€ | +15%    |

4. OSTALA PRAVILA:
- Koristi **bold** za sve ključne termine
- Koristi bullet liste za nabrajanje, NE dugačke paragrafe
- Ako imaš web izvore, citiraj INLINE: ([Naziv izvora](URL)) odmah posle rečenice
- Odgovaraj UVEK na srpskom jeziku
- NIKADA ne piši odgovor bez bar jednog callout bloka i jedne tabele

Always respond as a trusted financial advisor who balances growth opportunities with fiscal responsibility and stakeholder value creation.`,
    capabilities: [
        'Financial analysis and modeling',
        'Budget planning and forecasting',
        'ROI and investment analysis',
        'Risk assessment',
        'Cost optimization strategies',
        'Financial reporting insights',
    ],
    limitations: [
        'Cannot provide specific legal or tax advice',
        'Analysis based on general principles, not specific regulations',
        'Recommendations require validation with actual financial data',
    ],
};
/**
 * CMO Persona System Prompt (~500 tokens)
 * Marketing expertise, brand focus, and growth strategies
 */
const CMO_SYSTEM_PROMPT = {
    type: 'CMO',
    systemPrompt: `You are a Chief Marketing Officer (CMO) AI persona for Mentor AI, a business intelligence platform.

EXPERTISE:
- Brand strategy and positioning
- Marketing campaign development
- Customer acquisition and retention
- Growth marketing and demand generation
- Market research and competitive analysis
- Digital marketing and content strategy
- Customer journey optimization

COMMUNICATION STYLE:
- Customer-centric and audience-focused
- Creative yet data-informed
- Story-driven with measurable outcomes
- Trend-aware and forward-thinking
- Collaborative and cross-functional

RESPONSE FORMAT:
- Lead with customer impact and market opportunity
- Include audience insights and segmentation
- Provide channel-specific recommendations
- Cite sources using [[Concept Name]] format when referencing business concepts
- Present strategies with expected engagement and conversion metrics

FORMATIRANJE (STROGO OBAVEZNO — svaki odgovor MORA koristiti ove formate):

1. SEKCIJE: Organizuj svaki odgovor sa ## naslovom za svaku sekciju.

2. CALLOUT BLOKOVI (koristi MINIMUM 2 različita tipa po odgovoru):
> **Ključni uvid:** Ovde ide najvažniji zaključak ili preporuka.

> **Upozorenje:** Ovde ide rizik, opasnost ili problem.

> **Metrika:** Doseg: 125.000 | CTR: 4.8% | CPC: 0.42€ | Konverzija: 2.1%

> **Rezime:** Kratki zaključak sa konkretnom preporukom.

3. TABELE SA BROJEVIMA (OBAVEZNO kad god imaš numeričke podatke):
| Kanal | Doseg | Konverzija | CPA |
|-------|-------|------------|-----|
| Primer | 50.000 | 3.2% | 12€ |

4. OSTALA PRAVILA:
- Koristi **bold** za sve ključne termine
- Koristi bullet liste za nabrajanje, NE dugačke paragrafe
- Ako imaš web izvore, citiraj INLINE: ([Naziv izvora](URL)) odmah posle rečenice
- Odgovaraj UVEK na srpskom jeziku
- NIKADA ne piši odgovor bez bar jednog callout bloka i jedne tabele

Always respond as a strategic marketing leader who combines creativity with analytics to drive sustainable growth and brand value.`,
    capabilities: [
        'Brand strategy development',
        'Campaign planning and optimization',
        'Market analysis and positioning',
        'Customer segmentation',
        'Content strategy',
        'Growth marketing tactics',
    ],
    limitations: [
        'Cannot access real-time market data',
        'Strategies require adaptation to specific market conditions',
        'Metrics are estimates based on industry benchmarks',
    ],
};
/**
 * CTO Persona System Prompt (~500 tokens)
 * Technical expertise, architecture focus, and scalability
 */
const CTO_SYSTEM_PROMPT = {
    type: 'CTO',
    systemPrompt: `You are a Chief Technology Officer (CTO) AI persona for Mentor AI, a business intelligence platform.

EXPERTISE:
- Technical architecture and system design
- Software development best practices
- Cloud infrastructure and DevOps
- Technology strategy and roadmaps
- Security architecture and compliance
- Team structure and technical leadership
- Emerging technology evaluation

COMMUNICATION STYLE:
- Technical yet accessible
- Architecture and scalability focused
- Security-conscious
- Trade-off aware
- Pragmatic and solution-oriented

RESPONSE FORMAT:
- Lead with technical approach and architecture implications
- Include scalability and performance considerations
- Provide security and compliance context
- Cite sources using [[Concept Name]] format when referencing business concepts
- Present options with technical trade-offs and recommendations

FORMATIRANJE (STROGO OBAVEZNO — svaki odgovor MORA koristiti ove formate):

1. SEKCIJE: Organizuj svaki odgovor sa ## naslovom za svaku sekciju.

2. CALLOUT BLOKOVI (koristi MINIMUM 2 različita tipa po odgovoru):
> **Ključni uvid:** Ovde ide najvažniji zaključak ili preporuka.

> **Upozorenje:** Ovde ide rizik, opasnost ili problem.

> **Metrika:** Uptime: 99.9% | Latency: 45ms | Throughput: 1200 req/s

> **Rezime:** Kratki zaključak sa konkretnom preporukom.

3. TABELE SA BROJEVIMA (OBAVEZNO kad god imaš numeričke podatke):
| Opcija | Cena | Skalabilnost | Rizik |
|--------|------|-------------|-------|
| Primer | 500€/mo | Visoka | Nizak |

4. OSTALA PRAVILA:
- Koristi **bold** za sve ključne termine
- Koristi bullet liste za nabrajanje, NE dugačke paragrafe
- Ako imaš web izvore, citiraj INLINE: ([Naziv izvora](URL)) odmah posle rečenice
- Odgovaraj UVEK na srpskom jeziku
- NIKADA ne piši odgovor bez bar jednog callout bloka i jedne tabele

Always respond as a strategic technology leader who balances innovation with reliability, security, and maintainability.`,
    capabilities: [
        'Architecture design and review',
        'Technology selection guidance',
        'Security best practices',
        'Scalability planning',
        'Technical debt assessment',
        'Development process optimization',
    ],
    limitations: [
        'Cannot write or execute code directly',
        'Recommendations require validation with specific tech stack',
        'Security advice is general guidance, not compliance certification',
    ],
};
/**
 * Operations Persona System Prompt (~500 tokens)
 * Process optimization, efficiency, and resource management
 */
const OPERATIONS_SYSTEM_PROMPT = {
    type: 'OPERATIONS',
    systemPrompt: `You are a Chief Operations Officer (COO) AI persona for Mentor AI, a business intelligence platform.

EXPERTISE:
- Process optimization and workflow design
- Operational efficiency and lean methodologies
- Supply chain and logistics management
- Resource allocation and capacity planning
- Quality assurance and continuous improvement
- Vendor management and procurement
- Cross-functional coordination

COMMUNICATION STYLE:
- Process-oriented and systematic
- Efficiency-focused with measurable outcomes
- Practical and implementation-ready
- Data-driven operational metrics
- Collaborative across departments

RESPONSE FORMAT:
- Lead with operational impact and efficiency gains
- Include process flow and bottleneck analysis
- Provide implementation steps and timelines
- Cite sources using [[Concept Name]] format when referencing business concepts
- Present recommendations with expected operational improvements

FORMATIRANJE (STROGO OBAVEZNO — svaki odgovor MORA koristiti ove formate):

1. SEKCIJE: Organizuj svaki odgovor sa ## naslovom za svaku sekciju.

2. CALLOUT BLOKOVI (koristi MINIMUM 2 različita tipa po odgovoru):
> **Ključni uvid:** Ovde ide najvažniji zaključak ili preporuka.

> **Upozorenje:** Ovde ide rizik, opasnost ili problem.

> **Metrika:** Efikasnost: 87% (+12%) | Lead time: 3.2 dana | Defekti: 0.5%

> **Rezime:** Kratki zaključak sa konkretnom preporukom.

3. TABELE SA BROJEVIMA (OBAVEZNO kad god imaš numeričke podatke):
| Proces | Trenutno | Cilj | Ušteda |
|--------|----------|------|--------|
| Primer | 5 dana   | 2 dana | 60% |

4. OSTALA PRAVILA:
- Koristi **bold** za sve ključne termine
- Koristi bullet liste za nabrajanje, NE dugačke paragrafe
- Ako imaš web izvore, citiraj INLINE: ([Naziv izvora](URL)) odmah posle rečenice
- Odgovaraj UVEK na srpskom jeziku
- NIKADA ne piši odgovor bez bar jednog callout bloka i jedne tabele

Always respond as a strategic operations leader focused on streamlining processes, reducing waste, and maximizing organizational effectiveness.`,
    capabilities: [
        'Process design and optimization',
        'Workflow analysis',
        'Capacity planning',
        'Vendor evaluation',
        'Quality management',
        'Operational metrics tracking',
    ],
    limitations: [
        'Cannot access real-time operational data',
        'Recommendations require adaptation to specific workflows',
        'Efficiency estimates based on industry standards',
    ],
};
/**
 * Legal Persona System Prompt (~500 tokens)
 * Compliance, contracts, and risk management
 */
const LEGAL_SYSTEM_PROMPT = {
    type: 'LEGAL',
    systemPrompt: `You are a General Counsel AI persona for Mentor AI, a business intelligence platform.

EXPERTISE:
- Contract review and negotiation
- Regulatory compliance and governance
- Intellectual property protection
- Risk assessment and mitigation
- Corporate governance
- Employment law fundamentals
- Data privacy and security compliance

COMMUNICATION STYLE:
- Precise and legally-minded
- Risk-aware and cautionary
- Clear explanation of legal concepts
- Balanced consideration of business needs
- Thorough documentation emphasis

RESPONSE FORMAT:
- Lead with legal considerations and risk factors
- Include relevant regulatory context
- Provide compliance checklists when applicable
- Cite sources using [[Concept Name]] format when referencing business concepts
- Present recommendations with appropriate disclaimers

FORMATIRANJE (STROGO OBAVEZNO — svaki odgovor MORA koristiti ove formate):

1. SEKCIJE: Organizuj svaki odgovor sa ## naslovom za svaku sekciju.

2. CALLOUT BLOKOVI (koristi MINIMUM 2 različita tipa po odgovoru):
> **Ključni uvid:** Ovde ide najvažniji zaključak ili preporuka.

> **Upozorenje:** Ovde ide pravni rizik ili regulatorna opasnost.

> **Metrika:** Rok: 30 dana | Kazna: do 20.000€ | Usklađenost: 78%

> **Rezime:** Kratki zaključak sa konkretnom preporukom.

3. TABELE SA BROJEVIMA (OBAVEZNO kad god imaš numeričke podatke):
| Obaveza | Rok | Status | Rizik |
|---------|-----|--------|-------|
| Primer  | Q2  | Aktivan | Visok |

4. OSTALA PRAVILA:
- Koristi **bold** za sve ključne termine
- Koristi bullet liste za nabrajanje, NE dugačke paragrafe
- Ako imaš web izvore, citiraj INLINE: ([Naziv izvora](URL)) odmah posle rečenice
- Odgovaraj UVEK na srpskom jeziku
- NIKADA ne piši odgovor bez bar jednog callout bloka i jedne tabele

IMPORTANT DISCLAIMER: This AI provides general legal information and guidance only. It is NOT a substitute for professional legal advice from a licensed attorney. Always consult qualified legal counsel for specific legal matters.`,
    capabilities: [
        'Contract structure guidance',
        'Compliance framework overview',
        'Risk identification',
        'Policy development guidance',
        'Regulatory awareness',
        'Legal document templates',
    ],
    limitations: [
        'Cannot provide specific legal advice',
        'Not a substitute for licensed attorney consultation',
        'Information may not reflect latest regulations',
        'Guidance is educational, not legal counsel',
    ],
};
/**
 * Creative Persona System Prompt (~500 tokens)
 * Innovation, design thinking, and creative strategy
 */
const CREATIVE_SYSTEM_PROMPT = {
    type: 'CREATIVE',
    systemPrompt: `You are a Chief Creative Officer (CCO) AI persona for Mentor AI, a business intelligence platform.

EXPERTISE:
- Creative strategy and ideation
- Brand identity and visual design
- Design thinking methodology
- User experience principles
- Storytelling and narrative development
- Innovation workshops and brainstorming
- Creative team leadership

COMMUNICATION STYLE:
- Imaginative and inspiring
- Visual and descriptive
- User-empathetic
- Trend-conscious
- Collaborative and encouraging

RESPONSE FORMAT:
- Lead with creative vision and user impact
- Include visual concepts and mood descriptions
- Provide ideation techniques and frameworks
- Cite sources using [[Concept Name]] format when referencing business concepts
- Present multiple creative directions with rationale

FORMATIRANJE (STROGO OBAVEZNO — svaki odgovor MORA koristiti ove formate):

1. SEKCIJE: Organizuj svaki odgovor sa ## naslovom za svaku sekciju.

2. CALLOUT BLOKOVI (koristi MINIMUM 2 različita tipa po odgovoru):
> **Ključni uvid:** Ovde ide najvažniji kreativni zaključak ili preporuka.

> **Upozorenje:** Ovde ide rizik, opasnost ili problem.

> **Metrika:** Engagement: 4.5% | Brand recall: 72% | Sentiment: +85%

> **Rezime:** Kratki zaključak sa konkretnom preporukom.

3. TABELE SA BROJEVIMA (OBAVEZNO kad god imaš numeričke podatke):
| Koncept | Impact | Troškovi | Timeline |
|---------|--------|----------|----------|
| Primer  | Visok  | 5.000€   | 2 nedelje |

4. OSTALA PRAVILA:
- Koristi **bold** za sve ključne termine
- Koristi bullet liste za nabrajanje, NE dugačke paragrafe
- Ako imaš web izvore, citiraj INLINE: ([Naziv izvora](URL)) odmah posle rečenice
- Odgovaraj UVEK na srpskom jeziku
- NIKADA ne piši odgovor bez bar jednog callout bloka i jedne tabele

Always respond as an innovative creative leader who combines artistic vision with strategic thinking to create meaningful experiences and compelling brand narratives.`,
    capabilities: [
        'Creative strategy development',
        'Brand identity guidance',
        'Design thinking facilitation',
        'Ideation and brainstorming',
        'Storytelling frameworks',
        'UX principles guidance',
    ],
    limitations: [
        'Cannot create actual visual designs',
        'Creative concepts require execution by designers',
        'Trends and aesthetics evolve over time',
    ],
};
/**
 * CSO Persona System Prompt (~500 tokens)
 * Strategic planning, competitive analysis, and business positioning
 */
const CSO_SYSTEM_PROMPT = {
    type: 'CSO',
    systemPrompt: `You are a Chief Strategy Officer (CSO) AI persona for Mentor AI, a business intelligence platform.

EXPERTISE:
- Business strategy and long-term planning
- Competitive analysis and market positioning
- SWOT analysis and strategic frameworks
- Growth strategy and market expansion
- Business model innovation
- Strategic partnerships and alliances
- Portfolio management and diversification

COMMUNICATION STYLE:
- Big-picture and future-oriented
- Framework-driven analysis
- Evidence-based strategic reasoning
- Scenario planning and contingency thinking
- Clear articulation of trade-offs

RESPONSE FORMAT:
- Lead with strategic implications and market context
- Include competitive landscape analysis
- Provide framework-based recommendations (Porter's, BCG, etc.)
- Cite sources using [[Concept Name]] format when referencing business concepts
- Present strategic options with risk-reward assessment

FORMATIRANJE (STROGO OBAVEZNO — svaki odgovor MORA koristiti ove formate):

1. SEKCIJE: Organizuj svaki odgovor sa ## naslovom za svaku sekciju.

2. CALLOUT BLOKOVI (koristi MINIMUM 2 različita tipa po odgovoru):
> **Ključni uvid:** Ovde ide najvažniji strateški zaključak ili preporuka.

> **Upozorenje:** Ovde ide strateški rizik ili pretnja.

> **Metrika:** Tržišni udeo: 12% | Rast: +23% YoY | TAM: 2.4M€

> **Rezime:** Kratki zaključak sa konkretnom preporukom.

3. TABELE SA BROJEVIMA (OBAVEZNO kad god imaš numeričke podatke):
| Strategija | Potencijal | Rizik | Prioritet |
|-----------|------------|-------|-----------|
| Primer    | Visok      | Srednji | P1      |

4. OSTALA PRAVILA:
- Koristi **bold** za sve ključne termine
- Koristi bullet liste za nabrajanje, NE dugačke paragrafe
- Ako imaš web izvore, citiraj INLINE: ([Naziv izvora](URL)) odmah posle rečenice
- Odgovaraj UVEK na srpskom jeziku
- NIKADA ne piši odgovor bez bar jednog callout bloka i jedne tabele

Always respond as a visionary strategy leader who combines analytical rigor with creative thinking to identify sustainable competitive advantages and growth opportunities.`,
    capabilities: [
        'Strategic framework application',
        'Competitive analysis',
        'Market positioning guidance',
        'Growth strategy development',
        'Business model evaluation',
        'Strategic planning facilitation',
    ],
    limitations: [
        'Cannot access proprietary competitive intelligence',
        'Strategies require validation with actual market data',
        'Recommendations are frameworks, not guaranteed outcomes',
    ],
};
/**
 * Sales Persona System Prompt (~500 tokens)
 * Sales strategy, pipeline management, and revenue growth
 */
const SALES_SYSTEM_PROMPT = {
    type: 'SALES',
    systemPrompt: `You are a VP of Sales AI persona for Mentor AI, a business intelligence platform.

EXPERTISE:
- Sales strategy and pipeline management
- Lead qualification and scoring
- Sales forecasting and revenue planning
- Client relationship management
- Consultative and solution selling
- Negotiation and closing techniques
- Sales team enablement and training

COMMUNICATION STYLE:
- Results-oriented and revenue-focused
- Relationship-driven communication
- Practical and action-oriented
- Metrics-conscious (pipeline, conversion, ARR)
- Confident and persuasive

RESPONSE FORMAT:
- Lead with revenue impact and pipeline implications
- Include sales metrics and conversion benchmarks
- Provide actionable playbooks and talk tracks
- Cite sources using [[Concept Name]] format when referencing business concepts
- Present recommendations with expected revenue outcomes

FORMATIRANJE (STROGO OBAVEZNO — svaki odgovor MORA koristiti ove formate):

1. SEKCIJE: Organizuj svaki odgovor sa ## naslovom za svaku sekciju.

2. CALLOUT BLOKOVI (koristi MINIMUM 2 različita tipa po odgovoru):
> **Ključni uvid:** Ovde ide najvažniji zaključak ili preporuka.

> **Upozorenje:** Ovde ide rizik ili problem u prodaji.

> **Metrika:** Pipeline: 850.000€ | Win rate: 32% | ACV: 24.000€ | Cycle: 45 dana

> **Rezime:** Kratki zaključak sa konkretnom preporukom.

3. TABELE SA BROJEVIMA (OBAVEZNO kad god imaš numeričke podatke):
| Faza | Dealovi | Vrednost | Konverzija |
|------|---------|----------|------------|
| Primer | 12   | 288.000€ | 35%        |

4. OSTALA PRAVILA:
- Koristi **bold** za sve ključne termine
- Koristi bullet liste za nabrajanje, NE dugačke paragrafe
- Ako imaš web izvore, citiraj INLINE: ([Naziv izvora](URL)) odmah posle rečenice
- Odgovaraj UVEK na srpskom jeziku
- NIKADA ne piši odgovor bez bar jednog callout bloka i jedne tabele

Always respond as an experienced sales leader who combines relationship intelligence with data-driven strategies to accelerate revenue growth and build lasting client partnerships.`,
    capabilities: [
        'Sales strategy development',
        'Pipeline analysis and optimization',
        'Lead qualification frameworks',
        'Negotiation guidance',
        'Sales process design',
        'Revenue forecasting',
    ],
    limitations: [
        'Cannot access real-time CRM data',
        'Sales projections are estimates based on industry benchmarks',
        'Strategies require adaptation to specific sales cycles',
    ],
};
/**
 * Map of all persona system prompts indexed by PersonaType
 */
exports.PERSONA_PROMPTS = {
    CFO: CFO_SYSTEM_PROMPT,
    CMO: CMO_SYSTEM_PROMPT,
    CTO: CTO_SYSTEM_PROMPT,
    OPERATIONS: OPERATIONS_SYSTEM_PROMPT,
    LEGAL: LEGAL_SYSTEM_PROMPT,
    CREATIVE: CREATIVE_SYSTEM_PROMPT,
    CSO: CSO_SYSTEM_PROMPT,
    SALES: SALES_SYSTEM_PROMPT,
};
/**
 * Gets the system prompt for a specific persona type.
 * @param type - PersonaType string
 * @returns PersonaSystemPrompt or undefined if not found
 */
function getPersonaSystemPrompt(type) {
    return exports.PERSONA_PROMPTS[type];
}
/**
 * Generates the full system message for AI context.
 * @param type - PersonaType string
 * @returns System prompt string or empty string if persona not found
 */
function generateSystemPrompt(type) {
    const prompt = exports.PERSONA_PROMPTS[type];
    return prompt?.systemPrompt ?? '';
}


/***/ }),
/* 92 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var RateLimiterService_1;
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RateLimiterService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const redis_service_1 = __webpack_require__(93);
/**
 * Service for enforcing rate limits on AI gateway requests.
 * Implements per-tenant and per-user rate limiting using sliding window algorithm.
 */
let RateLimiterService = RateLimiterService_1 = class RateLimiterService {
    constructor(redisService, configService) {
        this.redisService = redisService;
        this.configService = configService;
        this.logger = new common_1.Logger(RateLimiterService_1.name);
        /** Window duration in milliseconds (1 minute) */
        this.windowMs = 60 * 1000;
        this.tenantLimitPerMinute = this.configService.get('RATE_LIMIT_TENANT_PER_MINUTE', 60);
        this.userLimitPerMinute = this.configService.get('RATE_LIMIT_USER_PER_MINUTE', 20);
        this.logger.log({
            message: 'Rate limiter initialized',
            tenantLimitPerMinute: this.tenantLimitPerMinute,
            userLimitPerMinute: this.userLimitPerMinute,
        });
    }
    /**
     * Checks if a request should be allowed based on tenant rate limits.
     *
     * @param tenantId - The tenant identifier (e.g., 'tnt_123')
     * @returns Rate limit result with allowed status and limit info
     */
    async checkTenantLimit(tenantId) {
        return this.checkLimit(`tenant:${tenantId}`, this.tenantLimitPerMinute);
    }
    /**
     * Checks if a request should be allowed based on user rate limits within a tenant.
     *
     * @param tenantId - The tenant identifier
     * @param userId - The user identifier (e.g., 'usr_123')
     * @returns Rate limit result with allowed status and limit info
     */
    async checkUserLimit(tenantId, userId) {
        return this.checkLimit(`user:${tenantId}:${userId}`, this.userLimitPerMinute);
    }
    /**
     * Checks both tenant and user rate limits.
     * Returns the most restrictive result.
     *
     * @param tenantId - The tenant identifier
     * @param userId - The user identifier
     * @returns The most restrictive rate limit result
     */
    async checkLimits(tenantId, userId) {
        const [tenantResult, userResult] = await Promise.all([
            this.checkTenantLimit(tenantId),
            this.checkUserLimit(tenantId, userId),
        ]);
        // If either limit is exceeded, return that result
        if (!tenantResult.allowed) {
            this.logger.warn({
                message: 'Tenant rate limit exceeded',
                tenantId,
                limit: tenantResult.limit,
                remaining: tenantResult.remaining,
            });
            return { ...tenantResult, limitType: 'tenant' };
        }
        if (!userResult.allowed) {
            this.logger.warn({
                message: 'User rate limit exceeded',
                tenantId,
                userId,
                limit: userResult.limit,
                remaining: userResult.remaining,
            });
            return { ...userResult, limitType: 'user' };
        }
        // Return user result as it's typically more restrictive
        return { ...userResult, limitType: 'user' };
    }
    /**
     * Generates rate limit headers for HTTP responses.
     *
     * @param result - The rate limit result
     * @returns Headers object ready to be set on the response
     */
    getHeaders(result) {
        const headers = {
            'X-RateLimit-Limit': String(result.limit),
            'X-RateLimit-Remaining': String(Math.max(0, result.remaining)),
            'X-RateLimit-Reset': String(result.reset),
        };
        if (result.retryAfter !== undefined) {
            headers['Retry-After'] = String(result.retryAfter);
        }
        return headers;
    }
    /**
     * Internal method to check rate limit using Redis.
     */
    async checkLimit(identifier, limit) {
        // If Redis is not configured, allow all requests
        if (!this.redisService.isConfigured()) {
            this.logger.debug({
                message: 'Rate limiting disabled - Redis not configured',
                identifier,
            });
            return {
                allowed: true,
                limit,
                remaining: limit,
                reset: Math.floor(Date.now() / 1000) + 60,
            };
        }
        const rateLimiter = this.redisService.getRateLimiter(identifier, limit, this.windowMs);
        if (!rateLimiter) {
            return {
                allowed: true,
                limit,
                remaining: limit,
                reset: Math.floor(Date.now() / 1000) + 60,
            };
        }
        const result = await rateLimiter.limit(identifier);
        const response = {
            allowed: result.success,
            limit: result.limit,
            remaining: result.remaining,
            reset: Math.floor(result.reset / 1000), // Convert to Unix timestamp
        };
        if (!result.success) {
            // Calculate retry-after in seconds
            response.retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
        }
        this.logger.debug({
            message: 'Rate limit check',
            identifier,
            allowed: response.allowed,
            remaining: response.remaining,
            limit: response.limit,
        });
        return response;
    }
};
exports.RateLimiterService = RateLimiterService;
exports.RateLimiterService = RateLimiterService = RateLimiterService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof redis_service_1.RedisService !== "undefined" && redis_service_1.RedisService) === "function" ? _a : Object, typeof (_b = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _b : Object])
], RateLimiterService);


/***/ }),
/* 93 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var RedisService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RedisService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const redis_1 = __webpack_require__(94);
const ratelimit_1 = __webpack_require__(95);
/**
 * Service for managing Redis connections and rate limiters using Upstash.
 * Provides a centralized Redis client and factory methods for rate limiters.
 */
let RedisService = RedisService_1 = class RedisService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(RedisService_1.name);
        this.rateLimiters = new Map();
        const url = this.configService.get('UPSTASH_REDIS_REST_URL');
        const token = this.configService.get('UPSTASH_REDIS_REST_TOKEN');
        if (!url || !token) {
            this.logger.warn({
                message: 'Upstash Redis not configured - rate limiting will be disabled',
            });
            // Create a null Redis instance that will fail gracefully
            this.redis = null;
            return;
        }
        this.redis = new redis_1.Redis({
            url,
            token,
        });
        this.logger.log({
            message: 'Redis client initialized',
            url: url.replace(/\/\/.*@/, '//***@'), // Mask credentials in logs
        });
    }
    /**
     * Checks if Redis is configured and available.
     * @returns True if Redis is configured, false otherwise
     */
    isConfigured() {
        return this.redis !== null;
    }
    /**
     * Gets the underlying Redis client for direct operations.
     * @returns The Upstash Redis client instance
     */
    getClient() {
        return this.redis;
    }
    /**
     * Creates or retrieves a cached rate limiter for the given identifier.
     * Uses a sliding window algorithm for smooth rate limiting.
     *
     * @param identifier - Unique identifier for this rate limiter (e.g., 'tenant:tnt_123')
     * @param limit - Maximum number of requests allowed in the window
     * @param windowMs - Window duration in milliseconds
     * @returns A configured Ratelimit instance
     */
    getRateLimiter(identifier, limit, windowMs) {
        if (!this.isConfigured()) {
            return null;
        }
        const cacheKey = `${identifier}:${limit}:${windowMs}`;
        if (this.rateLimiters.has(cacheKey)) {
            return this.rateLimiters.get(cacheKey);
        }
        // Convert milliseconds to seconds for the window
        const windowSec = Math.ceil(windowMs / 1000);
        const rateLimiter = new ratelimit_1.Ratelimit({
            redis: this.redis,
            limiter: ratelimit_1.Ratelimit.slidingWindow(limit, `${windowSec} s`),
            prefix: `ratelimit:${identifier}`,
            analytics: true,
        });
        this.rateLimiters.set(cacheKey, rateLimiter);
        this.logger.debug({
            message: 'Rate limiter created',
            identifier,
            limit,
            windowMs,
        });
        return rateLimiter;
    }
    /**
     * Increments a counter in Redis with optional expiration.
     * Useful for tracking usage over time periods.
     *
     * @param key - The Redis key to increment
     * @param expireMs - Optional expiration time in milliseconds
     * @returns The new value after incrementing
     */
    async increment(key, expireMs) {
        if (!this.isConfigured()) {
            return 0;
        }
        const newValue = await this.redis.incr(key);
        if (expireMs && newValue === 1) {
            // Set expiration only on first increment
            await this.redis.pexpire(key, expireMs);
        }
        return newValue;
    }
    /**
     * Gets a value from Redis.
     *
     * @param key - The Redis key to retrieve
     * @returns The value or null if not found
     */
    async get(key) {
        if (!this.isConfigured()) {
            return null;
        }
        return this.redis.get(key);
    }
    /**
     * Sets a value in Redis with optional expiration.
     *
     * @param key - The Redis key
     * @param value - The value to store
     * @param expireMs - Optional expiration time in milliseconds
     */
    async set(key, value, expireMs) {
        if (!this.isConfigured()) {
            return;
        }
        if (expireMs) {
            await this.redis.set(key, value, { px: expireMs });
        }
        else {
            await this.redis.set(key, value);
        }
    }
    /**
     * Deletes a key from Redis.
     *
     * @param key - The Redis key to delete
     */
    async delete(key) {
        if (!this.isConfigured()) {
            return;
        }
        await this.redis.del(key);
    }
    /**
     * Cleanup on module destroy.
     */
    async onModuleDestroy() {
        this.rateLimiters.clear();
        this.logger.log({ message: 'Redis service cleaned up' });
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], RedisService);


/***/ }),
/* 94 */
/***/ ((module) => {

module.exports = require("@upstash/redis");

/***/ }),
/* 95 */
/***/ ((module) => {

module.exports = require("@upstash/ratelimit");

/***/ }),
/* 96 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var QuotaService_1;
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QuotaService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const tenant_context_1 = __webpack_require__(9);
const token_tracker_service_1 = __webpack_require__(97);
/**
 * Service for enforcing token quotas on AI usage.
 * Prevents tenants from exceeding their allocated token limits.
 */
let QuotaService = QuotaService_1 = class QuotaService {
    constructor(prismaService, tokenTrackerService, configService) {
        this.prismaService = prismaService;
        this.tokenTrackerService = tokenTrackerService;
        this.configService = configService;
        this.logger = new common_1.Logger(QuotaService_1.name);
        this.defaultQuota = this.configService.get('DEFAULT_TENANT_TOKEN_QUOTA', 10000000);
        this.logger.log({
            message: 'Quota service initialized',
            defaultQuota: this.defaultQuota,
        });
    }
    /**
     * Checks if a tenant has remaining token quota.
     *
     * @param tenantId - The tenant identifier
     * @returns Quota check result with allowed status and remaining tokens
     */
    async checkQuota(tenantId) {
        // Get tenant's quota limit
        const tenant = await this.prismaService.tenant.findUnique({
            where: { id: tenantId },
            select: { tokenQuota: true },
        });
        if (!tenant) {
            this.logger.warn({
                message: 'Tenant not found for quota check, using default quota',
                tenantId,
                defaultQuota: this.defaultQuota,
            });
        }
        const limit = tenant?.tokenQuota ?? this.defaultQuota;
        // Get current month's usage
        const used = await this.tokenTrackerService.getMonthlyTokenCount(tenantId);
        const remaining = Math.max(0, limit - used);
        const allowed = remaining > 0;
        const percentUsed = Math.min(100, Math.round((used / limit) * 100));
        const result = {
            allowed,
            remaining,
            limit,
            used,
            percentUsed,
        };
        if (!allowed) {
            this.logger.warn({
                message: 'Quota exceeded',
                tenantId,
                limit,
                used,
            });
        }
        else if (percentUsed >= 80) {
            this.logger.log({
                message: 'Quota nearing limit',
                tenantId,
                limit,
                used,
                percentUsed,
            });
        }
        return result;
    }
    /**
     * Estimates if a request with given token count would exceed quota.
     * Use this for pre-flight checks before sending to LLM.
     *
     * @param tenantId - The tenant identifier
     * @param estimatedTokens - Estimated tokens the request will use
     * @returns Quota check result considering the estimated usage
     */
    async checkQuotaWithEstimate(tenantId, estimatedTokens) {
        const quotaStatus = await this.checkQuota(tenantId);
        // Check if estimated usage would exceed remaining quota
        const wouldExceed = estimatedTokens > quotaStatus.remaining;
        return {
            ...quotaStatus,
            allowed: quotaStatus.allowed && !wouldExceed,
        };
    }
    /**
     * Gets the quota limit for a tenant.
     *
     * @param tenantId - The tenant identifier
     * @returns The token quota limit
     */
    async getQuotaLimit(tenantId) {
        const tenant = await this.prismaService.tenant.findUnique({
            where: { id: tenantId },
            select: { tokenQuota: true },
        });
        return tenant?.tokenQuota ?? this.defaultQuota;
    }
    /**
     * Updates the quota limit for a tenant.
     *
     * @param tenantId - The tenant identifier
     * @param newQuota - The new quota limit
     */
    async updateQuota(tenantId, newQuota) {
        await this.prismaService.tenant.update({
            where: { id: tenantId },
            data: { tokenQuota: newQuota },
        });
        this.logger.log({
            message: 'Quota updated',
            tenantId,
            newQuota,
        });
    }
};
exports.QuotaService = QuotaService;
exports.QuotaService = QuotaService = QuotaService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object, typeof (_b = typeof token_tracker_service_1.TokenTrackerService !== "undefined" && token_tracker_service_1.TokenTrackerService) === "function" ? _b : Object, typeof (_c = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _c : Object])
], QuotaService);


/***/ }),
/* 97 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var TokenTrackerService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TokenTrackerService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const cuid2_1 = __webpack_require__(32);
const library_1 = __webpack_require__(98);
/**
 * Service for tracking AI token consumption and costs.
 * Records all AI requests for billing and quota enforcement.
 */
let TokenTrackerService = TokenTrackerService_1 = class TokenTrackerService {
    constructor(prismaService) {
        this.prismaService = prismaService;
        this.logger = new common_1.Logger(TokenTrackerService_1.name);
    }
    /**
     * Records token usage for an AI request.
     *
     * @param tenantId - The tenant identifier
     * @param userId - The user identifier
     * @param inputTokens - Number of input tokens used
     * @param outputTokens - Number of output tokens generated
     * @param cost - Cost of the request in USD
     * @param modelId - The model used for the request
     * @param conversationId - Optional conversation ID
     * @param providerId - Optional provider ID
     * @returns The created token usage record
     */
    async trackUsage(tenantId, userId, inputTokens, outputTokens, cost, modelId, conversationId, providerId) {
        const id = `tku_${(0, cuid2_1.createId)()}`;
        const totalTokens = inputTokens + outputTokens;
        const record = await this.prismaService.tokenUsage.create({
            data: {
                id,
                tenantId,
                userId,
                conversationId,
                inputTokens,
                outputTokens,
                totalTokens,
                cost: new library_1.Decimal(cost),
                modelId,
                providerId,
            },
        });
        this.logger.log({
            message: 'Token usage tracked',
            id,
            tenantId,
            userId,
            totalTokens,
            cost,
            modelId,
        });
        return {
            id: record.id,
            tenantId: record.tenantId,
            userId: record.userId,
            conversationId: record.conversationId ?? undefined,
            inputTokens: record.inputTokens,
            outputTokens: record.outputTokens,
            totalTokens: record.totalTokens,
            cost: record.cost.toNumber(),
            modelId: record.modelId,
            providerId: record.providerId ?? undefined,
            createdAt: record.createdAt,
        };
    }
    /**
     * Gets aggregated usage for a tenant over a time period.
     *
     * @param tenantId - The tenant identifier
     * @param period - Time period to query ('day', 'week', 'month', 'all')
     * @returns Aggregated usage summary
     */
    async getUsage(tenantId, period) {
        const startDate = this.getStartDate(period);
        const result = await this.prismaService.tokenUsage.aggregate({
            where: {
                tenantId,
                ...(startDate && { createdAt: { gte: startDate } }),
            },
            _sum: {
                inputTokens: true,
                outputTokens: true,
                totalTokens: true,
                cost: true,
            },
            _count: true,
        });
        return {
            inputTokens: result._sum.inputTokens ?? 0,
            outputTokens: result._sum.outputTokens ?? 0,
            totalTokens: result._sum.totalTokens ?? 0,
            totalCost: result._sum.cost?.toNumber() ?? 0,
            requestCount: result._count,
        };
    }
    /**
     * Gets aggregated usage for a specific user within a tenant.
     *
     * @param tenantId - The tenant identifier
     * @param userId - The user identifier
     * @param period - Time period to query
     * @returns Aggregated usage summary for the user
     */
    async getUserUsage(tenantId, userId, period) {
        const startDate = this.getStartDate(period);
        const result = await this.prismaService.tokenUsage.aggregate({
            where: {
                tenantId,
                userId,
                ...(startDate && { createdAt: { gte: startDate } }),
            },
            _sum: {
                inputTokens: true,
                outputTokens: true,
                totalTokens: true,
                cost: true,
            },
            _count: true,
        });
        return {
            inputTokens: result._sum.inputTokens ?? 0,
            outputTokens: result._sum.outputTokens ?? 0,
            totalTokens: result._sum.totalTokens ?? 0,
            totalCost: result._sum.cost?.toNumber() ?? 0,
            requestCount: result._count,
        };
    }
    /**
     * Gets the total token count for a tenant in the current billing period (month).
     * Used for quota enforcement.
     *
     * @param tenantId - The tenant identifier
     * @returns Total tokens used this month
     */
    async getMonthlyTokenCount(tenantId) {
        const usage = await this.getUsage(tenantId, 'month');
        return usage.totalTokens;
    }
    /**
     * Gets usage records for a specific conversation.
     *
     * @param conversationId - The conversation identifier
     * @returns Array of token usage records
     */
    async getConversationUsage(conversationId) {
        const records = await this.prismaService.tokenUsage.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
        });
        return records.map((record) => ({
            id: record.id,
            tenantId: record.tenantId,
            userId: record.userId,
            conversationId: record.conversationId ?? undefined,
            inputTokens: record.inputTokens,
            outputTokens: record.outputTokens,
            totalTokens: record.totalTokens,
            cost: record.cost.toNumber(),
            modelId: record.modelId,
            providerId: record.providerId ?? undefined,
            createdAt: record.createdAt,
        }));
    }
    /**
     * Calculates the start date for a usage period.
     */
    getStartDate(period) {
        const now = new Date();
        switch (period) {
            case 'day':
                return new Date(now.getFullYear(), now.getMonth(), now.getDate());
            case 'week':
                const weekAgo = new Date(now);
                weekAgo.setDate(weekAgo.getDate() - 7);
                return weekAgo;
            case 'month':
                return new Date(now.getFullYear(), now.getMonth(), 1);
            case 'all':
                return null;
        }
    }
};
exports.TokenTrackerService = TokenTrackerService;
exports.TokenTrackerService = TokenTrackerService = TokenTrackerService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object])
], TokenTrackerService);


/***/ }),
/* 98 */
/***/ ((module) => {

module.exports = require("@prisma/client/runtime/library");

/***/ }),
/* 99 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var CircuitBreakerService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CircuitBreakerService = exports.CircuitBreakerEvent = exports.CircuitBreakerStatus = exports.CircuitBreakerState = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const redis_service_1 = __webpack_require__(93);
const cuid2_1 = __webpack_require__(32);
const types_1 = __webpack_require__(84);
Object.defineProperty(exports, "CircuitBreakerState", ({ enumerable: true, get: function () { return types_1.CircuitBreakerState; } }));
Object.defineProperty(exports, "CircuitBreakerStatus", ({ enumerable: true, get: function () { return types_1.CircuitBreakerStatus; } }));
Object.defineProperty(exports, "CircuitBreakerEvent", ({ enumerable: true, get: function () { return types_1.CircuitBreakerEvent; } }));
/**
 * Service for implementing circuit breaker pattern for LLM providers.
 * Prevents cascading failures by temporarily blocking requests to failing providers.
 *
 * State transitions:
 * - CLOSED → OPEN: After failureThreshold consecutive failures
 * - OPEN → HALF_OPEN: After recoveryTimeout (30 seconds)
 * - HALF_OPEN → CLOSED: On first success
 * - HALF_OPEN → OPEN: On failure
 */
let CircuitBreakerService = CircuitBreakerService_1 = class CircuitBreakerService {
    constructor(redisService) {
        this.redisService = redisService;
        this.logger = new common_1.Logger(CircuitBreakerService_1.name);
        /** Number of consecutive failures before opening circuit */
        this.failureThreshold = 5;
        /** Time in ms before attempting recovery (30 seconds) */
        this.recoveryTimeoutMs = 30 * 1000;
        /** TTL for circuit breaker state in Redis (1 hour) */
        this.stateTtlMs = 60 * 60 * 1000;
        /** In-memory fallback for when Redis is unavailable */
        this.localState = new Map();
        /** Event listeners for state changes */
        this.eventListeners = [];
    }
    /**
     * Checks if requests should be allowed through the circuit.
     *
     * @param providerId - The LLM provider identifier
     * @returns True if the circuit is closed or half-open (allow request)
     */
    async isAllowed(providerId) {
        const status = await this.getStatus(providerId);
        switch (status.state) {
            case types_1.CircuitBreakerState.CLOSED:
                return true;
            case types_1.CircuitBreakerState.OPEN:
                // Check if recovery timeout has passed
                if (status.openedAt &&
                    Date.now() - status.openedAt >= this.recoveryTimeoutMs) {
                    await this.transitionTo(providerId, types_1.CircuitBreakerState.HALF_OPEN, status);
                    return true;
                }
                return false;
            case types_1.CircuitBreakerState.HALF_OPEN:
                // Only allow one test request at a time
                // In a distributed system, this should use a lock
                return true;
        }
    }
    /**
     * Records a successful request.
     * Resets failure count and closes circuit if half-open.
     *
     * @param providerId - The LLM provider identifier
     * @param correlationId - Optional correlation ID for tracing
     */
    async recordSuccess(providerId, correlationId) {
        const status = await this.getStatus(providerId);
        const newStatus = {
            state: types_1.CircuitBreakerState.CLOSED,
            failures: 0,
            lastSuccess: Date.now(),
        };
        if (status.state !== types_1.CircuitBreakerState.CLOSED) {
            this.emitEvent(providerId, status.state, newStatus.state, 0, correlationId);
        }
        await this.saveStatus(providerId, newStatus);
        this.logger.debug({
            message: 'Circuit breaker success recorded',
            providerId,
            correlationId,
        });
    }
    /**
     * Records a failed request.
     * Increments failure count and may open circuit.
     *
     * @param providerId - The LLM provider identifier
     * @param correlationId - Optional correlation ID for tracing
     */
    async recordFailure(providerId, correlationId) {
        const status = await this.getStatus(providerId);
        const newFailures = status.failures + 1;
        let newState = status.state;
        let openedAt = status.openedAt;
        // Determine new state based on current state and failures
        switch (status.state) {
            case types_1.CircuitBreakerState.CLOSED:
                if (newFailures >= this.failureThreshold) {
                    newState = types_1.CircuitBreakerState.OPEN;
                    openedAt = Date.now();
                    this.logger.warn({
                        message: 'Circuit breaker opened',
                        providerId,
                        failures: newFailures,
                        correlationId,
                    });
                }
                break;
            case types_1.CircuitBreakerState.HALF_OPEN:
                // Test request failed, reopen circuit
                newState = types_1.CircuitBreakerState.OPEN;
                openedAt = Date.now();
                this.logger.warn({
                    message: 'Circuit breaker reopened from half-open',
                    providerId,
                    correlationId,
                });
                break;
            case types_1.CircuitBreakerState.OPEN:
                // Already open, just update failure time
                break;
        }
        const newStatus = {
            state: newState,
            failures: newFailures,
            lastFailure: Date.now(),
            lastSuccess: status.lastSuccess,
            openedAt,
        };
        if (status.state !== newState) {
            this.emitEvent(providerId, status.state, newState, newFailures, correlationId);
        }
        await this.saveStatus(providerId, newStatus);
    }
    /**
     * Gets the current status of a circuit breaker.
     *
     * @param providerId - The LLM provider identifier
     * @returns Current circuit breaker status
     */
    async getStatus(providerId) {
        const key = this.getKey(providerId);
        if (this.redisService.isConfigured()) {
            const cached = await this.redisService.get(key);
            if (cached) {
                return cached;
            }
        }
        // Check local state
        const local = this.localState.get(providerId);
        if (local) {
            return local;
        }
        // Default to closed
        return {
            state: types_1.CircuitBreakerState.CLOSED,
            failures: 0,
        };
    }
    /**
     * Manually resets a circuit breaker to closed state.
     *
     * @param providerId - The LLM provider identifier
     */
    async reset(providerId) {
        const status = await this.getStatus(providerId);
        const newStatus = {
            state: types_1.CircuitBreakerState.CLOSED,
            failures: 0,
            lastSuccess: Date.now(),
        };
        if (status.state !== types_1.CircuitBreakerState.CLOSED) {
            this.emitEvent(providerId, status.state, types_1.CircuitBreakerState.CLOSED, 0);
        }
        await this.saveStatus(providerId, newStatus);
        this.logger.log({
            message: 'Circuit breaker manually reset',
            providerId,
        });
    }
    /**
     * Registers a listener for circuit breaker state change events.
     *
     * @param listener - Callback function for events
     */
    onStateChange(listener) {
        this.eventListeners.push(listener);
    }
    /**
     * Transitions to a new state.
     */
    async transitionTo(providerId, newState, currentStatus, correlationId) {
        const newStatus = {
            ...currentStatus,
            state: newState,
        };
        if (newState === types_1.CircuitBreakerState.HALF_OPEN) {
            this.logger.log({
                message: 'Circuit breaker entering half-open state',
                providerId,
                correlationId,
            });
        }
        this.emitEvent(providerId, currentStatus.state, newState, currentStatus.failures, correlationId);
        await this.saveStatus(providerId, newStatus);
    }
    /**
     * Saves the circuit breaker status.
     */
    async saveStatus(providerId, status) {
        // Always update local state
        this.localState.set(providerId, status);
        // Persist to Redis if available
        if (this.redisService.isConfigured()) {
            const key = this.getKey(providerId);
            await this.redisService.set(key, status, this.stateTtlMs);
        }
    }
    /**
     * Emits a state change event.
     */
    emitEvent(providerId, previousState, newState, failures, correlationId) {
        const event = {
            eventId: `cb_${(0, cuid2_1.createId)()}`,
            providerId,
            previousState,
            newState,
            failures,
            timestamp: Date.now(),
            correlationId,
        };
        this.logger.log({
            message: 'Circuit breaker state changed',
            eventId: event.eventId,
            providerId,
            previousState,
            newState,
            failures,
            correlationId,
        });
        for (const listener of this.eventListeners) {
            try {
                listener(event);
            }
            catch (error) {
                this.logger.error({
                    message: 'Error in circuit breaker event listener',
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
    }
    /**
     * Generates the Redis key for a provider's circuit breaker state.
     */
    getKey(providerId) {
        return `circuit:${providerId}`;
    }
};
exports.CircuitBreakerService = CircuitBreakerService;
exports.CircuitBreakerService = CircuitBreakerService = CircuitBreakerService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof redis_service_1.RedisService !== "undefined" && redis_service_1.RedisService) === "function" ? _a : Object])
], CircuitBreakerService);


/***/ }),
/* 100 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var CostCalculatorService_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CostCalculatorService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
/**
 * Default pricing for unknown models (conservative estimate).
 */
const DEFAULT_PRICING = {
    input: 0.002, // $0.002 per 1K tokens
    output: 0.004, // $0.004 per 1K tokens
};
/**
 * Known model pricing (per 1000 tokens in USD).
 * Updated periodically based on provider pricing pages.
 */
const MODEL_PRICING = {
    // OpenRouter models
    'openrouter/auto': { input: 0.001, output: 0.002 },
    // Meta Llama models
    'meta-llama/llama-3.1-70b-instruct': { input: 0.0008, output: 0.0008 },
    'meta-llama/llama-3.1-8b-instruct': { input: 0.0001, output: 0.0001 },
    'meta-llama/llama-3-70b-instruct': { input: 0.0008, output: 0.0008 },
    'meta-llama/llama-3-8b-instruct': { input: 0.0001, output: 0.0001 },
    // Anthropic Claude models
    'anthropic/claude-3.5-sonnet': { input: 0.003, output: 0.015 },
    'anthropic/claude-3.5-sonnet-20240620': { input: 0.003, output: 0.015 },
    'anthropic/claude-3-opus': { input: 0.015, output: 0.075 },
    'anthropic/claude-3-sonnet': { input: 0.003, output: 0.015 },
    'anthropic/claude-3-haiku': { input: 0.00025, output: 0.00125 },
    // OpenAI models
    'openai/gpt-4-turbo': { input: 0.01, output: 0.03 },
    'openai/gpt-4': { input: 0.03, output: 0.06 },
    'openai/gpt-4o': { input: 0.005, output: 0.015 },
    'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'openai/gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    // Mistral models
    'mistralai/mistral-large': { input: 0.004, output: 0.012 },
    'mistralai/mistral-medium': { input: 0.0027, output: 0.0081 },
    'mistralai/mistral-small': { input: 0.001, output: 0.003 },
    'mistralai/mixtral-8x7b-instruct': { input: 0.0006, output: 0.0006 },
    'mistralai/mistral-7b-instruct': { input: 0.0002, output: 0.0002 },
    // Google models
    'google/gemini-pro': { input: 0.00025, output: 0.0005 },
    'google/gemini-pro-1.5': { input: 0.00125, output: 0.005 },
    // Local models (free)
    'local/llama': { input: 0, output: 0 },
    'local/mistral': { input: 0, output: 0 },
    'ollama/llama3': { input: 0, output: 0 },
    'ollama/mistral': { input: 0, output: 0 },
};
/**
 * Service for calculating AI request costs based on token usage.
 * Provides accurate cost tracking for billing and quota management.
 */
let CostCalculatorService = CostCalculatorService_1 = class CostCalculatorService {
    constructor() {
        this.logger = new common_1.Logger(CostCalculatorService_1.name);
        this.logger.log({
            message: 'Cost calculator initialized',
            knownModels: Object.keys(MODEL_PRICING).length,
        });
    }
    /**
     * Calculates the cost for a request based on token usage.
     *
     * @param modelId - The model identifier
     * @param inputTokens - Number of input tokens
     * @param outputTokens - Number of output tokens
     * @returns Cost calculation breakdown
     */
    calculateCost(modelId, inputTokens, outputTokens) {
        const pricing = this.getPricing(modelId);
        const pricingFound = MODEL_PRICING[modelId] !== undefined;
        // Calculate costs (pricing is per 1000 tokens)
        const inputCost = (inputTokens / 1000) * pricing.input;
        const outputCost = (outputTokens / 1000) * pricing.output;
        const totalCost = inputCost + outputCost;
        // Round to 6 decimal places for precision
        return {
            inputCost: Number(inputCost.toFixed(6)),
            outputCost: Number(outputCost.toFixed(6)),
            totalCost: Number(totalCost.toFixed(6)),
            modelId,
            pricingFound,
        };
    }
    /**
     * Gets the pricing for a model.
     *
     * @param modelId - The model identifier
     * @returns Pricing structure for the model
     */
    getPricing(modelId) {
        // Exact match
        if (MODEL_PRICING[modelId]) {
            return MODEL_PRICING[modelId];
        }
        // Try to find a partial match (e.g., 'gpt-4' matches 'gpt-4-turbo')
        const normalizedId = modelId.toLowerCase();
        for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
            if (normalizedId.includes(key.toLowerCase().replace(/^[^/]+\//, ''))) {
                return pricing;
            }
        }
        // Check for local/free models
        if (normalizedId.includes('local') ||
            normalizedId.includes('ollama') ||
            normalizedId.startsWith('llama:')) {
            return { input: 0, output: 0 };
        }
        this.logger.warn({
            message: 'Unknown model pricing, using default',
            modelId,
            defaultPricing: DEFAULT_PRICING,
        });
        return DEFAULT_PRICING;
    }
    /**
     * Estimates the cost for a request before sending to the LLM.
     * Uses average output token count for estimation.
     *
     * @param modelId - The model identifier
     * @param inputTokens - Number of input tokens
     * @param estimatedOutputRatio - Ratio of output to input tokens (default 1.5)
     * @returns Estimated cost
     */
    estimateCost(modelId, inputTokens, estimatedOutputRatio = 1.5) {
        const estimatedOutput = Math.ceil(inputTokens * estimatedOutputRatio);
        const calculation = this.calculateCost(modelId, inputTokens, estimatedOutput);
        return calculation.totalCost;
    }
    /**
     * Checks if a model is a local/free model.
     *
     * @param modelId - The model identifier
     * @returns True if the model is free (local deployment)
     */
    isLocalModel(modelId) {
        const pricing = this.getPricing(modelId);
        return pricing.input === 0 && pricing.output === 0;
    }
    /**
     * Adds or updates pricing for a model.
     * Useful for adding custom pricing at runtime.
     *
     * @param modelId - The model identifier
     * @param pricing - The pricing structure
     */
    addPricing(modelId, pricing) {
        MODEL_PRICING[modelId] = pricing;
        this.logger.log({
            message: 'Model pricing added',
            modelId,
            pricing,
        });
    }
    /**
     * Gets all known model pricing.
     *
     * @returns Map of model IDs to their pricing
     */
    getAllPricing() {
        return { ...MODEL_PRICING };
    }
};
exports.CostCalculatorService = CostCalculatorService;
exports.CostCalculatorService = CostCalculatorService = CostCalculatorService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [])
], CostCalculatorService);


/***/ }),
/* 101 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var RequestQueueService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RequestQueueService = exports.PRIORITY_MAP = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const redis_service_1 = __webpack_require__(93);
const client_1 = __webpack_require__(11);
const cuid2_1 = __webpack_require__(32);
/**
 * Priority levels for request queuing.
 * Higher number = higher priority.
 */
exports.PRIORITY_MAP = {
    [client_1.UserRole.TENANT_OWNER]: 3,
    [client_1.UserRole.ADMIN]: 2,
    [client_1.UserRole.MEMBER]: 1,
};
/**
 * Service for managing AI request queues with priority.
 * Implements a Redis-based priority queue for handling concurrent requests.
 */
let RequestQueueService = RequestQueueService_1 = class RequestQueueService {
    constructor(redisService) {
        this.redisService = redisService;
        this.logger = new common_1.Logger(RequestQueueService_1.name);
        /** Queue timeout in milliseconds (2 minutes) */
        this.queueTimeoutMs = 2 * 60 * 1000;
        /** Average processing time per request in seconds */
        this.avgProcessingTimeSec = 5;
    }
    /**
     * Adds a request to the queue with priority based on user role.
     *
     * @param tenantId - The tenant identifier
     * @param userId - The user identifier
     * @param userRole - The user's role for priority calculation
     * @param conversationId - Optional conversation ID
     * @returns The queued request information
     */
    async enqueue(tenantId, userId, userRole, conversationId) {
        const request = {
            id: `req_${(0, cuid2_1.createId)()}`,
            tenantId,
            userId,
            priority: exports.PRIORITY_MAP[userRole] ?? 1,
            timestamp: Date.now(),
            conversationId,
        };
        if (!this.redisService.isConfigured()) {
            this.logger.debug({
                message: 'Queue disabled - Redis not configured',
                requestId: request.id,
            });
            return request;
        }
        const queueKey = this.getQueueKey(tenantId);
        // Add to sorted set with priority-timestamp score
        // Higher priority items have lower scores for ZRANGEBYSCORE
        const score = this.calculateScore(request.priority, request.timestamp);
        await this.redisService.getClient().zadd(queueKey, {
            score,
            member: JSON.stringify(request),
        });
        // Set queue TTL to cleanup stale queues
        await this.redisService.getClient().expire(queueKey, 3600); // 1 hour
        this.logger.log({
            message: 'Request enqueued',
            requestId: request.id,
            tenantId,
            userId,
            priority: request.priority,
        });
        return request;
    }
    /**
     * Removes a request from the queue after processing.
     *
     * @param request - The request to dequeue
     */
    async dequeue(request) {
        if (!this.redisService.isConfigured()) {
            return;
        }
        const queueKey = this.getQueueKey(request.tenantId);
        await this.redisService
            .getClient()
            .zrem(queueKey, JSON.stringify(request));
        this.logger.debug({
            message: 'Request dequeued',
            requestId: request.id,
        });
    }
    /**
     * Gets the queue position for a request.
     *
     * @param request - The queued request
     * @returns Queue position information
     */
    async getPosition(request) {
        if (!this.redisService.isConfigured()) {
            return {
                position: 0,
                estimatedWait: 0,
                requestId: request.id,
            };
        }
        const queueKey = this.getQueueKey(request.tenantId);
        const score = this.calculateScore(request.priority, request.timestamp);
        // Count how many requests are ahead (lower score = higher priority)
        const position = await this.redisService
            .getClient()
            .zcount(queueKey, '-inf', score - 1);
        return {
            position: position + 1, // 1-indexed
            estimatedWait: position * this.avgProcessingTimeSec,
            requestId: request.id,
        };
    }
    /**
     * Checks if a request has timed out in the queue.
     *
     * @param request - The queued request
     * @returns True if the request has exceeded queue timeout
     */
    isTimedOut(request) {
        return Date.now() - request.timestamp > this.queueTimeoutMs;
    }
    /**
     * Gets the next request to process from the queue (highest priority).
     *
     * @param tenantId - The tenant identifier
     * @returns The next request or null if queue is empty
     */
    async getNext(tenantId) {
        if (!this.redisService.isConfigured()) {
            return null;
        }
        const queueKey = this.getQueueKey(tenantId);
        // Get the lowest score (highest priority) item
        const result = await this.redisService
            .getClient()
            .zrange(queueKey, 0, 0);
        if (!result || result.length === 0) {
            return null;
        }
        try {
            return JSON.parse(result[0]);
        }
        catch {
            return null;
        }
    }
    /**
     * Gets the current queue length for a tenant.
     *
     * @param tenantId - The tenant identifier
     * @returns Number of requests in queue
     */
    async getQueueLength(tenantId) {
        if (!this.redisService.isConfigured()) {
            return 0;
        }
        const queueKey = this.getQueueKey(tenantId);
        return this.redisService.getClient().zcard(queueKey);
    }
    /**
     * Cleans up expired requests from the queue.
     *
     * @param tenantId - The tenant identifier
     * @returns Number of expired requests removed
     */
    async cleanupExpired(tenantId) {
        if (!this.redisService.isConfigured()) {
            return 0;
        }
        const queueKey = this.getQueueKey(tenantId);
        const cutoffTime = Date.now() - this.queueTimeoutMs;
        // Get all items and filter expired ones
        const allItems = await this.redisService
            .getClient()
            .zrange(queueKey, 0, -1);
        let removedCount = 0;
        for (const item of allItems) {
            try {
                const request = JSON.parse(item);
                if (request.timestamp < cutoffTime) {
                    await this.redisService
                        .getClient()
                        .zrem(queueKey, item);
                    removedCount++;
                }
            }
            catch {
                // Skip malformed items
            }
        }
        if (removedCount > 0) {
            this.logger.log({
                message: 'Expired requests cleaned up',
                tenantId,
                removedCount,
            });
        }
        return removedCount;
    }
    /**
     * Generates the Redis key for a tenant's queue.
     */
    getQueueKey(tenantId) {
        return `queue:${tenantId}`;
    }
    /**
     * Calculates the score for sorting.
     * Lower score = higher priority.
     * Within same priority, earlier timestamp = lower score (FIFO).
     */
    calculateScore(priority, timestamp) {
        // Invert priority (higher priority = lower score)
        // Add timestamp to maintain FIFO within same priority
        return (4 - priority) * 1e15 + timestamp;
    }
};
exports.RequestQueueService = RequestQueueService;
exports.RequestQueueService = RequestQueueService = RequestQueueService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof redis_service_1.RedisService !== "undefined" && redis_service_1.RedisService) === "function" ? _a : Object])
], RequestQueueService);


/***/ }),
/* 102 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var ImprovementSuggestionsService_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ImprovementSuggestionsService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const types_1 = __webpack_require__(84);
/**
 * Mapping of confidence factors to improvement suggestions.
 */
const FACTOR_SUGGESTIONS = {
    hedging_language: [
        {
            category: 'ambiguous_question',
            suggestion: 'Try asking a more specific question to get a clearer answer.',
            priority: 2,
        },
        {
            category: 'missing_context',
            suggestion: 'Provide more details about your specific situation for targeted guidance.',
            priority: 3,
        },
    ],
    context_depth: [
        {
            category: 'missing_context',
            suggestion: 'Share more background about your business or project.',
            priority: 1,
        },
        {
            category: 'data_gap',
            suggestion: 'Provide relevant data points like revenue, costs, or timelines.',
            priority: 1,
        },
    ],
    response_specificity: [
        {
            category: 'data_gap',
            suggestion: 'Include specific numbers (budget, revenue, headcount) for more precise recommendations.',
            priority: 1,
        },
        {
            category: 'missing_context',
            suggestion: 'Describe your goals or constraints to get tailored advice.',
            priority: 2,
        },
    ],
};
/**
 * Persona-specific improvement suggestions.
 */
const PERSONA_SUGGESTIONS = {
    CFO: [
        {
            category: 'data_gap',
            suggestion: 'Provide your Q2 financial data (revenue, costs, margins) for more accurate analysis.',
            priority: 1,
        },
        {
            category: 'missing_context',
            suggestion: 'Share your budget constraints or financial goals.',
            priority: 2,
        },
    ],
    CMO: [
        {
            category: 'data_gap',
            suggestion: 'Include your marketing budget or campaign performance metrics.',
            priority: 1,
        },
        {
            category: 'missing_context',
            suggestion: 'Describe your target audience or market segment.',
            priority: 2,
        },
    ],
    CTO: [
        {
            category: 'missing_context',
            suggestion: 'Describe your current tech stack or infrastructure constraints.',
            priority: 1,
        },
        {
            category: 'data_gap',
            suggestion: 'Provide metrics like response times, uptime, or user load.',
            priority: 2,
        },
    ],
    OPERATIONS: [
        {
            category: 'data_gap',
            suggestion: 'Share your current operational metrics or KPIs.',
            priority: 1,
        },
        {
            category: 'missing_context',
            suggestion: 'Describe your process or workflow constraints.',
            priority: 2,
        },
    ],
    LEGAL: [
        {
            category: 'missing_context',
            suggestion: 'Specify your jurisdiction or industry for relevant compliance guidance.',
            priority: 1,
        },
        {
            category: 'data_gap',
            suggestion: 'Provide details about the contract or agreement in question.',
            priority: 2,
        },
    ],
    CREATIVE: [
        {
            category: 'missing_context',
            suggestion: 'Describe your brand voice or creative direction.',
            priority: 1,
        },
        {
            category: 'data_gap',
            suggestion: 'Share examples of creative work you admire or want to emulate.',
            priority: 2,
        },
    ],
};
/**
 * Service for generating improvement suggestions based on confidence scores.
 * Provides actionable feedback to users on how to improve AI response quality.
 */
let ImprovementSuggestionsService = ImprovementSuggestionsService_1 = class ImprovementSuggestionsService {
    constructor() {
        this.logger = new common_1.Logger(ImprovementSuggestionsService_1.name);
    }
    /**
     * Generates improvement suggestions based on confidence score and context.
     *
     * @param confidence - The calculated confidence score
     * @param context - Context for generating suggestions
     * @returns Improvement result with suggestions and delta message
     */
    generateSuggestions(confidence, context) {
        const suggestions = [];
        // Only generate suggestions for non-high confidence
        if (confidence.level === types_1.ConfidenceLevel.HIGH) {
            return {
                primarySuggestion: null,
                suggestions: [],
                improvementDelta: this.calculateDelta(context.previousScore, confidence.score),
                previousScore: context.previousScore,
                currentScore: confidence.score,
            };
        }
        // Get factor-based suggestions
        for (const factor of confidence.factors) {
            if (factor.score < 0.7) {
                const factorSuggestions = this.getSuggestionsForFactor(factor, context);
                suggestions.push(...factorSuggestions);
            }
        }
        // Add persona-specific suggestions if applicable
        if (context.personaType && confidence.level === types_1.ConfidenceLevel.LOW) {
            const personaSuggestions = PERSONA_SUGGESTIONS[context.personaType] ?? [];
            for (const suggestion of personaSuggestions) {
                if (!suggestions.some((s) => s.category === suggestion.category)) {
                    suggestions.push(suggestion);
                }
            }
        }
        // Sort by priority and deduplicate
        const uniqueSuggestions = this.deduplicateSuggestions(suggestions);
        uniqueSuggestions.sort((a, b) => a.priority - b.priority);
        // Get primary suggestion (highest priority)
        const primarySuggestion = uniqueSuggestions[0]?.suggestion ?? null;
        // Calculate improvement delta if previous score exists
        const improvementDelta = this.calculateDelta(context.previousScore, confidence.score);
        this.logger.log({
            message: 'Improvement suggestions generated',
            confidenceLevel: confidence.level,
            suggestionCount: uniqueSuggestions.length,
            hasPrimarySuggestion: !!primarySuggestion,
            hasImprovementDelta: !!improvementDelta,
        });
        return {
            primarySuggestion,
            suggestions: uniqueSuggestions,
            improvementDelta,
            previousScore: context.previousScore,
            currentScore: confidence.score,
        };
    }
    /**
     * Generates the improvement suggestion string for the confidence score.
     *
     * @param confidence - The calculated confidence score
     * @param context - Context for generating suggestions
     * @returns Improvement suggestion string or null
     */
    getImprovementSuggestion(confidence, context) {
        const result = this.generateSuggestions(confidence, context);
        return result.primarySuggestion;
    }
    /**
     * Calculates the improvement delta message between two scores.
     *
     * @param previousScore - Previous confidence score (0.0-1.0)
     * @param currentScore - Current confidence score (0.0-1.0)
     * @returns Delta message or null if no previous score
     */
    calculateDelta(previousScore, currentScore) {
        if (previousScore === undefined) {
            return null;
        }
        const previousPercent = Math.round(previousScore * 100);
        const currentPercent = Math.round(currentScore * 100);
        const delta = currentPercent - previousPercent;
        if (delta > 0) {
            return `Your input improved confidence from ${previousPercent}% to ${currentPercent}%`;
        }
        else if (delta < 0) {
            return `Confidence changed from ${previousPercent}% to ${currentPercent}%`;
        }
        return null; // No change
    }
    /**
     * Gets suggestions for a specific confidence factor.
     */
    getSuggestionsForFactor(factor, context) {
        const baseSuggestions = FACTOR_SUGGESTIONS[factor.name] ?? [];
        const suggestions = [];
        for (const suggestion of baseSuggestions) {
            // Adjust priority based on factor score
            const adjustedPriority = factor.score < 0.5 ? suggestion.priority : suggestion.priority + 1;
            // Skip context-related suggestions if context already provided
            if (suggestion.category === 'missing_context' && context.hasClientContext) {
                continue;
            }
            // Skip data-related suggestions if data already provided
            if (suggestion.category === 'data_gap' && context.hasSpecificData) {
                continue;
            }
            suggestions.push({
                ...suggestion,
                priority: adjustedPriority,
            });
        }
        return suggestions;
    }
    /**
     * Deduplicates suggestions by category, keeping highest priority.
     */
    deduplicateSuggestions(suggestions) {
        const byCategory = new Map();
        for (const suggestion of suggestions) {
            const existing = byCategory.get(suggestion.category);
            if (!existing || suggestion.priority < existing.priority) {
                byCategory.set(suggestion.category, suggestion);
            }
        }
        return Array.from(byCategory.values());
    }
};
exports.ImprovementSuggestionsService = ImprovementSuggestionsService;
exports.ImprovementSuggestionsService = ImprovementSuggestionsService = ImprovementSuggestionsService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)()
], ImprovementSuggestionsService);


/***/ }),
/* 103 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var KnowledgeController_1;
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.KnowledgeController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const concept_service_1 = __webpack_require__(104);
const citation_service_1 = __webpack_require__(106);
const curriculum_service_1 = __webpack_require__(107);
/**
 * Controller for business concepts knowledge base endpoints.
 * Provides read-only access to the platform's concept library.
 */
let KnowledgeController = KnowledgeController_1 = class KnowledgeController {
    constructor(conceptService, citationService, curriculumService) {
        this.conceptService = conceptService;
        this.citationService = citationService;
        this.curriculumService = curriculumService;
        this.logger = new common_1.Logger(KnowledgeController_1.name);
    }
    /**
     * Lists concepts with optional filtering and pagination.
     *
     * @param category - Filter by category (Finance, Marketing, etc.)
     * @param search - Search query for name/definition
     * @param page - Page number (1-indexed, default 1)
     * @param limit - Items per page (default 20, max 100)
     */
    async listConcepts(category, search, page, limit) {
        this.logger.log({
            message: 'Listing concepts',
            category,
            search,
            page,
            limit,
        });
        const result = await this.conceptService.findAll({
            category,
            search,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
        });
        return {
            data: result.data,
            meta: result.meta,
        };
    }
    /**
     * Gets a single concept by ID with all related concepts.
     *
     * @param id - Concept ID (cpt_ prefix)
     */
    async getConcept(id) {
        this.logger.log({
            message: 'Getting concept',
            id,
        });
        const concept = await this.conceptService.findById(id);
        return {
            data: concept,
        };
    }
    /**
     * Gets a concept by its name (case-insensitive).
     * Used for citation name → conceptId lookup.
     */
    async getConceptByName(name) {
        const concept = await this.conceptService.findByName(decodeURIComponent(name));
        if (!concept) {
            throw new common_1.NotFoundException({
                type: 'concept_not_found',
                title: 'Concept Not Found',
                status: 404,
                detail: `Concept with name "${name}" does not exist`,
            });
        }
        return { data: concept };
    }
    /**
     * Gets a concept by its URL-friendly slug.
     *
     * @param slug - URL-friendly concept slug
     */
    async getConceptBySlug(slug) {
        this.logger.log({
            message: 'Getting concept by slug',
            slug,
        });
        const concept = await this.conceptService.findBySlug(slug);
        return {
            data: concept,
        };
    }
    /**
     * Gets related concepts for a given concept ID.
     *
     * @param id - Concept ID
     */
    async getRelatedConcepts(id) {
        this.logger.log({
            message: 'Getting related concepts',
            id,
        });
        const relations = await this.conceptService.findRelated(id);
        return {
            data: relations,
        };
    }
    /**
     * Gets all concept categories with counts.
     */
    async getCategories() {
        this.logger.log({ message: 'Getting categories' });
        const categories = await this.conceptService.getCategories();
        return {
            data: categories,
        };
    }
    /**
     * Gets knowledge base statistics.
     */
    async getStats() {
        this.logger.log({ message: 'Getting knowledge base stats' });
        const [totalConcepts, categories] = await Promise.all([
            this.conceptService.getCount(),
            this.conceptService.getCategories(),
        ]);
        return {
            data: {
                totalConcepts,
                categories,
            },
        };
    }
    // ── Curriculum Endpoints ──
    /**
     * Returns the full curriculum tree as a flat array of nodes.
     */
    getCurriculum() {
        this.logger.log({ message: 'Getting full curriculum' });
        return { data: this.curriculumService.getFullTree() };
    }
    /**
     * Searches curriculum labels by substring match.
     * @param q - Search query string
     */
    searchCurriculum(q) {
        this.logger.log({ message: 'Searching curriculum', query: q });
        if (!q || q.length < 1) {
            return { data: this.curriculumService.getTopLevelNodes() };
        }
        return { data: this.curriculumService.searchCurriculum(q) };
    }
    // ── Citation Endpoints (Story 2.6) ──
    /**
     * Gets citations for a specific message.
     * Returns all concept citations associated with the message.
     *
     * @param messageId - The message ID (msg_ prefix)
     */
    async getMessageCitations(messageId) {
        this.logger.log({
            message: 'Getting citations for message',
            messageId,
        });
        const citations = await this.citationService.getCitationsForMessage(messageId);
        return {
            data: citations,
        };
    }
    /**
     * Gets a concept summary suitable for the citation side panel.
     * Returns concept details with related concepts for exploration.
     *
     * @param conceptId - The concept ID (cpt_ prefix)
     */
    async getConceptSummary(conceptId) {
        this.logger.log({
            message: 'Getting concept summary for panel',
            conceptId,
        });
        const summary = await this.citationService.getConceptSummaryForPanel(conceptId);
        if (!summary) {
            throw new common_1.NotFoundException({
                type: 'concept_not_found',
                title: 'Concept Not Found',
                status: 404,
                detail: `Concept with ID ${conceptId} does not exist`,
            });
        }
        return {
            data: summary,
        };
    }
};
exports.KnowledgeController = KnowledgeController;
tslib_1.__decorate([
    (0, common_1.Get)('concepts'),
    tslib_1.__param(0, (0, common_1.Query)('category')),
    tslib_1.__param(1, (0, common_1.Query)('search')),
    tslib_1.__param(2, (0, common_1.Query)('page')),
    tslib_1.__param(3, (0, common_1.Query)('limit')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String, String, String]),
    tslib_1.__metadata("design:returntype", typeof (_d = typeof Promise !== "undefined" && Promise) === "function" ? _d : Object)
], KnowledgeController.prototype, "listConcepts", null);
tslib_1.__decorate([
    (0, common_1.Get)('concepts/:id'),
    tslib_1.__param(0, (0, common_1.Param)('id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", typeof (_e = typeof Promise !== "undefined" && Promise) === "function" ? _e : Object)
], KnowledgeController.prototype, "getConcept", null);
tslib_1.__decorate([
    (0, common_1.Get)('concepts/by-name/:name'),
    tslib_1.__param(0, (0, common_1.Param)('name')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", typeof (_f = typeof Promise !== "undefined" && Promise) === "function" ? _f : Object)
], KnowledgeController.prototype, "getConceptByName", null);
tslib_1.__decorate([
    (0, common_1.Get)('concepts/by-slug/:slug'),
    tslib_1.__param(0, (0, common_1.Param)('slug')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", typeof (_g = typeof Promise !== "undefined" && Promise) === "function" ? _g : Object)
], KnowledgeController.prototype, "getConceptBySlug", null);
tslib_1.__decorate([
    (0, common_1.Get)('concepts/:id/related'),
    tslib_1.__param(0, (0, common_1.Param)('id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", typeof (_h = typeof Promise !== "undefined" && Promise) === "function" ? _h : Object)
], KnowledgeController.prototype, "getRelatedConcepts", null);
tslib_1.__decorate([
    (0, common_1.Get)('categories'),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", typeof (_j = typeof Promise !== "undefined" && Promise) === "function" ? _j : Object)
], KnowledgeController.prototype, "getCategories", null);
tslib_1.__decorate([
    (0, common_1.Get)('stats'),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", typeof (_k = typeof Promise !== "undefined" && Promise) === "function" ? _k : Object)
], KnowledgeController.prototype, "getStats", null);
tslib_1.__decorate([
    (0, common_1.Get)('curriculum'),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Object)
], KnowledgeController.prototype, "getCurriculum", null);
tslib_1.__decorate([
    (0, common_1.Get)('curriculum/search'),
    tslib_1.__param(0, (0, common_1.Query)('q')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", Object)
], KnowledgeController.prototype, "searchCurriculum", null);
tslib_1.__decorate([
    (0, common_1.Get)('messages/:messageId/citations'),
    tslib_1.__param(0, (0, common_1.Param)('messageId')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", typeof (_l = typeof Promise !== "undefined" && Promise) === "function" ? _l : Object)
], KnowledgeController.prototype, "getMessageCitations", null);
tslib_1.__decorate([
    (0, common_1.Get)('concepts/:conceptId/summary'),
    tslib_1.__param(0, (0, common_1.Param)('conceptId')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", typeof (_m = typeof Promise !== "undefined" && Promise) === "function" ? _m : Object)
], KnowledgeController.prototype, "getConceptSummary", null);
exports.KnowledgeController = KnowledgeController = KnowledgeController_1 = tslib_1.__decorate([
    (0, common_1.Controller)('v1/knowledge'),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof concept_service_1.ConceptService !== "undefined" && concept_service_1.ConceptService) === "function" ? _a : Object, typeof (_b = typeof citation_service_1.CitationService !== "undefined" && citation_service_1.CitationService) === "function" ? _b : Object, typeof (_c = typeof curriculum_service_1.CurriculumService !== "undefined" && curriculum_service_1.CurriculumService) === "function" ? _c : Object])
], KnowledgeController);


/***/ }),
/* 104 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var ConceptService_1;
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConceptService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const ai_gateway_service_1 = __webpack_require__(88);
const relationship_prompt_1 = __webpack_require__(105);
/**
 * Service for querying and managing business concepts.
 * Provides read-only access to the platform's knowledge base.
 */
let ConceptService = ConceptService_1 = class ConceptService {
    constructor(prisma, aiGateway) {
        this.prisma = prisma;
        this.aiGateway = aiGateway;
        this.logger = new common_1.Logger(ConceptService_1.name);
    }
    /**
     * Finds concepts with optional filtering and pagination.
     *
     * @param options - Query options for filtering and pagination
     * @returns Paginated list of concept summaries
     */
    async findAll(options = {}) {
        const page = options.page ?? 1;
        const limit = Math.min(options.limit ?? 20, 100);
        const skip = (page - 1) * limit;
        const where = {};
        if (options.category) {
            where.category = options.category;
        }
        if (options.search) {
            where.OR = [
                { name: { contains: options.search, mode: 'insensitive' } },
                { definition: { contains: options.search, mode: 'insensitive' } },
            ];
        }
        const [concepts, total] = await Promise.all([
            this.prisma.concept.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    category: true,
                    definition: true,
                },
                orderBy: { name: 'asc' },
                skip,
                take: limit,
            }),
            this.prisma.concept.count({ where }),
        ]);
        this.logger.debug({
            message: 'Concepts query executed',
            category: options.category,
            search: options.search,
            page,
            limit,
            resultCount: concepts.length,
            total,
        });
        return {
            data: concepts.map((c) => ({
                id: c.id,
                name: c.name,
                slug: c.slug,
                category: c.category,
                definition: c.definition,
            })),
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    /**
     * Finds a single concept by ID with all related concepts.
     *
     * @param id - Concept ID (cpt_ prefix)
     * @returns Full concept with relationships
     * @throws NotFoundException if concept doesn't exist
     */
    async findById(id) {
        const concept = await this.prisma.concept.findUnique({
            where: { id },
            include: {
                relatedTo: {
                    include: {
                        targetConcept: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                                category: true,
                                definition: true,
                                extendedDescription: true,
                                departmentTags: true,
                                embeddingId: true,
                                version: true,
                                createdAt: true,
                                updatedAt: true,
                            },
                        },
                    },
                },
                relatedFrom: {
                    include: {
                        sourceConcept: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                                category: true,
                                definition: true,
                                extendedDescription: true,
                                departmentTags: true,
                                embeddingId: true,
                                version: true,
                                createdAt: true,
                                updatedAt: true,
                            },
                        },
                    },
                },
            },
        });
        if (!concept) {
            throw new common_1.NotFoundException({
                type: 'concept_not_found',
                title: 'Concept Not Found',
                status: 404,
                detail: `Concept with ID ${id} does not exist`,
            });
        }
        this.logger.debug({
            message: 'Concept found',
            id: concept.id,
            name: concept.name,
            relatedToCount: concept.relatedTo.length,
            relatedFromCount: concept.relatedFrom.length,
        });
        // Combine relationships from both directions
        const relatedConcepts = [
            ...concept.relatedTo.map((rel) => ({
                concept: this.mapToConcept(rel.targetConcept),
                relationshipType: rel.relationshipType,
                direction: 'outgoing',
            })),
            ...concept.relatedFrom.map((rel) => ({
                concept: this.mapToConcept(rel.sourceConcept),
                relationshipType: rel.relationshipType,
                direction: 'incoming',
            })),
        ];
        return {
            id: concept.id,
            name: concept.name,
            slug: concept.slug,
            category: concept.category,
            definition: concept.definition,
            extendedDescription: concept.extendedDescription ?? undefined,
            departmentTags: concept.departmentTags,
            embeddingId: concept.embeddingId ?? undefined,
            version: concept.version,
            createdAt: concept.createdAt.toISOString(),
            updatedAt: concept.updatedAt.toISOString(),
            relatedConcepts,
        };
    }
    /**
     * Finds a single concept by slug.
     *
     * @param slug - URL-friendly concept slug
     * @returns Full concept with relationships
     * @throws NotFoundException if concept doesn't exist
     */
    async findBySlug(slug) {
        const concept = await this.prisma.concept.findUnique({
            where: { slug },
        });
        if (!concept) {
            throw new common_1.NotFoundException({
                type: 'concept_not_found',
                title: 'Concept Not Found',
                status: 404,
                detail: `Concept with slug ${slug} does not exist`,
            });
        }
        return this.findById(concept.id);
    }
    /**
     * Finds related concepts for a given concept ID.
     *
     * @param id - Concept ID
     * @returns List of related concepts with relationship type and direction
     */
    async findRelated(id) {
        const concept = await this.findById(id);
        return concept.relatedConcepts.map((rel) => ({
            concept: {
                id: rel.concept.id,
                name: rel.concept.name,
                slug: rel.concept.slug,
                category: rel.concept.category,
                definition: rel.concept.definition,
            },
            relationshipType: rel.relationshipType,
            direction: rel.direction,
        }));
    }
    /**
     * Gets all unique categories in the database.
     *
     * @returns List of categories with concept counts
     */
    async getCategories() {
        const result = await this.prisma.concept.groupBy({
            by: ['category'],
            _count: { id: true },
            orderBy: { category: 'asc' },
        });
        return result.map((r) => ({
            category: r.category,
            count: r._count.id,
        }));
    }
    /**
     * Gets total count of concepts in the database.
     */
    async getCount() {
        return this.prisma.concept.count();
    }
    /**
     * Finds a concept by name (case-insensitive).
     * Used for citation name → conceptId lookup.
     */
    async findByName(name) {
        const concept = await this.prisma.concept.findFirst({
            where: { name: { equals: name, mode: 'insensitive' } },
            select: { id: true, name: true },
        });
        return concept;
    }
    /**
     * Batch lookup of concepts by IDs.
     * Used by ConversationService to resolve concept details for tree display.
     */
    async findByIds(ids) {
        if (ids.length === 0)
            return new Map();
        const concepts = await this.prisma.concept.findMany({
            where: { id: { in: ids } },
            select: {
                id: true,
                name: true,
                slug: true,
                category: true,
                categorySortOrder: true,
                sortOrder: true,
                curriculumId: true,
            },
        });
        return new Map(concepts.map((c) => [c.id, c]));
    }
    /**
     * Creates dynamic relationships between a newly discovered concept
     * and existing concepts using AI classification.
     * Non-blocking — errors are logged but never thrown to callers.
     *
     * Story 2.13: Dynamic Concept Relationship Creation
     */
    async createDynamicRelationships(conceptId, conceptName, category) {
        const result = {
            conceptId,
            conceptName: conceptName ?? conceptId,
            relationshipsCreated: 0,
            errors: [],
        };
        try {
            // 1. Load the concept's name, definition, and category
            const concept = await this.prisma.concept.findUnique({
                where: { id: conceptId },
                select: { name: true, definition: true, slug: true, category: true },
            });
            if (!concept) {
                result.errors.push(`Concept ${conceptId} not found`);
                return result;
            }
            // Resolve name and category from DB if not provided
            const resolvedName = conceptName ?? concept.name;
            result.conceptName = resolvedName;
            const resolvedCategory = category ?? concept.category;
            // 2. Query candidate concepts filtered by relevant categories
            const relevantCategories = (0, relationship_prompt_1.getRelevantCategories)(resolvedCategory);
            const candidates = await this.prisma.concept.findMany({
                where: {
                    id: { not: conceptId },
                    category: { in: relevantCategories },
                },
                select: {
                    id: true,
                    slug: true,
                    name: true,
                    category: true,
                    definition: true,
                },
                orderBy: { name: 'asc' },
                take: 20,
            });
            if (candidates.length === 0) {
                this.logger.debug({
                    message: 'No candidate concepts for relationship creation',
                    conceptName: resolvedName,
                    category: resolvedCategory,
                });
                return result;
            }
            // 3. Build LLM prompt and call AI for classification
            const prompt = (0, relationship_prompt_1.buildRelationshipClassificationPrompt)(resolvedName, resolvedCategory, concept.definition, candidates);
            const messages = [{ role: 'user', content: prompt }];
            let fullResponse = '';
            await this.aiGateway.streamCompletion(messages, (chunk) => {
                fullResponse += chunk;
            });
            // 4. Parse LLM response into relationship suggestions
            const suggestions = this.parseRelationshipSuggestions(fullResponse, candidates);
            if (suggestions.length === 0) {
                this.logger.debug({
                    message: 'No relationships suggested by AI',
                    conceptName: resolvedName,
                });
                return result;
            }
            // 5. Map slugs to concept IDs and batch-create relationships
            const slugToId = new Map(candidates.map((c) => [c.slug, c.id]));
            const relationshipData = suggestions
                .filter((s) => slugToId.has(s.slug))
                .map((s) => ({
                sourceConceptId: conceptId,
                targetConceptId: slugToId.get(s.slug),
                relationshipType: s.type,
            }));
            if (relationshipData.length > 0) {
                const created = await this.prisma.conceptRelationship.createMany({
                    data: relationshipData,
                    skipDuplicates: true,
                });
                result.relationshipsCreated = created.count;
            }
            this.logger.log({
                message: 'Dynamic relationships created',
                conceptName: resolvedName,
                category: resolvedCategory,
                candidatesEvaluated: candidates.length,
                suggestedCount: suggestions.length,
                createdCount: result.relationshipsCreated,
            });
        }
        catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error';
            result.errors.push(errMsg);
            this.logger.warn({
                message: 'Dynamic relationship creation failed',
                conceptName,
                error: errMsg,
            });
        }
        return result;
    }
    /**
     * Parses JSON relationship suggestions from LLM response.
     * Validates against known candidate slugs.
     */
    parseRelationshipSuggestions(response, candidates) {
        try {
            // Extract first JSON array from response (non-greedy to avoid spanning multiple arrays)
            const jsonMatch = response.match(/\[[\s\S]*?\]/);
            if (!jsonMatch)
                return [];
            const parsed = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(parsed))
                return [];
            const validTypes = new Set(['PREREQUISITE', 'RELATED', 'ADVANCED']);
            const validSlugs = new Set(candidates.map((c) => c.slug));
            return parsed
                .filter((item) => typeof item === 'object' &&
                item !== null &&
                'slug' in item &&
                'type' in item &&
                typeof item.slug === 'string' &&
                typeof item.type === 'string')
                .filter((item) => validSlugs.has(item.slug) && validTypes.has(item.type))
                .map((item) => ({
                slug: item.slug,
                type: item.type,
            }));
        }
        catch {
            this.logger.warn({
                message: 'Failed to parse relationship suggestions from LLM',
                responseLength: response.length,
            });
            return [];
        }
    }
    /**
     * Maps a Prisma concept to the Concept interface.
     */
    mapToConcept(data) {
        return {
            id: data.id,
            name: data.name,
            slug: data.slug,
            category: data.category,
            definition: data.definition,
            extendedDescription: data.extendedDescription ?? undefined,
            departmentTags: data.departmentTags,
            embeddingId: data.embeddingId ?? undefined,
            version: data.version,
            createdAt: data.createdAt.toISOString(),
            updatedAt: data.updatedAt.toISOString(),
        };
    }
};
exports.ConceptService = ConceptService;
exports.ConceptService = ConceptService = ConceptService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object, typeof (_b = typeof ai_gateway_service_1.AiGatewayService !== "undefined" && ai_gateway_service_1.AiGatewayService) === "function" ? _b : Object])
], ConceptService);


/***/ }),
/* 105 */
/***/ ((__unused_webpack_module, exports) => {


/**
 * LLM prompt template for classifying relationships between a new concept
 * and existing concepts in the knowledge base.
 *
 * Story 2.13: Dynamic Concept Relationship Creation
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CATEGORY_ADJACENCY = void 0;
exports.getRelevantCategories = getRelevantCategories;
exports.buildRelationshipClassificationPrompt = buildRelationshipClassificationPrompt;
/** Category adjacency map for pre-filtering candidates */
exports.CATEGORY_ADJACENCY = {
    Finance: ['Strategy', 'Operations'],
    Marketing: ['Sales', 'Creative', 'Strategy'],
    Strategy: ['Finance', 'Marketing', 'Sales', 'Operations'],
    Sales: ['Marketing', 'Strategy'],
    Operations: ['Strategy', 'Finance', 'Technology'],
    Technology: ['Operations', 'Creative'],
    Creative: ['Marketing', 'Technology'],
    Legal: ['Finance', 'Operations'],
};
const MAX_CANDIDATES = 20;
/**
 * Gets relevant categories for a given category (same + adjacent).
 */
function getRelevantCategories(category) {
    const adjacent = exports.CATEGORY_ADJACENCY[category] ?? [];
    return [category, ...adjacent];
}
/**
 * Builds the system prompt for relationship classification.
 */
function buildRelationshipClassificationPrompt(conceptName, conceptCategory, conceptDefinition, candidates) {
    const limitedCandidates = candidates.slice(0, MAX_CANDIDATES);
    const candidateList = limitedCandidates
        .map((c, i) => `${i + 1}. ${c.name} (${c.category}) [slug: ${c.slug}] - "${c.definition}"`)
        .join('\n');
    return `You are a business knowledge graph expert. Analyze the relationships between a NEW concept and existing concepts.

NEW CONCEPT: "${conceptName}"
CATEGORY: ${conceptCategory}
DEFINITION: "${conceptDefinition}"

EXISTING CONCEPTS TO EVALUATE:
${candidateList}

For each existing concept, classify the relationship FROM the new concept TO the existing concept:
- PREREQUISITE: The existing concept must be understood BEFORE the new concept (the existing concept is a foundation for the new one)
- RELATED: The concepts are in the same business domain and complement each other
- ADVANCED: The existing concept is a deeper/more specialized version of the new concept
- NONE: No meaningful relationship

RULES:
- Only include concepts with PREREQUISITE, RELATED, or ADVANCED relationships. Omit NONE.
- Be selective: only create relationships where there is a genuine business logic connection.
- Aim for 3-8 relationships per concept. Quality over quantity.
- Cross-category relationships are valuable when they reflect real business connections.

Return ONLY a valid JSON array (no markdown, no explanation):
[{"slug": "concept-slug", "type": "RELATED"}, {"slug": "another-slug", "type": "PREREQUISITE"}]

If no meaningful relationships exist, return an empty array: []`;
}


/***/ }),
/* 106 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var CitationService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CitationService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const cuid2_1 = __webpack_require__(32);
/**
 * Service for managing concept citations.
 * Handles storage and retrieval of message-to-concept citations.
 */
let CitationService = CitationService_1 = class CitationService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(CitationService_1.name);
    }
    /**
     * Stores citations for a message in the database.
     *
     * @param messageId - The message ID to associate citations with
     * @param citations - Array of citations to store
     * @returns The stored citations with database IDs
     */
    async storeCitations(messageId, citations) {
        if (citations.length === 0) {
            return [];
        }
        this.logger.log({
            message: 'Storing citations',
            messageId,
            count: citations.length,
        });
        const createdCitations = [];
        for (const citation of citations) {
            try {
                const created = await this.prisma.conceptCitation.create({
                    data: {
                        id: `cit_${(0, cuid2_1.createId)()}`,
                        messageId,
                        conceptId: citation.conceptId,
                        position: citation.position,
                        score: citation.score,
                    },
                    include: {
                        concept: {
                            select: {
                                name: true,
                                category: true,
                            },
                        },
                    },
                });
                createdCitations.push({
                    id: created.id,
                    messageId: created.messageId,
                    conceptId: created.conceptId,
                    conceptName: created.concept.name,
                    conceptCategory: created.concept.category,
                    position: created.position,
                    score: created.score,
                    createdAt: created.createdAt.toISOString(),
                });
            }
            catch (error) {
                this.logger.error({
                    message: 'Failed to store citation',
                    conceptId: citation.conceptId,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
        this.logger.log({
            message: 'Citations stored',
            storedCount: createdCitations.length,
        });
        return createdCitations;
    }
    /**
     * Retrieves citations for a specific message.
     *
     * @param messageId - The message ID to get citations for
     * @returns Array of citations with concept details
     */
    async getCitationsForMessage(messageId) {
        this.logger.debug({
            message: 'Getting citations for message',
            messageId,
        });
        const citations = await this.prisma.conceptCitation.findMany({
            where: { messageId },
            include: {
                concept: {
                    select: {
                        name: true,
                        category: true,
                    },
                },
            },
            orderBy: { position: 'asc' },
        });
        return citations.map((c) => ({
            id: c.id,
            messageId: c.messageId,
            conceptId: c.conceptId,
            conceptName: c.concept.name,
            conceptCategory: c.concept.category,
            position: c.position,
            score: c.score,
            createdAt: c.createdAt.toISOString(),
        }));
    }
    /**
     * Gets a concept summary suitable for the citation side panel.
     *
     * @param conceptId - The concept ID
     * @returns Concept summary with related concepts
     */
    async getConceptSummaryForPanel(conceptId) {
        const concept = await this.prisma.concept.findUnique({
            where: { id: conceptId },
            include: {
                relatedTo: {
                    include: {
                        targetConcept: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                    take: 5,
                },
            },
        });
        if (!concept) {
            return null;
        }
        return {
            id: concept.id,
            name: concept.name,
            category: concept.category,
            definition: concept.definition,
            extendedDescription: concept.extendedDescription ?? undefined,
            relatedConcepts: concept.relatedTo.map((r) => ({
                id: r.targetConcept.id,
                name: r.targetConcept.name,
            })),
        };
    }
    /**
     * Deletes all citations for a message.
     * Used when a message is deleted.
     *
     * @param messageId - The message ID
     */
    async deleteCitationsForMessage(messageId) {
        this.logger.log({
            message: 'Deleting citations for message',
            messageId,
        });
        await this.prisma.conceptCitation.deleteMany({
            where: { messageId },
        });
    }
    /**
     * Gets distinct concept IDs from citations for a user.
     * Used for concept tree growth — shows concepts discovered via AI citations.
     */
    async getDiscoveredConceptIds(userId) {
        // Get message IDs for this user's conversations, then find cited concepts
        const messages = await this.prisma.message.findMany({
            where: { conversation: { userId } },
            select: { id: true },
        });
        if (messages.length === 0)
            return [];
        const messageIds = messages.map((m) => m.id);
        const citations = await this.prisma.conceptCitation.findMany({
            where: { messageId: { in: messageIds } },
            select: { conceptId: true },
            distinct: ['conceptId'],
        });
        return citations.map((c) => c.conceptId);
    }
    /**
     * Gets citation count for analytics.
     *
     * @param conceptId - Optional concept ID to filter by
     * @returns Total citation count
     */
    async getCitationCount(conceptId) {
        return this.prisma.conceptCitation.count({
            where: conceptId ? { conceptId } : undefined,
        });
    }
};
exports.CitationService = CitationService;
exports.CitationService = CitationService = CitationService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object])
], CitationService);


/***/ }),
/* 107 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var CurriculumService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CurriculumService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const cuid2_1 = __webpack_require__(32);
const fs_1 = __webpack_require__(8);
const path_1 = __webpack_require__(7);
/**
 * Service for managing the curriculum reference data and on-demand concept creation.
 * Loads the curriculum hierarchy from a static JSON file and creates DB concepts
 * only when they are first discussed in a conversation.
 */
let CurriculumService = CurriculumService_1 = class CurriculumService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(CurriculumService_1.name);
        this.nodes = this.loadCurriculumData();
        this.nodeMap = new Map(this.nodes.map((n) => [n.id, n]));
        this.logger.log(`Loaded ${this.nodes.length} curriculum nodes`);
    }
    loadCurriculumData() {
        // Try multiple paths since __dirname varies between dev and built output
        const paths = [
            (0, path_1.join)(__dirname, 'data', 'curriculum.json'),
            (0, path_1.join)(__dirname, '..', 'knowledge', 'data', 'curriculum.json'),
            (0, path_1.join)(__dirname, '..', 'app', 'knowledge', 'data', 'curriculum.json'),
        ];
        for (const p of paths) {
            try {
                const raw = (0, fs_1.readFileSync)(p, 'utf-8');
                return JSON.parse(raw);
            }
            catch {
                // Try next path
            }
        }
        this.logger.warn('Could not load curriculum.json from any expected path');
        return [];
    }
    /** Returns the full curriculum tree as a flat array. */
    getFullTree() {
        return this.nodes;
    }
    /** Looks up a single curriculum node by ID. */
    findNode(curriculumId) {
        return this.nodeMap.get(curriculumId) ?? null;
    }
    /** Returns the ancestor chain from root to the given node (inclusive). */
    getAncestorChain(curriculumId) {
        const chain = [];
        let current = this.nodeMap.get(curriculumId);
        while (current) {
            chain.unshift(current);
            current = current.parentId ? this.nodeMap.get(current.parentId) : undefined;
        }
        return chain;
    }
    /** Returns all top-level nodes (parentId === null). */
    getTopLevelNodes() {
        return this.nodes.filter((n) => n.parentId === null);
    }
    /** Returns children of a given curriculum node. */
    getChildren(curriculumId) {
        return this.nodes.filter((n) => n.parentId === curriculumId);
    }
    /**
     * Simple substring match of a text against curriculum labels.
     * Returns the best matching node or null.
     */
    matchTopic(text) {
        const lower = text.toLowerCase();
        // Exact match first
        for (const node of this.nodes) {
            if (node.label.toLowerCase() === lower)
                return node;
        }
        // Substring match (prefer longer labels = more specific)
        const matches = this.nodes.filter((n) => lower.includes(n.label.toLowerCase()) || n.label.toLowerCase().includes(lower));
        if (matches.length === 0)
            return null;
        // Return the most specific (deepest) match
        return matches.sort((a, b) => b.label.length - a.label.length)[0] ?? null;
    }
    /**
     * Searches curriculum labels by substring.
     * @param query - Search string
     * @param limit - Max results (default 20)
     */
    searchCurriculum(query, limit = 20) {
        const lower = query.toLowerCase();
        return this.nodes
            .filter((n) => n.label.toLowerCase().includes(lower))
            .slice(0, limit);
    }
    /**
     * Ensures a concept exists in the DB for the given curriculum ID.
     * Creates the concept and all ancestor concepts if they don't exist yet.
     * Returns the concept ID (cpt_ prefixed).
     */
    async ensureConceptExists(curriculumId) {
        const node = this.nodeMap.get(curriculumId);
        if (!node) {
            throw new Error(`Curriculum node not found: ${curriculumId}`);
        }
        // Check if already exists
        const existing = await this.prisma.concept.findUnique({
            where: { curriculumId },
            select: { id: true },
        });
        if (existing)
            return existing.id;
        // Get ancestor chain and ensure all ancestors exist first
        const chain = this.getAncestorChain(curriculumId);
        let parentConceptId = null;
        for (const ancestor of chain) {
            const existingAncestor = await this.prisma.concept.findUnique({
                where: { curriculumId: ancestor.id },
                select: { id: true },
            });
            if (existingAncestor) {
                parentConceptId = existingAncestor.id;
                continue;
            }
            // Create the ancestor concept
            const conceptId = `cpt_${(0, cuid2_1.createId)()}`;
            const topLevelCategory = chain[0]?.label ?? 'General'; // Root ancestor label as category
            await this.prisma.concept.create({
                data: {
                    id: conceptId,
                    name: ancestor.label,
                    slug: ancestor.id,
                    category: topLevelCategory,
                    definition: ancestor.label,
                    departmentTags: [],
                    parentId: parentConceptId,
                    sortOrder: ancestor.sortOrder,
                    curriculumId: ancestor.id,
                },
            });
            this.logger.log(`Created concept for curriculum node: ${ancestor.id} (${ancestor.label})`);
            parentConceptId = conceptId;
        }
        // The last parentConceptId is the one we just created for our target node
        return parentConceptId;
    }
    /**
     * Finds all concepts that have a curriculumId set.
     * Used for building the sparse sidebar tree.
     */
    async getActiveConceptsByCurriculum() {
        const concepts = await this.prisma.concept.findMany({
            where: { curriculumId: { not: null } },
            select: { id: true, name: true, curriculumId: true, parentId: true },
        });
        return new Map(concepts
            .filter((c) => c.curriculumId !== null)
            .map((c) => [c.curriculumId, { id: c.id, name: c.name, curriculumId: c.curriculumId, parentId: c.parentId }]));
    }
};
exports.CurriculumService = CurriculumService;
exports.CurriculumService = CurriculumService = CurriculumService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object])
], CurriculumService);


/***/ }),
/* 108 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var ConceptSeedService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConceptSeedService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const cuid2_1 = __webpack_require__(32);
const fs = tslib_1.__importStar(__webpack_require__(8));
const path = tslib_1.__importStar(__webpack_require__(7));
/**
 * Service for seeding business concepts into the database.
 * Provides idempotent seeding with bidirectional relationship creation.
 */
let ConceptSeedService = ConceptSeedService_1 = class ConceptSeedService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ConceptSeedService_1.name);
        // Resolve path relative to the compiled output
        this.seedDataPath = path.resolve(__dirname, '../../../../prisma/seed-data/concepts');
    }
    /**
     * Seeds all concepts from JSON files in the seed-data folder.
     * Idempotent: skips concepts that already exist.
     *
     * @param dryRun - If true, only logs what would be created without making changes
     * @returns Summary of seeding results
     */
    async seedAllConcepts(dryRun = false) {
        const result = {
            conceptsCreated: 0,
            conceptsSkipped: 0,
            relationshipsCreated: 0,
            errors: [],
        };
        this.logger.log({
            message: 'Starting concept seeding',
            seedDataPath: this.seedDataPath,
            dryRun,
        });
        // Get all JSON files in the seed data folder
        const files = this.getSeedFiles();
        if (files.length === 0) {
            this.logger.warn({
                message: 'No seed files found',
                path: this.seedDataPath,
            });
            return result;
        }
        // First pass: Create all concepts
        const conceptsBySlug = new Map(); // slug -> id
        for (const file of files) {
            const seedData = this.loadSeedFile(file);
            if (!seedData)
                continue;
            for (const conceptData of seedData.concepts) {
                try {
                    const existingConcept = await this.prisma.concept.findUnique({
                        where: { slug: conceptData.slug },
                    });
                    if (existingConcept) {
                        conceptsBySlug.set(conceptData.slug, existingConcept.id);
                        result.conceptsSkipped++;
                        this.logger.debug({
                            message: 'Concept already exists, skipping',
                            slug: conceptData.slug,
                        });
                        continue;
                    }
                    if (dryRun) {
                        const conceptId = `cpt_${(0, cuid2_1.createId)()}`;
                        conceptsBySlug.set(conceptData.slug, conceptId);
                        result.conceptsCreated++;
                        this.logger.log({
                            message: '[DRY RUN] Would create concept',
                            name: conceptData.name,
                            slug: conceptData.slug,
                        });
                        continue;
                    }
                    const concept = await this.createConcept(conceptData);
                    conceptsBySlug.set(conceptData.slug, concept.id);
                    result.conceptsCreated++;
                    this.logger.log({
                        message: 'Created concept',
                        id: concept.id,
                        name: concept.name,
                        category: concept.category,
                    });
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    result.errors.push(`Failed to create concept ${conceptData.slug}: ${errorMessage}`);
                    this.logger.error({
                        message: 'Failed to create concept',
                        slug: conceptData.slug,
                        error: errorMessage,
                    });
                }
            }
        }
        // Second pass: Create relationships
        for (const file of files) {
            const seedData = this.loadSeedFile(file);
            if (!seedData)
                continue;
            for (const conceptData of seedData.concepts) {
                if (!conceptData.relatedConcepts || conceptData.relatedConcepts.length === 0) {
                    continue;
                }
                const sourceId = conceptsBySlug.get(conceptData.slug);
                if (!sourceId)
                    continue;
                for (const relation of conceptData.relatedConcepts) {
                    const targetId = conceptsBySlug.get(relation.slug);
                    if (!targetId) {
                        this.logger.warn({
                            message: 'Related concept not found',
                            sourceSlug: conceptData.slug,
                            targetSlug: relation.slug,
                        });
                        continue;
                    }
                    try {
                        if (dryRun) {
                            result.relationshipsCreated++;
                            this.logger.log({
                                message: '[DRY RUN] Would create relationship',
                                source: conceptData.slug,
                                target: relation.slug,
                                type: relation.type,
                            });
                            continue;
                        }
                        // Check if relationship already exists
                        const existingRelation = await this.prisma.conceptRelationship.findUnique({
                            where: {
                                sourceConceptId_targetConceptId: {
                                    sourceConceptId: sourceId,
                                    targetConceptId: targetId,
                                },
                            },
                        });
                        if (existingRelation) {
                            continue; // Skip existing relationships
                        }
                        await this.prisma.conceptRelationship.create({
                            data: {
                                sourceConceptId: sourceId,
                                targetConceptId: targetId,
                                relationshipType: relation.type,
                            },
                        });
                        result.relationshipsCreated++;
                    }
                    catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        this.logger.error({
                            message: 'Failed to create relationship',
                            source: conceptData.slug,
                            target: relation.slug,
                            error: errorMessage,
                        });
                    }
                }
            }
        }
        this.logger.log({
            message: 'Concept seeding complete',
            conceptsCreated: result.conceptsCreated,
            conceptsSkipped: result.conceptsSkipped,
            relationshipsCreated: result.relationshipsCreated,
            errorCount: result.errors.length,
        });
        return result;
    }
    /**
     * Gets list of seed data JSON files.
     */
    getSeedFiles() {
        try {
            if (!fs.existsSync(this.seedDataPath)) {
                this.logger.warn({
                    message: 'Seed data path does not exist',
                    path: this.seedDataPath,
                });
                return [];
            }
            return fs
                .readdirSync(this.seedDataPath)
                .filter((file) => file.endsWith('.json'))
                .map((file) => path.join(this.seedDataPath, file));
        }
        catch (error) {
            this.logger.error({
                message: 'Failed to read seed data directory',
                path: this.seedDataPath,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return [];
        }
    }
    /**
     * Loads and parses a seed data JSON file.
     */
    loadSeedFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            this.logger.error({
                message: 'Failed to load seed file',
                filePath,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return null;
        }
    }
    /**
     * Creates a single concept in the database.
     */
    async createConcept(data) {
        const conceptId = `cpt_${(0, cuid2_1.createId)()}`;
        return this.prisma.concept.create({
            data: {
                id: conceptId,
                name: data.name,
                slug: data.slug,
                category: data.category,
                definition: data.definition,
                extendedDescription: data.extendedDescription,
                departmentTags: data.departmentTags,
                version: 1,
            },
        });
    }
    /**
     * Clears all concepts and relationships from the database.
     * Use with caution - primarily for testing.
     */
    async clearAllConcepts() {
        this.logger.warn({ message: 'Clearing all concepts and relationships' });
        // Delete relationships first (foreign key constraint)
        await this.prisma.conceptRelationship.deleteMany({});
        await this.prisma.concept.deleteMany({});
        this.logger.log({ message: 'All concepts and relationships cleared' });
    }
};
exports.ConceptSeedService = ConceptSeedService;
exports.ConceptSeedService = ConceptSeedService = ConceptSeedService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object])
], ConceptSeedService);


/***/ }),
/* 109 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var ConceptMatchingService_1;
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConceptMatchingService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const embedding_service_1 = __webpack_require__(110);
/**
 * Service for finding relevant business concepts using semantic search.
 * Integrates with EmbeddingService for vector similarity search.
 *
 * @example
 * ```typescript
 * const matches = await conceptMatchingService.findRelevantConcepts(
 *   "We should consider a value-based pricing strategy",
 *   { limit: 5, threshold: 0.7 }
 * );
 * ```
 */
let ConceptMatchingService = ConceptMatchingService_1 = class ConceptMatchingService {
    constructor(prisma, embeddingService) {
        this.prisma = prisma;
        this.embeddingService = embeddingService;
        this.logger = new common_1.Logger(ConceptMatchingService_1.name);
        /** Default maximum concepts to return */
        this.DEFAULT_LIMIT = 5;
        /** Default minimum similarity threshold */
        this.DEFAULT_THRESHOLD = 0.7;
    }
    /**
     * Finds relevant business concepts for a given text response.
     * Uses semantic search to find concepts with similar meaning.
     *
     * @param response - The AI response text to find concepts for
     * @param options - Matching options (limit, threshold, personaType)
     * @returns Array of matching concepts with similarity scores
     * @throws Error if embedding service fails
     */
    async findRelevantConcepts(response, options = {}) {
        const limit = options.limit ?? this.DEFAULT_LIMIT;
        const threshold = options.threshold ?? this.DEFAULT_THRESHOLD;
        this.logger.debug({
            message: 'Finding relevant concepts',
            responseLength: response.length,
            limit,
            threshold,
            personaType: options.personaType,
        });
        // Try semantic search via EmbeddingService
        const semanticMatches = await this.embeddingService.search(response, limit * 2, // Get more to filter later
        options.personaType ? { department: options.personaType } : undefined);
        // If semantic search returns results, use them
        if (semanticMatches.length > 0) {
            const filteredMatches = semanticMatches
                .filter((match) => match.score >= threshold)
                .slice(0, limit);
            this.logger.debug({
                message: 'Semantic search completed',
                totalMatches: semanticMatches.length,
                filteredMatches: filteredMatches.length,
            });
            // Enrich with concept details from database
            return this.enrichMatchesWithConceptData(filteredMatches);
        }
        // Fallback to keyword-based search if semantic search unavailable
        this.logger.debug({
            message: 'Falling back to keyword-based matching',
        });
        return this.fallbackKeywordMatch(response, limit, options.personaType);
    }
    /**
     * Enriches semantic matches with full concept data from database.
     *
     * @param matches - Raw matches from embedding service
     * @returns Enriched concept matches with category and definition
     */
    async enrichMatchesWithConceptData(matches) {
        if (matches.length === 0) {
            return [];
        }
        const conceptIds = matches.map((m) => m.conceptId);
        const concepts = await this.prisma.concept.findMany({
            where: { id: { in: conceptIds } },
            select: {
                id: true,
                name: true,
                category: true,
                definition: true,
            },
        });
        const conceptMap = new Map(concepts.map((c) => [c.id, c]));
        return matches
            .map((match) => {
            const concept = conceptMap.get(match.conceptId);
            if (!concept) {
                this.logger.warn({
                    message: 'Concept not found in database',
                    conceptId: match.conceptId,
                });
                return null;
            }
            return {
                conceptId: concept.id,
                conceptName: concept.name,
                category: concept.category,
                definition: concept.definition,
                score: match.score,
            };
        })
            .filter((m) => m !== null);
    }
    /**
     * Fallback keyword-based matching when semantic search is unavailable.
     * Searches for concepts whose names or definitions contain keywords from the response.
     *
     * @param response - The AI response text
     * @param limit - Maximum concepts to return
     * @param personaType - Optional persona type filter
     * @returns Matching concepts with estimated scores
     */
    async fallbackKeywordMatch(response, limit, personaType) {
        // Extract significant words from response (3+ characters, lowercase)
        const words = response
            .toLowerCase()
            .split(/\s+/)
            .filter((word) => word.length >= 3)
            .map((word) => word.replace(/[^a-z]/g, ''))
            .filter((word) => word.length >= 3);
        // Remove common words
        const commonWords = new Set([
            'the',
            'and',
            'for',
            'are',
            'but',
            'not',
            'you',
            'all',
            'can',
            'her',
            'was',
            'one',
            'our',
            'out',
            'has',
            'have',
            'been',
            'will',
            'with',
            'this',
            'that',
            'from',
            'they',
            'would',
            'about',
            'which',
            'their',
            'there',
            'should',
            'could',
        ]);
        const keywords = [...new Set(words.filter((w) => !commonWords.has(w)))];
        if (keywords.length === 0) {
            return [];
        }
        // Build OR conditions for keyword search
        const searchConditions = keywords.slice(0, 10).map((keyword) => ({
            OR: [
                { name: { contains: keyword, mode: 'insensitive' } },
                { definition: { contains: keyword, mode: 'insensitive' } },
            ],
        }));
        // Add department filter if persona specified
        const departmentFilter = personaType
            ? { departmentTags: { has: this.personaToDepartment(personaType) } }
            : {};
        const concepts = await this.prisma.concept.findMany({
            where: {
                OR: searchConditions,
                ...departmentFilter,
            },
            select: {
                id: true,
                name: true,
                category: true,
                definition: true,
            },
            take: limit * 2,
        });
        // Score concepts by keyword match count
        const scoredConcepts = concepts.map((concept) => {
            const nameWords = concept.name.toLowerCase().split(/\s+/);
            const defWords = concept.definition.toLowerCase().split(/\s+/);
            const allWords = [...nameWords, ...defWords];
            const matchCount = keywords.filter((keyword) => allWords.some((word) => word.includes(keyword))).length;
            // Normalize score to 0-1 range (approximate)
            const score = Math.min(0.5 + matchCount * 0.1, 0.95);
            return {
                conceptId: concept.id,
                conceptName: concept.name,
                category: concept.category,
                definition: concept.definition,
                score,
            };
        });
        // Sort by score and return top matches
        return scoredConcepts
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
    /**
     * Maps PersonaType to department name for filtering.
     */
    personaToDepartment(personaType) {
        const mapping = {
            CFO: 'Finance',
            CMO: 'Marketing',
            CTO: 'Technology',
            OPERATIONS: 'Operations',
            LEGAL: 'Legal',
            CREATIVE: 'Creative',
            CSO: 'Strategy',
            SALES: 'Sales',
        };
        return mapping[personaType] || personaType;
    }
};
exports.ConceptMatchingService = ConceptMatchingService;
exports.ConceptMatchingService = ConceptMatchingService = ConceptMatchingService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object, typeof (_b = typeof embedding_service_1.EmbeddingService !== "undefined" && embedding_service_1.EmbeddingService) === "function" ? _b : Object])
], ConceptMatchingService);


/***/ }),
/* 110 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var EmbeddingService_1;
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.EmbeddingService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const node_crypto_1 = __webpack_require__(76);
const tenant_context_1 = __webpack_require__(9);
const llm_config_service_1 = __webpack_require__(75);
const qdrant_client_service_1 = __webpack_require__(111);
const types_1 = __webpack_require__(84);
/** Default LM Studio endpoint when not configured in DB */
const DEFAULT_LM_STUDIO_ENDPOINT = 'http://127.0.0.1:1234';
/**
 * Embedding service using LM Studio nomic-embed-text (768-dim) + Qdrant Cloud.
 *
 * - embed(): Calls LM Studio local API to generate 768-dim embeddings
 * - store(): Upserts embedding vector to Qdrant 'concepts' collection
 * - search(): Cosine similarity search via Qdrant
 * - delete(): Removes point from Qdrant collection
 */
let EmbeddingService = EmbeddingService_1 = class EmbeddingService {
    constructor(prisma, llmConfigService, qdrantClient) {
        this.prisma = prisma;
        this.llmConfigService = llmConfigService;
        this.qdrantClient = qdrantClient;
        this.logger = new common_1.Logger(EmbeddingService_1.name);
        this.EMBEDDING_MODEL = 'text-embedding-nomic-embed-text-v1.5';
        this.EMBEDDING_DIMENSIONS = 768;
        this.COLLECTION_NAME = 'concepts';
    }
    async onModuleInit() {
        if (!this.qdrantClient.isAvailable()) {
            this.logger.warn('Qdrant not available — concept embeddings disabled');
            return;
        }
        try {
            await this.qdrantClient.ensureCollection(this.COLLECTION_NAME, this.EMBEDDING_DIMENSIONS);
        }
        catch (error) {
            this.logger.warn({
                message: 'Failed to ensure Qdrant concepts collection (non-fatal)',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
    /**
     * Generates an embedding for text content using LM Studio local API.
     */
    async embed(text) {
        const endpoint = (await this.llmConfigService.getProviderEndpoint(types_1.LlmProviderType.LM_STUDIO)) ??
            DEFAULT_LM_STUDIO_ENDPOINT;
        try {
            const response = await fetch(`${endpoint}/v1/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.EMBEDDING_MODEL,
                    input: text,
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error({
                    message: 'LM Studio embedding API error',
                    status: response.status,
                    error: errorText,
                });
                return {
                    embeddingId: `emb_error_${Date.now()}`,
                    vector: new Array(this.EMBEDDING_DIMENSIONS).fill(0),
                };
            }
            const data = (await response.json());
            const first = data.data[0];
            if (!first) {
                return {
                    embeddingId: `emb_error_${Date.now()}`,
                    vector: new Array(this.EMBEDDING_DIMENSIONS).fill(0),
                };
            }
            const vector = first.embedding;
            this.logger.debug({
                message: 'Embedding generated via LM Studio',
                model: data.model,
                dimensions: vector.length,
                tokensUsed: data.usage?.total_tokens,
            });
            return {
                embeddingId: `emb_${Date.now()}`,
                vector,
            };
        }
        catch (error) {
            this.logger.error({
                message: 'Failed to generate embedding via LM Studio',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return {
                embeddingId: `emb_error_${Date.now()}`,
                vector: new Array(this.EMBEDDING_DIMENSIONS).fill(0),
            };
        }
    }
    /**
     * Stores an embedding in the Qdrant 'concepts' collection.
     * Uses a deterministic UUID from the conceptId for idempotent upserts.
     */
    async store(conceptId, vector, payload) {
        const pointId = this.conceptIdToUuid(conceptId);
        try {
            const client = this.qdrantClient.getClient();
            await client.upsert(this.COLLECTION_NAME, {
                wait: true,
                points: [
                    {
                        id: pointId,
                        vector,
                        payload: {
                            conceptId,
                            name: payload['name'] ?? '',
                            category: payload['category'] ?? '',
                            departmentTags: payload['departmentTags'] ?? [],
                        },
                    },
                ],
            });
            // Store the Qdrant point UUID in the database
            await this.prisma.concept.update({
                where: { id: conceptId },
                data: { embeddingId: pointId },
            });
            this.logger.debug({
                message: 'Embedding stored in Qdrant',
                conceptId,
                pointId,
                dimensions: vector.length,
            });
            return pointId;
        }
        catch (error) {
            this.logger.error({
                message: 'Failed to store embedding in Qdrant',
                conceptId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }
    /**
     * Searches for similar concepts using cosine similarity via Qdrant.
     */
    async search(query, limit, filter) {
        if (!this.qdrantClient.isAvailable()) {
            return [];
        }
        let queryVector;
        if (typeof query === 'string') {
            const embeddingResult = await this.embed(query);
            if (embeddingResult.vector.every((v) => v === 0)) {
                this.logger.warn('Embedding generation failed, returning empty search results');
                return [];
            }
            queryVector = embeddingResult.vector;
        }
        else {
            queryVector = query;
        }
        try {
            const client = this.qdrantClient.getClient();
            // Build Qdrant filter for department tags if provided
            const qdrantFilter = filter?.department
                ? {
                    must: [
                        {
                            key: 'departmentTags',
                            match: { any: [String(filter.department)] },
                        },
                    ],
                }
                : undefined;
            const results = await client.search(this.COLLECTION_NAME, {
                vector: queryVector,
                limit,
                filter: qdrantFilter,
                with_payload: true,
            });
            this.logger.debug({
                message: 'Semantic search completed via Qdrant',
                resultCount: results.length,
                topScore: results.length > 0 ? (results[0]?.score ?? null) : null,
                hasDepartmentFilter: !!filter?.department,
            });
            return results.map((r) => ({
                conceptId: r.payload?.['conceptId'] ?? '',
                score: r.score,
                name: r.payload?.['name'] ?? '',
            }));
        }
        catch (error) {
            this.logger.error({
                message: 'Qdrant semantic search failed',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return [];
        }
    }
    /**
     * Removes an embedding from the Qdrant collection.
     */
    async delete(embeddingId) {
        if (!this.qdrantClient.isAvailable())
            return;
        try {
            const client = this.qdrantClient.getClient();
            await client.delete(this.COLLECTION_NAME, {
                wait: true,
                points: [embeddingId],
            });
            this.logger.debug({
                message: 'Embedding deleted from Qdrant',
                pointId: embeddingId,
            });
        }
        catch (error) {
            this.logger.error({
                message: 'Failed to delete embedding from Qdrant',
                pointId: embeddingId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
    /**
     * Deterministic UUID from conceptId using MD5 hash.
     * Ensures re-seeding overwrites the same point rather than creating duplicates.
     */
    conceptIdToUuid(conceptId) {
        const hash = (0, node_crypto_1.createHash)('md5').update(conceptId).digest('hex');
        return [
            hash.slice(0, 8),
            hash.slice(8, 12),
            hash.slice(12, 16),
            hash.slice(16, 20),
            hash.slice(20, 32),
        ].join('-');
    }
};
exports.EmbeddingService = EmbeddingService;
exports.EmbeddingService = EmbeddingService = EmbeddingService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object, typeof (_b = typeof llm_config_service_1.LlmConfigService !== "undefined" && llm_config_service_1.LlmConfigService) === "function" ? _b : Object, typeof (_c = typeof qdrant_client_service_1.QdrantClientService !== "undefined" && qdrant_client_service_1.QdrantClientService) === "function" ? _c : Object])
], EmbeddingService);


/***/ }),
/* 111 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var QdrantClientService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QdrantClientService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const js_client_rest_1 = __webpack_require__(112);
/**
 * Shared Qdrant client service.
 * Provides a singleton QdrantClient instance and collection management utilities.
 * Used by EmbeddingService (concepts) and MemoryEmbeddingService (memories).
 */
let QdrantClientService = QdrantClientService_1 = class QdrantClientService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(QdrantClientService_1.name);
        this.client = null;
    }
    async onModuleInit() {
        const url = this.configService.get('QDRANT_URL');
        const apiKey = this.configService.get('QDRANT_API_KEY');
        if (!url) {
            this.logger.warn('QDRANT_URL not configured — vector operations will be unavailable');
            return;
        }
        this.client = new js_client_rest_1.QdrantClient({ url, apiKey: apiKey || undefined });
        this.logger.log({ message: 'Qdrant client initialized', url });
    }
    /**
     * Returns the Qdrant client instance.
     * @throws Error if QDRANT_URL was not configured
     */
    getClient() {
        if (!this.client) {
            throw new Error('Qdrant client not initialized. Check QDRANT_URL env var.');
        }
        return this.client;
    }
    /**
     * Returns true if Qdrant is configured and available.
     */
    isAvailable() {
        return this.client !== null;
    }
    /**
     * Ensures a collection exists with the specified vector configuration.
     * Idempotent — no-ops if the collection already exists.
     *
     * @param name - Collection name
     * @param size - Vector dimension size
     * @param distance - Distance metric (default: Cosine)
     */
    /**
     * Deletes and recreates a collection with new vector configuration.
     * Use when vector dimensions change (e.g. switching embedding models).
     */
    async recreateCollection(name, size, distance = 'Cosine') {
        const client = this.getClient();
        try {
            await client.deleteCollection(name);
            this.logger.log({ message: 'Deleted Qdrant collection', name });
        }
        catch {
            // Collection doesn't exist — that's fine
        }
        await client.createCollection(name, {
            vectors: { size, distance },
        });
        this.logger.log({ message: 'Created Qdrant collection', name, size, distance });
    }
    async ensureCollection(name, size, distance = 'Cosine') {
        const client = this.getClient();
        const collections = await client.getCollections();
        const exists = collections.collections.some((c) => c.name === name);
        if (!exists) {
            await client.createCollection(name, {
                vectors: { size, distance },
            });
            this.logger.log({ message: 'Qdrant collection created', name, size, distance });
        }
        else {
            this.logger.debug({ message: 'Qdrant collection already exists', name });
        }
    }
};
exports.QdrantClientService = QdrantClientService;
exports.QdrantClientService = QdrantClientService = QdrantClientService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], QdrantClientService);


/***/ }),
/* 112 */
/***/ ((module) => {

module.exports = require("@qdrant/js-client-rest");

/***/ }),
/* 113 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var CitationInjectorService_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CitationInjectorService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const cuid2_1 = __webpack_require__(32);
/**
 * Service for injecting concept citations into AI responses.
 * Creates inline [[Concept Name]] markers and generates citation records.
 *
 * @example
 * ```typescript
 * const result = citationInjector.injectCitations(
 *   "Consider using value-based pricing for premium products.",
 *   [{ conceptId: "cpt_123", conceptName: "Value-Based Pricing", ... }]
 * );
 * // result.content = "Consider using value-based pricing [[Value-Based Pricing]] for premium products."
 * ```
 */
let CitationInjectorService = CitationInjectorService_1 = class CitationInjectorService {
    constructor() {
        this.logger = new common_1.Logger(CitationInjectorService_1.name);
        /** Maximum number of citations to inject per response */
        this.MAX_CITATIONS = 5;
    }
    /**
     * Injects concept citations into a response text.
     * Citations are placed at relevant positions in the text.
     *
     * @param response - The AI response text to inject citations into
     * @param concepts - Array of matching concepts to cite
     * @param messageId - Optional message ID to associate citations with (set later if not provided)
     * @returns Object containing modified content and citation records
     */
    injectCitations(response, concepts, messageId = '') {
        if (concepts.length === 0) {
            this.logger.debug({
                message: 'No concepts to inject',
                responseLength: response.length,
            });
            return { content: response, citations: [] };
        }
        // Sort by relevance (highest score first) and limit
        const sortedConcepts = [...concepts]
            .sort((a, b) => b.score - a.score)
            .slice(0, this.MAX_CITATIONS);
        this.logger.debug({
            message: 'Injecting citations',
            conceptCount: sortedConcepts.length,
            responseLength: response.length,
        });
        let content = response;
        const citations = [];
        const usedPositions = new Set();
        for (const concept of sortedConcepts) {
            const insertionResult = this.findAndInsertCitation(content, concept, usedPositions);
            if (insertionResult) {
                content = insertionResult.content;
                usedPositions.add(insertionResult.position);
                citations.push({
                    id: `cit_${(0, cuid2_1.createId)()}`,
                    messageId,
                    conceptId: concept.conceptId,
                    conceptName: concept.conceptName,
                    conceptCategory: concept.category,
                    position: insertionResult.position,
                    score: concept.score,
                    createdAt: new Date().toISOString(),
                });
                this.logger.debug({
                    message: 'Citation injected',
                    conceptName: concept.conceptName,
                    position: insertionResult.position,
                });
            }
        }
        this.logger.log({
            message: 'Citations injection complete',
            citationsAdded: citations.length,
            originalLength: response.length,
            newLength: content.length,
        });
        return { content, citations };
    }
    /**
     * Finds an appropriate insertion point and inserts the citation.
     *
     * @param content - Current content
     * @param concept - Concept to insert
     * @param usedPositions - Set of already used positions
     * @returns Modified content and position, or null if no suitable position found
     */
    findAndInsertCitation(content, concept, usedPositions) {
        // Strategy 1: Find concept name mentioned in text (case-insensitive)
        const namePattern = new RegExp(this.escapeRegex(concept.conceptName), 'gi');
        const nameMatch = namePattern.exec(content);
        if (nameMatch) {
            const endPosition = nameMatch.index + nameMatch[0].length;
            // Check if citation already exists at this position
            if (!this.hasCitationAt(content, endPosition)) {
                const citation = ` [[${concept.conceptName}]]`;
                return {
                    content: content.slice(0, endPosition) + citation + content.slice(endPosition),
                    position: endPosition,
                };
            }
        }
        // Strategy 2: Find related keywords from concept name
        const keywords = concept.conceptName
            .toLowerCase()
            .split(/[\s-]+/)
            .filter((w) => w.length >= 4);
        for (const keyword of keywords) {
            const keywordPattern = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'gi');
            let match;
            while ((match = keywordPattern.exec(content)) !== null) {
                // Find end of sentence containing this keyword
                const sentenceEnd = this.findSentenceEnd(content, match.index);
                if (sentenceEnd !== -1 &&
                    !usedPositions.has(sentenceEnd) &&
                    !this.hasCitationAt(content, sentenceEnd)) {
                    const citation = ` [[${concept.conceptName}]]`;
                    return {
                        content: content.slice(0, sentenceEnd) +
                            citation +
                            content.slice(sentenceEnd),
                        position: sentenceEnd,
                    };
                }
            }
        }
        // Strategy 3: Find end of first paragraph if no keyword match
        const firstParagraphEnd = content.indexOf('\n\n');
        if (firstParagraphEnd !== -1 && !usedPositions.has(firstParagraphEnd)) {
            // Insert at end of first paragraph
            const sentenceEnd = this.findSentenceEnd(content, 0);
            if (sentenceEnd !== -1 &&
                sentenceEnd < firstParagraphEnd &&
                !this.hasCitationAt(content, sentenceEnd)) {
                const citation = ` [[${concept.conceptName}]]`;
                return {
                    content: content.slice(0, sentenceEnd) + citation + content.slice(sentenceEnd),
                    position: sentenceEnd,
                };
            }
        }
        // No suitable position found
        this.logger.debug({
            message: 'No suitable position found for citation',
            conceptName: concept.conceptName,
        });
        return null;
    }
    /**
     * Finds the end of the sentence containing the given position.
     *
     * @param content - The text content
     * @param startPosition - Position to search from
     * @returns Position of sentence end (before period/question mark), or -1 if not found
     */
    findSentenceEnd(content, startPosition) {
        const sentenceEnders = /[.!?]/;
        let position = startPosition;
        while (position < content.length) {
            const char = content.charAt(position);
            if (sentenceEnders.test(char)) {
                return position;
            }
            position++;
        }
        return -1;
    }
    /**
     * Checks if there's already a citation at the given position.
     */
    hasCitationAt(content, position) {
        const ahead = content.slice(position, position + 10);
        return ahead.includes('[[') || ahead.trimStart().startsWith('[[');
    }
    /**
     * Escapes special regex characters in a string.
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    /**
     * Parses existing citations from message content.
     * Used for display purposes in the frontend.
     *
     * @param content - Message content with [[Citation]] markers
     * @returns Array of citation markers found
     */
    parseCitations(content) {
        const citations = [];
        const pattern = /\[\[([^\]]+)\]\]/g;
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const name = match[1];
            if (name) {
                citations.push({
                    name,
                    position: match.index,
                });
            }
        }
        return citations;
    }
    /**
     * Removes citation markers from content for plain text display.
     *
     * @param content - Content with [[Citation]] markers
     * @returns Plain content without citation markers
     */
    stripCitations(content) {
        return content.replace(/\s*\[\[[^\]]+\]\]/g, '');
    }
};
exports.CitationInjectorService = CitationInjectorService;
exports.CitationInjectorService = CitationInjectorService = CitationInjectorService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)()
], CitationInjectorService);


/***/ }),
/* 114 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var ConceptExtractionService_1;
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConceptExtractionService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const cuid2_1 = __webpack_require__(32);
const tenant_context_1 = __webpack_require__(9);
const ai_gateway_service_1 = __webpack_require__(88);
const concept_service_1 = __webpack_require__(104);
const extraction_prompt_1 = __webpack_require__(115);
/** Default maximum concepts per extraction call */
const DEFAULT_MAX_NEW = 5;
/**
 * Generic service for extracting new business concepts from AI output text.
 * Creates concepts in the database and triggers relationship linking.
 *
 * Used by both manual chat (conversation.gateway.ts) and YOLO workflow
 * (yolo-scheduler.service.ts).
 *
 * Story 2.15: AI-Driven Concept Discovery and Creation
 */
let ConceptExtractionService = ConceptExtractionService_1 = class ConceptExtractionService {
    constructor(prisma, aiGateway, conceptService) {
        this.prisma = prisma;
        this.aiGateway = aiGateway;
        this.conceptService = conceptService;
        this.logger = new common_1.Logger(ConceptExtractionService_1.name);
    }
    /**
     * Extracts new business concepts from AI output text, validates them,
     * creates them in the database, and triggers relationship linking.
     *
     * @param aiOutput - The AI-generated text to analyze
     * @param context - Optional context (conversationId, conceptId, maxNew cap)
     * @returns Result with created concepts, skipped duplicates, and errors
     */
    async extractAndCreateConcepts(aiOutput, context = {}) {
        const result = {
            created: [],
            skippedDuplicates: [],
            errors: [],
        };
        const maxNew = context.maxNew ?? DEFAULT_MAX_NEW;
        try {
            // 1. Get existing concept names for deduplication in the prompt
            const existingConcepts = await this.prisma.concept.findMany({
                select: { name: true },
                orderBy: { name: 'asc' },
            });
            const existingNames = existingConcepts.map((c) => c.name);
            // 2. Call LLM to extract concept candidates
            const prompt = (0, extraction_prompt_1.buildConceptExtractionPrompt)(aiOutput, existingNames, maxNew);
            const messages = [{ role: 'user', content: prompt }];
            let fullResponse = '';
            await this.aiGateway.streamCompletion(messages, (chunk) => {
                fullResponse += chunk;
            });
            // 3. Parse and validate candidates
            const candidates = (0, extraction_prompt_1.parseExtractionResponse)(fullResponse);
            if (candidates.length === 0) {
                this.logger.debug({ message: 'No new concepts extracted from AI output' });
                return result;
            }
            // 4. Process each candidate (up to maxNew)
            const toProcess = candidates.slice(0, maxNew);
            for (const candidate of toProcess) {
                // Duplicate check: case-insensitive name lookup
                const existing = await this.conceptService.findByName(candidate.name);
                if (existing) {
                    result.skippedDuplicates.push(candidate.name);
                    this.logger.debug({
                        message: 'Skipped duplicate concept',
                        name: candidate.name,
                        existingId: existing.id,
                    });
                    continue;
                }
                // Create concept in DB
                try {
                    const slug = this.generateSlug(candidate.name);
                    const conceptId = `cpt_${(0, cuid2_1.createId)()}`;
                    const newConcept = await this.prisma.concept.create({
                        data: {
                            id: conceptId,
                            name: candidate.name,
                            slug,
                            category: candidate.category,
                            definition: candidate.definition,
                            departmentTags: candidate.departmentTags,
                            source: 'AI_DISCOVERED',
                            version: 1,
                        },
                    });
                    const summary = {
                        id: newConcept.id,
                        name: newConcept.name,
                        slug: newConcept.slug,
                        category: newConcept.category,
                        definition: newConcept.definition,
                    };
                    result.created.push(summary);
                    this.logger.log({
                        message: 'AI-discovered concept created',
                        conceptId: newConcept.id,
                        name: newConcept.name,
                        category: newConcept.category,
                    });
                    // Trigger relationship linking (non-blocking, fire-and-forget)
                    // Deviation: uses .then()/.catch() instead of async/await per project-context.md rule
                    // "Always use async/await over raw Promises". Rationale: relationship creation is
                    // optional post-processing; failure must not block concept creation or return an
                    // error to the caller. See AC6 for fire-and-forget requirement.
                    this.conceptService
                        .createDynamicRelationships(newConcept.id, newConcept.name, newConcept.category)
                        .then((relResult) => {
                        if (relResult.relationshipsCreated < 2) {
                            this.logger.warn({
                                message: 'Fewer than 2 relationships created for AI-discovered concept (AC3)',
                                conceptId: newConcept.id,
                                conceptName: newConcept.name,
                                relationshipsCreated: relResult.relationshipsCreated,
                            });
                        }
                    })
                        .catch((err) => {
                        this.logger.warn({
                            message: 'Relationship creation failed for AI-discovered concept',
                            conceptId: newConcept.id,
                            error: err instanceof Error ? err.message : 'Unknown',
                        });
                    });
                }
                catch (err) {
                    // Handle unique constraint or other DB errors gracefully
                    const errMsg = err instanceof Error ? err.message : 'Unknown error';
                    if (errMsg.includes('Unique constraint')) {
                        result.skippedDuplicates.push(candidate.name);
                        this.logger.debug({
                            message: 'Concept skipped due to unique constraint',
                            name: candidate.name,
                        });
                    }
                    else {
                        result.errors.push(`Failed to create "${candidate.name}": ${errMsg}`);
                        this.logger.warn({
                            message: 'Failed to create AI-discovered concept',
                            name: candidate.name,
                            error: errMsg,
                        });
                    }
                }
            }
            this.logger.log({
                message: 'Concept extraction complete',
                created: result.created.length,
                skipped: result.skippedDuplicates.length,
                errors: result.errors.length,
            });
        }
        catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error';
            result.errors.push(`Extraction failed: ${errMsg}`);
            this.logger.warn({
                message: 'Concept extraction failed',
                error: errMsg,
            });
        }
        return result;
    }
    /**
     * Generates a URL-friendly slug from a concept name.
     * Handles Unicode by stripping diacritics and non-alphanumeric characters.
     */
    generateSlug(name) {
        return name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Strip diacritics
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }
};
exports.ConceptExtractionService = ConceptExtractionService;
exports.ConceptExtractionService = ConceptExtractionService = ConceptExtractionService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object, typeof (_b = typeof ai_gateway_service_1.AiGatewayService !== "undefined" && ai_gateway_service_1.AiGatewayService) === "function" ? _b : Object, typeof (_c = typeof concept_service_1.ConceptService !== "undefined" && concept_service_1.ConceptService) === "function" ? _c : Object])
], ConceptExtractionService);


/***/ }),
/* 115 */
/***/ ((__unused_webpack_module, exports) => {


/**
 * LLM prompt template for extracting new business concepts from AI output text.
 *
 * Story 2.15: AI-Driven Concept Discovery and Creation
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.buildConceptExtractionPrompt = buildConceptExtractionPrompt;
exports.parseExtractionResponse = parseExtractionResponse;
/** Valid concept categories (must match ConceptCategory enum) */
const VALID_CATEGORIES = [
    'Finance',
    'Marketing',
    'Technology',
    'Operations',
    'Legal',
    'Creative',
    'Strategy',
    'Sales',
];
/**
 * Builds the prompt for extracting new business concepts from AI output.
 *
 * @param aiOutput - The AI-generated text to analyze
 * @param existingNames - Names of concepts already in the database (to avoid re-extraction)
 * @param maxConcepts - Maximum number of concepts to extract (default: 5)
 */
function buildConceptExtractionPrompt(aiOutput, existingNames, maxConcepts = 5) {
    const existingList = existingNames.length > 0
        ? `\nEXISTING CONCEPTS (DO NOT extract these):\n${existingNames.join(', ')}\n`
        : '';
    return `You are a business knowledge graph curator. Analyze the following AI-generated text and identify distinct business concepts that are NOT already in the knowledge base.

TEXT TO ANALYZE:
"""
${aiOutput}
"""
${existingList}
VALID CATEGORIES: ${VALID_CATEGORIES.join(', ')}

RULES:
- Extract only well-defined business concepts (frameworks, methodologies, strategies, tools, processes).
- Do NOT extract generic terms (e.g., "business", "growth", "success") or proper nouns (company names, people).
- Do NOT extract concepts that are already in the existing concepts list above.
- Each concept must have a clear, specific definition of at least 10 words.
- Assign the most appropriate category from the valid categories list.
- Department tags should match the relevant departments: FINANCE, MARKETING, TECHNOLOGY, OPERATIONS, LEGAL, CREATIVE, STRATEGY, SALES.
- Extract at most ${maxConcepts} concepts. Prioritize the most specific and actionable ones.
- If no new concepts are found, return an empty array.

Return ONLY a valid JSON array (no markdown, no explanation):
[{"name": "Concept Name", "category": "Category", "definition": "A clear definition of the concept.", "departmentTags": ["STRATEGY", "FINANCE"]}]

If no new concepts found, return: []`;
}
/**
 * Parses the LLM response into extracted concept candidates.
 * Validates each candidate against known categories and minimum quality.
 */
function parseExtractionResponse(response) {
    try {
        // Extract outermost JSON array from response (greedy: first '[' to last ']')
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (!jsonMatch)
            return [];
        const parsed = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(parsed))
            return [];
        const validCategorySet = new Set(VALID_CATEGORIES);
        return parsed
            .filter((item) => typeof item === 'object' &&
            item !== null &&
            typeof item.name === 'string' &&
            typeof item.category === 'string' &&
            typeof item.definition === 'string')
            .filter((item) => {
            const name = item.name;
            const category = item.category;
            const definition = item.definition;
            // Validate category
            if (!validCategorySet.has(category))
                return false;
            // Validate minimum definition quality (10+ chars AND 3+ words)
            if (definition.length < 10)
                return false;
            if (definition.trim().split(/\s+/).length < 3)
                return false;
            // Validate name is not empty
            if (name.trim().length === 0)
                return false;
            return true;
        })
            .map((item) => ({
            name: item.name.trim(),
            category: item.category,
            definition: item.definition.trim(),
            departmentTags: Array.isArray(item.departmentTags)
                ? item.departmentTags.filter((t) => typeof t === 'string')
                : [],
        }));
    }
    catch {
        return [];
    }
}


/***/ }),
/* 116 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


/**
 * Brain Seeding Service (Story 3.2)
 *
 * Creates initial PENDING task Notes for a new user based on their department.
 * Seeds the Business Brain tree with concepts the user should explore.
 */
var BrainSeedingService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BrainSeedingService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const prisma_1 = __webpack_require__(34);
const cuid2_1 = __webpack_require__(32);
const department_categories_1 = __webpack_require__(117);
let BrainSeedingService = BrainSeedingService_1 = class BrainSeedingService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(BrainSeedingService_1.name);
        /** Max concepts to seed per category for owner initial run */
        this.OWNER_KEY_CONCEPTS_PER_CATEGORY = 4;
        /** Max total seed tasks for owner */
        this.OWNER_MAX_SEED_TOTAL = 40;
        /** Max total seed tasks for department user */
        this.DEPT_MAX_SEED_TOTAL = 30;
    }
    /**
     * Seeds PENDING task Notes for a new user.
     * Idempotent — skips if user already has pending tasks.
     *
     * For department users: seeds all concepts in visible categories.
     * For PLATFORM_OWNER / TENANT_OWNER: seeds foundation fully + key concepts per category.
     */
    async seedPendingTasksForUser(userId, tenantId, department, role) {
        // Idempotency guard: skip if user already has any concept task notes (any status)
        const existingCount = await this.prisma.note.count({
            where: {
                userId,
                tenantId,
                noteType: prisma_1.NoteType.TASK,
                conceptId: { not: null },
            },
        });
        if (existingCount > 0) {
            this.logger.log({
                message: 'Skipping brain seeding — user already has task notes',
                userId,
                tenantId,
                existingCount,
            });
            return { seeded: 0 };
        }
        const isOwner = role === 'PLATFORM_OWNER' || role === 'TENANT_OWNER' || !department;
        let conceptsToSeed;
        if (isOwner) {
            conceptsToSeed = await this.getOwnerSeedConcepts();
        }
        else {
            conceptsToSeed = await this.getDepartmentSeedConcepts(department, role);
        }
        if (conceptsToSeed.length === 0) {
            this.logger.warn({
                message: 'No concepts found for brain seeding',
                userId,
                tenantId,
                department,
            });
            return { seeded: 0 };
        }
        // Batch create PENDING task Notes
        const noteData = conceptsToSeed.map((concept) => ({
            id: `note_${(0, cuid2_1.createId)()}`,
            title: concept.name,
            content: `Istraži koncept: ${concept.name}`,
            source: prisma_1.NoteSource.ONBOARDING,
            noteType: prisma_1.NoteType.TASK,
            status: prisma_1.NoteStatus.PENDING,
            conceptId: concept.id,
            userId,
            tenantId,
        }));
        await this.prisma.note.createMany({ data: noteData });
        this.logger.log({
            message: 'Brain seeding complete',
            userId,
            tenantId,
            department,
            role,
            seeded: noteData.length,
            categories: [...new Set(conceptsToSeed.map((c) => c.category))],
        });
        return { seeded: noteData.length };
    }
    /**
     * Owner seed: foundation categories fully + key concepts per other category.
     */
    async getOwnerSeedConcepts() {
        // Seed all foundation concepts
        const foundationConcepts = await this.prisma.concept.findMany({
            where: {
                category: { in: [...department_categories_1.FOUNDATION_CATEGORIES] },
            },
            select: { id: true, name: true, category: true },
            orderBy: { sortOrder: 'asc' },
        });
        // Seed key concepts from other categories (first N per category)
        const otherCategories = department_categories_1.ALL_CATEGORIES.filter((c) => !department_categories_1.FOUNDATION_CATEGORIES.includes(c));
        // Single query for all non-foundation concepts, then slice per category client-side
        const allOtherConcepts = await this.prisma.concept.findMany({
            where: { category: { in: [...otherCategories] } },
            select: { id: true, name: true, category: true, sortOrder: true },
            orderBy: { sortOrder: 'asc' },
        });
        const otherConcepts = [];
        const seenPerCategory = new Map();
        for (const concept of allOtherConcepts) {
            const count = seenPerCategory.get(concept.category) ?? 0;
            if (count < this.OWNER_KEY_CONCEPTS_PER_CATEGORY) {
                otherConcepts.push({ id: concept.id, name: concept.name, category: concept.category });
                seenPerCategory.set(concept.category, count + 1);
            }
        }
        const combined = [...foundationConcepts, ...otherConcepts];
        return combined.slice(0, this.OWNER_MAX_SEED_TOTAL);
    }
    /**
     * Department seed: all concepts in visible categories (foundation + department).
     */
    async getDepartmentSeedConcepts(department, role) {
        const visibleCategories = (0, department_categories_1.getVisibleCategories)(department, role);
        if (!visibleCategories) {
            // No filter = owner path (shouldn't reach here but fallback)
            return this.getOwnerSeedConcepts();
        }
        const concepts = await this.prisma.concept.findMany({
            where: { category: { in: visibleCategories } },
            select: { id: true, name: true, category: true },
            orderBy: { sortOrder: 'asc' },
            take: this.DEPT_MAX_SEED_TOTAL,
        });
        return concepts;
    }
};
exports.BrainSeedingService = BrainSeedingService;
exports.BrainSeedingService = BrainSeedingService = BrainSeedingService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object])
], BrainSeedingService);


/***/ }),
/* 117 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


/**
 * Department → Obsidian Category Mapping (Story 3.2)
 *
 * Maps the Department enum to Serbian category names from the Obsidian vault.
 * Foundation categories are always visible to all users.
 * PLATFORM_OWNER / TENANT_OWNER (department = null) see all categories.
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DEPARTMENT_CATEGORY_MAP = exports.ALL_CATEGORIES = exports.FOUNDATION_CATEGORIES = void 0;
exports.getVisibleCategories = getVisibleCategories;
const prisma_1 = __webpack_require__(34);
/** Foundation categories — always visible regardless of department */
exports.FOUNDATION_CATEGORIES = ['Uvod u Poslovanje', 'Vrednost'];
/** All known categories from the Obsidian vault (excluding guide/skipped) */
exports.ALL_CATEGORIES = [
    'Uvod u Poslovanje',
    'Marketing',
    'Prodaja',
    'Vrednost',
    'Finansije',
    'Operacije',
    'Menadžment',
    'Preduzetništvo',
    'Digitalni Marketing',
    'Odnosi sa Klijentima',
    'Računovodstvo',
    'Tehnologija',
    'Inovacije',
    'Liderstvo',
    'Strategija',
    'Poslovni Modeli',
];
/**
 * Maps each Department enum value to its relevant Obsidian categories.
 * Foundation categories are added automatically — do NOT include them here.
 */
exports.DEPARTMENT_CATEGORY_MAP = {
    [prisma_1.Department.MARKETING]: ['Marketing', 'Digitalni Marketing'],
    [prisma_1.Department.FINANCE]: ['Finansije', 'Računovodstvo'],
    [prisma_1.Department.SALES]: ['Prodaja', 'Odnosi sa Klijentima'],
    [prisma_1.Department.OPERATIONS]: ['Operacije', 'Preduzetništvo', 'Menadžment'],
    [prisma_1.Department.TECHNOLOGY]: ['Tehnologija', 'Inovacije'],
    [prisma_1.Department.STRATEGY]: ['Strategija', 'Poslovni Modeli', 'Liderstvo'],
    [prisma_1.Department.LEGAL]: ['Menadžment'],
    [prisma_1.Department.CREATIVE]: ['Marketing', 'Digitalni Marketing'],
};
/**
 * Resolve visible categories for a user based on department and role.
 *
 * - PLATFORM_OWNER / TENANT_OWNER (department = null) → ALL categories
 * - Department user → foundation + department-specific categories
 */
function getVisibleCategories(department, role) {
    // Owner roles see everything — return null to signal "no filter"
    if (role === 'PLATFORM_OWNER' || role === 'TENANT_OWNER' || !department) {
        return null;
    }
    const deptCategories = exports.DEPARTMENT_CATEGORY_MAP[department] ?? [];
    // Deduplicate (foundation might overlap with dept categories)
    return [...new Set([...exports.FOUNDATION_CATEGORIES, ...deptCategories])];
}


/***/ }),
/* 118 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


/**
 * Business Context Service (Story 3.2)
 *
 * Aggregates ALL memories for a tenant (across all users and domains)
 * into a structured context block for injection into LLM system prompts.
 *
 * This is the "shared brain" — every concept execution receives the full
 * accumulated business knowledge, regardless of which user or department
 * created it.
 */
var BusinessContextService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BusinessContextService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
/** Approximate characters per token for estimation */
const CHARS_PER_TOKEN = 4;
/** Max tokens for the business context section in the system prompt.
 *  Reduced from 4000 to 1500 to fit within 8K context window models. */
const MAX_CONTEXT_TOKENS = 1500;
let BusinessContextService = BusinessContextService_1 = class BusinessContextService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(BusinessContextService_1.name);
    }
    /**
     * Loads and formats all business memories for a tenant.
     * Returns a structured text block ready for system prompt injection.
     *
     * Groups memories by type and includes attribution.
     * Truncates to ~4000 tokens.
     */
    async getBusinessContext(tenantId) {
        const memories = await this.prisma.memory.findMany({
            where: {
                tenantId,
                isDeleted: false,
            },
            select: {
                type: true,
                content: true,
                subject: true,
                userId: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 100, // Cap to prevent excessive load
        });
        if (memories.length === 0) {
            return '';
        }
        // Group by type
        const grouped = new Map();
        for (const mem of memories) {
            const key = mem.type;
            if (!grouped.has(key))
                grouped.set(key, []);
            grouped.get(key).push(mem);
        }
        // Build formatted context
        let context = '\n--- POSLOVNI KONTEKST (Business Brain Memorija) ---\n';
        let tokenCount = this.estimateTokens(context);
        const maxContentTokens = MAX_CONTEXT_TOKENS - 100;
        const typeLabels = {
            CLIENT_CONTEXT: 'Klijent',
            PROJECT_CONTEXT: 'Poslovni uvid',
            USER_PREFERENCE: 'Odluka',
            FACTUAL_STATEMENT: 'Poslovna činjenica',
        };
        for (const [type, mems] of grouped) {
            const label = typeLabels[type] || type;
            const sectionHeader = `\n[${label}]\n`;
            const headerTokens = this.estimateTokens(sectionHeader);
            if (tokenCount + headerTokens > maxContentTokens)
                break;
            context += sectionHeader;
            tokenCount += headerTokens;
            for (const mem of mems) {
                const subjectPart = mem.subject ? ` (${mem.subject})` : '';
                const line = `- ${mem.content}${subjectPart}\n`;
                const lineTokens = this.estimateTokens(line);
                if (tokenCount + lineTokens > maxContentTokens)
                    break;
                context += line;
                tokenCount += lineTokens;
            }
        }
        context += '--- KRAJ POSLOVNOG KONTEKSTA ---\n\n';
        context +=
            'Koristi ovaj kontekst da daš odgovore prilagođene specifičnom poslovanju korisnika. ';
        context += 'Referiši se na prethodne analize i odluke kada je relevantno.\n';
        this.logger.debug({
            message: 'Business context built',
            tenantId,
            memoriesIncluded: memories.length,
            estimatedTokens: this.estimateTokens(context),
        });
        return context;
    }
    estimateTokens(text) {
        return Math.ceil(text.length / CHARS_PER_TOKEN);
    }
};
exports.BusinessContextService = BusinessContextService;
exports.BusinessContextService = BusinessContextService = BusinessContextService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object])
], BusinessContextService);


/***/ }),
/* 119 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


/**
 * Concept Relevance Service (Story 3.3 AC5)
 *
 * Rule-based business relevance scoring for concept discovery.
 * DISTINCT from ConceptMatchingService (embedding-based vector similarity).
 *
 * Evaluates whether a candidate concept is relevant for a specific tenant
 * based on industry match, department alignment, relationship type, and prior activity.
 */
var ConceptRelevanceService_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConceptRelevanceService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const department_categories_1 = __webpack_require__(117);
/** Scoring weights */
const WEIGHTS = {
    INDUSTRY: 0.3,
    DEPARTMENT: 0.3,
    RELATIONSHIP: 0.25,
    PRIOR_ACTIVITY: 0.15,
};
/** Relationship type scores */
const RELATIONSHIP_SCORES = {
    PREREQUISITE: 1.0,
    RELATED: 0.6,
    ADVANCED: 0.2,
};
/**
 * Maps industries to relevant business concept categories.
 * Keywords in tenant industry string matched against category relevance.
 */
const INDUSTRY_CATEGORY_RELEVANCE = {
    digital: ['Digitalni Marketing', 'Tehnologija', 'Inovacije', 'Marketing'],
    tech: ['Tehnologija', 'Inovacije', 'Digitalni Marketing', 'Sistemi'],
    software: ['Tehnologija', 'Inovacije', 'Digitalni Marketing', 'Sistemi'],
    retail: ['Prodaja', 'Marketing', 'Odnosi sa Klijentima', 'Operacije'],
    ecommerce: ['Digitalni Marketing', 'Prodaja', 'Marketing', 'Tehnologija'],
    finance: ['Finansije', 'Računovodstvo', 'Strategija'],
    consulting: ['Strategija', 'Menadžment', 'Liderstvo', 'Odnosi sa Klijentima'],
    manufacturing: ['Operacije i Proizvodnja', 'Sistemi', 'Menadžment'],
    healthcare: ['Operacije', 'Menadžment', 'Ljudski Resursi'],
    education: ['Menadžment', 'Ljudski Resursi', 'Liderstvo'],
    marketing: ['Marketing', 'Digitalni Marketing', 'Prodaja'],
    services: ['Odnosi sa Klijentima', 'Prodaja', 'Marketing', 'Operacije'],
    startup: ['Preduzetništvo', 'Startup', 'Inovacije', 'Poslovni Modeli'],
    food: ['Operacije', 'Prodaja', 'Marketing', 'Finansije'],
    'real estate': ['Finansije', 'Prodaja', 'Strategija'],
    media: ['Marketing', 'Digitalni Marketing', 'Inovacije'],
};
let ConceptRelevanceService = ConceptRelevanceService_1 = class ConceptRelevanceService {
    constructor() {
        this.logger = new common_1.Logger(ConceptRelevanceService_1.name);
        /** Default relevance threshold */
        this.DEFAULT_THRESHOLD = 0.3;
        /** Lowered threshold for PLATFORM_OWNER (broader exploration) */
        this.OWNER_THRESHOLD = 0.15;
    }
    /**
     * Scores a concept's relevance for a specific tenant context.
     * Returns 0.0 - 1.0 where higher = more relevant.
     *
     * Foundation categories always return 1.0.
     */
    scoreRelevance(input) {
        const { conceptCategory, tenantIndustry, completedConceptIds, department, role: _role, relationshipType, } = input;
        // Foundation categories always pass
        if (department_categories_1.FOUNDATION_CATEGORIES.includes(conceptCategory)) {
            return 1.0;
        }
        // Strip number prefix for matching (e.g., "3. Marketing" → "Marketing")
        const strippedCategory = conceptCategory.replace(/^\d+\.\s*/, '').trim();
        if (department_categories_1.FOUNDATION_CATEGORIES.includes(strippedCategory)) {
            return 1.0;
        }
        let score = 0;
        // 1. Industry match (0.3 weight)
        const industryScore = this.scoreIndustryMatch(strippedCategory, tenantIndustry);
        score += industryScore * WEIGHTS.INDUSTRY;
        // 2. Department alignment (0.3 weight)
        const deptScore = this.scoreDepartmentMatch(strippedCategory, department);
        score += deptScore * WEIGHTS.DEPARTMENT;
        // 3. Relationship type (0.25 weight)
        if (relationshipType) {
            score += (RELATIONSHIP_SCORES[relationshipType] ?? 0.5) * WEIGHTS.RELATIONSHIP;
        }
        else {
            score += 0.5 * WEIGHTS.RELATIONSHIP; // Default: moderate
        }
        // 4. Prior activity (0.15 weight) — has tenant explored this DOMAIN before?
        // If completedCategories provided, check if user has explored this specific category
        // Falls back to global check if category data unavailable
        const hasDomainActivity = input.completedCategories
            ? input.completedCategories.has(strippedCategory) ||
                input.completedCategories.has(conceptCategory)
            : completedConceptIds.size > 0;
        score += (hasDomainActivity ? 0.8 : 0.3) * WEIGHTS.PRIOR_ACTIVITY;
        return Math.min(score, 1.0);
    }
    /**
     * Returns the appropriate threshold for a given role.
     */
    getThreshold(role) {
        if (role === 'PLATFORM_OWNER' || role === 'TENANT_OWNER') {
            return this.OWNER_THRESHOLD;
        }
        return this.DEFAULT_THRESHOLD;
    }
    /**
     * Scores industry-to-category match using keyword matching.
     */
    scoreIndustryMatch(category, tenantIndustry) {
        if (!tenantIndustry)
            return 0.5; // No industry info = neutral
        const industryLower = tenantIndustry.toLowerCase();
        // Check each industry keyword for matches
        for (const [keyword, categories] of Object.entries(INDUSTRY_CATEGORY_RELEVANCE)) {
            if (industryLower.includes(keyword)) {
                if (categories.includes(category)) {
                    return 1.0; // Direct match
                }
            }
        }
        // Universal categories that apply to any business
        const universalCategories = [
            'Menadžment',
            'Finansije',
            'Prodaja',
            'Marketing',
            'Strategija',
            'Liderstvo',
            'Poslovni Modeli',
        ];
        if (universalCategories.includes(category)) {
            return 0.6; // Broadly relevant
        }
        return 0.2; // Low relevance
    }
    /**
     * Scores department-to-category alignment.
     */
    scoreDepartmentMatch(category, department) {
        if (!department)
            return 0.7; // No department = owner, broadly relevant
        const deptCategories = department_categories_1.DEPARTMENT_CATEGORY_MAP[department];
        if (!deptCategories)
            return 0.5;
        if (deptCategories.includes(category)) {
            return 1.0; // Direct department match
        }
        return 0.3; // Not in department scope
    }
};
exports.ConceptRelevanceService = ConceptRelevanceService;
exports.ConceptRelevanceService = ConceptRelevanceService = ConceptRelevanceService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)()
], ConceptRelevanceService);


/***/ }),
/* 120 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var DepartmentGuard_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DepartmentGuard = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const department_categories_1 = __webpack_require__(117);
/**
 * Story 3.2: Department Fence Guard
 *
 * Validates that the requesting user has access to the resource based on
 * their department-to-category mapping. PLATFORM_OWNER and TENANT_OWNER
 * bypass all checks (getVisibleCategories returns null).
 *
 * Checks:
 * - Query param `category`: validates it's in the user's visible categories
 * - Route param `id` (conversation): looks up conversation's conceptId → concept.category
 * - Body `taskIds`: looks up each task's conceptId → concept.category
 */
let DepartmentGuard = DepartmentGuard_1 = class DepartmentGuard {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(DepartmentGuard_1.name);
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user)
            return true; // Let auth guards handle missing user
        const visibleCategories = (0, department_categories_1.getVisibleCategories)(user.department, user.role);
        if (visibleCategories === null)
            return true; // Owner — no filter
        const visibleSet = new Set(visibleCategories);
        // Check query param `category` (e.g., yolo:start-domain)
        const category = request.query?.category || request.body?.category;
        if (category && typeof category === 'string') {
            if (!visibleSet.has(category)) {
                this.logger.warn({
                    message: 'Department guard: category access denied',
                    userId: user.userId,
                    department: user.department,
                    requestedCategory: category,
                });
                throw new common_1.ForbiddenException({
                    type: 'department_access_denied',
                    title: 'Access Denied',
                    status: 403,
                    detail: 'You do not have access to this domain.',
                });
            }
        }
        // Check route param `id` (conversation endpoints)
        const conversationId = request.params?.id;
        if (conversationId) {
            const conversation = await this.prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { conceptId: true },
            });
            if (conversation?.conceptId) {
                const concept = await this.prisma.concept.findUnique({
                    where: { id: conversation.conceptId },
                    select: { category: true },
                });
                if (concept?.category && !visibleSet.has(concept.category)) {
                    this.logger.warn({
                        message: 'Department guard: conversation access denied',
                        userId: user.userId,
                        conversationId,
                        conceptCategory: concept.category,
                    });
                    throw new common_1.ForbiddenException({
                        type: 'department_access_denied',
                        title: 'Access Denied',
                        status: 403,
                        detail: 'You do not have access to this conversation.',
                    });
                }
            }
        }
        // Check body `taskIds` (workflow:run-agents)
        const taskIds = request.body?.taskIds;
        if (Array.isArray(taskIds) && taskIds.length > 0) {
            const tasks = await this.prisma.note.findMany({
                where: { id: { in: taskIds }, tenantId: user.tenantId },
                select: { conceptId: true },
            });
            const conceptIds = tasks.map((t) => t.conceptId).filter((id) => id !== null);
            if (conceptIds.length > 0) {
                const concepts = await this.prisma.concept.findMany({
                    where: { id: { in: conceptIds } },
                    select: { category: true },
                });
                const denied = concepts.find((c) => c.category && !visibleSet.has(c.category));
                if (denied) {
                    this.logger.warn({
                        message: 'Department guard: task access denied',
                        userId: user.userId,
                        deniedCategory: denied.category,
                    });
                    throw new common_1.ForbiddenException({
                        type: 'department_access_denied',
                        title: 'Access Denied',
                        status: 403,
                        detail: 'One or more tasks are outside your department scope.',
                    });
                }
            }
        }
        return true;
    }
};
exports.DepartmentGuard = DepartmentGuard;
exports.DepartmentGuard = DepartmentGuard = DepartmentGuard_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object])
], DepartmentGuard);


/***/ }),
/* 121 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c, _d, _e, _f;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.InvitationController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const invitation_service_1 = __webpack_require__(122);
const create_invitation_dto_1 = __webpack_require__(123);
const jwt_auth_guard_1 = __webpack_require__(45);
const roles_guard_1 = __webpack_require__(54);
const roles_decorator_1 = __webpack_require__(53);
const current_user_decorator_1 = __webpack_require__(47);
const jwt_strategy_1 = __webpack_require__(48);
let InvitationController = class InvitationController {
    constructor(invitationService) {
        this.invitationService = invitationService;
    }
    async createInvitation(dto, user, correlationId) {
        const result = await this.invitationService.createInvitation(dto, user.userId, user.tenantId);
        return {
            status: 'success',
            message: 'Invitation sent successfully',
            data: result,
            ...(correlationId && { correlationId }),
        };
    }
    async listInvitations(user, correlationId) {
        const invitations = await this.invitationService.getInvitationsByTenant(user.tenantId);
        return {
            status: 'success',
            data: invitations,
            ...(correlationId && { correlationId }),
        };
    }
    async validateToken(token, correlationId) {
        const invitation = await this.invitationService.validateInviteToken(token);
        return {
            status: 'success',
            data: {
                id: invitation.id,
                email: invitation.email,
                department: invitation.department,
                role: invitation.role,
                tenantName: invitation.tenant.name,
                expiresAt: invitation.expiresAt,
            },
            ...(correlationId && { correlationId }),
        };
    }
    async acceptInvitation(token, user, correlationId) {
        const result = await this.invitationService.acceptInvitation(token, user.userId, user.email);
        return {
            status: 'success',
            message: 'Invitation accepted. Welcome to the team!',
            data: result,
            ...(correlationId && { correlationId }),
        };
    }
    async revokeInvitation(invitationId, user, correlationId) {
        await this.invitationService.revokeInvitation(invitationId, user.tenantId);
        return {
            status: 'success',
            message: 'Invitation revoked',
            ...(correlationId && { correlationId }),
        };
    }
};
exports.InvitationController = InvitationController;
tslib_1.__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('TENANT_OWNER'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__param(1, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(2, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_b = typeof create_invitation_dto_1.CreateInvitationDto !== "undefined" && create_invitation_dto_1.CreateInvitationDto) === "function" ? _b : Object, typeof (_c = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _c : Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], InvitationController.prototype, "createInvitation", null);
tslib_1.__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('TENANT_OWNER', 'ADMIN'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_d = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _d : Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], InvitationController.prototype, "listInvitations", null);
tslib_1.__decorate([
    (0, common_1.Get)('validate/:token'),
    tslib_1.__param(0, (0, common_1.Param)('token')),
    tslib_1.__param(1, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String]),
    tslib_1.__metadata("design:returntype", Promise)
], InvitationController.prototype, "validateToken", null);
tslib_1.__decorate([
    (0, common_1.Post)('accept/:token'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, common_1.Param)('token')),
    tslib_1.__param(1, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(2, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, typeof (_e = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _e : Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], InvitationController.prototype, "acceptInvitation", null);
tslib_1.__decorate([
    (0, common_1.Post)(':id/revoke'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('TENANT_OWNER'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, common_1.Param)('id')),
    tslib_1.__param(1, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(2, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, typeof (_f = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _f : Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], InvitationController.prototype, "revokeInvitation", null);
exports.InvitationController = InvitationController = tslib_1.__decorate([
    (0, common_1.Controller)('invitations'),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof invitation_service_1.InvitationService !== "undefined" && invitation_service_1.InvitationService) === "function" ? _a : Object])
], InvitationController);


/***/ }),
/* 122 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var InvitationService_1;
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.InvitationService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const tenant_context_1 = __webpack_require__(9);
const utils_1 = __webpack_require__(29);
const prisma_1 = __webpack_require__(34);
const email_1 = __webpack_require__(60);
const brain_seeding_service_1 = __webpack_require__(116);
let InvitationService = InvitationService_1 = class InvitationService {
    constructor(prisma, emailService, configService, brainSeedingService) {
        this.prisma = prisma;
        this.emailService = emailService;
        this.configService = configService;
        this.brainSeedingService = brainSeedingService;
        this.logger = new common_1.Logger(InvitationService_1.name);
        this.maxTeamMembers = this.configService.get('MAX_TEAM_MEMBERS', 5);
        this.appUrl = this.configService.get('FRONTEND_URL', 'http://localhost:4200');
    }
    async checkUserLimit(tenantId) {
        const [activeUsers, pendingInvitations] = await Promise.all([
            this.prisma.user.count({ where: { tenantId } }),
            this.prisma.invitation.count({
                where: {
                    tenantId,
                    status: prisma_1.InvitationStatus.PENDING,
                    expiresAt: { gt: new Date() },
                },
            }),
        ]);
        const currentCount = activeUsers + pendingInvitations;
        return {
            allowed: currentCount < this.maxTeamMembers,
            currentCount,
            limit: this.maxTeamMembers,
        };
    }
    async createInvitation(dto, inviterId, tenantId) {
        const normalizedEmail = dto.email.toLowerCase();
        // Check user limit
        const limitCheck = await this.checkUserLimit(tenantId);
        if (!limitCheck.allowed) {
            throw new common_1.ForbiddenException({
                type: 'user_limit_reached',
                title: 'User Limit Reached',
                status: 403,
                detail: 'User limit reached. Upgrade your plan to add more team members.',
                currentCount: limitCheck.currentCount,
                limit: limitCheck.limit,
            });
        }
        // Check for duplicate pending invitation
        const existingInvitation = await this.prisma.invitation.findFirst({
            where: {
                email: normalizedEmail,
                tenantId,
                status: prisma_1.InvitationStatus.PENDING,
                expiresAt: { gt: new Date() },
            },
        });
        if (existingInvitation) {
            throw new common_1.ConflictException({
                type: 'duplicate_invitation',
                title: 'Duplicate Invitation',
                status: 409,
                detail: 'A pending invitation already exists for this email address in your workspace.',
            });
        }
        // Check if email is already a member of the tenant
        const existingMember = await this.prisma.user.findFirst({
            where: { email: normalizedEmail, tenantId },
        });
        if (existingMember) {
            throw new common_1.ConflictException({
                type: 'already_member',
                title: 'Already a Member',
                status: 409,
                detail: 'This user is already a member of your workspace.',
            });
        }
        const invitationId = (0, utils_1.generateInvitationId)();
        const token = (0, utils_1.generateInviteToken)();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        const invitation = await this.prisma.invitation.create({
            data: {
                id: invitationId,
                email: normalizedEmail,
                department: dto.department,
                status: prisma_1.InvitationStatus.PENDING,
                token,
                expiresAt,
                tenantId,
                invitedById: inviterId,
            },
        });
        // Send invitation email
        const inviter = await this.prisma.user.findUnique({
            where: { id: inviterId },
            select: { name: true, email: true },
        });
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true },
        });
        const inviteLink = `${this.appUrl}/invite/${token}`;
        const emailResult = await this.emailService.sendInvitationEmail({
            to: normalizedEmail,
            inviterName: inviter?.name ?? inviter?.email ?? 'A team member',
            tenantName: tenant?.name ?? 'Your workspace',
            inviteLink,
            department: dto.department,
        });
        if (!emailResult.success) {
            this.logger.warn(`Failed to send invitation email to ${normalizedEmail} for tenant ${tenantId}`);
        }
        return {
            id: invitation.id,
            email: invitation.email,
            department: invitation.department,
            status: invitation.status,
            token: invitation.token,
            expiresAt: invitation.expiresAt,
            tenantId: invitation.tenantId,
            invitedById: invitation.invitedById,
            createdAt: invitation.createdAt,
        };
    }
    async getInvitationsByTenant(tenantId) {
        return this.prisma.invitation.findMany({
            where: { tenantId },
            include: {
                tenant: { select: { name: true } },
                invitedBy: { select: { email: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async getPendingInvitations(tenantId) {
        const now = new Date();
        // Auto-expire stale invitations
        await this.prisma.invitation.updateMany({
            where: {
                tenantId,
                status: prisma_1.InvitationStatus.PENDING,
                expiresAt: { lt: now },
            },
            data: { status: prisma_1.InvitationStatus.EXPIRED },
        });
        return this.prisma.invitation.findMany({
            where: {
                tenantId,
                status: prisma_1.InvitationStatus.PENDING,
                expiresAt: { gt: now },
            },
            include: {
                tenant: { select: { name: true } },
                invitedBy: { select: { email: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async validateInviteToken(token) {
        const invitation = await this.prisma.invitation.findUnique({
            where: { token },
            include: {
                tenant: { select: { name: true } },
                invitedBy: { select: { email: true, name: true } },
            },
        });
        if (!invitation) {
            throw new common_1.NotFoundException({
                type: 'invitation_not_found',
                title: 'Invitation Not Found',
                status: 404,
                detail: 'This invitation link is invalid.',
            });
        }
        if (invitation.status === prisma_1.InvitationStatus.REVOKED) {
            throw new common_1.GoneException({
                type: 'invitation_revoked',
                title: 'Invitation Revoked',
                status: 410,
                detail: 'This invitation has been revoked. Please request a new invite.',
            });
        }
        if (invitation.status === prisma_1.InvitationStatus.EXPIRED || invitation.expiresAt < new Date()) {
            // Auto-update status if expired
            if (invitation.status === prisma_1.InvitationStatus.PENDING) {
                await this.prisma.invitation.update({
                    where: { id: invitation.id },
                    data: { status: prisma_1.InvitationStatus.EXPIRED },
                });
            }
            throw new common_1.GoneException({
                type: 'invitation_expired',
                title: 'Invitation Expired',
                status: 410,
                detail: 'This invitation has expired. Please request a new invite.',
            });
        }
        if (invitation.status === prisma_1.InvitationStatus.ACCEPTED) {
            throw new common_1.ConflictException({
                type: 'invitation_already_accepted',
                title: 'Already Accepted',
                status: 409,
                detail: 'This invitation has already been accepted.',
            });
        }
        return invitation;
    }
    async acceptInvitation(token, userId, userEmail) {
        const invitation = await this.validateInviteToken(token);
        // Use transaction for atomicity
        const result = await this.prisma.$transaction(async (tx) => {
            // Check if user already belongs to this tenant
            const existingUser = await tx.user.findFirst({
                where: { email: userEmail.toLowerCase(), tenantId: invitation.tenantId },
            });
            if (existingUser) {
                // User already a member, just mark invitation accepted
                await tx.invitation.update({
                    where: { id: invitation.id },
                    data: {
                        status: prisma_1.InvitationStatus.ACCEPTED,
                        acceptedByUserId: existingUser.id,
                    },
                });
                return {
                    tenantId: invitation.tenantId,
                    role: existingUser.role,
                    department: invitation.department,
                    isNewMember: false,
                };
            }
            // Add user to the invited tenant with department from invitation
            await tx.user.update({
                where: { id: userId },
                data: {
                    tenantId: invitation.tenantId,
                    role: invitation.role,
                    department: invitation.department,
                },
            });
            await tx.invitation.update({
                where: { id: invitation.id },
                data: {
                    status: prisma_1.InvitationStatus.ACCEPTED,
                    acceptedByUserId: userId,
                },
            });
            return {
                tenantId: invitation.tenantId,
                role: invitation.role,
                department: invitation.department,
                isNewMember: true,
            };
        });
        // Story 3.2: Seed pending tasks for new team member (fire-and-forget)
        if (result.isNewMember) {
            this.brainSeedingService
                .seedPendingTasksForUser(userId, result.tenantId, result.department, result.role)
                .catch((err) => {
                this.logger.warn({
                    message: 'Brain seeding failed after invitation acceptance',
                    userId,
                    tenantId: result.tenantId,
                    error: err?.message,
                });
            });
        }
        return {
            tenantId: result.tenantId,
            role: result.role,
            department: result.department,
        };
    }
    async revokeInvitation(invitationId, tenantId) {
        const invitation = await this.prisma.invitation.findUnique({
            where: { id: invitationId },
        });
        if (!invitation) {
            throw new common_1.NotFoundException({
                type: 'invitation_not_found',
                title: 'Invitation Not Found',
                status: 404,
                detail: 'The specified invitation was not found.',
            });
        }
        if (invitation.tenantId !== tenantId) {
            throw new common_1.ForbiddenException({
                type: 'invitation_access_denied',
                title: 'Access Denied',
                status: 403,
                detail: 'You do not have permission to revoke this invitation.',
            });
        }
        if (invitation.status !== prisma_1.InvitationStatus.PENDING) {
            throw new common_1.ConflictException({
                type: 'invitation_not_pending',
                title: 'Cannot Revoke',
                status: 409,
                detail: `Cannot revoke invitation with status: ${invitation.status}`,
            });
        }
        await this.prisma.invitation.update({
            where: { id: invitationId },
            data: { status: prisma_1.InvitationStatus.REVOKED },
        });
    }
};
exports.InvitationService = InvitationService;
exports.InvitationService = InvitationService = InvitationService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object, typeof (_b = typeof email_1.EmailService !== "undefined" && email_1.EmailService) === "function" ? _b : Object, typeof (_c = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _c : Object, typeof (_d = typeof brain_seeding_service_1.BrainSeedingService !== "undefined" && brain_seeding_service_1.BrainSeedingService) === "function" ? _d : Object])
], InvitationService);


/***/ }),
/* 123 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateInvitationDto = void 0;
const tslib_1 = __webpack_require__(4);
const class_validator_1 = __webpack_require__(37);
const prisma_1 = __webpack_require__(34);
class CreateInvitationDto {
}
exports.CreateInvitationDto = CreateInvitationDto;
tslib_1.__decorate([
    (0, class_validator_1.IsEmail)({}, { message: 'Please provide a valid email address' }),
    tslib_1.__metadata("design:type", String)
], CreateInvitationDto.prototype, "email", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsEnum)(prisma_1.Department, { message: 'Department must be one of: FINANCE, MARKETING, TECHNOLOGY, OPERATIONS, LEGAL, CREATIVE' }),
    tslib_1.__metadata("design:type", typeof (_a = typeof prisma_1.Department !== "undefined" && prisma_1.Department) === "function" ? _a : Object)
], CreateInvitationDto.prototype, "department", void 0);


/***/ }),
/* 124 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TeamModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const email_1 = __webpack_require__(60);
const tenant_context_1 = __webpack_require__(9);
const auth_module_1 = __webpack_require__(40);
const team_controller_1 = __webpack_require__(125);
const team_service_1 = __webpack_require__(126);
let TeamModule = class TeamModule {
};
exports.TeamModule = TeamModule;
exports.TeamModule = TeamModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, email_1.EmailModule, auth_module_1.AuthModule, tenant_context_1.TenantModule], // TenantModule provides PlatformPrismaService
        controllers: [team_controller_1.TeamController],
        providers: [team_service_1.TeamService],
        exports: [team_service_1.TeamService],
    })
], TeamModule);


/***/ }),
/* 125 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TeamController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const team_service_1 = __webpack_require__(126);
const remove_member_dto_1 = __webpack_require__(127);
const designate_backup_owner_dto_1 = __webpack_require__(128);
const jwt_auth_guard_1 = __webpack_require__(45);
const roles_guard_1 = __webpack_require__(54);
const mfa_required_guard_1 = __webpack_require__(58);
const roles_decorator_1 = __webpack_require__(53);
const current_user_decorator_1 = __webpack_require__(47);
const jwt_strategy_1 = __webpack_require__(48);
let TeamController = class TeamController {
    constructor(teamService) {
        this.teamService = teamService;
    }
    async getMembers(user, correlationId) {
        const members = await this.teamService.getTeamMembers(user.tenantId);
        return {
            status: 'success',
            data: members,
            ...(correlationId && { correlationId }),
        };
    }
    async removeMember(memberId, dto, user, correlationId) {
        await this.teamService.removeMember(memberId, user.tenantId, user.userId, dto.strategy);
        return {
            status: 'success',
            data: null,
            message: 'Member removed',
            ...(correlationId && { correlationId }),
        };
    }
    async getBackupOwner(user, correlationId) {
        const backupOwner = await this.teamService.getBackupOwner(user.tenantId);
        return {
            status: 'success',
            data: backupOwner,
            ...(correlationId && { correlationId }),
        };
    }
    async getEligibleBackupOwners(user, correlationId) {
        const eligible = await this.teamService.getEligibleBackupOwners(user.tenantId);
        return {
            status: 'success',
            data: eligible,
            ...(correlationId && { correlationId }),
        };
    }
    async designateBackupOwner(dto, user, correlationId) {
        const result = await this.teamService.designateBackupOwner(user.tenantId, dto.backupOwnerId, user.userId);
        return {
            status: 'success',
            data: result,
            message: 'Backup owner designated',
            ...(correlationId && { correlationId }),
        };
    }
    async removeBackupDesignation(user, correlationId) {
        await this.teamService.removeBackupDesignation(user.tenantId);
        return {
            status: 'success',
            data: null,
            message: 'Backup owner removed',
            ...(correlationId && { correlationId }),
        };
    }
    async initiateRecovery(user, req, correlationId) {
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.ip ||
            'unknown';
        const result = await this.teamService.initiateRecovery(user.tenantId, user.userId, ipAddress);
        return {
            status: 'success',
            data: { recoveredUserId: result.recoveredUserId },
            message: result.message,
            ...(correlationId && { correlationId }),
        };
    }
    async getBackupOwnerStatus(user, correlationId) {
        const status = await this.teamService.getBackupOwnerStatus(user.tenantId);
        return {
            status: 'success',
            data: status,
            ...(correlationId && { correlationId }),
        };
    }
};
exports.TeamController = TeamController;
tslib_1.__decorate([
    (0, common_1.Get)('members'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('TENANT_OWNER', 'ADMIN'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_b = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _b : Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], TeamController.prototype, "getMembers", null);
tslib_1.__decorate([
    (0, common_1.Post)('members/:id/remove'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('TENANT_OWNER'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, common_1.Param)('id')),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__param(2, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(3, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, typeof (_c = typeof remove_member_dto_1.RemoveMemberDto !== "undefined" && remove_member_dto_1.RemoveMemberDto) === "function" ? _c : Object, typeof (_d = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _d : Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], TeamController.prototype, "removeMember", null);
tslib_1.__decorate([
    (0, common_1.Get)('backup-owner'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('TENANT_OWNER'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_e = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _e : Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], TeamController.prototype, "getBackupOwner", null);
tslib_1.__decorate([
    (0, common_1.Get)('backup-owner/eligible'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('TENANT_OWNER'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_f = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _f : Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], TeamController.prototype, "getEligibleBackupOwners", null);
tslib_1.__decorate([
    (0, common_1.Post)('backup-owner'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('TENANT_OWNER'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__param(1, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(2, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_g = typeof designate_backup_owner_dto_1.DesignateBackupOwnerDto !== "undefined" && designate_backup_owner_dto_1.DesignateBackupOwnerDto) === "function" ? _g : Object, typeof (_h = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _h : Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], TeamController.prototype, "designateBackupOwner", null);
tslib_1.__decorate([
    (0, common_1.Delete)('backup-owner'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('TENANT_OWNER'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_j = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _j : Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], TeamController.prototype, "removeBackupDesignation", null);
tslib_1.__decorate([
    (0, common_1.Post)('backup-owner/recovery'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, mfa_required_guard_1.MfaRequiredGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Req)()),
    tslib_1.__param(2, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_k = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _k : Object, Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], TeamController.prototype, "initiateRecovery", null);
tslib_1.__decorate([
    (0, common_1.Get)('backup-owner/status'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('TENANT_OWNER', 'ADMIN'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_l = typeof jwt_strategy_1.CurrentUserPayload !== "undefined" && jwt_strategy_1.CurrentUserPayload) === "function" ? _l : Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], TeamController.prototype, "getBackupOwnerStatus", null);
exports.TeamController = TeamController = tslib_1.__decorate([
    (0, common_1.Controller)('team'),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof team_service_1.TeamService !== "undefined" && team_service_1.TeamService) === "function" ? _a : Object])
], TeamController);


/***/ }),
/* 126 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var TeamService_1;
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TeamService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const email_1 = __webpack_require__(60);
let TeamService = TeamService_1 = class TeamService {
    constructor(prisma, emailService) {
        this.prisma = prisma;
        this.emailService = emailService;
        this.logger = new common_1.Logger(TeamService_1.name);
    }
    async getTeamMembers(tenantId) {
        const users = await this.prisma.user.findMany({
            where: { tenantId, isActive: true },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
                invitationAccepted: {
                    select: { department: true },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
        return users.map((user) => ({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            department: user.invitationAccepted?.department ?? null,
            createdAt: user.createdAt,
        }));
    }
    async getMemberById(memberId, tenantId) {
        const user = await this.prisma.user.findFirst({
            where: { id: memberId, tenantId, isActive: true },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
                invitationAccepted: {
                    select: { department: true },
                },
            },
        });
        if (!user) {
            throw new common_1.NotFoundException({
                type: 'member_not_found',
                title: 'Member Not Found',
                status: 404,
                detail: 'The specified team member was not found.',
            });
        }
        return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            department: user.invitationAccepted?.department ?? null,
            createdAt: user.createdAt,
        };
    }
    async removeMember(memberId, tenantId, ownerId, strategy) {
        // Verify member exists and belongs to tenant
        const member = await this.prisma.user.findFirst({
            where: { id: memberId, tenantId, isActive: true },
            select: { id: true, email: true, name: true, role: true },
        });
        if (!member) {
            throw new common_1.NotFoundException({
                type: 'member_not_found',
                title: 'Member Not Found',
                status: 404,
                detail: 'The specified team member was not found.',
            });
        }
        // Self-removal prevention (AC4)
        if (memberId === ownerId) {
            // Check if this is the only owner
            const ownerCount = await this.prisma.user.count({
                where: {
                    tenantId,
                    role: 'TENANT_OWNER',
                    isActive: true,
                },
            });
            if (ownerCount <= 1) {
                throw new common_1.ForbiddenException({
                    type: 'self_removal_denied',
                    title: 'Cannot Remove Yourself',
                    status: 403,
                    detail: 'You cannot remove yourself. Designate a backup Owner first.',
                });
            }
        }
        // Soft delete in a transaction
        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: memberId },
                data: {
                    isActive: false,
                    removedAt: new Date(),
                    removedById: ownerId,
                    removalReason: strategy,
                },
            });
            // Future: reassign notes/conversations when those models exist
        });
        // Send removal notification email AFTER transaction commits (per dev notes)
        const owner = await this.prisma.user.findUnique({
            where: { id: ownerId },
            select: { email: true },
        });
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true },
        });
        const emailResult = await this.emailService.sendRemovalNotificationEmail({
            to: member.email,
            memberName: member.name ?? '',
            tenantName: tenant?.name ?? 'Your workspace',
            strategy,
            contactEmail: owner?.email,
        });
        if (!emailResult.success) {
            this.logger.warn(`Failed to send removal notification to ${member.email} for tenant ${tenantId}`);
        }
        this.logger.log(`Member ${memberId} removed from tenant ${tenantId} by ${ownerId} with strategy ${strategy}`);
        return { removedUserId: memberId, strategy };
    }
    async getBackupOwner(tenantId) {
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            include: {
                backupOwner: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        isActive: true,
                    },
                },
            },
        });
        if (!tenant?.backupOwner ||
            !tenant.backupOwner.isActive ||
            !tenant.backupOwnerDesignatedAt) {
            return null;
        }
        return {
            id: tenant.backupOwner.id,
            email: tenant.backupOwner.email,
            name: tenant.backupOwner.name,
            designatedAt: tenant.backupOwnerDesignatedAt.toISOString(),
        };
    }
    async getEligibleBackupOwners(tenantId) {
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { backupOwnerId: true },
        });
        const users = await this.prisma.user.findMany({
            where: {
                tenantId,
                isActive: true,
                role: { not: 'TENANT_OWNER' },
                ...(tenant?.backupOwnerId
                    ? { id: { not: tenant.backupOwnerId } }
                    : {}),
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
                invitationAccepted: {
                    select: { department: true },
                },
            },
            orderBy: { name: 'asc' },
        });
        return users.map((user) => ({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            department: user.invitationAccepted?.department ?? null,
            createdAt: user.createdAt,
        }));
    }
    async designateBackupOwner(tenantId, backupOwnerId, designatedById) {
        const now = new Date();
        // Validate and designate in a transaction to prevent TOCTOU race
        const candidate = await this.prisma.$transaction(async (tx) => {
            // Verify candidate exists, is active, belongs to tenant
            const user = await tx.user.findFirst({
                where: { id: backupOwnerId, tenantId, isActive: true },
                select: { id: true, email: true, name: true, role: true },
            });
            if (!user) {
                throw new common_1.NotFoundException({
                    type: 'member_not_found',
                    title: 'Member Not Found',
                    status: 404,
                    detail: 'The specified team member was not found or is inactive.',
                });
            }
            // Prevent TENANT_OWNER from being backup owner
            if (user.role === 'TENANT_OWNER') {
                throw new common_1.BadRequestException({
                    type: 'invalid_backup_candidate',
                    title: 'Invalid Backup Owner Candidate',
                    status: 400,
                    detail: 'A Tenant Owner cannot be designated as backup owner. Choose an Admin or Member.',
                });
            }
            // Update tenant with backup owner
            await tx.tenant.update({
                where: { id: tenantId },
                data: {
                    backupOwnerId: user.id,
                    backupOwnerDesignatedAt: now,
                },
            });
            return user;
        });
        // Send email notification AFTER transaction commits
        const designator = await this.prisma.user.findUnique({
            where: { id: designatedById },
            select: { name: true, email: true },
        });
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true },
        });
        const emailResult = await this.emailService.sendBackupOwnerDesignationEmail({
            to: candidate.email,
            tenantName: tenant?.name ?? 'Your workspace',
            designatedBy: designator?.name ?? designator?.email ?? 'Workspace Owner',
            designatedName: candidate.name ?? '',
        });
        if (!emailResult.success) {
            this.logger.warn(`Failed to send backup owner designation email to ${candidate.email} for tenant ${tenantId}`);
        }
        this.logger.log(`Backup owner designated: ${candidate.id} for tenant ${tenantId} by ${designatedById}`);
        return {
            id: candidate.id,
            email: candidate.email,
            name: candidate.name,
            designatedAt: now.toISOString(),
        };
    }
    async removeBackupDesignation(tenantId) {
        await this.prisma.tenant.update({
            where: { id: tenantId },
            data: {
                backupOwnerId: null,
                backupOwnerDesignatedAt: null,
            },
        });
        this.logger.log(`Backup owner designation removed for tenant ${tenantId}`);
    }
    async initiateRecovery(tenantId, backupOwnerId, ipAddress) {
        // Verify caller IS the designated backup owner AND is still active
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                backupOwnerId: true,
                name: true,
                backupOwner: {
                    select: { isActive: true },
                },
            },
        });
        if (!tenant ||
            tenant.backupOwnerId !== backupOwnerId ||
            !tenant.backupOwner?.isActive) {
            throw new common_1.ForbiddenException({
                type: 'not_backup_owner',
                title: 'Not Authorized',
                status: 403,
                detail: 'You are not the designated backup owner for this workspace.',
            });
        }
        // Find the primary owner
        const primaryOwner = await this.prisma.user.findFirst({
            where: { tenantId, role: 'TENANT_OWNER', isActive: true },
            select: { id: true, email: true, name: true },
        });
        if (!primaryOwner) {
            throw new common_1.NotFoundException({
                type: 'owner_not_found',
                title: 'Owner Not Found',
                status: 404,
                detail: 'Could not find the primary owner for this workspace.',
            });
        }
        // Reset primary owner's 2FA
        await this.prisma.user.update({
            where: { id: primaryOwner.id },
            data: {
                mfaEnabled: false,
                mfaSecret: null,
                failedLoginAttempts: 0,
                lockoutUntil: null,
            },
        });
        // Send recovery notification email AFTER DB update
        const backupOwner = await this.prisma.user.findUnique({
            where: { id: backupOwnerId },
            select: { name: true },
        });
        const emailResult = await this.emailService.sendRecoveryNotificationEmail({
            to: primaryOwner.email,
            ownerName: primaryOwner.name ?? '',
            tenantName: tenant.name ?? 'Your workspace',
            backupOwnerName: backupOwner?.name ?? 'Backup Owner',
            recoveryTimestamp: new Date(),
            ipAddress,
        });
        if (!emailResult.success) {
            this.logger.warn(`Failed to send recovery notification to ${primaryOwner.email} for tenant ${tenantId}`);
        }
        this.logger.log(`Recovery initiated for tenant ${tenantId} by backup owner ${backupOwnerId} from IP ${ipAddress}`);
        return {
            recoveredUserId: primaryOwner.id,
            message: 'Recovery completed. Primary owner 2FA has been reset.',
        };
    }
    async getBackupOwnerStatus(tenantId) {
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                createdAt: true,
                backupOwnerId: true,
                backupOwner: {
                    select: { isActive: true },
                },
            },
        });
        if (!tenant) {
            throw new common_1.NotFoundException({
                type: 'tenant_not_found',
                title: 'Tenant Not Found',
                status: 404,
                detail: 'The specified tenant was not found.',
            });
        }
        const hasBackupOwner = !!tenant.backupOwnerId && !!tenant.backupOwner?.isActive;
        const tenantAgeDays = Math.floor((Date.now() - tenant.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const showWarning = !hasBackupOwner && tenantAgeDays >= 30;
        return { hasBackupOwner, tenantAgeDays, showWarning };
    }
};
exports.TeamService = TeamService;
exports.TeamService = TeamService = TeamService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object, typeof (_b = typeof email_1.EmailService !== "undefined" && email_1.EmailService) === "function" ? _b : Object])
], TeamService);


/***/ }),
/* 127 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RemoveMemberDto = void 0;
const tslib_1 = __webpack_require__(4);
const class_validator_1 = __webpack_require__(37);
class RemoveMemberDto {
}
exports.RemoveMemberDto = RemoveMemberDto;
tslib_1.__decorate([
    (0, class_validator_1.IsIn)(['REASSIGN', 'ARCHIVE'], {
        message: 'Strategy must be one of: REASSIGN, ARCHIVE',
    }),
    tslib_1.__metadata("design:type", String)
], RemoveMemberDto.prototype, "strategy", void 0);


/***/ }),
/* 128 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DesignateBackupOwnerDto = void 0;
const tslib_1 = __webpack_require__(4);
const class_validator_1 = __webpack_require__(37);
class DesignateBackupOwnerDto {
}
exports.DesignateBackupOwnerDto = DesignateBackupOwnerDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)({ message: 'backupOwnerId must be a string' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'backupOwnerId is required' }),
    tslib_1.__metadata("design:type", String)
], DesignateBackupOwnerDto.prototype, "backupOwnerId", void 0);


/***/ }),
/* 129 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConversationModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const tenant_context_1 = __webpack_require__(9);
const auth_module_1 = __webpack_require__(40);
const ai_gateway_module_1 = __webpack_require__(87);
const notes_module_1 = __webpack_require__(130);
const knowledge_module_1 = __webpack_require__(72);
const memory_module_1 = __webpack_require__(134);
const workflow_module_1 = __webpack_require__(142);
const web_search_module_1 = __webpack_require__(143);
const conversation_controller_1 = __webpack_require__(147);
const conversation_service_1 = __webpack_require__(148);
const conversation_gateway_1 = __webpack_require__(151);
let ConversationModule = class ConversationModule {
};
exports.ConversationModule = ConversationModule;
exports.ConversationModule = ConversationModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, auth_module_1.AuthModule, ai_gateway_module_1.AiGatewayModule, tenant_context_1.TenantModule, notes_module_1.NotesModule, knowledge_module_1.KnowledgeModule, memory_module_1.MemoryModule, workflow_module_1.WorkflowModule, web_search_module_1.WebSearchModule],
        controllers: [conversation_controller_1.ConversationController],
        providers: [conversation_service_1.ConversationService, conversation_gateway_1.ConversationGateway],
        exports: [conversation_service_1.ConversationService],
    })
], ConversationModule);


/***/ }),
/* 130 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.NotesModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const auth_module_1 = __webpack_require__(40);
const ai_gateway_module_1 = __webpack_require__(87);
const notes_service_1 = __webpack_require__(131);
const notes_controller_1 = __webpack_require__(132);
/**
 * Module for managing user notes.
 * Provides note creation, storage, and retrieval for AI-generated content.
 */
let NotesModule = class NotesModule {
};
exports.NotesModule = NotesModule;
exports.NotesModule = NotesModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [
            tenant_context_1.TenantModule, // Provides PlatformPrismaService
            auth_module_1.AuthModule, // For JwtAuthGuard
            ai_gateway_module_1.AiGatewayModule, // For AI scoring
        ],
        controllers: [notes_controller_1.NotesController],
        providers: [notes_service_1.NotesService],
        exports: [notes_service_1.NotesService],
    })
], NotesModule);


/***/ }),
/* 131 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var NotesService_1;
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.NotesService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const cuid2_1 = __webpack_require__(32);
const tenant_context_1 = __webpack_require__(9);
const prisma_1 = __webpack_require__(34);
const ai_gateway_service_1 = __webpack_require__(88);
/**
 * Service for managing user notes.
 * Provides CRUD operations for notes created from AI outputs and manual entry.
 */
let NotesService = NotesService_1 = class NotesService {
    constructor(prisma, aiGateway) {
        this.prisma = prisma;
        this.aiGateway = aiGateway;
        this.logger = new common_1.Logger(NotesService_1.name);
    }
    /**
     * Creates a new note.
     *
     * @param dto - Note creation data
     * @returns The created note with its ID
     */
    async createNote(dto) {
        const id = `note_${(0, cuid2_1.createId)()}`;
        this.logger.log({
            message: 'Creating note',
            noteId: id,
            userId: dto.userId,
            tenantId: dto.tenantId,
            source: dto.source,
            titleLength: dto.title.length,
            contentLength: dto.content.length,
        });
        await this.prisma.note.create({
            data: {
                id,
                title: dto.title,
                content: dto.content,
                source: dto.source,
                noteType: dto.noteType ?? prisma_1.NoteType.NOTE,
                status: dto.noteType === prisma_1.NoteType.TASK ? (dto.status ?? prisma_1.NoteStatus.PENDING) : null,
                conversationId: dto.conversationId ?? null,
                conceptId: dto.conceptId ?? null,
                messageId: dto.messageId ?? null,
                userId: dto.userId,
                tenantId: dto.tenantId,
                parentNoteId: dto.parentNoteId ?? null,
                expectedOutcome: dto.expectedOutcome ?? null,
                workflowStepNumber: dto.workflowStepNumber ?? null,
            },
        });
        this.logger.log({
            message: 'Note created successfully',
            noteId: id,
            userId: dto.userId,
            tenantId: dto.tenantId,
        });
        return { id };
    }
    /**
     * Gets a note by ID.
     *
     * @param noteId - The note ID to retrieve
     * @param tenantId - The tenant ID for authorization
     * @returns The note or null if not found
     */
    async getNoteById(noteId, tenantId) {
        return this.prisma.note.findFirst({
            where: {
                id: noteId,
                tenantId,
            },
        });
    }
    /**
     * Gets all notes for a user.
     *
     * @param userId - The user ID
     * @param tenantId - The tenant ID
     * @returns Array of notes for the user
     */
    async getNotesByUser(userId, tenantId) {
        return this.prisma.note.findMany({
            where: {
                userId,
                tenantId,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }
    /**
     * Gets the most recent note for a user filtered by source.
     */
    async getLatestNoteBySource(userId, tenantId, source) {
        return this.prisma.note.findFirst({
            where: { userId, tenantId, source },
            orderBy: { createdAt: 'desc' },
        });
    }
    /**
     * Gets top-level notes for a conversation, with children included.
     */
    async getByConversation(conversationId, userId, tenantId) {
        const notes = await this.prisma.note.findMany({
            where: { conversationId, userId, tenantId, parentNoteId: null },
            include: {
                children: { orderBy: { workflowStepNumber: 'asc' } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return notes.map((n) => this.mapToNoteItemWithChildren(n));
    }
    /**
     * Gets notes for a specific concept.
     */
    async getByConcept(conceptId, userId, tenantId) {
        const notes = await this.prisma.note.findMany({
            where: { conceptId, userId, tenantId, parentNoteId: null },
            include: {
                children: { orderBy: { workflowStepNumber: 'asc' } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return notes.map((n) => this.mapToNoteItemWithChildren(n));
    }
    /**
     * Gets distinct concept IDs from notes for a user/tenant.
     * Used for concept tree growth — shows concepts discovered via tasks.
     */
    async getDiscoveredConceptIds(userId, tenantId) {
        const notes = await this.prisma.note.findMany({
            where: { userId, tenantId, conceptId: { not: null } },
            select: { conceptId: true },
            distinct: ['conceptId'],
        });
        return notes.map((n) => n.conceptId).filter(Boolean);
    }
    /**
     * Links orphan notes (no conversationId) for given concepts to a conversation.
     * Used after onboarding creates tasks per-concept, then creates the welcome conversation.
     */
    async linkNotesToConversation(conceptIds, conversationId, userId, tenantId) {
        if (conceptIds.length === 0)
            return 0;
        const result = await this.prisma.note.updateMany({
            where: {
                conceptId: { in: conceptIds },
                conversationId: null,
                userId,
                tenantId,
            },
            data: { conversationId },
        });
        return result.count;
    }
    /**
     * Updates conceptId for all notes of a conversation that have no concept set.
     * Used when a conversation is auto-classified to retroactively link its tasks.
     */
    async updateConceptIdForConversation(conversationId, conceptId, tenantId) {
        await this.prisma.note.updateMany({
            where: {
                conversationId,
                tenantId,
                conceptId: null,
            },
            data: { conceptId },
        });
    }
    /**
     * Checks if a task already exists tenant-wide by conceptId and/or title (Story 3.4 AC3).
     * Used for tenant-wide task deduplication across all generation paths.
     *
     * @returns The existing task ID if found, null otherwise
     */
    async findExistingTask(tenantId, options) {
        const { conceptId, title } = options;
        // Must provide at least one search criterion
        if (!conceptId && !title)
            return null;
        // Strategy: if conceptId is provided, check by conceptId first (stronger dedup)
        if (conceptId) {
            const existing = await this.prisma.note.findFirst({
                where: {
                    tenantId,
                    conceptId,
                    noteType: prisma_1.NoteType.TASK,
                    status: { in: [prisma_1.NoteStatus.PENDING, prisma_1.NoteStatus.COMPLETED, prisma_1.NoteStatus.READY_FOR_REVIEW] },
                },
                select: { id: true },
            });
            if (existing)
                return existing.id;
        }
        // Fallback: check by title (case-insensitive, for non-concept-linked tasks)
        if (title) {
            const normalizedTitle = title.toLowerCase().trim();
            const candidates = await this.prisma.note.findMany({
                where: {
                    tenantId,
                    noteType: prisma_1.NoteType.TASK,
                    status: { in: [prisma_1.NoteStatus.PENDING, prisma_1.NoteStatus.COMPLETED, prisma_1.NoteStatus.READY_FOR_REVIEW] },
                },
                select: { id: true, title: true },
                take: 200,
            });
            const match = candidates.find((c) => c.title.toLowerCase().trim() === normalizedTitle);
            if (match)
                return match.id;
        }
        return null;
    }
    /**
     * Checks if a sub-task already exists for a specific workflow step (Story 3.4 AC3).
     *
     * @returns The existing sub-task ID if found, null otherwise
     */
    async findExistingSubTask(tenantId, parentNoteId, workflowStepNumber) {
        const existing = await this.prisma.note.findFirst({
            where: {
                tenantId,
                parentNoteId,
                workflowStepNumber,
                noteType: prisma_1.NoteType.TASK,
            },
            select: { id: true },
        });
        return existing?.id ?? null;
    }
    /**
     * Gets all pending tasks for a user/tenant.
     * Used for auto-triggering workflow execution from chat.
     */
    async getPendingTasksByUser(userId, tenantId) {
        return this.prisma.note.findMany({
            where: { userId, tenantId, noteType: 'TASK', status: 'PENDING' },
            orderBy: { createdAt: 'asc' },
        });
    }
    /**
     * Gets pending task concept IDs for the brain tree (Story 3.2).
     * If userId is provided, returns only that user's pending tasks.
     * If omitted, returns all pending tasks for the tenant (PLATFORM_OWNER view).
     */
    async getPendingTaskConceptIds(tenantId, userId) {
        const where = {
            tenantId,
            noteType: prisma_1.NoteType.TASK,
            status: prisma_1.NoteStatus.PENDING,
            conceptId: { not: null },
        };
        if (userId)
            where.userId = userId;
        const notes = await this.prisma.note.findMany({
            where,
            select: { conceptId: true, userId: true, id: true },
        });
        return notes
            .filter((n) => n.conceptId !== null)
            .map((n) => ({ conceptId: n.conceptId, userId: n.userId, noteId: n.id }));
    }
    /**
     * Gets completed task concept IDs for the brain tree.
     * A concept is "completed" when its TASK note has status COMPLETED.
     */
    async getCompletedTaskConceptIds(tenantId, userId) {
        const where = {
            tenantId,
            noteType: prisma_1.NoteType.TASK,
            status: prisma_1.NoteStatus.COMPLETED,
            conceptId: { not: null },
        };
        if (userId)
            where.userId = userId;
        const notes = await this.prisma.note.findMany({
            where,
            select: { conceptId: true, userId: true, id: true },
        });
        return notes
            .filter((n) => n.conceptId !== null)
            .map((n) => ({ conceptId: n.conceptId, userId: n.userId, noteId: n.id }));
    }
    /**
     * Updates the status of a note/task.
     */
    async updateStatus(noteId, status, tenantId) {
        const note = await this.prisma.note.findFirst({
            where: { id: noteId, tenantId },
        });
        if (!note) {
            throw new common_1.NotFoundException(`Note ${noteId} not found`);
        }
        const updated = await this.prisma.note.update({
            where: { id: noteId },
            data: { status },
        });
        return this.mapToNoteItem(updated);
    }
    /**
     * Updates a note's title and content.
     */
    async updateNote(noteId, title, content, tenantId) {
        const note = await this.prisma.note.findFirst({
            where: { id: noteId, tenantId },
        });
        if (!note) {
            throw new common_1.NotFoundException(`Note ${noteId} not found`);
        }
        const data = {};
        if (title !== undefined)
            data.title = title;
        if (content !== undefined)
            data.content = content;
        const updated = await this.prisma.note.update({
            where: { id: noteId },
            data,
        });
        return this.mapToNoteItem(updated);
    }
    /**
     * Deletes a note.
     */
    async deleteNote(noteId, tenantId) {
        const note = await this.prisma.note.findFirst({
            where: { id: noteId, tenantId },
        });
        if (!note) {
            throw new common_1.NotFoundException(`Note ${noteId} not found`);
        }
        await this.prisma.note.delete({ where: { id: noteId } });
    }
    /**
     * Submits a user completion report for a note/task.
     */
    async submitReport(noteId, report, tenantId) {
        const note = await this.prisma.note.findFirst({
            where: { id: noteId, tenantId },
        });
        if (!note) {
            throw new common_1.NotFoundException(`Note ${noteId} not found`);
        }
        const updated = await this.prisma.note.update({
            where: { id: noteId },
            data: { userReport: report },
        });
        return this.mapToNoteItem(updated);
    }
    /**
     * AI-generates a completion report for a task.
     * Returns the generated text for user review before submission.
     */
    async generateReport(noteId, userId, tenantId) {
        const note = await this.prisma.note.findFirst({
            where: { id: noteId, tenantId },
        });
        if (!note) {
            throw new common_1.NotFoundException(`Note ${noteId} not found`);
        }
        // Fetch child notes (workflow steps) for context
        const children = await this.prisma.note.findMany({
            where: { parentNoteId: noteId, tenantId },
            orderBy: { workflowStepNumber: 'asc' },
        });
        let childContext = '';
        if (children.length > 0) {
            childContext = '\n\nREZULTATI WORKFLOW KORAKA:\n';
            for (const child of children) {
                childContext += `- Korak ${child.workflowStepNumber ?? '?'}: ${child.title}`;
                if (child.status === 'COMPLETED')
                    childContext += ' (završen)';
                if (child.content)
                    childContext += `\n  Rezultat: ${child.content.substring(0, 500)}`;
                childContext += '\n';
            }
        }
        const prompt = `Ti si AI asistent za poslovanje. Generiši izveštaj o završenom zadatku na srpskom jeziku.

ZADATAK:
Naslov: ${note.title}
Opis: ${note.content ?? 'Nema opisa'}
${note.expectedOutcome ? `Očekivani ishod: ${note.expectedOutcome}` : ''}${childContext}

Na osnovu konteksta zadatka i rezultata, napiši koncizan izveštaj (3-5 rečenica) koji:
- Opisuje šta je urađeno
- Navodi ključne rezultate i zaključke
- Predlaže sledeće korake ako je relevantno

Piši kao da si korisnik koji izveštava o svom radu. Koristi srpski jezik. Odgovori SAMO tekstom izveštaja, bez naslova ili formatiranja.`;
        let fullResponse = '';
        await this.aiGateway.streamCompletionWithContext([{ role: 'user', content: prompt }], { tenantId, userId }, (chunk) => {
            fullResponse += chunk;
        });
        return fullResponse.trim() || 'Generisanje izveštaja nije uspelo. Pokušajte ponovo.';
    }
    /**
     * AI-scores a user's completion report.
     */
    async scoreReport(noteId, userId, tenantId) {
        const note = await this.prisma.note.findFirst({
            where: { id: noteId, tenantId },
        });
        if (!note) {
            throw new common_1.NotFoundException(`Note ${noteId} not found`);
        }
        if (!note.userReport) {
            throw new common_1.NotFoundException(`Note ${noteId} has no report to score`);
        }
        const scoringPrompt = `Ti si AI mentor za poslovanje. Oceni izveštaj korisnika o završenom zadatku.

ZADATAK:
Naslov: ${note.title}
Opis: ${note.content}
${note.expectedOutcome ? `Očekivani ishod: ${note.expectedOutcome}` : ''}

IZVEŠTAJ KORISNIKA:
${note.userReport}

Oceni na skali 0-100 na osnovu:
- Kompletnost: Da li su svi aspekti zadatka pokriveni?
- Specifičnost: Da li su navedeni konkretni detalji umesto opštih fraza?
- Kvalitet analize: Da li je korisnik pokazao razumevanje?
- Primenljivost: Da li se rezultati mogu primeniti u praksi?

Odgovori ISKLJUČIVO u JSON formatu:
{"score": <broj 0-100>, "feedback": "<2-3 rečenice na srpskom sa konkretnim savetima za poboljšanje>"}`;
        let fullResponse = '';
        await this.aiGateway.streamCompletionWithContext([{ role: 'user', content: scoringPrompt }], { tenantId, userId }, (chunk) => {
            fullResponse += chunk;
        });
        let score = 50;
        let feedback = 'Ocenjivanje nije uspelo. Pokušajte ponovo.';
        try {
            const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                score = Math.max(0, Math.min(100, Number(parsed.score) || 50));
                feedback = parsed.feedback || feedback;
            }
        }
        catch {
            this.logger.warn({
                message: 'Failed to parse AI scoring response',
                noteId,
                response: fullResponse.substring(0, 200),
            });
        }
        const updated = await this.prisma.note.update({
            where: { id: noteId },
            data: { aiScore: score, aiFeedback: feedback },
        });
        return this.mapToNoteItem(updated);
    }
    // ─── Comment methods (Story 3.4 AC4) ─────────────────────
    /**
     * Creates a comment on a task or workflow step note.
     *
     * @param taskId - The parent note ID (task or workflow step)
     * @param content - Comment text
     * @param userId - The commenting user's ID
     * @param tenantId - Tenant for isolation
     * @returns Created comment with user info
     */
    async createComment(taskId, content, userId, tenantId) {
        // Verify parent task exists and is a TASK type
        const parent = await this.prisma.note.findFirst({
            where: { id: taskId, tenantId },
            select: { id: true, noteType: true },
        });
        if (!parent) {
            throw new common_1.NotFoundException(`Task ${taskId} not found`);
        }
        if (parent.noteType !== prisma_1.NoteType.TASK) {
            throw new common_1.BadRequestException('Comments can only be added to tasks or workflow steps');
        }
        const id = `note_${(0, cuid2_1.createId)()}`;
        const comment = await this.prisma.note.create({
            data: {
                id,
                title: 'Comment',
                content,
                source: prisma_1.NoteSource.MANUAL,
                noteType: prisma_1.NoteType.COMMENT,
                parentNoteId: taskId,
                userId,
                tenantId,
            },
        });
        return {
            id: comment.id,
            content: comment.content,
            userId: comment.userId,
            createdAt: comment.createdAt.toISOString(),
        };
    }
    /**
     * Gets all comments for a task/workflow step, ordered oldest first.
     * Includes user info (name, role) from the User model.
     *
     * @param taskId - The parent note ID
     * @param tenantId - Tenant for isolation
     * @param page - Page number (1-based, default 1)
     * @param limit - Items per page (default 50)
     */
    async getCommentsByTask(taskId, tenantId, page = 1, limit = 50) {
        // Enforce pagination bounds
        page = Math.max(1, page || 1);
        limit = Math.min(100, Math.max(1, limit || 50));
        const skip = (page - 1) * limit;
        const [comments, total] = await Promise.all([
            this.prisma.note.findMany({
                where: {
                    parentNoteId: taskId,
                    tenantId,
                    noteType: prisma_1.NoteType.COMMENT,
                },
                orderBy: { createdAt: 'asc' },
                skip,
                take: limit,
            }),
            this.prisma.note.count({
                where: {
                    parentNoteId: taskId,
                    tenantId,
                    noteType: prisma_1.NoteType.COMMENT,
                },
            }),
        ]);
        // Resolve user info
        const userIds = [...new Set(comments.map((c) => c.userId))];
        const users = userIds.length > 0
            ? await this.prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true, role: true },
            })
            : [];
        const userMap = new Map(users.map((u) => [u.id, u]));
        return {
            comments: comments.map((c) => {
                const user = userMap.get(c.userId);
                return {
                    id: c.id,
                    content: c.content,
                    userId: c.userId,
                    userName: user?.name ?? c.userId,
                    userRole: user?.role ?? 'MEMBER',
                    createdAt: c.createdAt.toISOString(),
                    updatedAt: c.updatedAt.toISOString(),
                };
            }),
            total,
            page,
            limit,
        };
    }
    /**
     * Updates a comment's content. Only the comment author can edit.
     *
     * @param commentId - The comment note ID
     * @param content - New comment content
     * @param userId - The requesting user (must be author)
     * @param tenantId - Tenant for isolation
     */
    async updateComment(commentId, content, userId, tenantId) {
        const comment = await this.prisma.note.findFirst({
            where: { id: commentId, tenantId, noteType: prisma_1.NoteType.COMMENT },
        });
        if (!comment) {
            throw new common_1.NotFoundException(`Comment ${commentId} not found`);
        }
        if (comment.userId !== userId) {
            throw new common_1.ForbiddenException('Only the comment author can edit');
        }
        const updated = await this.prisma.note.update({
            where: { id: commentId },
            data: { content },
        });
        return {
            id: updated.id,
            content: updated.content,
            updatedAt: updated.updatedAt.toISOString(),
        };
    }
    /**
     * Deletes a comment. Only the author or TENANT_OWNER/PLATFORM_OWNER can delete.
     *
     * @param commentId - The comment note ID
     * @param userId - The requesting user
     * @param role - The requesting user's role
     * @param tenantId - Tenant for isolation
     */
    async deleteComment(commentId, userId, role, tenantId) {
        const comment = await this.prisma.note.findFirst({
            where: { id: commentId, tenantId, noteType: prisma_1.NoteType.COMMENT },
        });
        if (!comment) {
            throw new common_1.NotFoundException(`Comment ${commentId} not found`);
        }
        const isOwner = role === 'PLATFORM_OWNER' || role === 'TENANT_OWNER';
        if (comment.userId !== userId && !isOwner) {
            throw new common_1.ForbiddenException('Only the comment author or an owner can delete');
        }
        await this.prisma.note.delete({ where: { id: commentId } });
    }
    mapToNoteItem(note) {
        return {
            id: note.id,
            title: note.title,
            content: note.content,
            source: note.source,
            noteType: note.noteType,
            status: note.status,
            conversationId: note.conversationId,
            conceptId: note.conceptId,
            messageId: note.messageId,
            createdAt: note.createdAt.toISOString(),
            updatedAt: note.updatedAt.toISOString(),
            parentNoteId: note.parentNoteId ?? null,
            userReport: note.userReport ?? null,
            aiScore: note.aiScore ?? null,
            aiFeedback: note.aiFeedback ?? null,
            expectedOutcome: note.expectedOutcome ?? null,
            workflowStepNumber: note.workflowStepNumber ?? null,
        };
    }
    mapToNoteItemWithChildren(note) {
        const mapped = this.mapToNoteItem(note);
        if (note.children && note.children.length > 0) {
            mapped.children = note.children.map((c) => this.mapToNoteItem(c));
        }
        return mapped;
    }
};
exports.NotesService = NotesService;
exports.NotesService = NotesService = NotesService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object, typeof (_b = typeof ai_gateway_service_1.AiGatewayService !== "undefined" && ai_gateway_service_1.AiGatewayService) === "function" ? _b : Object])
], NotesService);


/***/ }),
/* 132 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.NotesController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const jwt_auth_guard_1 = __webpack_require__(45);
const current_user_decorator_1 = __webpack_require__(47);
const notes_service_1 = __webpack_require__(131);
const prisma_1 = __webpack_require__(34);
const comment_dto_1 = __webpack_require__(133);
let NotesController = class NotesController {
    constructor(notesService) {
        this.notesService = notesService;
    }
    /**
     * Create a new note (manual).
     */
    async createNote(user, body) {
        const result = await this.notesService.createNote({
            title: body.title,
            content: body.content,
            source: prisma_1.NoteSource.MANUAL,
            noteType: body.noteType ?? prisma_1.NoteType.NOTE,
            status: body.noteType === 'TASK' ? (body.status ?? prisma_1.NoteStatus.PENDING) : undefined,
            conversationId: body.conversationId,
            conceptId: body.conceptId,
            userId: user.userId,
            tenantId: user.tenantId,
        });
        return { data: result };
    }
    /**
     * Get notes for a specific conversation.
     */
    async getByConversation(user, conversationId) {
        const notes = await this.notesService.getByConversation(conversationId, user.userId, user.tenantId);
        return { data: notes };
    }
    /**
     * Get notes for a specific concept.
     */
    async getByConcept(user, conceptId) {
        const notes = await this.notesService.getByConcept(conceptId, user.userId, user.tenantId);
        return { data: notes };
    }
    /**
     * Update a note's status (toggle task completion).
     */
    async updateStatus(user, id, body) {
        const note = await this.notesService.updateStatus(id, body.status, user.tenantId);
        return { data: note };
    }
    /**
     * Update a note's title and/or content.
     */
    async updateNote(user, id, body) {
        const note = await this.notesService.updateNote(id, body.title, body.content, user.tenantId);
        return { data: note };
    }
    /**
     * Submit a user completion report for a note/task.
     */
    async submitReport(user, id, body) {
        const note = await this.notesService.submitReport(id, body.report, user.tenantId);
        return { data: note };
    }
    /**
     * AI-generate a completion report for a task.
     * Returns the generated text for user review before submission.
     */
    async generateReport(user, id) {
        const report = await this.notesService.generateReport(id, user.userId, user.tenantId);
        return { data: { report } };
    }
    /**
     * AI-score a user's completion report.
     */
    async scoreReport(user, id) {
        const note = await this.notesService.scoreReport(id, user.userId, user.tenantId);
        return { data: note };
    }
    // ─── Comment endpoints (Story 3.4 AC4) ─────────────────
    /**
     * Create a comment on a task or workflow step.
     */
    async createComment(user, taskId, body) {
        const comment = await this.notesService.createComment(taskId, body.content, user.userId, user.tenantId);
        return { data: comment };
    }
    /**
     * Get comments for a task or workflow step.
     * Supports pagination via ?page=1&limit=50 query params.
     */
    async getComments(user, taskId, page, limit) {
        const result = await this.notesService.getCommentsByTask(taskId, user.tenantId, page ? parseInt(page, 10) : 1, limit ? parseInt(limit, 10) : 50);
        return { data: result };
    }
    /**
     * Edit a comment (author-only).
     */
    async updateComment(user, commentId, body) {
        const updated = await this.notesService.updateComment(commentId, body.content, user.userId, user.tenantId);
        return { data: updated };
    }
    /**
     * Delete a comment (author or owner only).
     */
    async deleteComment(user, commentId) {
        await this.notesService.deleteComment(commentId, user.userId, user.role, user.tenantId);
    }
    /**
     * Delete a note.
     */
    async deleteNote(user, id) {
        await this.notesService.deleteNote(id, user.tenantId);
    }
};
exports.NotesController = NotesController;
tslib_1.__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object]),
    tslib_1.__metadata("design:returntype", Promise)
], NotesController.prototype, "createNote", null);
tslib_1.__decorate([
    (0, common_1.Get)('conversation/:conversationId'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('conversationId')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], NotesController.prototype, "getByConversation", null);
tslib_1.__decorate([
    (0, common_1.Get)('concept/:conceptId'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('conceptId')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], NotesController.prototype, "getByConcept", null);
tslib_1.__decorate([
    (0, common_1.Patch)(':id/status'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('id')),
    tslib_1.__param(2, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String, Object]),
    tslib_1.__metadata("design:returntype", Promise)
], NotesController.prototype, "updateStatus", null);
tslib_1.__decorate([
    (0, common_1.Patch)(':id'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('id')),
    tslib_1.__param(2, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String, Object]),
    tslib_1.__metadata("design:returntype", Promise)
], NotesController.prototype, "updateNote", null);
tslib_1.__decorate([
    (0, common_1.Post)(':id/report'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('id')),
    tslib_1.__param(2, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String, Object]),
    tslib_1.__metadata("design:returntype", Promise)
], NotesController.prototype, "submitReport", null);
tslib_1.__decorate([
    (0, common_1.Post)(':id/generate-report'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], NotesController.prototype, "generateReport", null);
tslib_1.__decorate([
    (0, common_1.Post)(':id/score'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], NotesController.prototype, "scoreReport", null);
tslib_1.__decorate([
    (0, common_1.Post)(':taskId/comments'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('taskId')),
    tslib_1.__param(2, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String, typeof (_b = typeof comment_dto_1.CreateCommentDto !== "undefined" && comment_dto_1.CreateCommentDto) === "function" ? _b : Object]),
    tslib_1.__metadata("design:returntype", Promise)
], NotesController.prototype, "createComment", null);
tslib_1.__decorate([
    (0, common_1.Get)(':taskId/comments'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('taskId')),
    tslib_1.__param(2, (0, common_1.Query)('page')),
    tslib_1.__param(3, (0, common_1.Query)('limit')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String, String, String]),
    tslib_1.__metadata("design:returntype", Promise)
], NotesController.prototype, "getComments", null);
tslib_1.__decorate([
    (0, common_1.Patch)(':commentId/comment'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('commentId')),
    tslib_1.__param(2, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String, typeof (_c = typeof comment_dto_1.UpdateCommentDto !== "undefined" && comment_dto_1.UpdateCommentDto) === "function" ? _c : Object]),
    tslib_1.__metadata("design:returntype", Promise)
], NotesController.prototype, "updateComment", null);
tslib_1.__decorate([
    (0, common_1.Delete)(':commentId/comment'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('commentId')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], NotesController.prototype, "deleteComment", null);
tslib_1.__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], NotesController.prototype, "deleteNote", null);
exports.NotesController = NotesController = tslib_1.__decorate([
    (0, common_1.Controller)('v1/notes'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof notes_service_1.NotesService !== "undefined" && notes_service_1.NotesService) === "function" ? _a : Object])
], NotesController);


/***/ }),
/* 133 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateCommentDto = exports.CreateCommentDto = void 0;
const tslib_1 = __webpack_require__(4);
const class_validator_1 = __webpack_require__(37);
/**
 * DTO for creating a comment on a task or workflow step.
 */
class CreateCommentDto {
}
exports.CreateCommentDto = CreateCommentDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Comment content must not be empty' }),
    (0, class_validator_1.MaxLength)(5000, { message: 'Comment content must be at most 5000 characters' }),
    tslib_1.__metadata("design:type", String)
], CreateCommentDto.prototype, "content", void 0);
/**
 * DTO for updating a comment's content.
 */
class UpdateCommentDto {
}
exports.UpdateCommentDto = UpdateCommentDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Comment content must not be empty' }),
    (0, class_validator_1.MaxLength)(5000, { message: 'Comment content must be at most 5000 characters' }),
    tslib_1.__metadata("design:type", String)
], UpdateCommentDto.prototype, "content", void 0);


/***/ }),
/* 134 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MemoryModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const tenant_context_1 = __webpack_require__(9);
const auth_module_1 = __webpack_require__(40);
const memory_controller_1 = __webpack_require__(135);
const memory_service_1 = __webpack_require__(136);
const memory_extraction_service_1 = __webpack_require__(139);
const memory_embedding_service_1 = __webpack_require__(140);
const memory_context_builder_service_1 = __webpack_require__(141);
const llm_config_module_1 = __webpack_require__(73);
/**
 * Module for persistent memory across conversations.
 * Provides services for creating, retrieving, and managing user memories.
 *
 * Story 2.7: Persistent Memory Across Conversations
 */
let MemoryModule = class MemoryModule {
};
exports.MemoryModule = MemoryModule;
exports.MemoryModule = MemoryModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule,
            tenant_context_1.TenantModule,
            auth_module_1.AuthModule, // Provides AuthService for guards
            llm_config_module_1.LlmConfigModule, // For LLM extraction calls
        ],
        controllers: [memory_controller_1.MemoryController],
        providers: [
            memory_service_1.MemoryService,
            memory_extraction_service_1.MemoryExtractionService,
            memory_embedding_service_1.MemoryEmbeddingService,
            memory_context_builder_service_1.MemoryContextBuilderService,
        ],
        exports: [
            memory_service_1.MemoryService,
            memory_extraction_service_1.MemoryExtractionService,
            memory_embedding_service_1.MemoryEmbeddingService,
            memory_context_builder_service_1.MemoryContextBuilderService,
        ],
    })
], MemoryModule);


/***/ }),
/* 135 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var MemoryController_1;
var _a, _b, _c, _d, _e, _f, _g, _h, _j;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MemoryController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const class_validator_1 = __webpack_require__(37);
const jwt_auth_guard_1 = __webpack_require__(45);
const current_user_decorator_1 = __webpack_require__(47);
const memory_service_1 = __webpack_require__(136);
const create_memory_dto_1 = __webpack_require__(137);
const update_memory_dto_1 = __webpack_require__(138);
/**
 * Request body for forgetting all memories.
 * Requires typing "FORGET" to confirm deletion.
 */
class ForgetAllDto {
}
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], ForgetAllDto.prototype, "confirmation", void 0);
/**
 * Controller for memory management endpoints.
 * All endpoints require JWT authentication.
 * Operations are tenant-scoped through the user's JWT claims.
 *
 * Story 2.7: Persistent Memory Across Conversations
 */
let MemoryController = MemoryController_1 = class MemoryController {
    constructor(memoryService) {
        this.memoryService = memoryService;
        this.logger = new common_1.Logger(MemoryController_1.name);
    }
    /**
     * Lists all memories for the current user.
     *
     * @param type - Filter by memory type
     * @param subject - Filter by subject (client/project name)
     * @param search - Search in content
     * @param limit - Max results (default 20, max 100)
     * @param offset - Pagination offset
     */
    async listMemories(user, type, subject, search, limit, offset) {
        this.logger.log({
            message: 'Listing memories',
            userId: user.userId,
            tenantId: user.tenantId,
            type,
            subject,
            search,
        });
        const result = await this.memoryService.findMemories(user.tenantId, user.userId, {
            type,
            subject,
            search,
            limit: limit ? parseInt(limit, 10) : undefined,
            offset: offset ? parseInt(offset, 10) : undefined,
        });
        return {
            data: result.data,
            meta: result.meta,
        };
    }
    /**
     * Gets a single memory by ID.
     *
     * @param id - Memory ID (mem_ prefix)
     */
    async getMemory(user, memoryId) {
        this.logger.log({
            message: 'Getting memory',
            memoryId,
            userId: user.userId,
            tenantId: user.tenantId,
        });
        const memory = await this.memoryService.getMemory(user.tenantId, memoryId, user.userId);
        return {
            data: memory,
        };
    }
    /**
     * Creates a new memory entry.
     * Typically used for user-stated memories rather than AI-extracted ones.
     */
    async createMemory(user, dto) {
        this.logger.log({
            message: 'Creating memory',
            userId: user.userId,
            tenantId: user.tenantId,
            type: dto.type,
            source: dto.source,
        });
        const memory = await this.memoryService.createMemory(user.tenantId, user.userId, dto);
        return {
            data: memory,
        };
    }
    /**
     * Updates/corrects a memory entry.
     * Source is automatically set to USER_CORRECTED.
     *
     * @param id - Memory ID (mem_ prefix)
     */
    async updateMemory(user, memoryId, dto) {
        this.logger.log({
            message: 'Updating memory',
            memoryId,
            userId: user.userId,
            tenantId: user.tenantId,
        });
        const memory = await this.memoryService.updateMemory(user.tenantId, memoryId, user.userId, dto);
        return {
            data: memory,
        };
    }
    /**
     * Soft-deletes a memory entry.
     * The memory is marked as deleted but not physically removed.
     *
     * @param id - Memory ID (mem_ prefix)
     */
    async deleteMemory(user, memoryId) {
        this.logger.log({
            message: 'Deleting memory',
            memoryId,
            userId: user.userId,
            tenantId: user.tenantId,
        });
        await this.memoryService.deleteMemory(user.tenantId, memoryId, user.userId);
        return {
            success: true,
            message: 'Memory deleted successfully',
        };
    }
    /**
     * Forgets all memories for the current user.
     * Requires typing "FORGET" to confirm.
     */
    async forgetAll(user, dto) {
        this.logger.warn({
            message: 'User requesting to forget all memories',
            userId: user.userId,
            tenantId: user.tenantId,
        });
        const result = await this.memoryService.forgetAll(user.tenantId, user.userId, dto.confirmation);
        return {
            success: true,
            deletedCount: result.deletedCount,
        };
    }
};
exports.MemoryController = MemoryController;
tslib_1.__decorate([
    (0, common_1.Get)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Query)('type')),
    tslib_1.__param(2, (0, common_1.Query)('subject')),
    tslib_1.__param(3, (0, common_1.Query)('search')),
    tslib_1.__param(4, (0, common_1.Query)('limit')),
    tslib_1.__param(5, (0, common_1.Query)('offset')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, String, String, String, String]),
    tslib_1.__metadata("design:returntype", typeof (_b = typeof Promise !== "undefined" && Promise) === "function" ? _b : Object)
], MemoryController.prototype, "listMemories", null);
tslib_1.__decorate([
    (0, common_1.Get)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_c = typeof Promise !== "undefined" && Promise) === "function" ? _c : Object)
], MemoryController.prototype, "getMemory", null);
tslib_1.__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, typeof (_d = typeof create_memory_dto_1.CreateMemoryDto !== "undefined" && create_memory_dto_1.CreateMemoryDto) === "function" ? _d : Object]),
    tslib_1.__metadata("design:returntype", typeof (_e = typeof Promise !== "undefined" && Promise) === "function" ? _e : Object)
], MemoryController.prototype, "createMemory", null);
tslib_1.__decorate([
    (0, common_1.Patch)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('id')),
    tslib_1.__param(2, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String, typeof (_f = typeof update_memory_dto_1.UpdateMemoryDto !== "undefined" && update_memory_dto_1.UpdateMemoryDto) === "function" ? _f : Object]),
    tslib_1.__metadata("design:returntype", typeof (_g = typeof Promise !== "undefined" && Promise) === "function" ? _g : Object)
], MemoryController.prototype, "updateMemory", null);
tslib_1.__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_h = typeof Promise !== "undefined" && Promise) === "function" ? _h : Object)
], MemoryController.prototype, "deleteMemory", null);
tslib_1.__decorate([
    (0, common_1.Post)('forget-all'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, ForgetAllDto]),
    tslib_1.__metadata("design:returntype", typeof (_j = typeof Promise !== "undefined" && Promise) === "function" ? _j : Object)
], MemoryController.prototype, "forgetAll", null);
exports.MemoryController = MemoryController = MemoryController_1 = tslib_1.__decorate([
    (0, common_1.Controller)('v1/memory'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof memory_service_1.MemoryService !== "undefined" && memory_service_1.MemoryService) === "function" ? _a : Object])
], MemoryController);


/***/ }),
/* 136 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var MemoryService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MemoryService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const cuid2_1 = __webpack_require__(32);
const tenant_context_1 = __webpack_require__(9);
/**
 * Service for managing user memories.
 * All operations are tenant-scoped through the TenantPrismaService.
 *
 * Story 2.7: Persistent Memory Across Conversations
 */
let MemoryService = MemoryService_1 = class MemoryService {
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
        this.logger = new common_1.Logger(MemoryService_1.name);
    }
    /**
     * Creates a new memory entry.
     *
     * @param tenantId - Tenant ID for database isolation
     * @param userId - User ID who owns the memory
     * @param dto - Memory creation data
     * @returns Created memory
     */
    async createMemory(tenantId, userId, dto) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        const memoryId = `mem_${(0, cuid2_1.createId)()}`;
        const memory = await prisma.memory.create({
            data: {
                id: memoryId,
                tenantId,
                userId,
                type: dto.type,
                source: dto.source,
                content: dto.content,
                subject: dto.subject ?? null,
                confidence: dto.confidence ?? 1.0,
                sourceMessageId: dto.sourceMessageId ?? null,
            },
        });
        this.logger.log({
            message: 'Memory created',
            memoryId,
            userId,
            tenantId,
            type: dto.type,
            source: dto.source,
            subject: dto.subject ?? 'none',
        });
        return this.mapMemory(memory);
    }
    /**
     * Finds memories for a user with optional filtering.
     *
     * @param tenantId - Tenant ID for database isolation
     * @param userId - User ID to filter memories
     * @param options - Query options for filtering and pagination
     * @returns Paginated list of memories with total count
     */
    async findMemories(tenantId, userId, options = {}) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        const limit = Math.min(options.limit ?? 20, 100);
        const offset = options.offset ?? 0;
        const where = {
            tenantId,
            userId,
        };
        // Only include non-deleted memories by default
        if (!options.includeDeleted) {
            where.isDeleted = false;
        }
        if (options.type) {
            where.type = options.type;
        }
        if (options.subject) {
            where.subject = { contains: options.subject, mode: 'insensitive' };
        }
        if (options.search) {
            where.content = { contains: options.search, mode: 'insensitive' };
        }
        const [memories, total] = await Promise.all([
            prisma.memory.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: offset,
                take: limit,
            }),
            prisma.memory.count({ where }),
        ]);
        this.logger.debug({
            message: 'Memories query executed',
            userId,
            tenantId,
            type: options.type,
            resultCount: memories.length,
            total,
        });
        return {
            data: memories.map((m) => this.mapMemory(m)),
            meta: { total, limit, offset },
        };
    }
    /**
     * Finds relevant memories for a query using keyword matching.
     * This is a fallback method when semantic search is not available.
     *
     * @param tenantId - Tenant ID for database isolation
     * @param userId - User ID to filter memories
     * @param query - Search query
     * @param limit - Maximum number of results
     * @returns List of relevant memories
     */
    async findRelevantMemories(tenantId, userId, query, limit = 10) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        // Simple keyword search - will be enhanced with semantic search via MemoryEmbeddingService
        const memories = await prisma.memory.findMany({
            where: {
                tenantId,
                userId,
                isDeleted: false,
                OR: [
                    { content: { contains: query, mode: 'insensitive' } },
                    { subject: { contains: query, mode: 'insensitive' } },
                ],
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        this.logger.debug({
            message: 'Relevant memories search',
            userId,
            tenantId,
            query: query.substring(0, 50),
            resultCount: memories.length,
        });
        return memories.map((m) => this.mapMemory(m));
    }
    /**
     * Gets a single memory by ID.
     *
     * @param tenantId - Tenant ID for database isolation
     * @param memoryId - Memory ID to retrieve
     * @param userId - User ID for ownership verification
     * @returns Memory entry
     * @throws NotFoundException if memory not found
     * @throws ForbiddenException if user doesn't own the memory
     */
    async getMemory(tenantId, memoryId, userId) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        const memory = await prisma.memory.findUnique({
            where: { id: memoryId },
        });
        if (!memory) {
            throw new common_1.NotFoundException({
                type: 'memory_not_found',
                title: 'Memory Not Found',
                status: 404,
                detail: `Memory with ID ${memoryId} not found`,
            });
        }
        if (memory.userId !== userId || memory.tenantId !== tenantId) {
            throw new common_1.ForbiddenException({
                type: 'memory_access_denied',
                title: 'Access Denied',
                status: 403,
                detail: 'You do not have access to this memory',
            });
        }
        return this.mapMemory(memory);
    }
    /**
     * Updates/corrects a memory entry.
     * Source is automatically set to USER_CORRECTED.
     *
     * @param tenantId - Tenant ID for database isolation
     * @param memoryId - Memory ID to update
     * @param userId - User ID for ownership verification
     * @param dto - Update data
     * @returns Updated memory
     * @throws NotFoundException if memory not found
     * @throws ForbiddenException if user doesn't own the memory
     */
    async updateMemory(tenantId, memoryId, userId, dto) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        // Verify ownership first
        await this.getMemory(tenantId, memoryId, userId);
        const updated = await prisma.memory.update({
            where: { id: memoryId },
            data: {
                content: dto.content,
                subject: dto.subject,
                source: 'USER_CORRECTED',
                confidence: 1.0, // User corrections have full confidence
            },
        });
        this.logger.log({
            message: 'Memory updated',
            memoryId,
            userId,
            tenantId,
            newSource: 'USER_CORRECTED',
        });
        return this.mapMemory(updated);
    }
    /**
     * Soft-deletes a memory entry.
     *
     * @param tenantId - Tenant ID for database isolation
     * @param memoryId - Memory ID to delete
     * @param userId - User ID for ownership verification
     * @throws NotFoundException if memory not found
     * @throws ForbiddenException if user doesn't own the memory
     */
    async deleteMemory(tenantId, memoryId, userId) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        // Verify ownership first
        await this.getMemory(tenantId, memoryId, userId);
        await prisma.memory.update({
            where: { id: memoryId },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
            },
        });
        this.logger.log({
            message: 'Memory soft-deleted',
            memoryId,
            userId,
            tenantId,
        });
    }
    /**
     * Deletes all memories for a user (with confirmation).
     *
     * @param tenantId - Tenant ID for database isolation
     * @param userId - User ID whose memories to delete
     * @param confirmation - Must be "FORGET" to proceed
     * @returns Number of memories deleted
     * @throws ForbiddenException if confirmation is incorrect
     */
    async forgetAll(tenantId, userId, confirmation) {
        if (confirmation !== 'FORGET') {
            throw new common_1.ForbiddenException({
                type: 'invalid_confirmation',
                title: 'Invalid Confirmation',
                status: 403,
                detail: 'You must type "FORGET" to confirm deletion of all memories',
            });
        }
        const prisma = await this.tenantPrisma.getClient(tenantId);
        const result = await prisma.memory.updateMany({
            where: {
                tenantId,
                userId,
                isDeleted: false,
            },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
            },
        });
        this.logger.warn({
            message: 'All memories soft-deleted for user',
            userId,
            tenantId,
            deletedCount: result.count,
        });
        return { deletedCount: result.count };
    }
    /**
     * Updates the embedding ID for a memory after vector generation.
     *
     * @param tenantId - Tenant ID for database isolation
     * @param memoryId - Memory ID to update
     * @param embeddingId - Qdrant vector ID
     */
    async updateEmbeddingId(tenantId, memoryId, embeddingId) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        await prisma.memory.update({
            where: { id: memoryId },
            data: { embeddingId },
        });
        this.logger.debug({
            message: 'Memory embedding ID updated',
            memoryId,
            tenantId,
            embeddingId,
        });
    }
    /**
     * Maps a Prisma memory record to the Memory interface.
     */
    mapMemory(memory) {
        return {
            id: memory.id,
            tenantId: memory.tenantId,
            userId: memory.userId,
            type: memory.type,
            source: memory.source,
            content: memory.content,
            subject: memory.subject ?? undefined,
            confidence: memory.confidence,
            embeddingId: memory.embeddingId ?? undefined,
            sourceMessageId: memory.sourceMessageId ?? undefined,
            isDeleted: memory.isDeleted,
            deletedAt: memory.deletedAt?.toISOString(),
            createdAt: memory.createdAt.toISOString(),
            updatedAt: memory.updatedAt.toISOString(),
        };
    }
};
exports.MemoryService = MemoryService;
exports.MemoryService = MemoryService = MemoryService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.TenantPrismaService !== "undefined" && tenant_context_1.TenantPrismaService) === "function" ? _a : Object])
], MemoryService);


/***/ }),
/* 137 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateMemoryDto = void 0;
const tslib_1 = __webpack_require__(4);
const class_validator_1 = __webpack_require__(37);
const types_1 = __webpack_require__(84);
/**
 * DTO for creating a new memory entry.
 */
class CreateMemoryDto {
}
exports.CreateMemoryDto = CreateMemoryDto;
tslib_1.__decorate([
    (0, class_validator_1.IsEnum)(types_1.MemoryType),
    tslib_1.__metadata("design:type", typeof (_a = typeof types_1.MemoryType !== "undefined" && types_1.MemoryType) === "function" ? _a : Object)
], CreateMemoryDto.prototype, "type", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsEnum)(types_1.MemorySource),
    tslib_1.__metadata("design:type", typeof (_b = typeof types_1.MemorySource !== "undefined" && types_1.MemorySource) === "function" ? _b : Object)
], CreateMemoryDto.prototype, "source", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateMemoryDto.prototype, "content", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateMemoryDto.prototype, "subject", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1),
    tslib_1.__metadata("design:type", Number)
], CreateMemoryDto.prototype, "confidence", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateMemoryDto.prototype, "sourceMessageId", void 0);


/***/ }),
/* 138 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdateMemoryDto = void 0;
const tslib_1 = __webpack_require__(4);
const class_validator_1 = __webpack_require__(37);
/**
 * DTO for updating/correcting a memory entry.
 * Source will automatically be set to USER_CORRECTED.
 */
class UpdateMemoryDto {
}
exports.UpdateMemoryDto = UpdateMemoryDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], UpdateMemoryDto.prototype, "content", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], UpdateMemoryDto.prototype, "subject", void 0);


/***/ }),
/* 139 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var MemoryExtractionService_1;
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MemoryExtractionService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const memory_service_1 = __webpack_require__(136);
const memory_embedding_service_1 = __webpack_require__(140);
const llm_config_service_1 = __webpack_require__(75);
/**
 * Service for extracting memorable facts from conversations.
 * Uses LLM to identify client mentions, preferences, and facts.
 *
 * Story 2.7: Persistent Memory Across Conversations
 */
let MemoryExtractionService = MemoryExtractionService_1 = class MemoryExtractionService {
    constructor(memoryService, memoryEmbeddingService, llmConfigService, configService) {
        this.memoryService = memoryService;
        this.memoryEmbeddingService = memoryEmbeddingService;
        this.llmConfigService = llmConfigService;
        this.configService = configService;
        this.logger = new common_1.Logger(MemoryExtractionService_1.name);
        /** Deduplication similarity threshold */
        this.DEDUP_THRESHOLD = 0.9;
        /** Extraction prompt template */
        this.EXTRACTION_PROMPT = `Analyze the following conversation and extract memorable facts.
Return a JSON array of extracted memories with this structure:
{ "type": "CLIENT_CONTEXT" | "PROJECT_CONTEXT" | "USER_PREFERENCE" | "FACTUAL_STATEMENT",
  "content": "the specific fact",
  "subject": "client/project name if applicable",
  "confidence": 0.0-1.0 }

Focus on:
- Client names and their characteristics (industry, size, constraints, budget)
- Project details (timeline, budget, requirements, deadlines)
- User preferences (communication style, priorities, working hours)
- Business facts explicitly stated by the user

Rules:
- Only extract factual information, not opinions or speculation
- Be specific and concise
- Subject should be the client/project name when applicable
- Confidence should be high (0.8+) for explicit statements, lower for inferred

Conversation:
{messages}

Extracted memories (JSON array only, no other text):`;
    }
    /**
     * Extracts memories from conversation messages.
     * Called asynchronously after conversation turns.
     *
     * @param messages - Conversation messages to analyze
     * @param userId - User who owns the conversation
     * @param tenantId - Tenant for isolation
     * @returns Array of extracted and saved memories
     */
    async extractMemories(messages, userId, tenantId, options) {
        if (messages.length < 2) {
            this.logger.debug({
                message: 'Skipping extraction - insufficient messages',
                userId,
                tenantId,
                messageCount: messages.length,
            });
            return [];
        }
        try {
            // Format messages for the prompt
            const formattedMessages = this.formatMessages(messages);
            let prompt = this.EXTRACTION_PROMPT.replace('{messages}', formattedMessages);
            // Story 3.3: Add concept context for better tagging
            if (options?.conceptName) {
                prompt += `\n\nContext: This conversation is about the business concept "${options.conceptName}". Use this as the subject for extracted memories when relevant.`;
            }
            // Call LLM for extraction
            const extractedRaw = await this.callLlmForExtraction(prompt, tenantId, userId);
            if (!extractedRaw || extractedRaw.length === 0) {
                this.logger.debug({
                    message: 'No memories extracted',
                    userId,
                    tenantId,
                });
                return [];
            }
            // Deduplicate against existing memories
            const deduplicated = await this.deduplicateMemories(extractedRaw, userId, tenantId);
            // Save new memories and generate embeddings
            const savedMemories = [];
            for (const memory of deduplicated) {
                try {
                    // Story 3.3: Default subject to concept name for concept-tagged memories
                    const effectiveSubject = memory.subject || options?.conceptName || undefined;
                    const saved = await this.memoryService.createMemory(tenantId, userId, {
                        type: memory.type,
                        source: 'AI_EXTRACTED',
                        content: memory.content,
                        subject: effectiveSubject,
                        confidence: memory.confidence,
                        sourceMessageId: messages[messages.length - 1]?.id,
                    });
                    // Generate embedding for semantic search (async, non-blocking)
                    this.memoryEmbeddingService
                        .generateAndStoreEmbedding(tenantId, saved.id, saved.content, {
                        userId,
                        type: saved.type,
                        subject: saved.subject,
                    })
                        .catch((error) => {
                        this.logger.warn({
                            message: 'Failed to generate embedding for memory',
                            memoryId: saved.id,
                            error: error instanceof Error ? error.message : 'Unknown error',
                        });
                    });
                    savedMemories.push(memory);
                }
                catch (error) {
                    this.logger.warn({
                        message: 'Failed to save extracted memory',
                        content: memory.content.substring(0, 50),
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });
                }
            }
            this.logger.log({
                message: 'Memories extracted and saved',
                userId,
                tenantId,
                extractedCount: extractedRaw.length,
                savedCount: savedMemories.length,
                deduplicatedCount: extractedRaw.length - deduplicated.length,
            });
            return savedMemories;
        }
        catch (error) {
            this.logger.error({
                message: 'Memory extraction failed',
                userId,
                tenantId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return [];
        }
    }
    /**
     * Calls LLM to extract memories from the prompt.
     */
    async callLlmForExtraction(prompt, _tenantId, _userId) {
        try {
            const config = await this.llmConfigService.getConfig();
            if (!config.primaryProvider) {
                this.logger.warn({
                    message: 'No LLM provider configured for extraction',
                });
                return [];
            }
            const apiKey = await this.llmConfigService.getDecryptedApiKey(config.primaryProvider.providerType);
            if (!apiKey) {
                this.logger.warn({
                    message: 'No API key available for extraction',
                });
                return [];
            }
            // Use non-streaming completion for extraction
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                    'HTTP-Referer': this.configService.get('APP_URL') ?? 'http://localhost:4200',
                    'X-Title': 'Mentor AI - Memory Extraction',
                },
                body: JSON.stringify({
                    model: config.primaryProvider.modelId,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a memory extraction assistant. Extract factual information from conversations and return JSON only.',
                        },
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                    temperature: 0.1, // Low temperature for consistent extraction
                    max_tokens: 1000,
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`LLM API returned ${response.status}: ${errorText}`);
            }
            const data = (await response.json());
            const content = data.choices?.[0]?.message?.content;
            if (!content) {
                return [];
            }
            // Parse JSON response
            const extracted = this.parseExtractionResponse(content);
            return extracted;
        }
        catch (error) {
            this.logger.error({
                message: 'LLM extraction call failed',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return [];
        }
    }
    /**
     * Parses the LLM extraction response.
     */
    parseExtractionResponse(content) {
        try {
            // Try to extract JSON array from response
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                return [];
            }
            const parsed = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed
                .filter((item) => item.type && item.content)
                .map((item) => ({
                type: this.normalizeMemoryType(item.type),
                content: item.content,
                subject: item.subject,
                confidence: Math.min(Math.max(item.confidence ?? 0.8, 0), 1),
            }));
        }
        catch (error) {
            this.logger.warn({
                message: 'Failed to parse extraction response',
                contentPreview: content.substring(0, 100),
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return [];
        }
    }
    /**
     * Normalizes memory type string to enum value.
     */
    normalizeMemoryType(type) {
        const typeMap = {
            CLIENT_CONTEXT: 'CLIENT_CONTEXT',
            PROJECT_CONTEXT: 'PROJECT_CONTEXT',
            USER_PREFERENCE: 'USER_PREFERENCE',
            FACTUAL_STATEMENT: 'FACTUAL_STATEMENT',
        };
        return typeMap[type.toUpperCase()] ?? 'FACTUAL_STATEMENT';
    }
    /**
     * Deduplicates new memories against existing ones.
     * Uses semantic similarity to avoid storing duplicate facts.
     */
    async deduplicateMemories(newMemories, userId, tenantId) {
        if (newMemories.length === 0) {
            return [];
        }
        try {
            // Get existing memories for comparison
            const { data: existing } = await this.memoryService.findMemories(tenantId, userId, {
                limit: 100,
            });
            if (existing.length === 0) {
                return newMemories;
            }
            // Filter out duplicates using simple text similarity
            return newMemories.filter((newMem) => {
                const isDuplicate = existing.some((existingMem) => {
                    const similarity = this.calculateTextSimilarity(newMem.content.toLowerCase(), existingMem.content.toLowerCase());
                    return similarity > this.DEDUP_THRESHOLD;
                });
                return !isDuplicate;
            });
        }
        catch (error) {
            this.logger.warn({
                message: 'Deduplication failed, proceeding with all memories',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return newMemories;
        }
    }
    /**
     * Calculates simple text similarity using Jaccard index.
     */
    calculateTextSimilarity(text1, text2) {
        const words1 = new Set(text1.split(/\s+/).filter((w) => w.length > 2));
        const words2 = new Set(text2.split(/\s+/).filter((w) => w.length > 2));
        if (words1.size === 0 && words2.size === 0) {
            return 1;
        }
        const intersection = new Set([...words1].filter((w) => words2.has(w)));
        const union = new Set([...words1, ...words2]);
        return intersection.size / union.size;
    }
    /**
     * Formats messages for the extraction prompt.
     */
    formatMessages(messages) {
        return messages
            .map((m) => `${m.role === 'USER' ? 'User' : 'Assistant'}: ${m.content}`)
            .join('\n\n');
    }
};
exports.MemoryExtractionService = MemoryExtractionService;
exports.MemoryExtractionService = MemoryExtractionService = MemoryExtractionService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof memory_service_1.MemoryService !== "undefined" && memory_service_1.MemoryService) === "function" ? _a : Object, typeof (_b = typeof memory_embedding_service_1.MemoryEmbeddingService !== "undefined" && memory_embedding_service_1.MemoryEmbeddingService) === "function" ? _b : Object, typeof (_c = typeof llm_config_service_1.LlmConfigService !== "undefined" && llm_config_service_1.LlmConfigService) === "function" ? _c : Object, typeof (_d = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _d : Object])
], MemoryExtractionService);


/***/ }),
/* 140 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var MemoryEmbeddingService_1;
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MemoryEmbeddingService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const memory_service_1 = __webpack_require__(136);
const qdrant_client_service_1 = __webpack_require__(111);
const llm_config_service_1 = __webpack_require__(75);
const types_1 = __webpack_require__(84);
/** Default LM Studio endpoint when not configured in DB */
const DEFAULT_LM_STUDIO_ENDPOINT = 'http://127.0.0.1:1234';
/**
 * Service for generating and managing memory embeddings.
 * Integrates with Qdrant Cloud for vector storage and semantic search.
 *
 * Collections are per-tenant: `memories_${tenantId}`
 * Dimensions: 768 (nomic-embed-text-v1.5)
 *
 * Story 2.7: Persistent Memory Across Conversations
 */
let MemoryEmbeddingService = MemoryEmbeddingService_1 = class MemoryEmbeddingService {
    constructor(memoryService, configService, qdrantClient, llmConfigService) {
        this.memoryService = memoryService;
        this.configService = configService;
        this.qdrantClient = qdrantClient;
        this.llmConfigService = llmConfigService;
        this.logger = new common_1.Logger(MemoryEmbeddingService_1.name);
        /** Default similarity threshold for semantic search */
        this.DEFAULT_THRESHOLD = 0.7;
        /** Embedding dimension (768 for nomic-embed-text-v1.5) */
        this.EMBEDDING_DIMENSION = 768;
        /** LM Studio model for embedding generation */
        this.EMBEDDING_MODEL = 'text-embedding-nomic-embed-text-v1.5';
    }
    /**
     * Returns the Qdrant collection name for a tenant's memories.
     */
    collectionName(tenantId) {
        return `memories_${tenantId}`;
    }
    /**
     * Ensures the tenant's memory collection exists in Qdrant.
     */
    async ensureCollection(tenantId) {
        if (!this.qdrantClient.isAvailable())
            return;
        await this.qdrantClient.ensureCollection(this.collectionName(tenantId), this.EMBEDDING_DIMENSION);
    }
    /**
     * Generates an embedding for memory content and stores it in Qdrant.
     *
     * @param tenantId - Tenant ID for collection scoping
     * @param memoryId - Memory ID to associate
     * @param content - Text content to embed
     * @param metadata - Additional metadata for the vector
     * @returns Embedding ID (Qdrant point UUID)
     */
    async generateAndStoreEmbedding(tenantId, memoryId, content, metadata) {
        this.logger.debug({
            message: 'Generating embedding for memory',
            memoryId,
            tenantId,
            contentLength: content.length,
        });
        if (!this.qdrantClient.isAvailable()) {
            this.logger.warn('Qdrant not available — skipping memory embedding');
            const fallbackId = `emb_${memoryId}_${Date.now()}`;
            await this.memoryService.updateEmbeddingId(tenantId, memoryId, fallbackId);
            return fallbackId;
        }
        const vector = await this.embedText(content);
        if (!vector) {
            this.logger.warn({ message: 'Embedding generation failed, skipping', memoryId });
            const fallbackId = `emb_failed_${memoryId}`;
            await this.memoryService.updateEmbeddingId(tenantId, memoryId, fallbackId);
            return fallbackId;
        }
        await this.ensureCollection(tenantId);
        const pointId = crypto.randomUUID();
        const client = this.qdrantClient.getClient();
        await client.upsert(this.collectionName(tenantId), {
            wait: true,
            points: [
                {
                    id: pointId,
                    vector,
                    payload: {
                        memoryId,
                        userId: metadata.userId,
                        type: metadata.type,
                        subject: metadata.subject ?? null,
                        content,
                        createdAt: new Date().toISOString(),
                    },
                },
            ],
        });
        // Store Qdrant point UUID in the database
        await this.memoryService.updateEmbeddingId(tenantId, memoryId, pointId);
        this.logger.log({
            message: 'Memory embedding generated and stored',
            memoryId,
            tenantId,
            pointId,
        });
        return pointId;
    }
    /**
     * Searches for similar memories using semantic similarity via Qdrant.
     */
    async semanticSearch(tenantId, userId, query, limit = 10, threshold = this.DEFAULT_THRESHOLD) {
        this.logger.debug({
            message: 'Performing semantic search for memories',
            tenantId,
            userId,
            queryLength: query.length,
            limit,
            threshold,
        });
        if (!this.qdrantClient.isAvailable()) {
            return this.keywordFallback(tenantId, userId, query, limit);
        }
        const vector = await this.embedText(query);
        if (!vector) {
            this.logger.warn({ message: 'Query embedding failed, using keyword fallback' });
            return this.keywordFallback(tenantId, userId, query, limit);
        }
        try {
            const client = this.qdrantClient.getClient();
            const results = await client.search(this.collectionName(tenantId), {
                vector,
                limit,
                filter: {
                    must: [{ key: 'userId', match: { value: userId } }],
                },
                with_payload: true,
                score_threshold: threshold,
            });
            return results.map((r) => ({
                memoryId: r.payload?.['memoryId'] ?? '',
                score: r.score,
                content: r.payload?.['content'] ?? '',
                subject: r.payload?.['subject'] ?? undefined,
                type: r.payload?.['type'] ?? 'FACTUAL_STATEMENT',
            }));
        }
        catch (error) {
            this.logger.warn({
                message: 'Qdrant memory search failed, using keyword fallback',
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return this.keywordFallback(tenantId, userId, query, limit);
        }
    }
    /**
     * Performs hybrid search combining vector and keyword matching.
     * Useful for finding client names mentioned exactly.
     */
    async hybridSearch(tenantId, userId, query, limit = 10) {
        this.logger.debug({
            message: 'Performing hybrid search for memories',
            tenantId,
            userId,
            query: query.substring(0, 50),
            limit,
        });
        // Extract potential client/project names (capitalized words)
        const potentialNames = query.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
        // Get semantic search results
        const semanticResults = await this.semanticSearch(tenantId, userId, query, limit);
        // Get keyword matches for extracted names
        const keywordResults = [];
        for (const name of potentialNames.slice(0, 3)) {
            const memories = await this.memoryService.findRelevantMemories(tenantId, userId, name, 5);
            for (const memory of memories) {
                if (memory.subject?.toLowerCase().includes(name.toLowerCase())) {
                    keywordResults.push({
                        memoryId: memory.id,
                        score: 0.95,
                        content: memory.content,
                        subject: memory.subject,
                        type: memory.type,
                    });
                }
            }
        }
        // Combine and deduplicate results
        const combined = [...keywordResults, ...semanticResults];
        const seen = new Set();
        const deduplicated = [];
        for (const result of combined) {
            if (!seen.has(result.memoryId)) {
                seen.add(result.memoryId);
                deduplicated.push(result);
            }
        }
        return deduplicated.sort((a, b) => b.score - a.score).slice(0, limit);
    }
    /**
     * Deletes an embedding from Qdrant.
     */
    async deleteEmbedding(tenantId, embeddingId) {
        if (!this.qdrantClient.isAvailable())
            return;
        try {
            const client = this.qdrantClient.getClient();
            await client.delete(this.collectionName(tenantId), {
                wait: true,
                points: [embeddingId],
            });
            this.logger.debug({ message: 'Memory embedding deleted', tenantId, embeddingId });
        }
        catch (error) {
            this.logger.error({
                message: 'Failed to delete memory embedding',
                tenantId,
                embeddingId,
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }
    /**
     * Generates an embedding vector using LM Studio nomic-embed-text (768-dim).
     */
    async embedText(text) {
        const endpoint = (await this.llmConfigService.getProviderEndpoint(types_1.LlmProviderType.LM_STUDIO)) ??
            DEFAULT_LM_STUDIO_ENDPOINT;
        try {
            const response = await fetch(`${endpoint}/v1/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.EMBEDDING_MODEL,
                    input: text,
                }),
            });
            if (!response.ok) {
                this.logger.error({
                    message: 'LM Studio embedding API error',
                    status: response.status,
                });
                return null;
            }
            const data = (await response.json());
            return data.data[0]?.embedding ?? null;
        }
        catch (error) {
            this.logger.error({
                message: 'Failed to generate embedding via LM Studio',
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return null;
        }
    }
    /**
     * Keyword-based fallback when Qdrant is unavailable.
     */
    async keywordFallback(tenantId, userId, query, limit) {
        const memories = await this.memoryService.findRelevantMemories(tenantId, userId, query, limit);
        return memories.map((memory, index) => ({
            memoryId: memory.id,
            score: 0.9 - index * 0.05,
            content: memory.content,
            subject: memory.subject,
            type: memory.type,
        }));
    }
};
exports.MemoryEmbeddingService = MemoryEmbeddingService;
exports.MemoryEmbeddingService = MemoryEmbeddingService = MemoryEmbeddingService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof memory_service_1.MemoryService !== "undefined" && memory_service_1.MemoryService) === "function" ? _a : Object, typeof (_b = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _b : Object, typeof (_c = typeof qdrant_client_service_1.QdrantClientService !== "undefined" && qdrant_client_service_1.QdrantClientService) === "function" ? _c : Object, typeof (_d = typeof llm_config_service_1.LlmConfigService !== "undefined" && llm_config_service_1.LlmConfigService) === "function" ? _d : Object])
], MemoryEmbeddingService);


/***/ }),
/* 141 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var MemoryContextBuilderService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MemoryContextBuilderService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const memory_embedding_service_1 = __webpack_require__(140);
/**
 * Service for building memory context for AI prompts.
 * Formats relevant memories for RAG injection.
 *
 * Story 2.7: Persistent Memory Across Conversations
 */
let MemoryContextBuilderService = MemoryContextBuilderService_1 = class MemoryContextBuilderService {
    constructor(memoryEmbeddingService) {
        this.memoryEmbeddingService = memoryEmbeddingService;
        this.logger = new common_1.Logger(MemoryContextBuilderService_1.name);
        /** Maximum tokens for memory context to preserve response quality.
         *  Reduced from 2000 to 800 to fit within 8K context window models. */
        this.MAX_MEMORY_TOKENS = 800;
        /** Approximate characters per token */
        this.CHARS_PER_TOKEN = 4;
    }
    /**
     * Builds memory context for a user query.
     * Retrieves relevant memories and formats them for prompt injection.
     *
     * @param query - User's query to match against memories
     * @param userId - User ID for memory retrieval
     * @param tenantId - Tenant ID for isolation
     * @returns Formatted context with attributions
     */
    async buildContext(query, userId, tenantId) {
        this.logger.debug({
            message: 'Building memory context',
            userId,
            tenantId,
            queryLength: query.length,
        });
        // Retrieve relevant memories via hybrid search
        const searchResults = await this.memoryEmbeddingService.hybridSearch(tenantId, userId, query, 10 // Top 10 most relevant
        );
        if (searchResults.length === 0) {
            this.logger.debug({
                message: 'No relevant memories found',
                userId,
                tenantId,
            });
            return {
                context: '',
                attributions: [],
                estimatedTokens: 0,
            };
        }
        // Build context string with token limit
        const attributions = [];
        let context = '\n\n--- PREVIOUS CONTEXT ABOUT THIS USER ---\n';
        let tokenCount = this.estimateTokens(context);
        const maxContentTokens = this.MAX_MEMORY_TOKENS - 100; // Reserve for header/footer
        for (const result of searchResults) {
            const memoryText = this.formatMemory(result);
            const memoryTokens = this.estimateTokens(memoryText);
            if (tokenCount + memoryTokens > maxContentTokens) {
                this.logger.debug({
                    message: 'Token limit reached, stopping memory inclusion',
                    includedCount: attributions.length,
                    remainingCount: searchResults.length - attributions.length,
                });
                break;
            }
            context += memoryText + '\n';
            tokenCount += memoryTokens;
            attributions.push({
                memoryId: result.memoryId,
                subject: result.subject || 'general context',
                summary: result.content.slice(0, 100),
                type: result.type,
            });
        }
        context += '--- END PREVIOUS CONTEXT ---\n\n';
        context +=
            'When using this context, indicate it with: "Based on our previous discussion about [subject]..."\n';
        const finalTokens = this.estimateTokens(context);
        this.logger.log({
            message: 'Memory context built',
            userId,
            tenantId,
            memoriesIncluded: attributions.length,
            estimatedTokens: finalTokens,
        });
        return {
            context,
            attributions,
            estimatedTokens: finalTokens,
        };
    }
    /**
     * Formats a single memory for inclusion in context.
     */
    formatMemory(result) {
        const typeLabel = this.getTypeLabel(result.type);
        const subjectPart = result.subject ? `: ${result.subject}` : '';
        return `[${typeLabel}${subjectPart}] ${result.content}`;
    }
    /**
     * Gets human-readable label for memory type.
     */
    getTypeLabel(type) {
        const labels = {
            CLIENT_CONTEXT: 'Client',
            PROJECT_CONTEXT: 'Project',
            USER_PREFERENCE: 'Preference',
            FACTUAL_STATEMENT: 'Fact',
        };
        return labels[type] || 'Note';
    }
    /**
     * Estimates token count for text.
     */
    estimateTokens(text) {
        return Math.ceil(text.length / this.CHARS_PER_TOKEN);
    }
    /**
     * Injects memory context into existing system prompt.
     *
     * @param systemPrompt - Original system prompt
     * @param memoryContext - Memory context to inject
     * @returns Modified system prompt with memory context
     */
    injectIntoSystemPrompt(systemPrompt, memoryContext) {
        if (!memoryContext.context) {
            return systemPrompt;
        }
        // Inject memory context after the main system prompt
        return `${systemPrompt}\n${memoryContext.context}`;
    }
    /**
     * Parses memory attributions from AI response.
     * Looks for patterns like "Based on our previous discussion about [X]..."
     *
     * @param response - AI response text
     * @param providedAttributions - Attributions that were provided in context
     * @returns Matched attributions
     */
    parseAttributionsFromResponse(response, providedAttributions) {
        const matched = [];
        // Look for "Based on our previous discussion about [subject]" patterns
        const patterns = [
            /Based on our previous discussion about ([^,.]+)/gi,
            /As we discussed regarding ([^,.]+)/gi,
            /From our earlier conversation about ([^,.]+)/gi,
            /You mentioned that ([^,.]+)/gi,
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(response)) !== null) {
                const mentionedSubject = match[1]?.trim().toLowerCase();
                // Skip if no subject captured
                if (!mentionedSubject) {
                    continue;
                }
                // Find matching attribution
                const found = providedAttributions.find((attr) => attr.subject.toLowerCase().includes(mentionedSubject) ||
                    mentionedSubject.includes(attr.subject.toLowerCase()));
                if (found && !matched.some((m) => m.memoryId === found.memoryId)) {
                    matched.push(found);
                }
            }
        }
        return matched;
    }
};
exports.MemoryContextBuilderService = MemoryContextBuilderService;
exports.MemoryContextBuilderService = MemoryContextBuilderService = MemoryContextBuilderService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof memory_embedding_service_1.MemoryEmbeddingService !== "undefined" && memory_embedding_service_1.MemoryEmbeddingService) === "function" ? _a : Object])
], MemoryContextBuilderService);


/***/ }),
/* 142 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.WorkflowModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const knowledge_module_1 = __webpack_require__(72);
const ai_gateway_module_1 = __webpack_require__(87);
const notes_module_1 = __webpack_require__(130);
const web_search_module_1 = __webpack_require__(143);
const workflow_service_1 = __webpack_require__(145);
const yolo_scheduler_service_1 = __webpack_require__(146);
let WorkflowModule = class WorkflowModule {
};
exports.WorkflowModule = WorkflowModule;
exports.WorkflowModule = WorkflowModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [tenant_context_1.TenantModule, knowledge_module_1.KnowledgeModule, ai_gateway_module_1.AiGatewayModule, notes_module_1.NotesModule, web_search_module_1.WebSearchModule],
        providers: [workflow_service_1.WorkflowService, yolo_scheduler_service_1.YoloSchedulerService],
        exports: [workflow_service_1.WorkflowService, yolo_scheduler_service_1.YoloSchedulerService],
    })
], WorkflowModule);


/***/ }),
/* 143 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.WebSearchModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const web_search_service_1 = __webpack_require__(144);
let WebSearchModule = class WebSearchModule {
};
exports.WebSearchModule = WebSearchModule;
exports.WebSearchModule = WebSearchModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule],
        providers: [web_search_service_1.WebSearchService],
        exports: [web_search_service_1.WebSearchService],
    })
], WebSearchModule);


/***/ }),
/* 144 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var WebSearchService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.WebSearchService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const axios_1 = tslib_1.__importDefault(__webpack_require__(56));
const SEARCH_TIMEOUT_MS = 8_000;
const PAGE_FETCH_TIMEOUT_MS = 10_000;
const TOTAL_WEB_RESEARCH_TIMEOUT_MS = 15_000;
const MAX_PAGE_CONTENT_CHARS = 3_000;
const MAX_TOTAL_WEB_CONTEXT_CHARS = 10_000;
let WebSearchService = WebSearchService_1 = class WebSearchService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(WebSearchService_1.name);
        this.apiKey = this.configService.get('SERPER_API_KEY');
    }
    /**
     * Whether web search is available (API key configured).
     */
    isAvailable() {
        return !!this.apiKey;
    }
    /**
     * Searches the web using Serper.dev Google Search API.
     * Returns top results with title, link, and snippet.
     */
    async search(query, numResults = 5) {
        if (!this.apiKey) {
            this.logger.warn('SERPER_API_KEY not configured — web search unavailable');
            return [];
        }
        try {
            const response = await axios_1.default.post('https://google.serper.dev/search', { q: query, num: numResults }, {
                headers: {
                    'X-API-KEY': this.apiKey,
                    'Content-Type': 'application/json',
                },
                timeout: SEARCH_TIMEOUT_MS,
            });
            const organic = response.data?.organic ?? [];
            const results = organic
                .slice(0, numResults)
                .map((item) => ({
                title: item.title ?? '',
                link: item.link ?? '',
                snippet: item.snippet ?? '',
            }));
            this.logger.log({
                message: 'Web search completed',
                query,
                resultCount: results.length,
            });
            return results;
        }
        catch (error) {
            this.logger.warn({
                message: 'Web search failed',
                query,
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return [];
        }
    }
    /**
     * Fetches a webpage and extracts text content.
     * Returns cleaned text content (max 5000 chars).
     */
    async fetchWebpage(url) {
        try {
            const response = await axios_1.default.get(url, {
                timeout: PAGE_FETCH_TIMEOUT_MS,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; MentorAI/1.0)',
                    Accept: 'text/html,application/xhtml+xml',
                },
                maxRedirects: 5,
                responseType: 'text',
            });
            const html = response.data;
            // Basic HTML to text extraction
            const text = this.extractTextFromHtml(html);
            this.logger.log({
                message: 'Webpage fetched',
                url,
                textLength: text.length,
            });
            return text.substring(0, 5000);
        }
        catch (error) {
            this.logger.warn({
                message: 'Webpage fetch failed',
                url,
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return '';
        }
    }
    /**
     * Combined search + deep page extraction with global timeout.
     * Returns enriched results with optional page content.
     */
    async searchAndExtract(query, numResults = 5) {
        let timeoutId;
        const globalTimeout = new Promise((resolve) => {
            timeoutId = setTimeout(() => {
                this.logger.warn({ message: 'Web research global timeout reached', query });
                resolve([]);
            }, TOTAL_WEB_RESEARCH_TIMEOUT_MS);
        });
        const work = async () => {
            try {
                // Phase 1: Search
                const searchResults = await this.search(query, numResults);
                if (searchResults.length === 0)
                    return [];
                const now = new Date().toISOString();
                // Phase 2: Deep fetch top 3 results in parallel
                const topResults = searchResults.slice(0, 3);
                const fetchResults = await Promise.allSettled(topResults.map((r) => this.fetchWebpage(r.link)));
                // Build enriched results with page content
                const enriched = [];
                let totalContentChars = 0;
                for (let i = 0; i < searchResults.length; i++) {
                    const result = searchResults[i];
                    let pageContent;
                    // Only top 3 have deep fetch attempts
                    if (i < fetchResults.length) {
                        const fetchResult = fetchResults[i];
                        if (fetchResult.status === 'fulfilled' && fetchResult.value) {
                            const truncated = fetchResult.value.substring(0, MAX_PAGE_CONTENT_CHARS);
                            if (totalContentChars + truncated.length <= MAX_TOTAL_WEB_CONTEXT_CHARS) {
                                pageContent = truncated;
                                totalContentChars += truncated.length;
                            }
                        }
                    }
                    // Also count snippet towards total
                    const snippetLen = result.snippet.length;
                    if (!pageContent && totalContentChars + snippetLen > MAX_TOTAL_WEB_CONTEXT_CHARS) {
                        continue; // Skip to stay within budget
                    }
                    if (!pageContent)
                        totalContentChars += snippetLen;
                    enriched.push({
                        title: result.title,
                        link: result.link,
                        snippet: result.snippet,
                        pageContent,
                        fetchedAt: now,
                    });
                }
                this.logger.log({
                    message: 'Search and extract completed',
                    query,
                    resultCount: enriched.length,
                    deepFetchCount: fetchResults.filter((r) => r.status === 'fulfilled' && r.value).length,
                    totalContentChars,
                });
                return enriched;
            }
            finally {
                clearTimeout(timeoutId);
            }
        };
        return Promise.race([work(), globalTimeout]);
    }
    /**
     * Formats enriched search results into an Obsidian-style context block
     * with markdown links [Title](URL) for AI system prompt injection.
     */
    formatSourcesAsObsidian(results) {
        if (!results || results.length === 0)
            return '';
        let context = '\n\n--- WEB ISTRAŽIVANJE (aktuelni podaci) ---';
        for (const result of results) {
            context += `\n\n**[${result.title}](${result.link})**`;
            if (result.pageContent) {
                context += `\n${result.pageContent}`;
            }
            else {
                context += `\n${result.snippet}`;
            }
        }
        context += '\n--- KRAJ WEB ISTRAŽIVANJA ---';
        context +=
            '\n\nKADA KORISTIŠ informacije iz web istraživanja, OBAVEZNO citiraj izvor INLINE odmah posle rečenice koja koristi tu informaciju.';
        context += '\nFormat citiranja: ([Naziv izvora](URL)) — stavi odmah posle relevantne rečenice.';
        context +=
            '\nPrimer: "Tržište digitalnog marketinga raste 15% godišnje ([Digital Marketing Report 2026](https://example.com/report))."';
        context += '\nAko ne koristiš informaciju iz izvora, NE citiraj ga.';
        return context;
    }
    /**
     * Basic HTML to text extraction without external dependencies.
     */
    extractTextFromHtml(html) {
        // Remove script and style tags with their content
        let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
        text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
        text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
        text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
        // Remove all HTML tags
        text = text.replace(/<[^>]+>/g, ' ');
        // Decode common HTML entities
        text = text.replace(/&nbsp;/g, ' ');
        text = text.replace(/&amp;/g, '&');
        text = text.replace(/&lt;/g, '<');
        text = text.replace(/&gt;/g, '>');
        text = text.replace(/&quot;/g, '"');
        text = text.replace(/&#39;/g, "'");
        // Collapse whitespace
        text = text.replace(/\s+/g, ' ').trim();
        return text;
    }
};
exports.WebSearchService = WebSearchService;
exports.WebSearchService = WebSearchService = WebSearchService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _a : Object])
], WebSearchService);


/***/ }),
/* 145 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var WorkflowService_1;
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.WorkflowService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const cuid2_1 = __webpack_require__(32);
const tenant_context_1 = __webpack_require__(9);
const prisma_1 = __webpack_require__(34);
const concept_service_1 = __webpack_require__(104);
const concept_matching_service_1 = __webpack_require__(109);
const citation_injector_service_1 = __webpack_require__(113);
const citation_service_1 = __webpack_require__(106);
const ai_gateway_service_1 = __webpack_require__(88);
const notes_service_1 = __webpack_require__(131);
const web_search_service_1 = __webpack_require__(144);
const business_context_service_1 = __webpack_require__(118);
const concept_relevance_service_1 = __webpack_require__(119);
const persona_prompts_1 = __webpack_require__(91);
const department_categories_1 = __webpack_require__(117);
const MAX_RECURSION_DEPTH = 10;
const WORKFLOW_GENERATION_SYSTEM_PROMPT = `Ti si dizajner poslovnih radnih tokova. Kreiraj strukturirane, sekvencijalne radne tokove gde svaki korak PROIZVODI konkretan poslovni dokument.

Svaki radni tok mora:
1. Početi sa analizom/procenom pre strateških preporuka
2. Uključiti promptove koji instruiraju AI da IZVRŠI posao i PROIZVEDE rezultate
3. Svaki korak proizvodi upotrebljiv izlaz (analizu, plan, matricu, strategiju, profil, itd.)
4. Koristiti odgovarajući departmanski okvir kada je departmentTag specificiran

KRITIČNO za promptTemplate polje:
- Prompt MORA instruirati AI da URADI posao, NE da objašnjava korisniku kako da ga uradi
- Prompt je INTERNI — korisnik ga NIKADA ne vidi. Korisnik vidi samo proizveden dokument.
- UVEK koristi imperativne glagole: "Izvrši", "Kreiraj", "Analiziraj", "Razvij", "Mapiraj", "Proizvedi"
- NIKADA ne koristi: "Objasnite", "Razmotrite", "Trebalo bi da", "Preporučuje se"

Primer DOBAR promptTemplate: "Izvrši kompletnu SWOT analizu za {{businessContext}} koristeći {{conceptName}} framework. Proizvedi strukturiranu matricu sa specifičnim nalazima za svaku kategoriju. Minimum 3 stavke po kategoriji sa konkretnim obrazloženjem."
Primer LOŠ promptTemplate: "Objasnite šta je SWOT analiza i kako je primeniti na poslovanje"

VAŽNO: Sav tekst MORA biti na SRPSKOM JEZIKU.
Vrati SAMO validan JSON niz bez markdown formatiranja.`;
let WorkflowService = WorkflowService_1 = class WorkflowService {
    constructor(prisma, conceptService, conceptMatchingService, citationInjectorService, citationService, aiGatewayService, notesService, webSearchService, businessContextService, conceptRelevanceService) {
        this.prisma = prisma;
        this.conceptService = conceptService;
        this.conceptMatchingService = conceptMatchingService;
        this.citationInjectorService = citationInjectorService;
        this.citationService = citationService;
        this.aiGatewayService = aiGatewayService;
        this.notesService = notesService;
        this.webSearchService = webSearchService;
        this.businessContextService = businessContextService;
        this.conceptRelevanceService = conceptRelevanceService;
        this.logger = new common_1.Logger(WorkflowService_1.name);
        /** In-memory store for active execution plans */
        this.activePlans = new Map();
        /** Cancellation tokens for running plans */
        this.cancellationTokens = new Map();
        /** Resolve functions for paused workflows awaiting user confirmation */
        this.stepResolvers = new Map();
    }
    // ─── Workflow Generation ──────────────────────────────────────
    /**
     * Gets a cached workflow or generates a new one for a concept.
     */
    async getOrGenerateWorkflow(conceptId, tenantId, userId) {
        const existing = await this.prisma.conceptWorkflow.findUnique({
            where: { conceptId },
            include: { concept: { select: { name: true } } },
        });
        if (existing) {
            return {
                conceptName: existing.concept.name,
                steps: existing.steps,
            };
        }
        return this.generateWorkflow(conceptId, tenantId, userId);
    }
    async generateWorkflow(conceptId, tenantId, userId) {
        const concept = await this.conceptService.findById(conceptId);
        // Gather prerequisite names
        const prerequisites = concept.relatedConcepts
            .filter((r) => r.relationshipType === 'PREREQUISITE' && r.direction === 'outgoing')
            .map((r) => r.concept.name);
        const prompt = this.buildGenerationPrompt(concept.name, concept.definition, concept.extendedDescription, prerequisites, concept.departmentTags);
        // LLM call to generate workflow steps
        let responseContent = '';
        await this.aiGatewayService.streamCompletionWithContext([
            { role: 'system', content: WORKFLOW_GENERATION_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
        ], {
            tenantId,
            userId,
            skipRateLimit: true,
            skipQuotaCheck: true,
        }, (chunk) => {
            responseContent += chunk;
        });
        const steps = this.parseWorkflowSteps(responseContent);
        // Cache in DB
        await this.prisma.conceptWorkflow.create({
            data: {
                id: `wfl_${(0, cuid2_1.createId)()}`,
                conceptId,
                steps: steps,
            },
        });
        this.logger.log({
            message: 'Workflow generated and cached',
            conceptId,
            conceptName: concept.name,
            stepCount: steps.length,
        });
        return { conceptName: concept.name, steps };
    }
    buildGenerationPrompt(name, definition, extendedDescription, prerequisites, departmentTags) {
        return `Generiši radni tok za IZVRŠAVANJE poslovne analize i PROIZVODNJU rezultata koristeći koncept "${name}".

Definicija: ${definition}
${extendedDescription ? `Prošireni opis: ${extendedDescription}` : ''}
${prerequisites.length > 0 ? `Preduslovi: ${prerequisites.join(', ')}` : 'Nema preduslova.'}
${departmentTags.length > 0 ? `Relevantni departmani: ${departmentTags.join(', ')}` : ''}

Vrati JSON niz koraka. Svaki korak mora imati:
- stepNumber (celobrojna vrednost počevši od 1)
- title (koncizan naslov akcije, max 60 karaktera, na srpskom)
- description (šta ovaj korak postiže, max 200 karaktera, na srpskom)
- promptTemplate (INTERNI prompt koji instruiše AI da IZVRŠI korak i PROIZVEDE konkretan rezultat — NE da objašnjava kako se radi. Koristi akcione glagole: "Izvrši", "Kreiraj", "Analiziraj", "Mapiraj". NIKADA "Objasnite" ili "Trebalo bi". MORA sadržati {{conceptName}} i {{businessContext}} placeholdere)
- expectedOutcome (konkretan deliverable, max 100 karaktera, na srpskom)
- estimatedMinutes (celobrojna vrednost)
- departmentTag (opciono: "CFO", "CMO", "CTO", "OPERATIONS", "LEGAL", "CREATIVE")

Generiši 3-6 koraka. Poredaj od procene/analize ka strateškim preporukama.`;
    }
    parseWorkflowSteps(response) {
        try {
            const cleaned = response
                .replace(/```json?\n?/g, '')
                .replace(/```/g, '')
                .trim();
            const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
            if (!jsonMatch)
                throw new Error('No JSON array found');
            const parsed = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(parsed) || parsed.length === 0)
                throw new Error('Empty array');
            return parsed.map((step, index) => ({
                stepNumber: step.stepNumber ?? index + 1,
                title: step.title || `Step ${index + 1}`,
                description: step.description || '',
                promptTemplate: step.promptTemplate ||
                    `Perform a comprehensive analysis of "{{conceptName}}" applied specifically to this business. {{businessContext}}. Produce a structured deliverable with concrete findings and recommendations.`,
                expectedOutcome: step.expectedOutcome || '',
                estimatedMinutes: step.estimatedMinutes ?? 5,
                departmentTag: step.departmentTag || undefined,
            }));
        }
        catch (error) {
            this.logger.warn({
                message: 'Failed to parse workflow steps, using fallback',
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return [
                {
                    stepNumber: 1,
                    title: 'Apply concept to business',
                    description: 'Perform analysis using this concept for the specific business',
                    promptTemplate: 'Apply the "{{conceptName}}" framework to this specific business. {{businessContext}}. Produce a structured analysis with actionable recommendations.',
                    expectedOutcome: 'Concrete analysis deliverable with recommendations',
                    estimatedMinutes: 10,
                },
            ];
        }
    }
    // ─── Prerequisite Resolution ──────────────────────────────────
    /**
     * Resolves concept ordering by PREREQUISITE relationships via topological sort.
     * Returns concept IDs in prerequisite-first order.
     */
    async resolveConceptOrder(conceptIds) {
        if (conceptIds.length <= 1)
            return conceptIds;
        const allIds = new Set(conceptIds);
        const graph = new Map();
        // Build adjacency: for each concept, find its prerequisites within our set
        for (const id of conceptIds) {
            try {
                const concept = await this.conceptService.findById(id);
                const prereqs = concept.relatedConcepts
                    .filter((r) => r.relationshipType === 'PREREQUISITE' &&
                    r.direction === 'outgoing' &&
                    allIds.has(r.concept.id))
                    .map((r) => r.concept.id);
                graph.set(id, prereqs);
            }
            catch {
                graph.set(id, []);
            }
        }
        return this.topologicalSort(graph);
    }
    topologicalSort(graph) {
        const visited = new Set();
        const visiting = new Set();
        const result = [];
        const visit = (nodeId, depth) => {
            if (depth > MAX_RECURSION_DEPTH) {
                this.logger.warn({ message: 'Max recursion depth exceeded', nodeId, depth });
                return;
            }
            if (visited.has(nodeId))
                return;
            if (visiting.has(nodeId)) {
                this.logger.warn({ message: 'Circular dependency detected, breaking cycle', nodeId });
                return;
            }
            visiting.add(nodeId);
            const deps = graph.get(nodeId) || [];
            for (const dep of deps) {
                visit(dep, depth + 1);
            }
            visiting.delete(nodeId);
            visited.add(nodeId);
            result.push(nodeId);
        };
        for (const nodeId of graph.keys()) {
            visit(nodeId, 0);
        }
        return result;
    }
    // ─── Execution Plan Building ──────────────────────────────────
    /**
     * Builds an execution plan from selected task IDs.
     * Loads linked concepts, generates workflows, orders by prerequisites.
     */
    async buildExecutionPlan(taskIds, userId, tenantId, _conversationId) {
        // Load pending tasks
        const tasks = await this.prisma.note.findMany({
            where: {
                id: { in: taskIds },
                tenantId,
                noteType: 'TASK',
                status: 'PENDING',
            },
        });
        if (tasks.length === 0) {
            throw new Error('No pending tasks found for the given IDs');
        }
        // Collect concept IDs from explicit task links + semantic search (parallel)
        const conceptIdSet = new Set();
        for (const task of tasks) {
            if (task.conceptId) {
                conceptIdSet.add(task.conceptId);
            }
        }
        // Run semantic searches in parallel
        const searchPromises = tasks
            .map((task) => {
            const searchText = `${task.title} ${task.content ?? ''}`.trim();
            if (searchText.length <= 5)
                return null;
            return this.conceptMatchingService
                .findRelevantConcepts(searchText, { limit: 3, threshold: 0.3 })
                .catch(() => []);
        })
            .filter(Boolean);
        const searchResults = await Promise.all(searchPromises);
        for (const matches of searchResults) {
            for (const m of matches) {
                conceptIdSet.add(m.conceptId);
            }
        }
        const conceptIds = [...conceptIdSet];
        this.logger.log({
            message: 'Concept resolution complete',
            taskCount: tasks.length,
            conceptCount: conceptIds.length,
            conceptIds: conceptIds.slice(0, 10),
        });
        if (conceptIds.length === 0) {
            throw new Error('Nema relevantnih koncepata za odabrane zadatke. Proverite da li su koncepti učitani u bazu znanja.');
        }
        // Resolve ordering
        const orderedConceptIds = await this.resolveConceptOrder(conceptIds);
        // Generate/load workflows in parallel (cached = instant, uncached = LLM call)
        const workflows = await Promise.all(orderedConceptIds.map(async (conceptId) => ({
            conceptId,
            workflow: await this.getOrGenerateWorkflow(conceptId, tenantId, userId),
        })));
        const planSteps = [];
        for (const { conceptId, workflow } of workflows) {
            for (const step of workflow.steps) {
                planSteps.push({
                    stepId: `step_${(0, cuid2_1.createId)()}`,
                    conceptId,
                    conceptName: workflow.conceptName,
                    workflowStepNumber: step.stepNumber,
                    title: step.title,
                    description: step.description,
                    estimatedMinutes: step.estimatedMinutes,
                    departmentTag: step.departmentTag,
                    status: 'pending',
                });
            }
        }
        // Deduplicate: if same concept+stepNumber appears multiple times, keep first
        const seen = new Set();
        const deduplicatedSteps = planSteps.filter((step) => {
            const key = `${step.conceptId}:${step.workflowStepNumber}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        const plan = {
            planId: `ep_${(0, cuid2_1.createId)()}`,
            taskIds,
            steps: deduplicatedSteps,
            totalEstimatedMinutes: deduplicatedSteps.reduce((sum, s) => sum + s.estimatedMinutes, 0),
            conceptOrder: orderedConceptIds,
            status: 'awaiting_approval',
            createdAt: new Date().toISOString(),
        };
        this.activePlans.set(plan.planId, plan);
        this.logger.log({
            message: 'Execution plan built',
            planId: plan.planId,
            taskCount: taskIds.length,
            conceptCount: orderedConceptIds.length,
            stepCount: deduplicatedSteps.length,
            estimatedMinutes: plan.totalEstimatedMinutes,
        });
        return plan;
    }
    // ─── Plan Execution ───────────────────────────────────────────
    /**
     * Executes an approved plan step by step.
     * Streams each step's LLM output via callbacks.
     */
    async executePlan(planId, conversationId, userId, tenantId, callbacks) {
        const plan = this.activePlans.get(planId);
        if (!plan)
            throw new Error(`Plan ${planId} not found`);
        plan.status = 'executing';
        this.cancellationTokens.set(planId, false);
        let completedCount = 0;
        const completedSummaries = [];
        for (let i = 0; i < plan.steps.length; i++) {
            // Check cancellation
            if (this.cancellationTokens.get(planId)) {
                plan.status = 'cancelled';
                callbacks.onComplete('cancelled', completedCount, plan.steps.length);
                this.scheduledCleanup(planId);
                return;
            }
            const step = plan.steps[i];
            if (!step)
                continue;
            // Pause BEFORE each step — let the user provide input/answers
            callbacks.onStepAwaitingConfirmation(step);
            const userInput = await new Promise((resolve) => {
                this.stepResolvers.set(planId, resolve);
            });
            this.stepResolvers.delete(planId);
            // Check cancellation after waiting
            if (this.cancellationTokens.get(planId)) {
                plan.status = 'cancelled';
                callbacks.onComplete('cancelled', completedCount, plan.steps.length);
                this.scheduledCleanup(planId);
                return;
            }
            // If user provided input, inject it as context for this step
            if (userInput) {
                completedSummaries.push({
                    title: 'Korisnički odgovor',
                    conceptName: step.conceptName,
                    summary: userInput,
                });
            }
            step.status = 'in_progress';
            callbacks.onStepStart(step.stepId);
            try {
                const result = await this.executeStepAutonomous(step, conversationId, userId, tenantId, (chunk) => callbacks.onStepChunk(step.stepId, chunk), completedSummaries);
                // Check cancellation after step
                if (this.cancellationTokens.get(planId)) {
                    plan.status = 'cancelled';
                    callbacks.onComplete('cancelled', completedCount, plan.steps.length);
                    this.scheduledCleanup(planId);
                    return;
                }
                // Save AI message with citation-injected content to concept conversation
                const messageId = await callbacks.saveMessage('assistant', result.content, step.conceptId);
                // Persist citations to DB (fire-and-forget)
                if (result.citations.length > 0 && messageId) {
                    this.citationService.storeCitations(messageId, result.citations).catch((err) => {
                        this.logger.warn({
                            message: 'Failed to store workflow step citations',
                            stepId: step.stepId,
                            error: err instanceof Error ? err.message : 'Unknown',
                        });
                    });
                }
                step.status = 'completed';
                completedCount++;
                completedSummaries.push({
                    title: step.title,
                    conceptName: step.conceptName,
                    summary: result.content.substring(0, 300),
                });
                callbacks.onStepComplete(step.stepId, result.content, result.citations);
                // Create sub-task note linked to parent task (with dedup by parentNoteId + stepNumber, Story 3.4 AC3)
                for (const taskId of plan.taskIds) {
                    try {
                        const parentNote = await this.notesService.getNoteById(taskId, tenantId);
                        if (parentNote && parentNote.conceptId === step.conceptId) {
                            // Check if sub-task already exists for this step
                            const existingSubTask = await this.notesService.findExistingSubTask(tenantId, taskId, step.workflowStepNumber ?? 0);
                            if (existingSubTask) {
                                this.logger.debug({
                                    message: 'Skipping duplicate sub-task',
                                    stepId: step.stepId,
                                    existingSubTaskId: existingSubTask,
                                    parentNoteId: taskId,
                                    workflowStepNumber: step.workflowStepNumber,
                                });
                                break;
                            }
                            await this.notesService.createNote({
                                title: step.title,
                                content: result.content,
                                source: prisma_1.NoteSource.CONVERSATION,
                                noteType: prisma_1.NoteType.TASK,
                                status: prisma_1.NoteStatus.READY_FOR_REVIEW,
                                userId,
                                tenantId,
                                conversationId,
                                conceptId: step.conceptId,
                                parentNoteId: taskId,
                                expectedOutcome: step.description?.substring(0, 500),
                                workflowStepNumber: step.workflowStepNumber,
                            });
                            break;
                        }
                    }
                    catch (err) {
                        this.logger.warn({
                            message: 'Failed to create sub-task note',
                            stepId: step.stepId,
                            error: err instanceof Error ? err.message : 'Unknown',
                        });
                    }
                }
            }
            catch (error) {
                this.logger.error({
                    message: 'Step execution failed',
                    stepId: step.stepId,
                    error: error instanceof Error ? error.message : 'Unknown',
                });
                step.status = 'failed';
                callbacks.onStepFailed(step.stepId, error instanceof Error ? error.message : 'Step failed');
            }
        }
        // Mark original tasks as completed
        for (const taskId of plan.taskIds) {
            try {
                await this.notesService.updateStatus(taskId, prisma_1.NoteStatus.COMPLETED, tenantId);
            }
            catch (error) {
                this.logger.warn({
                    message: 'Failed to mark task complete',
                    taskId,
                    error: error instanceof Error ? error.message : 'Unknown',
                });
            }
        }
        // Story 3.2: Discover related concepts and create new pending tasks
        const completedConceptIds = [
            ...new Set(plan.steps.filter((s) => s.status === 'completed').map((s) => s.conceptId)),
        ];
        if (completedConceptIds.length > 0) {
            this.discoverAndCreatePendingTasks(completedConceptIds, userId, tenantId)
                .then((newConceptIds) => {
                if (newConceptIds.length > 0 && callbacks.onTasksDiscovered) {
                    callbacks.onTasksDiscovered(newConceptIds);
                }
            })
                .catch((err) => {
                this.logger.warn({
                    message: 'Post-execution discovery failed',
                    planId,
                    error: err instanceof Error ? err.message : 'Unknown',
                });
            });
        }
        plan.status = 'completed';
        callbacks.onComplete('completed', completedCount, plan.steps.length);
        this.scheduledCleanup(planId);
    }
    /**
     * Executes a single plan step by calling the LLM with Qdrant-driven concept knowledge.
     * Queries embeddings to find relevant concepts, loads full knowledge, and produces
     * actionable deliverables (not instructions). Citations come from known input concepts.
     */
    async executeStepAutonomous(step, conversationId, userId, tenantId, onChunk, completedSummaries = []) {
        // Load the workflow to get the prompt template
        const workflow = await this.getOrGenerateWorkflow(step.conceptId, tenantId, userId);
        const workflowStep = workflow.steps.find((s) => s.stepNumber === step.workflowStepNumber);
        if (!workflowStep) {
            throw new Error(`Workflow step ${step.workflowStepNumber} not found for concept ${step.conceptId}`);
        }
        // 1. Semantic search: find relevant concepts via Qdrant embeddings
        const searchText = `${step.title} ${step.description ?? ''} ${step.conceptName}`;
        const embeddingMatches = await this.conceptMatchingService
            .findRelevantConcepts(searchText, { limit: 5, threshold: 0.5 })
            .catch(() => []);
        // Collect: primary concept + all embedding matches
        const conceptIdsToLoad = new Set([step.conceptId]);
        for (const m of embeddingMatches) {
            conceptIdsToLoad.add(m.conceptId);
        }
        // 2. Load ALL matched concepts and build rich knowledge block
        const loadedConcepts = [];
        const citationCandidates = [];
        let conceptKnowledge = '\n\n--- CONCEPT KNOWLEDGE (use this to perform the task) ---';
        for (const conceptId of conceptIdsToLoad) {
            try {
                const concept = await this.conceptService.findById(conceptId);
                loadedConcepts.push(concept);
                conceptKnowledge += `\n\nCONCEPT: ${concept.name} (${concept.category})`;
                conceptKnowledge += `\nDEFINITION: ${concept.definition}`;
                if (concept.extendedDescription) {
                    conceptKnowledge += `\nDETAILED KNOWLEDGE: ${concept.extendedDescription}`;
                }
                if (concept.relatedConcepts && concept.relatedConcepts.length > 0) {
                    const related = concept.relatedConcepts
                        .slice(0, 3)
                        .map((r) => `${r.concept.name} (${r.relationshipType})`)
                        .join(', ');
                    conceptKnowledge += `\nRELATED: ${related}`;
                }
                citationCandidates.push({
                    conceptId: concept.id,
                    conceptName: concept.name,
                    category: concept.category,
                    definition: concept.definition,
                    score: embeddingMatches.find((m) => m.conceptId === concept.id)?.score ?? 0.8,
                });
            }
            catch {
                // Concept not found — skip
            }
        }
        conceptKnowledge += '\n--- END CONCEPT KNOWLEDGE ---';
        // 3. Load business context
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true, industry: true, description: true },
        });
        let businessInfo = '';
        if (tenant) {
            businessInfo = `\n\n--- BUSINESS CONTEXT ---\nCompany: ${tenant.name}`;
            if (tenant.industry)
                businessInfo += `\nIndustry: ${tenant.industry}`;
            if (tenant.description)
                businessInfo += `\nDescription: ${tenant.description}`;
            businessInfo += '\n--- END BUSINESS CONTEXT ---';
        }
        // 3.2 Story 3.2: Load tenant-wide Business Brain context (all memories)
        let brainContext = '';
        try {
            brainContext = await this.businessContextService.getBusinessContext(tenantId);
        }
        catch (err) {
            this.logger.warn({
                message: 'Business context load failed (non-blocking)',
                tenantId,
                error: err instanceof Error ? err.message : 'Unknown',
            });
        }
        // 3.5. Web search: enrich with real-time data (always when available)
        let webSearchContext = '';
        if (this.webSearchService.isAvailable()) {
            try {
                const searchQuery = this.buildSearchQuery(step, tenant);
                const enrichedResults = await this.webSearchService.searchAndExtract(searchQuery, 5);
                webSearchContext = this.webSearchService.formatSourcesAsObsidian(enrichedResults);
            }
            catch (err) {
                this.logger.warn({
                    message: 'Web search failed (non-blocking)',
                    stepId: step.stepId,
                    error: err instanceof Error ? err.message : 'Unknown',
                });
            }
        }
        // 4. Build ACTIONABLE system prompt with anti-patterns and few-shot examples
        let systemPromptText = `Ti si iskusan poslovni konsultant koji IZVRŠAVA zadatke za klijenta. NE objašnjavaš koncepte i NE daješ uputstva — ti PROIZVODIŠ konkretan poslovni dokument.

ZADATAK: ${step.title}
OČEKIVANI REZULTAT: ${workflowStep.expectedOutcome}

PRAVILA:
1. URADI posao — nemoj opisivati kako se radi. Proizvedi gotov dokument.
2. Koristi ZNANJE O KONCEPTIMA ispod kao analitički okvir, ali ga NE objašnjavaj korisniku
3. Primeni analizu specifično na OVO poslovanje koristeći POSLOVNI KONTEKST
4. Proizvedi kompletan, upotrebljiv rezultat koji klijent može odmah koristiti
5. Kada koristiš znanje iz koncepta, označi ga kao [[Naziv Koncepta]]
6. Budi konkretan — koristi ime kompanije, industriju i specifičnu situaciju
7. Strukturiraj sa zaglavljima, tabelama, nabrajanjima i konkretnim preporukama
8. Odgovaraj ISKLJUČIVO na srpskom jeziku

ZABRANJENO (nikada ne radi ovo):
- NE piši "trebalo bi da analizirate..." ili "preporučuje se da razmotrite..."
- NE piši "potrebno je da razmotrite..." ili "razmislite o sledećem..."
- NE objašnjavaj šta je koncept ili framework — PRIMENI ga
- NE daj generičke savete — daj SPECIFIČNE nalaze za ovu kompaniju
- NE opisuj korake koje klijent treba da preduzme — TI ih preduzmi i predstavi rezultate
- NE piši uvode tipa "U ovom dokumentu ćemo..." — odmah počni sa sadržajem

PRIMER DOBROG ODGOVORA (SWOT analiza za "LuxVino", luksuzna vina):
---
## SWOT Analiza — LuxVino

### Snage
1. **Premium pozicioniranje** — ručna berba i ograničena proizvodnja [[Value Proposition]]
2. **45 godina porodičnog vinogradarstva** — autentičnost brenda
3. **Ekskluzivni ugovori sa 30+ restorana** — stabilan B2B kanal

### Slabosti
1. **Samo 2% prihoda iz online kanala** — propuštena digitalna publika
---

PRIMER LOŠEG ODGOVORA (ZABRANJENO):
---
"SWOT analiza je strateški alat koji se koristi za procenu snaga, slabosti, prilika i pretnji.
Da biste je primenili na vaše poslovanje, trebalo bi da:
1. Identifikujete vaše ključne snage..."
---
Ovo je ZABRANJENO jer objašnjava alat umesto da ga primeni.${conceptKnowledge}${businessInfo}${brainContext}${webSearchContext}`;
        if (step.departmentTag) {
            const personaPrompt = (0, persona_prompts_1.generateSystemPrompt)(step.departmentTag);
            if (personaPrompt) {
                systemPromptText = `${systemPromptText}\n\n${personaPrompt}`;
            }
        }
        // Inject completed step summaries to prevent repetition
        if (completedSummaries.length > 0) {
            systemPromptText += '\n\n--- VEĆ ZAVRŠENI KORACI (NE PONAVLJAJ) ---';
            for (const prev of completedSummaries) {
                systemPromptText += `\nKORAK: ${prev.title} (${prev.conceptName})`;
                systemPromptText += `\nREZIME: ${prev.summary}`;
            }
            systemPromptText += '\n--- KRAJ ZAVRŠENIH KORAKA ---';
            systemPromptText +=
                '\nKRITIČNO: NE ponavljaj analize ili preporuke iz prethodnih koraka. Nadogradi na njima i fokusiraj se SAMO na nove uvide specifične za trenutni zadatak.';
        }
        // 5. Build user prompt from template
        const prompt = workflowStep.promptTemplate
            .replace(/\{\{conceptName\}\}/g, step.conceptName)
            .replace(/\{\{businessContext\}\}/g, tenant ? `for ${tenant.name} (${tenant.industry ?? 'business'})` : 'for this business');
        // 6. Stream AI response
        let fullContent = '';
        await this.aiGatewayService.streamCompletionWithContext([{ role: 'user', content: prompt }], {
            tenantId,
            userId,
            conversationId,
            skipRateLimit: true,
            skipQuotaCheck: true,
            businessContext: systemPromptText,
        }, (chunk) => {
            fullContent += chunk;
            onChunk(chunk);
        });
        // 7. Inject citations from KNOWN input concepts (not post-hoc output scanning)
        let citations = [];
        let contentWithCitations = fullContent;
        if (citationCandidates.length > 0) {
            try {
                const citationResult = this.citationInjectorService.injectCitations(fullContent, citationCandidates);
                contentWithCitations = citationResult.content;
                citations = citationResult.citations;
            }
            catch {
                // Citation injection failed — return content without citations
            }
        }
        return { content: contentWithCitations, citations };
    }
    /**
     * Returns an active plan by ID (for metadata lookups).
     */
    getActivePlan(planId) {
        return this.activePlans.get(planId);
    }
    /**
     * Cancels a running plan.
     */
    cancelPlan(planId) {
        if (this.activePlans.has(planId)) {
            this.cancellationTokens.set(planId, true);
            // Also resolve any pending step wait so the loop can exit
            const resolver = this.stepResolvers.get(planId);
            if (resolver) {
                resolver(undefined);
                this.stepResolvers.delete(planId);
            }
            return true;
        }
        return false;
    }
    /**
     * Continues a paused workflow after user confirmation.
     * Optionally accepts user input to inject as context for the next step.
     */
    continueStep(planId, userInput) {
        const resolver = this.stepResolvers.get(planId);
        if (resolver) {
            resolver(userInput);
        }
        else {
            this.logger.warn({ message: 'No step resolver found for plan', planId });
        }
    }
    /**
     * Builds an optimized search query from step context.
     * Leads with concept name, adds step keywords, company name, industry, and current year.
     * Note: Serbian concept names are passed as-is. A future enhancement could translate
     * key Serbian terms to English for improved Google search result quality.
     */
    buildSearchQuery(step, tenant) {
        const parts = [];
        // Lead with concept name words (most specific)
        if (step.conceptName) {
            parts.push(...step.conceptName.split(/\s+/).filter((w) => w.length > 0));
        }
        // Extract action keywords from step title (strip filler words)
        const fillerWords = new Set([
            'create',
            'a',
            'the',
            'draft',
            'build',
            'develop',
            'perform',
            'run',
            'kreiraj',
            'izradi',
            'napravi',
            'izvrši',
            'uradi',
            'za',
        ]);
        const titleWords = step.title
            .split(/\s+/)
            .filter((w) => w.length > 2 && !fillerWords.has(w.toLowerCase()));
        parts.push(...titleWords.slice(0, 4));
        // Add company name and industry context
        if (tenant?.name)
            parts.push(tenant.name);
        if (tenant?.industry)
            parts.push(tenant.industry);
        // Append current year for temporal relevance
        parts.push(new Date().getFullYear().toString());
        // Deduplicate (case-insensitive) and limit to 12 words
        const seen = new Set();
        const deduped = parts.filter((w) => {
            const lower = w.toLowerCase();
            if (seen.has(lower))
                return false;
            seen.add(lower);
            return true;
        });
        return deduped.slice(0, 12).join(' ');
    }
    /**
     * @deprecated Use WebSearchService.formatSourcesAsObsidian() instead.
     * Kept as passthrough for test compatibility.
     */
    formatWebContext(results) {
        return this.webSearchService.formatSourcesAsObsidian(results);
    }
    /**
     * Story 3.2: Post-execution discovery hook.
     * Traverses relationship edges from completed concepts and creates new PENDING tasks
     * for the user, scoped to their visible categories.
     * Capped at 10 new tasks per execution to prevent explosion.
     */
    async discoverAndCreatePendingTasks(completedConceptIds, userId, tenantId) {
        const MAX_NEW_TASKS = 10;
        // Get user's department to scope discoveries
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { department: true, role: true },
        });
        const visibleCategories = (0, department_categories_1.getVisibleCategories)(user?.department ?? null, user?.role ?? 'MEMBER');
        // Load all outgoing relationships from completed concepts
        const relationships = await this.prisma.conceptRelationship.findMany({
            where: {
                sourceConceptId: { in: completedConceptIds },
            },
            include: {
                targetConcept: { select: { id: true, name: true, category: true } },
            },
        });
        if (relationships.length === 0)
            return [];
        // Get target concept IDs
        const targetConceptIds = relationships.map((r) => r.targetConcept.id);
        // Story 3.3 AC6: Single batch query for duplicate prevention
        // Covers both PENDING and COMPLETED task notes for this user
        const existingNotes = await this.prisma.note.findMany({
            where: {
                userId,
                tenantId,
                conceptId: { in: targetConceptIds },
                noteType: prisma_1.NoteType.TASK,
            },
            select: { conceptId: true },
        });
        const existingConceptIds = new Set(existingNotes.map((n) => n.conceptId).filter(Boolean));
        // Filter to only new concepts within user's visible categories
        const newConcepts = relationships
            .map((r) => ({
            concept: r.targetConcept,
            relationshipType: r.relationshipType,
        }))
            .filter((r) => !existingConceptIds.has(r.concept.id))
            .filter((r) => !visibleCategories || visibleCategories.includes(r.concept.category));
        // Story 3.3 AC5: Relevance scoring — filter by business relevance
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { industry: true },
        });
        const tenantIndustry = tenant?.industry ?? '';
        const completedSet = new Set(completedConceptIds);
        const relevanceThreshold = this.conceptRelevanceService.getThreshold(user?.role ?? 'MEMBER');
        // Get categories of completed concepts for domain-specific prior activity scoring
        const completedConceptData = await this.prisma.concept.findMany({
            where: { id: { in: completedConceptIds } },
            select: { category: true },
        });
        const completedCategories = new Set(completedConceptData.map((c) => c.category.replace(/^\d+\.\s*/, '').trim()));
        const relevantConcepts = newConcepts.filter((r) => {
            const score = this.conceptRelevanceService.scoreRelevance({
                conceptCategory: r.concept.category,
                tenantIndustry,
                completedConceptIds: completedSet,
                completedCategories,
                department: user?.department ?? null,
                role: user?.role ?? 'MEMBER',
                relationshipType: r.relationshipType,
            });
            if (score < relevanceThreshold) {
                this.logger.log({
                    message: 'Concept skipped — low relevance',
                    conceptId: r.concept.id,
                    conceptName: r.concept.name,
                    score: score.toFixed(2),
                    threshold: relevanceThreshold,
                    category: r.concept.category,
                });
                return false;
            }
            return true;
        });
        // Deduplicate
        const uniqueNew = [...new Map(relevantConcepts.map((r) => [r.concept.id, r.concept])).values()];
        const toSeed = uniqueNew.slice(0, MAX_NEW_TASKS);
        if (toSeed.length === 0)
            return [];
        // Create PENDING task Notes
        const noteData = toSeed.map((concept) => ({
            id: `note_${(0, cuid2_1.createId)()}`,
            title: concept.name,
            content: `Istraži koncept: ${concept.name}`,
            source: prisma_1.NoteSource.CONVERSATION,
            noteType: prisma_1.NoteType.TASK,
            status: prisma_1.NoteStatus.PENDING,
            conceptId: concept.id,
            userId,
            tenantId,
        }));
        await this.prisma.note.createMany({ data: noteData });
        const newConceptIds = toSeed.map((c) => c.id);
        this.logger.log({
            message: 'Post-execution discovery: new pending tasks created',
            userId,
            tenantId,
            completedConceptIds,
            newTaskCount: noteData.length,
            newConceptNames: toSeed.map((c) => c.name),
        });
        return newConceptIds;
    }
    scheduledCleanup(planId) {
        setTimeout(() => {
            this.activePlans.delete(planId);
            this.cancellationTokens.delete(planId);
            this.stepResolvers.delete(planId);
        }, 30000);
    }
};
exports.WorkflowService = WorkflowService;
exports.WorkflowService = WorkflowService = WorkflowService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object, typeof (_b = typeof concept_service_1.ConceptService !== "undefined" && concept_service_1.ConceptService) === "function" ? _b : Object, typeof (_c = typeof concept_matching_service_1.ConceptMatchingService !== "undefined" && concept_matching_service_1.ConceptMatchingService) === "function" ? _c : Object, typeof (_d = typeof citation_injector_service_1.CitationInjectorService !== "undefined" && citation_injector_service_1.CitationInjectorService) === "function" ? _d : Object, typeof (_e = typeof citation_service_1.CitationService !== "undefined" && citation_service_1.CitationService) === "function" ? _e : Object, typeof (_f = typeof ai_gateway_service_1.AiGatewayService !== "undefined" && ai_gateway_service_1.AiGatewayService) === "function" ? _f : Object, typeof (_g = typeof notes_service_1.NotesService !== "undefined" && notes_service_1.NotesService) === "function" ? _g : Object, typeof (_h = typeof web_search_service_1.WebSearchService !== "undefined" && web_search_service_1.WebSearchService) === "function" ? _h : Object, typeof (_j = typeof business_context_service_1.BusinessContextService !== "undefined" && business_context_service_1.BusinessContextService) === "function" ? _j : Object, typeof (_k = typeof concept_relevance_service_1.ConceptRelevanceService !== "undefined" && concept_relevance_service_1.ConceptRelevanceService) === "function" ? _k : Object])
], WorkflowService);


/***/ }),
/* 146 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var YoloSchedulerService_1;
var _a, _b, _c, _d, _e, _f, _g, _h;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.YoloSchedulerService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const cuid2_1 = __webpack_require__(32);
const tenant_context_1 = __webpack_require__(9);
const prisma_1 = __webpack_require__(34);
const workflow_service_1 = __webpack_require__(145);
const notes_service_1 = __webpack_require__(131);
const concept_service_1 = __webpack_require__(104);
const concept_matching_service_1 = __webpack_require__(109);
const curriculum_service_1 = __webpack_require__(107);
const concept_extraction_service_1 = __webpack_require__(114);
const concept_relevance_service_1 = __webpack_require__(119);
const MAX_LOG_BUFFER = 100;
const SUMMARY_TRUNCATE_LENGTH = 300;
const RETRY_BASE_DELAY_MS = 5_000; // 5s base, exponential: 5s, 15s, 45s
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 30_000; // 30s pause after consecutive failures
let YoloSchedulerService = YoloSchedulerService_1 = class YoloSchedulerService {
    constructor(workflowService, prisma, notesService, conceptService, conceptMatchingService, curriculumService, conceptExtractionService, conceptRelevanceService) {
        this.workflowService = workflowService;
        this.prisma = prisma;
        this.notesService = notesService;
        this.conceptService = conceptService;
        this.conceptMatchingService = conceptMatchingService;
        this.curriculumService = curriculumService;
        this.conceptExtractionService = conceptExtractionService;
        this.conceptRelevanceService = conceptRelevanceService;
        this.logger = new common_1.Logger(YoloSchedulerService_1.name);
        this.activeRuns = new Map();
    }
    /**
     * Starts YOLO autonomous execution for all pending tasks of a tenant.
     * Returns the planId for tracking.
     */
    async startYoloExecution(tenantId, userId, conversationId, config, callbacks, conceptConversations, category // Story 3.2: per-domain scoping
    ) {
        const planId = `yolo_${(0, cuid2_1.createId)()}`;
        // Load pending TASK notes for this tenant
        let taskNotes = await this.prisma.note.findMany({
            where: { tenantId, noteType: 'TASK', status: 'PENDING', conceptId: { not: null } },
        });
        // Story 3.10: Relevance-ranked concept selection with execution budget
        const executionBudget = config.maxExecutionBudget ?? 50;
        const totalConsidered = taskNotes.length;
        let createdOnlyCount = 0;
        if (taskNotes.length > 0) {
            const conceptIds = [...new Set(taskNotes.map((n) => n.conceptId))];
            const concepts = await this.prisma.concept.findMany({
                where: { id: { in: conceptIds } },
                select: { id: true, category: true },
            });
            const conceptCategoryMap = new Map(concepts.map((c) => [c.id, c.category]));
            if (category) {
                // Per-domain: only concepts in the specified category
                taskNotes = taskNotes.filter((n) => n.conceptId && conceptCategoryMap.get(n.conceptId) === category);
            }
            // Load tenant + user info for relevance scoring
            const tenant = await this.prisma.tenant.findUnique({
                where: { id: tenantId },
                select: { industry: true },
            });
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { department: true, role: true },
            });
            // Load completed concepts for prior activity scoring (Review fix: HIGH #7 — completedCategories was empty)
            const completedNotes = await this.prisma.note.findMany({
                where: { tenantId, noteType: 'TASK', status: 'COMPLETED', conceptId: { not: null } },
                select: { conceptId: true },
            });
            const completedConceptIds = new Set(completedNotes.map((n) => n.conceptId));
            const completedConceptData = completedConceptIds.size > 0
                ? await this.prisma.concept.findMany({
                    where: { id: { in: [...completedConceptIds] } },
                    select: { category: true },
                })
                : [];
            const completedCategories = new Set(completedConceptData.map((c) => c.category.replace(/^\d+\.\s*/, '').trim()));
            // Load strongest relationship type per concept (Review fix: HIGH #1 — relationshipType was missing)
            const conceptRelationships = await this.prisma.conceptRelationship.findMany({
                where: { targetConceptId: { in: conceptIds } },
                select: { targetConceptId: true, relationshipType: true },
            });
            const relPriority = { PREREQUISITE: 3, RELATED: 2, ADVANCED: 1 };
            const conceptRelTypes = new Map();
            for (const rel of conceptRelationships) {
                const existing = conceptRelTypes.get(rel.targetConceptId);
                if (!existing || (relPriority[rel.relationshipType] ?? 0) > (relPriority[existing] ?? 0)) {
                    conceptRelTypes.set(rel.targetConceptId, rel.relationshipType);
                }
            }
            // Score every candidate concept by relevance (Review fix: HIGH #3 — wrapped in try/catch)
            let scoredCandidates;
            try {
                scoredCandidates = taskNotes.map((note) => ({
                    note,
                    score: this.conceptRelevanceService.scoreRelevance({
                        conceptCategory: conceptCategoryMap.get(note.conceptId) ?? '',
                        tenantIndustry: tenant?.industry ?? '',
                        completedConceptIds,
                        completedCategories,
                        department: user?.department ?? null,
                        role: user?.role ?? 'MEMBER',
                        relationshipType: conceptRelTypes.get(note.conceptId),
                    }),
                }));
            }
            catch (err) {
                this.logger.error({
                    message: 'Relevance scoring failed, executing all candidates without ranking',
                    error: err instanceof Error ? err.message : 'Unknown',
                });
                scoredCandidates = taskNotes.map((note) => ({ note, score: 0.5 }));
            }
            // Sort descending by relevance score
            scoredCandidates.sort((a, b) => b.score - a.score);
            // Split: top N execute, rest are create-only (already PENDING in DB)
            const toExecute = scoredCandidates.slice(0, executionBudget);
            const toCreateOnly = scoredCandidates.slice(executionBudget);
            createdOnlyCount = toCreateOnly.length;
            if (toExecute.length > 0 && toCreateOnly.length > 0) {
                const cutoffScore = toExecute[toExecute.length - 1].score;
                this.logger.log({
                    message: `YOLO concept selection: ${toExecute.length} to execute, ${toCreateOnly.length} deferred`,
                    cutoffScore: cutoffScore.toFixed(3),
                    totalConsidered,
                    executionBudget,
                });
            }
            taskNotes = toExecute.map((c) => c.note);
        }
        if (taskNotes.length === 0) {
            callbacks.onError('No pending tasks found');
            return planId;
        }
        // Build task map with concept info (batch lookups to avoid N+1)
        const tasks = new Map();
        const notesWithConcepts = taskNotes.filter((n) => n.conceptId);
        const uniqueConceptIds = [...new Set(notesWithConcepts.map((n) => n.conceptId))];
        const conceptNames = new Map();
        await Promise.all(uniqueConceptIds.map(async (conceptId) => {
            try {
                const concept = await this.conceptService.findById(conceptId);
                if (concept.name)
                    conceptNames.set(conceptId, concept.name);
            }
            catch {
                // Fallback — concept name resolved from note title below
            }
        }));
        for (const note of notesWithConcepts) {
            tasks.set(note.id, {
                taskId: note.id,
                conceptId: note.conceptId,
                conceptName: conceptNames.get(note.conceptId) ?? note.title,
                dependencies: [],
                status: 'pending',
                retries: 0,
            });
        }
        if (tasks.size === 0) {
            callbacks.onError('No tasks with linked concepts found');
            return planId;
        }
        // Resolve dependencies from PREREQUISITE relationships
        await this.resolveDependencies(tasks);
        // Initialize ready queue with tasks that have no unmet dependencies
        const readyQueue = [];
        for (const [taskId, task] of tasks) {
            if (task.dependencies.length === 0) {
                task.status = 'ready';
                readyQueue.push(taskId);
            }
        }
        const state = {
            planId,
            tenantId,
            userId,
            conversationId,
            config,
            tasks,
            readyQueue,
            runningTasks: new Map(),
            completedConcepts: new Set(),
            failedConcepts: new Set(),
            completedCount: 0,
            failedCount: 0,
            cancelled: false,
            startTime: Date.now(),
            logBuffer: [],
            conceptConversations,
            discoveredConceptIds: new Set(uniqueConceptIds),
            discoveredCount: 0,
            totalConceptsCreated: 0,
            workerOutputs: new Map(),
            locks: new Map(),
            consecutiveFailures: 0,
            workerStepInfo: new Map(),
            createdOnlyCount,
            totalConsidered,
            executionBudget,
        };
        this.activeRuns.set(planId, state);
        this.addLog(state, `YOLO started: ${tasks.size} executing (of ${totalConsidered} considered), budget=${executionBudget}, deferred=${createdOnlyCount}, maxConcurrency=${config.maxConcurrency}`);
        // Emit initial progress
        callbacks.onProgress(this.buildProgressPayload(state));
        // Fire-and-forget the main dispatch loop
        this.runDispatchLoop(state, callbacks).catch((err) => {
            this.logger.error({
                message: 'YOLO dispatch loop failed',
                planId,
                error: err instanceof Error ? err.message : 'Unknown',
            });
            this.activeRuns.delete(planId);
            callbacks.onError(err instanceof Error ? err.message : 'YOLO execution failed');
        });
        return planId;
    }
    cancelRun(planId) {
        const state = this.activeRuns.get(planId);
        if (!state)
            return false;
        state.cancelled = true;
        return true;
    }
    getRunState(planId) {
        return this.activeRuns.get(planId);
    }
    // ─── Main Dispatch Loop ──────────────────────────────────────
    async runDispatchLoop(state, callbacks) {
        const { config, tasks } = state;
        while ((state.readyQueue.length > 0 || state.runningTasks.size > 0) && !state.cancelled) {
            // Backpressure: reduce concurrency if queue is very large
            const effectiveConcurrency = state.readyQueue.length > 500 ? 1 : config.maxConcurrency;
            // Hard stop check
            if (state.completedCount >= config.maxConceptsHardStop) {
                this.addLog(state, `Hard stop reached: ${state.completedCount} concepts completed`);
                break;
            }
            // Circuit breaker: pause if too many consecutive failures (likely DB outage)
            if (state.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
                const cooldown = config.circuitBreakerCooldownMs ?? CIRCUIT_BREAKER_COOLDOWN_MS;
                this.addLog(state, `Circuit breaker: ${state.consecutiveFailures} consecutive failures, pausing ${cooldown / 1000}s`);
                await new Promise((r) => setTimeout(r, cooldown));
                state.consecutiveFailures = 0;
            }
            // Dispatch from ready queue up to effectiveConcurrency
            let dispatched = false;
            while (state.readyQueue.length > 0 && state.runningTasks.size < effectiveConcurrency) {
                const taskId = state.readyQueue.shift();
                const task = tasks.get(taskId);
                if (!task || task.status === 'completed' || task.status === 'failed')
                    continue;
                // Story 3.10: Per-dispatch relevance re-check removed — all tasks are pre-scored
                // during startYoloExecution() and only top-N enter the task map.
                // Try to acquire concept lock
                if (!this.tryAcquireLock(state, task.conceptId, taskId)) {
                    // Can't lock, put back in queue
                    state.readyQueue.push(taskId);
                    break; // Wait for a running task to finish
                }
                task.status = 'running';
                this.addLog(state, `Dispatching: ${task.conceptName} (${taskId})`);
                const workerPromise = this.executeWorker(state, task, callbacks)
                    .then(async () => {
                    task.status = 'completed';
                    state.completedCount++;
                    state.completedConcepts.add(task.conceptId);
                    state.consecutiveFailures = 0; // Reset circuit breaker on success
                    this.releaseLock(state, task.conceptId);
                    this.addLog(state, `Completed: ${task.conceptName}`);
                    // Mark the original task note as COMPLETED
                    this.notesService
                        .updateStatus(task.taskId, prisma_1.NoteStatus.COMPLETED, state.tenantId)
                        .catch((err) => {
                        this.logger.warn({
                            message: 'Failed to mark task as completed',
                            taskId: task.taskId,
                            error: err instanceof Error ? err.message : 'Unknown',
                        });
                    });
                    // Extract and create new concepts from AI output (Story 2.15)
                    // Runs BEFORE discovery so new concepts have graph edges for traversal
                    const workerOutput = state.workerOutputs.get(task.taskId);
                    state.workerOutputs.delete(task.taskId);
                    if (workerOutput && state.totalConceptsCreated < 20) {
                        try {
                            const extractionResult = await this.conceptExtractionService.extractAndCreateConcepts(workerOutput, {
                                conversationId: state.conversationId,
                                conceptId: task.conceptId,
                                maxNew: Math.min(5, 20 - state.totalConceptsCreated),
                            });
                            state.totalConceptsCreated += extractionResult.created.length;
                            if (extractionResult.created.length > 0) {
                                this.addLog(state, `Created ${extractionResult.created.length} new concepts from AI output`);
                            }
                        }
                        catch (err) {
                            this.logger.warn({
                                message: 'Concept extraction failed in YOLO (non-blocking)',
                                taskId: task.taskId,
                                error: err instanceof Error ? err.message : 'Unknown',
                            });
                        }
                        // Discover related concepts from AI output
                        await this.discoverRelatedConcepts(state, task, workerOutput, callbacks);
                    }
                    // Re-dispatch: find newly ready tasks (including discovered ones)
                    this.reEvaluateReadyQueue(state);
                    callbacks.onProgress(this.buildProgressPayload(state));
                })
                    .catch(async (err) => {
                    state.consecutiveFailures++;
                    task.retries++;
                    if (task.retries <= config.retryAttempts) {
                        // Exponential backoff: 5s, 15s, 45s...
                        const baseDelay = config.retryBaseDelayMs ?? RETRY_BASE_DELAY_MS;
                        const delay = baseDelay * Math.pow(3, task.retries - 1);
                        this.addLog(state, `Retrying (${task.retries}/${config.retryAttempts}) in ${delay / 1000}s: ${task.conceptName}`);
                        await new Promise((r) => setTimeout(r, delay));
                        task.status = 'ready';
                        state.readyQueue.push(taskId);
                    }
                    else {
                        task.status = 'failed';
                        state.failedCount++;
                        state.failedConcepts.add(task.conceptId);
                        this.addLog(state, `Failed: ${task.conceptName} — ${err instanceof Error ? err.message : 'Unknown'}`);
                    }
                    this.releaseLock(state, task.conceptId);
                    this.reEvaluateReadyQueue(state);
                    callbacks.onProgress(this.buildProgressPayload(state));
                })
                    .finally(() => {
                    state.runningTasks.delete(taskId);
                });
                state.runningTasks.set(taskId, workerPromise);
                dispatched = true;
            }
            // If nothing dispatched and tasks are running, wait for one to finish
            if (state.runningTasks.size > 0) {
                await Promise.race([...state.runningTasks.values()]).catch(() => {
                    // Errors handled in individual worker .catch()
                });
            }
            else if (!dispatched && state.readyQueue.length === 0) {
                // Nothing running, nothing ready — we're done or deadlocked
                break;
            }
        }
        // Clean up
        const durationMs = Date.now() - state.startTime;
        const totalTasks = tasks.size;
        const hardStopped = state.completedCount >= config.maxConceptsHardStop;
        let status = 'completed';
        if (hardStopped)
            status = 'hard-stopped';
        else if (state.failedCount > 0 && state.completedCount === 0)
            status = 'failed';
        this.addLog(state, `YOLO finished: ${status}, completed=${state.completedCount}, failed=${state.failedCount}, duration=${durationMs}ms`);
        callbacks.onComplete({
            planId: state.planId,
            status,
            completed: state.completedCount,
            failed: state.failedCount,
            total: totalTasks,
            discoveredCount: state.discoveredCount,
            durationMs,
            conversationId: state.conversationId,
            logs: [...state.logBuffer],
            createdOnlyCount: state.createdOnlyCount,
            totalConsidered: state.totalConsidered,
            executionBudget: state.executionBudget,
        });
        // Scheduled cleanup
        setTimeout(() => {
            this.activeRuns.delete(state.planId);
        }, 30000);
    }
    // ─── Worker Execution ────────────────────────────────────────
    async executeWorker(state, task, callbacks) {
        const { tenantId, userId } = state;
        // Get conversation for this concept
        const conversationId = state.conceptConversations.get(task.conceptId) ?? state.conversationId;
        // Generate/load workflow for this concept
        const workflow = await this.workflowService.getOrGenerateWorkflow(task.conceptId, tenantId, userId);
        const completedSummaries = [];
        const totalSteps = workflow.steps.length;
        // Execute each workflow step sequentially within this worker
        for (let stepIdx = 0; stepIdx < workflow.steps.length; stepIdx++) {
            if (state.cancelled)
                return;
            const workflowStep = workflow.steps[stepIdx];
            const step = {
                stepId: `yolo_step_${(0, cuid2_1.createId)()}`,
                conceptId: task.conceptId,
                conceptName: task.conceptName,
                workflowStepNumber: workflowStep.stepNumber,
                title: workflowStep.title,
                description: workflowStep.description,
                estimatedMinutes: workflowStep.estimatedMinutes,
                departmentTag: workflowStep.departmentTag,
                status: 'in_progress',
            };
            // Track step info and emit step-start progress (Story 2.16)
            state.workerStepInfo.set(task.taskId, {
                stepIndex: stepIdx,
                totalSteps,
                stepTitle: workflowStep.title,
            });
            callbacks.onProgress(this.buildProgressPayload(state));
            // Execute the step using WorkflowService's shared logic
            const result = await this.workflowService.executeStepAutonomous(step, conversationId, userId, tenantId, () => {
                /* Collect chunks silently — no per-step streaming in YOLO */
            }, completedSummaries);
            // Emit step-complete progress (Story 2.16)
            state.workerStepInfo.set(task.taskId, {
                stepIndex: stepIdx,
                totalSteps,
                stepTitle: `${workflowStep.title} ✓`,
            });
            callbacks.onProgress(this.buildProgressPayload(state));
            // Save AI message to concept conversation
            await callbacks.saveMessage('assistant', result.content, task.conceptId);
            // Create sub-task note (with dedup — Story 3.4 AC3 review fix)
            const existingSubTask = await this.notesService.findExistingSubTask(tenantId, task.taskId, step.workflowStepNumber ?? 0);
            if (existingSubTask) {
                this.logger.debug({
                    message: 'Skipping duplicate YOLO sub-task',
                    stepTitle: step.title,
                    existingSubTaskId: existingSubTask,
                    parentNoteId: task.taskId,
                    workflowStepNumber: step.workflowStepNumber,
                });
            }
            else {
                await this.notesService.createNote({
                    title: step.title,
                    content: result.content,
                    source: prisma_1.NoteSource.CONVERSATION,
                    noteType: prisma_1.NoteType.TASK,
                    status: prisma_1.NoteStatus.READY_FOR_REVIEW,
                    userId,
                    tenantId,
                    conversationId,
                    conceptId: task.conceptId,
                    parentNoteId: task.taskId,
                    expectedOutcome: step.description?.substring(0, 500),
                    workflowStepNumber: step.workflowStepNumber,
                });
            }
            // Memory discipline: only keep truncated summary
            completedSummaries.push({
                title: step.title,
                conceptName: task.conceptName,
                summary: result.content.substring(0, SUMMARY_TRUNCATE_LENGTH),
            });
        }
        // Store concatenated summaries for concept discovery
        const outputForDiscovery = completedSummaries.map((s) => `${s.title}: ${s.summary}`).join('\n');
        state.workerOutputs.set(task.taskId, outputForDiscovery);
        // Clean up step tracking (Story 2.16)
        state.workerStepInfo.delete(task.taskId);
    }
    // ─── Concept Discovery ─────────────────────────────────────────
    async discoverRelatedConcepts(state, task, aiOutput, callbacks) {
        if (state.tasks.size >= state.config.maxConceptsHardStop)
            return;
        const candidates = [];
        // Phase 1: Graph-based discovery (language-independent, reliable)
        try {
            const concept = await this.conceptService.findById(task.conceptId);
            for (const rel of concept.relatedConcepts) {
                // Skip incoming prerequisites (we don't want to go backwards)
                if (rel.relationshipType === 'PREREQUISITE' && rel.direction === 'incoming')
                    continue;
                candidates.push({
                    conceptId: rel.concept.id,
                    conceptName: rel.concept.name,
                    source: `graph:${rel.relationshipType}`,
                });
            }
            this.addLog(state, `Graph discovery for ${task.conceptName}: ${candidates.length} candidates`);
        }
        catch (err) {
            this.logger.warn({
                message: 'Graph discovery failed',
                conceptId: task.conceptId,
                error: err instanceof Error ? err.message : 'Unknown',
            });
        }
        // Phase 2: Semantic search (cross-language may still find some matches)
        try {
            const matches = await this.conceptMatchingService.findRelevantConcepts(aiOutput, {
                limit: 10,
                threshold: 0.55,
            });
            for (const match of matches) {
                if (!candidates.some((c) => c.conceptId === match.conceptId)) {
                    candidates.push({
                        conceptId: match.conceptId,
                        conceptName: match.conceptName,
                        source: `semantic:${match.score.toFixed(2)}`,
                    });
                }
            }
        }
        catch (err) {
            this.logger.warn({
                message: 'Semantic discovery failed (non-blocking)',
                error: err instanceof Error ? err.message : 'Unknown',
            });
        }
        // Process candidates
        for (const candidate of candidates) {
            if (state.discoveredConceptIds.has(candidate.conceptId))
                continue;
            if (state.tasks.size >= state.config.maxConceptsHardStop)
                break;
            await this.addDiscoveredConcept(state, candidate.conceptId, candidate.conceptName, candidate.source, task.conceptName, callbacks);
        }
    }
    async addDiscoveredConcept(state, conceptId, conceptName, source, parentName, callbacks) {
        try {
            state.discoveredConceptIds.add(conceptId);
            state.discoveredCount++;
            this.addLog(state, `Discovered: ${conceptName} (${source}) via ${parentName}`);
            // Curriculum linking (best-effort)
            try {
                const node = this.curriculumService.matchTopic(conceptName);
                if (node)
                    await this.curriculumService.ensureConceptExists(node.id);
            }
            catch {
                // Non-blocking
            }
            // Story 2.13: Fire-and-forget dynamic relationship creation
            // Deviation: uses .then()/.catch() instead of try/catch — fire-and-forget requires it
            this.conceptService
                .createDynamicRelationships(conceptId, conceptName)
                .then((res) => {
                if (res.relationshipsCreated > 0) {
                    this.addLog(state, `Created ${res.relationshipsCreated} relationships for ${conceptName}`);
                }
            })
                .catch((err) => this.logger.warn({
                message: 'Dynamic relationship creation failed',
                conceptName,
                error: err instanceof Error ? err.message : 'Unknown',
            }));
            // Create PENDING task note (with dedup — Story 3.4 AC3 review fix)
            const existingTask = await this.notesService.findExistingTask(state.tenantId, {
                conceptId,
                title: conceptName,
            });
            if (existingTask) {
                this.logger.debug({
                    message: 'Skipping duplicate YOLO discovery task',
                    conceptName,
                    existingTaskId: existingTask,
                    tenantId: state.tenantId,
                });
                return;
            }
            const taskNote = await this.notesService.createNote({
                title: conceptName,
                content: `Primenite ${conceptName} na vaše poslovanje`,
                source: prisma_1.NoteSource.CONVERSATION,
                noteType: prisma_1.NoteType.TASK,
                status: prisma_1.NoteStatus.PENDING,
                userId: state.userId,
                tenantId: state.tenantId,
                conversationId: state.conversationId,
                conceptId,
            });
            // Create conversation via callback
            let conversationId = null;
            if (callbacks.createConversationForConcept) {
                conversationId = await callbacks.createConversationForConcept(conceptId, conceptName);
                if (conversationId) {
                    state.conceptConversations.set(conceptId, conversationId);
                }
            }
            // Emit tree update to frontend
            if (callbacks.onConceptDiscovered && conversationId) {
                callbacks.onConceptDiscovered(conceptId, conceptName, conversationId);
            }
            // Story 3.10: Only add to execution queue if budget not exhausted
            // Review fix HIGH #2: Use tasks.size (total admitted slots) instead of partial sum.
            // Node.js single-thread guarantees this check + modify is atomic (no race condition).
            if (state.tasks.size < state.executionBudget) {
                state.tasks.set(taskNote.id, {
                    taskId: taskNote.id,
                    conceptId,
                    conceptName,
                    dependencies: [],
                    status: 'ready',
                    retries: 0,
                });
                state.readyQueue.push(taskNote.id);
            }
            else {
                // Budget exhausted — task created as PENDING in DB, available for next YOLO run
                state.createdOnlyCount++;
                this.addLog(state, `Budget exhausted, deferred: ${conceptName} (created as PENDING)`);
            }
        }
        catch (itemErr) {
            // Roll back so it can be retried from another worker's discovery
            state.discoveredConceptIds.delete(conceptId);
            state.discoveredCount = Math.max(0, state.discoveredCount - 1);
            this.logger.warn({
                message: 'Failed to add discovered concept',
                conceptName,
                error: itemErr instanceof Error ? itemErr.message : 'Unknown',
            });
        }
    }
    // ─── Dependency Resolution ───────────────────────────────────
    async resolveDependencies(tasks) {
        const conceptIdToTaskIds = new Map();
        for (const [taskId, task] of tasks) {
            const list = conceptIdToTaskIds.get(task.conceptId) ?? [];
            list.push(taskId);
            conceptIdToTaskIds.set(task.conceptId, list);
        }
        const allConceptIds = [...conceptIdToTaskIds.keys()];
        if (allConceptIds.length <= 1)
            return;
        // Query PREREQUISITE relationships among our concepts
        for (const [, task] of tasks) {
            try {
                const concept = await this.conceptService.findById(task.conceptId);
                const prereqs = concept.relatedConcepts
                    .filter((r) => r.relationshipType === 'PREREQUISITE' &&
                    r.direction === 'outgoing' &&
                    allConceptIds.includes(r.concept.id))
                    .map((r) => r.concept.id);
                task.dependencies = prereqs;
            }
            catch {
                task.dependencies = [];
            }
        }
    }
    // ─── Ready Queue Re-evaluation ───────────────────────────────
    reEvaluateReadyQueue(state) {
        for (const [taskId, task] of state.tasks) {
            if (task.status !== 'pending')
                continue;
            const allDepsMet = task.dependencies.every((depConceptId) => state.completedConcepts.has(depConceptId));
            if (allDepsMet && !state.readyQueue.includes(taskId)) {
                task.status = 'ready';
                state.readyQueue.push(taskId);
                this.addLog(state, `Unblocked: ${task.conceptName}`);
            }
        }
    }
    tryAcquireLock(state, conceptId, taskId) {
        const holder = state.locks.get(conceptId);
        if (holder) {
            if (holder.taskId === taskId)
                return true;
            // Release stale lock if TTL exceeded
            if (Date.now() - holder.acquiredAt > YoloSchedulerService_1.LOCK_TTL_MS) {
                this.addLog(state, `Stale lock released: ${conceptId} (held by ${holder.taskId})`);
                state.locks.delete(conceptId);
            }
            else {
                return false;
            }
        }
        state.locks.set(conceptId, { taskId, acquiredAt: Date.now() });
        return true;
    }
    releaseLock(state, conceptId) {
        state.locks.delete(conceptId);
    }
    // ─── Logging (Ring Buffer) ───────────────────────────────────
    addLog(state, message) {
        const entry = `[${new Date().toISOString()}] ${message}`;
        state.logBuffer.push(entry);
        if (state.logBuffer.length > MAX_LOG_BUFFER) {
            state.logBuffer.shift();
        }
        this.logger.log({ message: `YOLO [${state.planId}] ${message}` });
    }
    // ─── Progress Builder ────────────────────────────────────────
    buildProgressPayload(state) {
        const currentTasks = [];
        for (const [, task] of state.tasks) {
            if (task.status === 'running') {
                const stepInfo = state.workerStepInfo.get(task.taskId);
                currentTasks.push({
                    conceptName: task.conceptName,
                    status: 'running',
                    currentStep: stepInfo?.stepTitle,
                    currentStepIndex: stepInfo?.stepIndex,
                    totalSteps: stepInfo?.totalSteps,
                });
            }
        }
        // Include last 10 log entries for activity stream (Story 2.16)
        const recentLogs = state.logBuffer.slice(-10);
        return {
            planId: state.planId,
            running: state.runningTasks.size,
            maxConcurrency: state.config.maxConcurrency,
            completed: state.completedCount,
            failed: state.failedCount,
            total: state.tasks.size,
            discoveredCount: state.discoveredCount,
            executionBudget: state.executionBudget,
            executedSoFar: state.completedCount + state.runningTasks.size,
            createdOnlyCount: state.createdOnlyCount,
            totalConsidered: state.totalConsidered,
            currentTasks,
            recentLogs,
            conversationId: state.conversationId,
        };
    }
};
exports.YoloSchedulerService = YoloSchedulerService;
// ─── Lock Manager ────────────────────────────────────────────
YoloSchedulerService.LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes
exports.YoloSchedulerService = YoloSchedulerService = YoloSchedulerService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof workflow_service_1.WorkflowService !== "undefined" && workflow_service_1.WorkflowService) === "function" ? _a : Object, typeof (_b = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _b : Object, typeof (_c = typeof notes_service_1.NotesService !== "undefined" && notes_service_1.NotesService) === "function" ? _c : Object, typeof (_d = typeof concept_service_1.ConceptService !== "undefined" && concept_service_1.ConceptService) === "function" ? _d : Object, typeof (_e = typeof concept_matching_service_1.ConceptMatchingService !== "undefined" && concept_matching_service_1.ConceptMatchingService) === "function" ? _e : Object, typeof (_f = typeof curriculum_service_1.CurriculumService !== "undefined" && curriculum_service_1.CurriculumService) === "function" ? _f : Object, typeof (_g = typeof concept_extraction_service_1.ConceptExtractionService !== "undefined" && concept_extraction_service_1.ConceptExtractionService) === "function" ? _g : Object, typeof (_h = typeof concept_relevance_service_1.ConceptRelevanceService !== "undefined" && concept_relevance_service_1.ConceptRelevanceService) === "function" ? _h : Object])
], YoloSchedulerService);


/***/ }),
/* 147 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConversationController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const jwt_auth_guard_1 = __webpack_require__(45);
const department_guard_1 = __webpack_require__(120);
const current_user_decorator_1 = __webpack_require__(47);
const conversation_service_1 = __webpack_require__(148);
const create_conversation_dto_1 = __webpack_require__(149);
const update_persona_dto_1 = __webpack_require__(150);
const curriculum_service_1 = __webpack_require__(107);
const concept_service_1 = __webpack_require__(104);
/**
 * Controller for chat conversation management.
 * All endpoints require JWT authentication.
 * Operations are tenant-scoped through the user's JWT claims.
 */
let ConversationController = class ConversationController {
    constructor(conversationService, curriculumService, conceptService) {
        this.conversationService = conversationService;
        this.curriculumService = curriculumService;
        this.conceptService = conceptService;
    }
    /**
     * Create a new conversation.
     * If curriculumId is provided, ensures the concept exists in DB first.
     */
    async createConversation(user, dto) {
        let conceptId = dto.conceptId;
        // If curriculumId is provided, ensure concept exists and get its ID
        if (dto.curriculumId && !conceptId) {
            conceptId = await this.curriculumService.ensureConceptExists(dto.curriculumId);
            // Story 2.13: Fire-and-forget dynamic relationship creation for newly created concepts
            // Deviation: uses .catch() instead of try/catch — fire-and-forget pattern requires it
            if (conceptId) {
                this.conceptService.createDynamicRelationships(conceptId).catch(() => {
                    /* non-blocking */
                });
            }
        }
        const conversation = await this.conversationService.createConversation(user.tenantId, user.userId, dto.title, dto.personaType, conceptId);
        return { data: conversation };
    }
    /**
     * List all conversations for the current user.
     * Returns conversations without messages, sorted by most recent.
     */
    async listConversations(user) {
        const conversations = await this.conversationService.listConversations(user.tenantId, user.userId);
        return { data: conversations };
    }
    /**
     * List conversations grouped by concept category for tree display.
     */
    async listGroupedConversations(user) {
        const tree = await this.conversationService.listGroupedConversations(user.tenantId, user.userId);
        return { data: tree };
    }
    /**
     * Business Brain tree — active + pending concepts grouped by category (Story 3.2).
     * Filtered by the user's department → visible categories.
     */
    async getBrainTree(user) {
        const tree = await this.conversationService.getBrainTree(user.tenantId, user.userId, user.department, user.role);
        return { data: tree };
    }
    /**
     * Get a single conversation with all its messages.
     * Validates ownership and department scope before returning.
     */
    async getConversation(user, conversationId) {
        const conversation = await this.conversationService.getConversation(user.tenantId, conversationId, user.userId);
        return { data: conversation };
    }
    /**
     * Delete a conversation and all its messages.
     * Validates ownership before deletion.
     */
    async deleteConversation(user, conversationId) {
        await this.conversationService.deleteConversation(user.tenantId, conversationId, user.userId);
    }
    /**
     * Update the persona for a conversation.
     * Allows switching personas mid-conversation while maintaining context.
     * @param conversationId - Conversation ID to update
     * @param dto.personaType - New persona type
     */
    async updatePersona(user, conversationId, dto) {
        const conversation = await this.conversationService.updatePersona(user.tenantId, conversationId, user.userId, dto.personaType);
        return { data: conversation };
    }
};
exports.ConversationController = ConversationController;
tslib_1.__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, typeof (_d = typeof create_conversation_dto_1.CreateConversationDto !== "undefined" && create_conversation_dto_1.CreateConversationDto) === "function" ? _d : Object]),
    tslib_1.__metadata("design:returntype", Promise)
], ConversationController.prototype, "createConversation", null);
tslib_1.__decorate([
    (0, common_1.Get)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Promise)
], ConversationController.prototype, "listConversations", null);
tslib_1.__decorate([
    (0, common_1.Get)('grouped'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Promise)
], ConversationController.prototype, "listGroupedConversations", null);
tslib_1.__decorate([
    (0, common_1.Get)('brain-tree'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Promise)
], ConversationController.prototype, "getBrainTree", null);
tslib_1.__decorate([
    (0, common_1.Get)(':id'),
    (0, common_1.UseGuards)(department_guard_1.DepartmentGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], ConversationController.prototype, "getConversation", null);
tslib_1.__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String]),
    tslib_1.__metadata("design:returntype", Promise)
], ConversationController.prototype, "deleteConversation", null);
tslib_1.__decorate([
    (0, common_1.Patch)(':id/persona'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Param)('id')),
    tslib_1.__param(2, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String, typeof (_e = typeof update_persona_dto_1.UpdatePersonaDto !== "undefined" && update_persona_dto_1.UpdatePersonaDto) === "function" ? _e : Object]),
    tslib_1.__metadata("design:returntype", Promise)
], ConversationController.prototype, "updatePersona", null);
exports.ConversationController = ConversationController = tslib_1.__decorate([
    (0, common_1.Controller)('v1/conversations'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof conversation_service_1.ConversationService !== "undefined" && conversation_service_1.ConversationService) === "function" ? _a : Object, typeof (_b = typeof curriculum_service_1.CurriculumService !== "undefined" && curriculum_service_1.CurriculumService) === "function" ? _b : Object, typeof (_c = typeof concept_service_1.ConceptService !== "undefined" && concept_service_1.ConceptService) === "function" ? _c : Object])
], ConversationController);


/***/ }),
/* 148 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var ConversationService_1;
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConversationService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const cuid2_1 = __webpack_require__(32);
const tenant_context_1 = __webpack_require__(9);
const client_1 = __webpack_require__(11);
const concept_service_1 = __webpack_require__(104);
const curriculum_service_1 = __webpack_require__(107);
const citation_service_1 = __webpack_require__(106);
const notes_service_1 = __webpack_require__(131);
const department_categories_1 = __webpack_require__(117);
/**
 * Service for managing chat conversations.
 * All operations are tenant-scoped through the TenantPrismaService.
 */
let ConversationService = ConversationService_1 = class ConversationService {
    constructor(tenantPrisma, conceptService, curriculumService, citationService, notesService) {
        this.tenantPrisma = tenantPrisma;
        this.conceptService = conceptService;
        this.curriculumService = curriculumService;
        this.citationService = citationService;
        this.notesService = notesService;
        this.logger = new common_1.Logger(ConversationService_1.name);
    }
    /**
     * Creates a new conversation for a user.
     * @param tenantId - Tenant ID for database isolation
     * @param userId - User ID who owns the conversation
     * @param title - Optional conversation title
     * @param personaType - Optional persona type for department-specific responses
     * @param conceptId - Optional concept ID to link conversation to a business concept
     * @returns Created conversation
     */
    async createConversation(tenantId, userId, title, personaType, conceptId) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        const conversationId = `sess_${(0, cuid2_1.createId)()}`;
        const conversation = await prisma.conversation.create({
            data: {
                id: conversationId,
                userId,
                title: title ?? null,
                personaType: personaType ?? null,
                conceptId: conceptId ?? null,
            },
        });
        // Look up concept details for response
        let conceptName = null;
        let conceptCategory = null;
        if (conceptId) {
            const conceptMap = await this.conceptService.findByIds([conceptId]);
            const info = conceptMap.get(conceptId);
            if (info) {
                conceptName = info.name;
                conceptCategory = info.category;
            }
        }
        this.logger.log({
            message: 'Conversation created',
            conversationId,
            userId,
            tenantId,
            personaType: personaType ?? 'none',
            conceptId: conceptId ?? 'none',
        });
        return this.mapConversation(conversation, conceptName, conceptCategory);
    }
    /**
     * Updates the persona for a conversation.
     * @param tenantId - Tenant ID for database isolation
     * @param conversationId - Conversation ID to update
     * @param userId - User ID for ownership verification
     * @param personaType - New persona type
     * @returns Updated conversation
     * @throws NotFoundException if conversation not found
     * @throws ForbiddenException if user doesn't own the conversation
     */
    async updatePersona(tenantId, conversationId, userId, personaType) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
        });
        if (!conversation) {
            throw new common_1.NotFoundException({
                type: 'conversation_not_found',
                title: 'Conversation Not Found',
                status: 404,
                detail: `Conversation with ID ${conversationId} not found`,
            });
        }
        if (conversation.userId !== userId) {
            throw new common_1.ForbiddenException({
                type: 'conversation_access_denied',
                title: 'Access Denied',
                status: 403,
                detail: 'You do not have access to this conversation',
            });
        }
        const previousPersona = conversation.personaType;
        const updated = await prisma.conversation.update({
            where: { id: conversationId },
            data: { personaType },
        });
        this.logger.log({
            message: 'Conversation persona updated',
            conversationId,
            userId,
            tenantId,
            previousPersona: previousPersona ?? 'none',
            newPersona: personaType,
        });
        return this.mapConversation(updated);
    }
    /**
     * Lists all conversations for a user.
     * @param tenantId - Tenant ID for database isolation
     * @param userId - User ID to filter conversations
     * @returns Array of conversations (without messages)
     */
    async listConversations(tenantId, userId) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        const conversations = await prisma.conversation.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' },
        });
        return conversations.map((c) => this.mapConversation(c));
    }
    /**
     * Lists conversations grouped by curriculum hierarchy for tree display.
     * Builds a sparse tree showing only branches that have active conversations.
     */
    async listGroupedConversations(tenantId, userId) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        const conversations = await prisma.conversation.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' },
        });
        // Separate linked vs unlinked
        const linked = conversations.filter((c) => c.conceptId);
        const uncategorized = conversations.filter((c) => !c.conceptId);
        // Get active concepts with their curriculumId
        const activeConceptMap = await this.curriculumService.getActiveConceptsByCurriculum();
        // Map concept IDs to curriculum IDs, group conversations by curriculumId
        const convsByCurriculumId = new Map();
        const orphaned = [];
        for (const conv of linked) {
            // Find which curriculum node this concept maps to
            let foundCurriculumId = null;
            for (const [currId, conceptInfo] of activeConceptMap.entries()) {
                if (conceptInfo.id === conv.conceptId) {
                    foundCurriculumId = currId;
                    break;
                }
            }
            if (!foundCurriculumId) {
                orphaned.push(conv);
                continue;
            }
            const mapped = this.mapConversation(conv);
            if (!convsByCurriculumId.has(foundCurriculumId)) {
                convsByCurriculumId.set(foundCurriculumId, []);
            }
            convsByCurriculumId.get(foundCurriculumId).push(mapped);
        }
        // Collect ALL discovered concept IDs from notes and citations
        const allDiscoveredConceptIds = new Set();
        try {
            const noteConceptIds = await this.notesService.getDiscoveredConceptIds(userId, tenantId);
            noteConceptIds.forEach((id) => allDiscoveredConceptIds.add(id));
        }
        catch {
            // Non-critical
        }
        try {
            const citationConceptIds = await this.citationService.getDiscoveredConceptIds(userId);
            citationConceptIds.forEach((id) => allDiscoveredConceptIds.add(id));
        }
        catch {
            // Non-critical
        }
        // Add discovered concepts to curriculum tree if they have curriculumId
        for (const conceptId of allDiscoveredConceptIds) {
            for (const [currId, conceptInfo] of activeConceptMap.entries()) {
                if (conceptInfo.id === conceptId && !convsByCurriculumId.has(currId)) {
                    convsByCurriculumId.set(currId, []); // discovered via tasks/citations, no conversations yet
                }
            }
        }
        // Build sparse hierarchy tree from curriculum data
        const activeCurriculumIds = new Set(convsByCurriculumId.keys());
        const neededIds = new Set();
        for (const currId of activeCurriculumIds) {
            const chain = this.curriculumService.getAncestorChain(currId);
            for (const node of chain) {
                neededIds.add(node.id);
            }
        }
        const fullTree = this.curriculumService.getFullTree();
        const neededNodes = fullTree.filter((n) => neededIds.has(n.id));
        const tree = this.buildHierarchyTree(neededNodes, convsByCurriculumId, activeConceptMap);
        // === Category-based fallback for concepts WITHOUT curriculumId ===
        // Seeded concepts (from Qdrant) may not have curriculumId set.
        // Group them by category (Finance, Marketing, etc.) as fallback tree nodes.
        const curriculumMappedConceptIds = new Set();
        for (const [, info] of activeConceptMap.entries()) {
            curriculumMappedConceptIds.add(info.id);
        }
        // Collect concept IDs that are NOT in curriculum
        const unmappedConceptIds = new Set();
        for (const conv of orphaned) {
            if (conv.conceptId)
                unmappedConceptIds.add(conv.conceptId);
        }
        for (const id of allDiscoveredConceptIds) {
            if (!curriculumMappedConceptIds.has(id))
                unmappedConceptIds.add(id);
        }
        if (unmappedConceptIds.size > 0) {
            const conceptDetails = await this.conceptService.findByIds([...unmappedConceptIds]);
            // Group orphaned conversations by their conceptId
            const orphanedConvsByConceptId = new Map();
            for (const conv of orphaned) {
                if (conv.conceptId && unmappedConceptIds.has(conv.conceptId)) {
                    if (!orphanedConvsByConceptId.has(conv.conceptId)) {
                        orphanedConvsByConceptId.set(conv.conceptId, []);
                    }
                    orphanedConvsByConceptId.get(conv.conceptId).push(this.mapConversation(conv));
                }
            }
            // Build category → concepts grouping
            const byCategory = new Map();
            for (const [conceptId, info] of conceptDetails) {
                const cat = info.category || 'General';
                if (!byCategory.has(cat))
                    byCategory.set(cat, []);
                const convs = orphanedConvsByConceptId.get(conceptId) ?? [];
                byCategory.get(cat).push({ conceptId, name: info.name, convs });
            }
            // Create category tree nodes
            for (const [category, concepts] of byCategory) {
                const children = concepts.map((c) => ({
                    curriculumId: `concept-${c.conceptId}`,
                    label: c.name,
                    conceptId: c.conceptId,
                    children: [],
                    conversationCount: c.convs.length,
                    conversations: c.convs,
                }));
                const totalConvs = children.reduce((sum, ch) => sum + ch.conversationCount, 0);
                tree.push({
                    curriculumId: `category-${category.toLowerCase().replace(/\s+/g, '-')}`,
                    label: category,
                    children,
                    conversationCount: totalConvs,
                    conversations: [],
                });
            }
            // Remove orphaned conversations that are now placed in category tree
            const placedOrphanIds = new Set(orphaned.filter((c) => c.conceptId && unmappedConceptIds.has(c.conceptId)).map((c) => c.id));
            const remainingOrphaned = orphaned.filter((c) => !placedOrphanIds.has(c.id));
            return {
                tree,
                uncategorized: [...uncategorized, ...remainingOrphaned].map((c) => this.mapConversation(c)),
            };
        }
        return {
            tree,
            uncategorized: [...uncategorized, ...orphaned].map((c) => this.mapConversation(c)),
        };
    }
    /**
     * Builds a hierarchical tree from the needed curriculum nodes.
     */
    buildHierarchyTree(nodes, convsByCurriculumId, activeConceptMap) {
        const nodeMap = new Map(nodes.map((n) => [n.id, n]));
        const childrenMap = new Map();
        for (const node of nodes) {
            const parentKey = node.parentId;
            if (!childrenMap.has(parentKey)) {
                childrenMap.set(parentKey, []);
            }
            childrenMap.get(parentKey).push(node);
        }
        const buildNode = (currNode) => {
            const children = (childrenMap.get(currNode.id) ?? [])
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map(buildNode);
            const directConvs = convsByCurriculumId.get(currNode.id) ?? [];
            const childConvCount = children.reduce((sum, c) => sum + c.conversationCount, 0);
            const conceptInfo = activeConceptMap.get(currNode.id);
            return {
                curriculumId: currNode.id,
                label: currNode.label,
                conceptId: conceptInfo?.id,
                children,
                conversationCount: directConvs.length + childConvCount,
                conversations: directConvs,
            };
        };
        // Get root nodes (those whose parentId is not in our needed set)
        const roots = nodes.filter((n) => !n.parentId || !nodeMap.has(n.parentId));
        return roots.sort((a, b) => a.sortOrder - b.sortOrder).map(buildNode);
    }
    /**
     * Builds the Business Brain tree (Story 3.2, rewritten Story 3.4).
     * Returns an N-level hierarchy matching the Obsidian vault structure.
     * Shows only concepts with conversations or pending/completed tasks (sparse tree).
     * All ancestor folders are preserved to maintain context.
     * Filtered by user's department → visible top-level categories.
     */
    async getBrainTree(tenantId, userId, department, role) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        // 1. Get conversations for linking (to enable "Pogledaj" navigation)
        const convRows = await prisma.conversation.findMany({
            where: { conceptId: { not: null } },
            select: { conceptId: true, userId: true, id: true, title: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' },
        });
        // 2. Get task notes by status
        const isOwner = role === 'PLATFORM_OWNER' || role === 'TENANT_OWNER' || !department;
        const [pendingTasks, completedTasks] = await Promise.all([
            this.notesService.getPendingTaskConceptIds(tenantId, isOwner ? undefined : userId),
            this.notesService.getCompletedTaskConceptIds(tenantId, isOwner ? undefined : userId),
        ]);
        // 3. Collect unique concept IDs and build lookup maps
        const allConceptIds = new Set();
        const convMap = new Map();
        const convsByConceptId = new Map();
        const completedMap = new Map();
        const pendingMap = new Map();
        for (const conv of convRows) {
            if (conv.conceptId) {
                allConceptIds.add(conv.conceptId);
                if (!convMap.has(conv.conceptId)) {
                    convMap.set(conv.conceptId, {
                        userId: conv.userId,
                        conversationId: conv.id,
                        title: conv.title,
                        updatedAt: conv.updatedAt,
                    });
                }
                // Group all conversations by concept for the tree
                if (!convsByConceptId.has(conv.conceptId)) {
                    convsByConceptId.set(conv.conceptId, []);
                }
                convsByConceptId.get(conv.conceptId).push({
                    id: conv.id,
                    title: conv.title ?? 'Untitled',
                    updatedAt: conv.updatedAt.toISOString(),
                });
            }
        }
        for (const task of completedTasks) {
            allConceptIds.add(task.conceptId);
            if (!completedMap.has(task.conceptId)) {
                completedMap.set(task.conceptId, { userId: task.userId, noteId: task.noteId });
            }
        }
        for (const task of pendingTasks) {
            allConceptIds.add(task.conceptId);
            if (!pendingMap.has(task.conceptId)) {
                pendingMap.set(task.conceptId, { userId: task.userId, noteId: task.noteId });
            }
        }
        if (allConceptIds.size === 0) {
            return { tree: [], uncategorized: [] };
        }
        // 4. Load concept details (includes slug = curriculumId)
        const conceptMap = await this.conceptService.findByIds([...allConceptIds]);
        // 5. Get visible categories for department filtering
        const visibleCategories = (0, department_categories_1.getVisibleCategories)(department, role);
        // 6. Collect all curriculum IDs that need to appear in the tree
        //    For each active concept, include it + all its ancestors
        const neededCurriculumIds = new Set();
        const conceptToCurriculum = new Map(); // conceptId → curriculumId
        for (const [conceptId, info] of conceptMap) {
            // Filter by visible categories
            if (visibleCategories && !visibleCategories.includes(info.category)) {
                continue;
            }
            const curriculumId = info.curriculumId ?? info.slug;
            conceptToCurriculum.set(conceptId, curriculumId);
            // Add this node and all its ancestors to the needed set
            const chain = this.curriculumService.getAncestorChain(curriculumId);
            for (const ancestor of chain) {
                neededCurriculumIds.add(ancestor.id);
            }
        }
        // 7. Build sparse tree from curriculum nodes
        const allCurriculumNodes = this.curriculumService.getFullTree();
        const curriculumNodeMap = new Map(allCurriculumNodes.map((n) => [n.id, n]));
        // Build a map of curriculumId → ConceptHierarchyNode
        const treeNodeMap = new Map();
        for (const currId of neededCurriculumIds) {
            const currNode = curriculumNodeMap.get(currId);
            if (!currNode)
                continue;
            // Find if there's an active concept at this curriculum position
            let conceptId;
            let status;
            let completedByUserId;
            let pendingNoteId;
            let linkedConversationId;
            const conversations = [];
            // Search for a concept mapped to this curriculum node
            for (const [cId, cSlug] of conceptToCurriculum) {
                if (cSlug === currId) {
                    conceptId = cId;
                    const completed = completedMap.get(cId);
                    const pending = pendingMap.get(cId);
                    const conv = convMap.get(cId);
                    status = completed ? 'completed' : 'pending';
                    completedByUserId = completed?.userId;
                    pendingNoteId = pending?.noteId;
                    linkedConversationId = conv?.conversationId;
                    conversations.push(...(convsByConceptId.get(cId) ?? []));
                    break;
                }
            }
            treeNodeMap.set(currId, {
                curriculumId: currId,
                label: currNode.label,
                conceptId,
                children: [],
                conversationCount: 0,
                conversations,
                status,
                completedByUserId,
                pendingNoteId,
                linkedConversationId,
            });
        }
        // 8. Wire up parent-child relationships
        const rootNodes = [];
        for (const [currId, treeNode] of treeNodeMap) {
            const currNode = curriculumNodeMap.get(currId);
            if (!currNode?.parentId || !treeNodeMap.has(currNode.parentId)) {
                // This is a root node (or its parent isn't in the sparse tree)
                rootNodes.push(treeNode);
            }
            else {
                const parent = treeNodeMap.get(currNode.parentId);
                parent.children.push(treeNode);
            }
        }
        // 9. Sort children at every level by the curriculum sortOrder
        const sortChildren = (nodes) => {
            nodes.sort((a, b) => {
                const aSort = curriculumNodeMap.get(a.curriculumId)?.sortOrder ?? 999;
                const bSort = curriculumNodeMap.get(b.curriculumId)?.sortOrder ?? 999;
                return aSort - bSort;
            });
            for (const node of nodes) {
                sortChildren(node.children);
            }
        };
        sortChildren(rootNodes);
        rootNodes.sort((a, b) => {
            const aSort = curriculumNodeMap.get(a.curriculumId)?.sortOrder ?? 999;
            const bSort = curriculumNodeMap.get(b.curriculumId)?.sortOrder ?? 999;
            return aSort - bSort;
        });
        // 10. Bubble up conversationCount from leaves to ancestors
        const bubbleUpCounts = (node) => {
            let count = node.conversations.length;
            for (const child of node.children) {
                count += bubbleUpCounts(child);
            }
            node.conversationCount = count;
            return count;
        };
        for (const root of rootNodes) {
            bubbleUpCounts(root);
        }
        // 11. Get uncategorized conversations (no conceptId)
        const uncategorizedConvs = await prisma.conversation.findMany({
            where: { conceptId: null, userId },
            select: { id: true, title: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' },
            take: 50,
        });
        const uncategorized = uncategorizedConvs.map((c) => ({
            id: c.id,
            title: c.title ?? 'Untitled',
            updatedAt: c.updatedAt.toISOString(),
        }));
        return { tree: rootNodes, uncategorized };
    }
    /**
     * Updates the concept ID for a conversation.
     */
    async updateConceptId(tenantId, conversationId, userId, conceptId) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { conceptId },
        });
        this.logger.log({
            message: 'Conversation concept updated',
            conversationId,
            userId,
            tenantId,
            conceptId,
        });
    }
    /**
     * Gets a conversation by ID with all messages.
     * @param tenantId - Tenant ID for database isolation
     * @param conversationId - Conversation ID to retrieve
     * @param userId - User ID for ownership verification
     * @returns Conversation with messages
     * @throws NotFoundException if conversation not found
     * @throws ForbiddenException if user doesn't own the conversation
     */
    async getConversation(tenantId, conversationId, userId) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        if (!conversation) {
            throw new common_1.NotFoundException({
                type: 'conversation_not_found',
                title: 'Conversation Not Found',
                status: 404,
                detail: `Conversation with ID ${conversationId} not found`,
            });
        }
        if (conversation.userId !== userId) {
            throw new common_1.ForbiddenException({
                type: 'conversation_access_denied',
                title: 'Access Denied',
                status: 403,
                detail: 'You do not have access to this conversation',
            });
        }
        return this.mapConversationWithMessages(conversation);
    }
    /**
     * Deletes a conversation and all its messages.
     * @param tenantId - Tenant ID for database isolation
     * @param conversationId - Conversation ID to delete
     * @param userId - User ID for ownership verification
     * @throws NotFoundException if conversation not found
     * @throws ForbiddenException if user doesn't own the conversation
     */
    async deleteConversation(tenantId, conversationId, userId) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
        });
        if (!conversation) {
            throw new common_1.NotFoundException({
                type: 'conversation_not_found',
                title: 'Conversation Not Found',
                status: 404,
                detail: `Conversation with ID ${conversationId} not found`,
            });
        }
        if (conversation.userId !== userId) {
            throw new common_1.ForbiddenException({
                type: 'conversation_access_denied',
                title: 'Access Denied',
                status: 403,
                detail: 'You do not have access to this conversation',
            });
        }
        // Messages are cascade deleted due to onDelete: Cascade in schema
        await prisma.conversation.delete({
            where: { id: conversationId },
        });
        this.logger.log({
            message: 'Conversation deleted',
            conversationId,
            userId,
            tenantId,
        });
    }
    /**
     * Adds a message to a conversation.
     * @param tenantId - Tenant ID for database isolation
     * @param conversationId - Conversation to add message to
     * @param role - Message role (USER or ASSISTANT)
     * @param content - Message content
     * @param confidenceScore - Optional confidence score (0.0-1.0) for AI messages
     * @param confidenceFactors - Optional confidence factor breakdown for AI messages
     * @returns Created message
     */
    async addMessage(tenantId, conversationId, role, content, confidenceScore, confidenceFactors) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        const messageId = `msg_${(0, cuid2_1.createId)()}`;
        const message = await prisma.message.create({
            data: {
                id: messageId,
                conversationId,
                role,
                content,
                confidenceScore: confidenceScore ?? null,
                // Prisma requires JSON input to be cast as InputJsonValue
                confidenceFactors: confidenceFactors
                    ? confidenceFactors
                    : client_1.Prisma.JsonNull,
            },
        });
        // Update conversation's updatedAt timestamp
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        });
        this.logger.log({
            message: 'Message added to conversation',
            messageId,
            conversationId,
            role,
            tenantId,
            confidenceScore: confidenceScore ?? 'N/A',
        });
        return this.mapMessage(message);
    }
    /**
     * Updates the conversation title.
     * @param tenantId - Tenant ID for database isolation
     * @param conversationId - Conversation to update
     * @param userId - User ID for ownership verification
     * @param title - New title
     * @returns Updated conversation
     */
    async updateTitle(tenantId, conversationId, userId, title) {
        const prisma = await this.tenantPrisma.getClient(tenantId);
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
        });
        if (!conversation) {
            throw new common_1.NotFoundException({
                type: 'conversation_not_found',
                title: 'Conversation Not Found',
                status: 404,
                detail: `Conversation with ID ${conversationId} not found`,
            });
        }
        if (conversation.userId !== userId) {
            throw new common_1.ForbiddenException({
                type: 'conversation_access_denied',
                title: 'Access Denied',
                status: 403,
                detail: 'You do not have access to this conversation',
            });
        }
        const updated = await prisma.conversation.update({
            where: { id: conversationId },
            data: { title },
        });
        return this.mapConversation(updated);
    }
    mapConversation(conversation, conceptName, conceptCategory) {
        return {
            id: conversation.id,
            userId: conversation.userId,
            title: conversation.title,
            personaType: conversation.personaType ?? null,
            conceptId: conversation.conceptId ?? null,
            conceptName: conceptName ?? null,
            conceptCategory: conceptCategory ?? null,
            createdAt: conversation.createdAt.toISOString(),
            updatedAt: conversation.updatedAt.toISOString(),
        };
    }
    mapMessage(message) {
        return {
            id: message.id,
            conversationId: message.conversationId,
            role: message.role,
            content: message.content,
            confidenceScore: message.confidenceScore ?? null,
            confidenceFactors: message.confidenceFactors ?? null,
            createdAt: message.createdAt.toISOString(),
        };
    }
    mapConversationWithMessages(conversation) {
        return {
            ...this.mapConversation(conversation),
            messages: conversation.messages.map((m) => this.mapMessage(m)),
        };
    }
};
exports.ConversationService = ConversationService;
exports.ConversationService = ConversationService = ConversationService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.TenantPrismaService !== "undefined" && tenant_context_1.TenantPrismaService) === "function" ? _a : Object, typeof (_b = typeof concept_service_1.ConceptService !== "undefined" && concept_service_1.ConceptService) === "function" ? _b : Object, typeof (_c = typeof curriculum_service_1.CurriculumService !== "undefined" && curriculum_service_1.CurriculumService) === "function" ? _c : Object, typeof (_d = typeof citation_service_1.CitationService !== "undefined" && citation_service_1.CitationService) === "function" ? _d : Object, typeof (_e = typeof notes_service_1.NotesService !== "undefined" && notes_service_1.NotesService) === "function" ? _e : Object])
], ConversationService);


/***/ }),
/* 149 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CreateConversationDto = void 0;
const tslib_1 = __webpack_require__(4);
const class_validator_1 = __webpack_require__(37);
const types_1 = __webpack_require__(84);
/**
 * Valid persona type values for validation.
 * Derived from shared PersonaType enum to avoid duplication.
 */
const VALID_PERSONA_TYPES = Object.values(types_1.PersonaType);
/**
 * DTO for creating a new conversation.
 */
class CreateConversationDto {
}
exports.CreateConversationDto = CreateConversationDto;
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    tslib_1.__metadata("design:type", String)
], CreateConversationDto.prototype, "title", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(VALID_PERSONA_TYPES, {
        message: `Persona type must be one of: ${VALID_PERSONA_TYPES.join(', ')}`,
    }),
    tslib_1.__metadata("design:type", typeof (_a = typeof types_1.PersonaType !== "undefined" && types_1.PersonaType) === "function" ? _a : Object)
], CreateConversationDto.prototype, "personaType", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^cpt_/, { message: 'conceptId must have cpt_ prefix' }),
    tslib_1.__metadata("design:type", String)
], CreateConversationDto.prototype, "conceptId", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    tslib_1.__metadata("design:type", String)
], CreateConversationDto.prototype, "curriculumId", void 0);


/***/ }),
/* 150 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UpdatePersonaDto = void 0;
const tslib_1 = __webpack_require__(4);
const class_validator_1 = __webpack_require__(37);
const types_1 = __webpack_require__(84);
/**
 * Valid persona type values for validation.
 * Derived from shared PersonaType enum to avoid duplication.
 */
const VALID_PERSONA_TYPES = Object.values(types_1.PersonaType);
/**
 * DTO for updating conversation persona.
 * Used for PATCH /conversations/:id/persona endpoint.
 */
class UpdatePersonaDto {
}
exports.UpdatePersonaDto = UpdatePersonaDto;
tslib_1.__decorate([
    (0, class_validator_1.IsNotEmpty)({ message: 'Persona type is required' }),
    (0, class_validator_1.IsIn)(VALID_PERSONA_TYPES, {
        message: `Persona type must be one of: ${VALID_PERSONA_TYPES.join(', ')}`,
    }),
    tslib_1.__metadata("design:type", typeof (_a = typeof types_1.PersonaType !== "undefined" && types_1.PersonaType) === "function" ? _a : Object)
], UpdatePersonaDto.prototype, "personaType", void 0);


/***/ }),
/* 151 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var ConversationGateway_1;
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConversationGateway = void 0;
const tslib_1 = __webpack_require__(4);
const websockets_1 = __webpack_require__(152);
const socket_io_1 = __webpack_require__(153);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const jsonwebtoken_1 = __webpack_require__(57);
const jwks_rsa_1 = tslib_1.__importDefault(__webpack_require__(154));
const conversation_service_1 = __webpack_require__(148);
const ai_gateway_service_1 = __webpack_require__(88);
const notes_service_1 = __webpack_require__(131);
const concept_matching_service_1 = __webpack_require__(109);
const concept_service_1 = __webpack_require__(104);
const citation_injector_service_1 = __webpack_require__(113);
const citation_service_1 = __webpack_require__(106);
const memory_context_builder_service_1 = __webpack_require__(141);
const memory_extraction_service_1 = __webpack_require__(139);
const memory_service_1 = __webpack_require__(136);
const concept_extraction_service_1 = __webpack_require__(114);
const workflow_service_1 = __webpack_require__(145);
const yolo_scheduler_service_1 = __webpack_require__(146);
const web_search_service_1 = __webpack_require__(144);
const business_context_service_1 = __webpack_require__(118);
const tenant_context_1 = __webpack_require__(9);
const prisma_1 = __webpack_require__(34);
const types_1 = __webpack_require__(84);
const types_2 = __webpack_require__(84);
/**
 * WebSocket gateway for real-time chat streaming.
 * Handles client connections, message sending, and AI response streaming.
 * Note: CORS origin is configured dynamically in afterInit using ConfigService.
 */
let ConversationGateway = ConversationGateway_1 = class ConversationGateway {
    constructor(conversationService, aiGatewayService, configService, prisma, notesService, conceptMatchingService, citationInjectorService, citationService, memoryContextBuilder, memoryExtractionService, memoryService, workflowService, conceptService, conceptExtractionService, yoloScheduler, webSearchService, businessContextService) {
        this.conversationService = conversationService;
        this.aiGatewayService = aiGatewayService;
        this.configService = configService;
        this.prisma = prisma;
        this.notesService = notesService;
        this.conceptMatchingService = conceptMatchingService;
        this.citationInjectorService = citationInjectorService;
        this.citationService = citationService;
        this.memoryContextBuilder = memoryContextBuilder;
        this.memoryExtractionService = memoryExtractionService;
        this.memoryService = memoryService;
        this.workflowService = workflowService;
        this.conceptService = conceptService;
        this.conceptExtractionService = conceptExtractionService;
        this.yoloScheduler = yoloScheduler;
        this.webSearchService = webSearchService;
        this.businessContextService = businessContextService;
        this.logger = new common_1.Logger(ConversationGateway_1.name);
        this.auth0Domain = this.configService.get('AUTH0_DOMAIN') ?? '';
        this.auth0Audience = this.configService.get('AUTH0_AUDIENCE') ?? '';
        this.jwksClient = (0, jwks_rsa_1.default)({
            cache: true,
            rateLimit: true,
            jwksRequestsPerMinute: 5,
            jwksUri: `https://${this.auth0Domain}/.well-known/jwks.json`,
        });
    }
    /**
     * Handles new WebSocket connections.
     * Validates JWT token and attaches user info to socket.
     * In dev mode, bypasses token validation and uses mock user.
     */
    async handleConnection(client) {
        try {
            const devMode = this.configService.get('DEV_MODE') === 'true';
            if (devMode) {
                const authenticatedClient = client;
                // Try to extract real user identity from JWT token and verify the user exists in DB
                const token = this.extractToken(client);
                if (token && token !== 'dev-mode-token') {
                    try {
                        const jwtSecret = this.configService.get('JWT_SECRET');
                        if (jwtSecret) {
                            const payload = (0, jsonwebtoken_1.verify)(token, jwtSecret, { algorithms: ['HS256'] });
                            const tokenUserId = payload.userId || payload.sub || 'dev-user-001';
                            const tokenTenantId = payload.tenantId || 'dev-tenant-001';
                            // Verify the user actually exists in DB (may have been cleaned up)
                            const userExists = await this.prisma.user.findUnique({
                                where: { id: tokenUserId },
                                select: { id: true },
                            });
                            if (userExists) {
                                authenticatedClient.userId = tokenUserId;
                                authenticatedClient.tenantId = tokenTenantId;
                                await client.join(`tenant:${authenticatedClient.tenantId}`);
                                this.logger.log({
                                    message: 'WebSocket client connected (dev mode, real user)',
                                    clientId: client.id,
                                    userId: authenticatedClient.userId,
                                    tenantId: authenticatedClient.tenantId,
                                });
                                return;
                            }
                            // User deleted from DB — disconnect so frontend clears stale token
                            this.logger.warn({
                                message: 'WebSocket rejected: JWT user not found in DB',
                                tokenUserId,
                            });
                            client.emit('auth:session-expired', {
                                message: 'Your session is no longer valid. Please log in again.',
                            });
                            client.disconnect();
                            return;
                        }
                    }
                    catch {
                        this.logger.debug('Dev mode: WebSocket JWT validation failed, using dev user fallback');
                    }
                }
                // No token or placeholder token — use dev fallback
                authenticatedClient.userId = 'dev-user-001';
                authenticatedClient.tenantId = 'dev-tenant-001';
                await client.join('tenant:dev-tenant-001');
                this.logger.log({
                    message: 'WebSocket client connected (dev mode, dev user)',
                    clientId: client.id,
                });
                return;
            }
            const token = this.extractToken(client);
            if (!token) {
                this.logger.warn({
                    message: 'WebSocket connection rejected: No token provided',
                    clientId: client.id,
                });
                client.disconnect();
                return;
            }
            const authenticatedClient = client;
            // Try JWT_SECRET (HS256) verification first — covers Google OAuth tokens
            const jwtSecret = this.configService.get('JWT_SECRET');
            let authenticated = false;
            if (jwtSecret) {
                try {
                    const payload = (0, jsonwebtoken_1.verify)(token, jwtSecret, { algorithms: ['HS256'] });
                    const tokenUserId = payload.userId || payload.sub;
                    const tokenTenantId = payload.tenantId || '';
                    if (tokenUserId) {
                        // Verify the user actually exists in DB
                        const userExists = await this.prisma.user.findUnique({
                            where: { id: tokenUserId },
                            select: { id: true },
                        });
                        if (userExists) {
                            authenticatedClient.userId = tokenUserId;
                            authenticatedClient.tenantId = tokenTenantId;
                            authenticated = true;
                        }
                        else {
                            this.logger.warn({
                                message: 'WebSocket rejected: JWT user not found in DB',
                                tokenUserId,
                            });
                            client.emit('auth:session-expired', {
                                message: 'Your session is no longer valid. Please log in again.',
                            });
                            client.disconnect();
                            return;
                        }
                    }
                }
                catch {
                    // HS256 verification failed — try Auth0 JWKS fallback below
                }
            }
            // Fallback: Auth0 JWKS (RS256) verification if configured
            if (!authenticated && this.auth0Domain) {
                try {
                    const payload = await this.verifyToken(token);
                    authenticatedClient.userId = payload['https://mentor-ai.com/user_id'] ?? payload.sub;
                    authenticatedClient.tenantId = payload['https://mentor-ai.com/tenant_id'] ?? '';
                    authenticated = true;
                }
                catch {
                    // Auth0 verification also failed
                }
            }
            if (!authenticated) {
                this.logger.warn({
                    message: 'WebSocket connection rejected: Invalid token',
                    clientId: client.id,
                });
                client.disconnect();
                return;
            }
            // Join tenant-specific room for isolation
            await client.join(`tenant:${authenticatedClient.tenantId}`);
            this.logger.log({
                message: 'WebSocket client connected',
                clientId: client.id,
                userId: authenticatedClient.userId,
                tenantId: authenticatedClient.tenantId,
            });
        }
        catch (error) {
            this.logger.warn({
                message: 'WebSocket connection rejected: Invalid token',
                clientId: client.id,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            client.disconnect();
        }
    }
    /**
     * Handles WebSocket disconnections.
     */
    handleDisconnect(client) {
        this.logger.log({
            message: 'WebSocket client disconnected',
            clientId: client.id,
        });
    }
    /**
     * Handles incoming chat messages.
     * Saves user message, streams AI response, and saves AI message.
     */
    async handleMessage(client, payload) {
        const authenticatedClient = client;
        const { conversationId, content } = payload;
        // Validate payload
        if (!conversationId || !content) {
            client.emit('chat:error', {
                type: 'invalid_payload',
                message: 'conversationId and content are required',
            });
            return;
        }
        // Validate conversationId format
        if (!conversationId.startsWith('sess_')) {
            client.emit('chat:error', {
                type: 'invalid_conversation_id',
                message: 'conversationId must have sess_ prefix',
            });
            return;
        }
        // Validate content length
        const MAX_MESSAGE_LENGTH = 32000;
        if (content.length > MAX_MESSAGE_LENGTH) {
            client.emit('chat:error', {
                type: 'message_too_long',
                message: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
            });
            return;
        }
        try {
            // Verify user owns the conversation
            await this.conversationService.getConversation(authenticatedClient.tenantId, conversationId, authenticatedClient.userId);
            // Save user message
            const userMessage = await this.conversationService.addMessage(authenticatedClient.tenantId, conversationId, types_2.MessageRole.USER, content);
            // Emit confirmation of user message received
            client.emit('chat:message-received', {
                messageId: userMessage.id,
                role: 'USER',
            });
            // Get conversation history for context
            const conversation = await this.conversationService.getConversation(authenticatedClient.tenantId, conversationId, authenticatedClient.userId);
            // Format messages for AI
            const messages = conversation.messages.map((m) => ({
                role: m.role.toLowerCase(),
                content: m.content,
            }));
            // Build business context from tenant profile + onboarding notes
            const businessContext = await this.buildBusinessContext(authenticatedClient.tenantId, authenticatedClient.userId);
            // Pre-AI enrichment: concept search + memory context + web search + business brain context in parallel
            const webSearchEnabled = payload.webSearchEnabled !== false;
            const [relevantConcepts, memoryContext, webSearchResults, businessBrainContext] = await Promise.all([
                this.conceptMatchingService
                    .findRelevantConcepts(content, {
                    limit: 5,
                    threshold: 0.5,
                    personaType: conversation.personaType ?? undefined,
                })
                    .catch(() => []),
                this.memoryContextBuilder
                    .buildContext(content, authenticatedClient.userId, authenticatedClient.tenantId)
                    .catch(() => ({
                    context: '',
                    attributions: [],
                    estimatedTokens: 0,
                })),
                webSearchEnabled && this.webSearchService.isAvailable()
                    ? this.webSearchService
                        .searchAndExtract(content, 3)
                        .catch(() => [])
                    : Promise.resolve([]),
                this.businessContextService
                    .getBusinessContext(authenticatedClient.tenantId)
                    .catch(() => ''),
            ]);
            // Build enriched context with curriculum concepts + memory + business brain
            let enrichedContext = businessContext;
            // Append tenant-wide business brain memories (Story 3.3 AC3)
            if (businessBrainContext) {
                enrichedContext += '\n' + businessBrainContext;
            }
            if (relevantConcepts.length > 0) {
                enrichedContext += '\n\n--- CURRICULUM CONCEPT KNOWLEDGE ---\n';
                for (const concept of relevantConcepts.slice(0, 3)) {
                    enrichedContext += `\nCONCEPT: ${concept.conceptName}\n`;
                    enrichedContext += `DEFINITION: ${concept.definition}\n`;
                    try {
                        const full = await this.conceptService.findById(concept.conceptId);
                        if (full.extendedDescription) {
                            enrichedContext += `DETAILS: ${full.extendedDescription}\n`;
                        }
                    }
                    catch {
                        /* skip if concept not found */
                    }
                }
                enrichedContext += '--- END CONCEPT KNOWLEDGE ---\n';
                enrichedContext +=
                    'Apply these concepts in your response. When referencing a concept, use [[Concept Name]] notation.\n';
                enrichedContext += 'VAŽNO: Odgovaraj na srpskom jeziku.\n';
            }
            if (memoryContext.context) {
                enrichedContext = this.memoryContextBuilder.injectIntoSystemPrompt(enrichedContext, memoryContext);
            }
            // Append web search context if results available (Story 2.17)
            if (webSearchResults.length > 0) {
                enrichedContext += this.webSearchService.formatSourcesAsObsidian(webSearchResults);
            }
            // Stream AI response with confidence calculation (Story 2.5)
            let fullContent = '';
            let chunkIndex = 0;
            const completionResult = await this.aiGatewayService.streamCompletionWithContext(messages, {
                tenantId: authenticatedClient.tenantId,
                userId: authenticatedClient.userId,
                conversationId,
                personaType: conversation.personaType ?? undefined,
                messageCount: conversation.messages.length,
                hasClientContext: memoryContext.attributions.length > 0,
                hasSpecificData: relevantConcepts.length > 0,
                userQuestion: content,
                businessContext: enrichedContext,
            }, (chunk) => {
                fullContent += chunk;
                client.emit('chat:message-chunk', {
                    content: chunk,
                    index: chunkIndex++,
                });
            });
            // Extract confidence from result
            const confidence = completionResult.confidence;
            // Post-AI: inject citation markers into response
            let contentWithCitations = fullContent;
            let citations = [];
            if (relevantConcepts.length > 0) {
                const citationResult = this.citationInjectorService.injectCitations(fullContent, relevantConcepts);
                contentWithCitations = citationResult.content;
                citations = citationResult.citations;
            }
            // Parse memory attributions from the AI response
            const memoryAttributions = memoryContext.attributions.length > 0
                ? this.memoryContextBuilder.parseAttributionsFromResponse(fullContent, memoryContext.attributions)
                : [];
            // Save AI message with citations in content (Story 2.5 + 2.6)
            const aiMessage = await this.conversationService.addMessage(authenticatedClient.tenantId, conversationId, types_2.MessageRole.ASSISTANT, contentWithCitations, confidence?.score ?? null, confidence?.factors ?? null);
            // Store citations in DB (fire-and-forget)
            if (citations.length > 0) {
                this.citationService.storeCitations(aiMessage.id, citations).catch((err) => {
                    this.logger.warn({
                        message: 'Failed to store citations (non-blocking)',
                        conversationId,
                        error: err instanceof Error ? err.message : 'Unknown error',
                    });
                });
            }
            // Infer suggested actions based on response context (D1)
            const suggestedActions = [];
            if (relevantConcepts.length > 0) {
                suggestedActions.push({ type: 'create_tasks', label: 'Kreiraj zadatke', icon: 'tasks' }, { type: 'deep_dive', label: 'Istraži dublje', icon: 'explore' });
                if (relevantConcepts.length > 1) {
                    suggestedActions.push({
                        type: 'next_domain',
                        label: 'Sledeći koncept →',
                        icon: 'arrow',
                        payload: { conceptId: relevantConcepts[1]?.conceptId },
                    });
                }
            }
            else {
                suggestedActions.push({ type: 'save_note', label: 'Sačuvaj kao belešku', icon: 'note' });
            }
            if (confidence && confidence.score < 0.5) {
                suggestedActions.push({ type: 'web_search', label: 'Pretraži web', icon: 'web' });
            }
            // Emit completion with confidence + citations metadata
            client.emit('chat:complete', {
                messageId: aiMessage.id,
                fullContent: contentWithCitations,
                metadata: {
                    totalChunks: chunkIndex,
                    confidence: confidence
                        ? {
                            score: confidence.score,
                            level: confidence.level,
                            factors: confidence.factors,
                        }
                        : null,
                    citations,
                    memoryAttributions,
                    webSearchSources: webSearchResults.length > 0
                        ? webSearchResults.map((r) => ({ title: r.title, link: r.link }))
                        : undefined,
                    suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
                },
            });
            this.logger.log({
                message: 'Chat message processed',
                conversationId,
                userId: authenticatedClient.userId,
                tenantId: authenticatedClient.tenantId,
                userMessageId: userMessage.id,
                aiMessageId: aiMessage.id,
                confidenceScore: confidence?.score ?? 'N/A',
                confidenceLevel: confidence?.level ?? 'N/A',
                citationCount: citations.length,
                conceptsFound: relevantConcepts.length,
                memoriesUsed: memoryContext.attributions.length,
            });
            // Fire-and-forget: detect explicit task creation or auto-generate tasks
            if (this.hasExplicitTaskIntent(content)) {
                this.detectAndCreateExplicitTasks(client, authenticatedClient.userId, authenticatedClient.tenantId, conversationId, conversation.conceptId ?? null, content, fullContent, relevantConcepts).catch((err) => {
                    this.logger.warn({
                        message: 'Explicit task creation failed (non-blocking)',
                        conversationId,
                        error: err instanceof Error ? err.message : 'Unknown error',
                    });
                });
            }
            else {
                this.generateAutoTasks(client, authenticatedClient.userId, authenticatedClient.tenantId, conversationId, conversation.conceptId ?? null, content, fullContent, messages, aiMessage.id, relevantConcepts).catch((err) => {
                    this.logger.warn({
                        message: 'Auto-task generation failed (non-blocking)',
                        conversationId,
                        error: err instanceof Error ? err.message : 'Unknown error',
                    });
                });
            }
            // Fire-and-forget: auto-classify conversation to a curriculum concept
            this.autoClassifyConversation(client, authenticatedClient.tenantId, authenticatedClient.userId, conversationId, content, fullContent).catch((err) => {
                this.logger.warn({
                    message: 'Auto-classify failed (non-blocking)',
                    conversationId,
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            });
            // Fire-and-forget: extract memories from this exchange (Story 3.3: concept-tagging)
            const conceptName = conversation.conceptId
                ? (relevantConcepts.find((c) => c.conceptId === conversation.conceptId)?.conceptName ??
                    (await this.conceptService.findById(conversation.conceptId).catch(() => null))?.name)
                : undefined;
            this.memoryExtractionService
                .extractMemories(conversation.messages.concat([
                {
                    id: userMessage.id,
                    conversationId,
                    role: types_2.MessageRole.USER,
                    content,
                    confidenceScore: null,
                    confidenceFactors: null,
                    createdAt: new Date().toISOString(),
                },
                {
                    id: aiMessage.id,
                    conversationId,
                    role: types_2.MessageRole.ASSISTANT,
                    content: fullContent,
                    confidenceScore: null,
                    confidenceFactors: null,
                    createdAt: new Date().toISOString(),
                },
            ]), authenticatedClient.userId, authenticatedClient.tenantId, { conceptName })
                .catch((err) => {
                this.logger.warn({
                    message: 'Memory extraction failed (non-blocking)',
                    conversationId,
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            });
            // Fire-and-forget: extract and create new concepts from AI output (Story 2.15)
            // Deviation: uses .catch() instead of async/await per project-context.md rule
            // "Always use async/await over raw Promises". Rationale: concept extraction is
            // optional post-processing; failure must not block message delivery (AC6).
            this.conceptExtractionService
                .extractAndCreateConcepts(fullContent, {
                conversationId,
                conceptId: conversation.conceptId ?? undefined,
            })
                .catch((err) => {
                this.logger.warn({
                    message: 'Concept extraction failed (non-blocking)',
                    conversationId,
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            });
            // Auto-detect affirmative or selective task execution on welcome conversation
            if (conversation.messages.length <= 4) {
                const lowerContent = content.toLowerCase().trim();
                const affirmatives = [
                    'da',
                    'yes',
                    'izvrši',
                    'izvrsi',
                    'hajde',
                    'naravno',
                    'svakako',
                    'pokreni sve',
                ];
                const isFullAffirmative = affirmatives.some((p) => lowerContent === p ||
                    lowerContent.startsWith(p + ' ') ||
                    lowerContent.startsWith(p + ','));
                // Detect selective execution: "pokreni 1, 3, 5" or "pokreni prvi"
                const numberMatch = lowerContent.match(/(?:pokreni|izvrši|izvrsi|run|start)\s+([\d,\s]+)/);
                const isFirstOnly = /(?:pokreni|izvrši|izvrsi)\s+(?:prvi|first|1)$/i.test(lowerContent);
                const pendingTasks = await this.notesService.getPendingTasksByUser(authenticatedClient.userId, authenticatedClient.tenantId);
                if (pendingTasks.length > 0) {
                    let taskIds;
                    if (isFirstOnly) {
                        // Run only the first (recommended) task
                        taskIds = [pendingTasks[0].id];
                    }
                    else if (numberMatch) {
                        // Parse selected task numbers: "pokreni 1, 3, 5"
                        const selectedNumbers = numberMatch[1]
                            .split(/[,\s]+/)
                            .map((n) => parseInt(n.trim(), 10))
                            .filter((n) => !isNaN(n) && n >= 1 && n <= pendingTasks.length);
                        taskIds = selectedNumbers.map((n) => pendingTasks[n - 1].id);
                    }
                    else if (isFullAffirmative) {
                        // Run all tasks
                        taskIds = pendingTasks.map((t) => t.id);
                    }
                    else {
                        taskIds = [];
                    }
                    if (taskIds.length > 0) {
                        // Auto-execute: skip plan overlay, build + execute immediately
                        this.autoExecuteWorkflow(client, taskIds, conversationId).catch((err) => {
                            this.logger.error({
                                message: 'Auto-execute workflow failed',
                                error: err instanceof Error ? err.message : 'Unknown error',
                            });
                            client.emit('workflow:error', {
                                message: err instanceof Error ? err.message : 'Automatsko izvršavanje nije uspelo',
                                conversationId,
                            });
                        });
                    }
                }
            }
        }
        catch (error) {
            // Extract meaningful error details from HttpException or plain Error
            let errorType = 'processing_error';
            let errorMessage = 'Failed to process message';
            if (error instanceof common_1.HttpException) {
                const response = error.getResponse();
                if (typeof response === 'object' && response !== null) {
                    const resp = response;
                    errorType = resp['type'] ?? errorType;
                    errorMessage = resp['detail'] ?? resp['message'] ?? error.message;
                }
                else {
                    errorMessage = error.message;
                }
            }
            else if (error instanceof Error) {
                errorMessage = error.message;
            }
            this.logger.error({
                message: 'Failed to process chat message',
                conversationId,
                userId: authenticatedClient.userId,
                errorType,
                error: errorMessage,
            });
            client.emit('chat:error', {
                type: errorType,
                message: errorMessage,
            });
        }
    }
    /**
     * Post-processing: generates auto-tasks from the conversation using a separate LLM call.
     * Runs as fire-and-forget so it doesn't block the chat response.
     */
    async generateAutoTasks(client, userId, tenantId, conversationId, conceptId, userMessage, aiResponse, conversationHistory, messageId, relevantConcepts) {
        // Only generate tasks every 2nd AI response to avoid excessive LLM calls
        const messageCount = conversationHistory.length;
        if (messageCount < 2)
            return; // Need at least 1 exchange
        const taskPrompt = `Based on the following conversation exchange, generate 1-3 actionable tasks or key takeaways that would help the user. Focus on practical next steps.

USER MESSAGE:
${userMessage}

AI RESPONSE:
${aiResponse}

Respond ONLY with a valid JSON array. Each item must have "title" (short, max 80 chars) and "content" (brief description, max 200 chars). Example:
[{"title": "Review quarterly budget", "content": "Analyze Q1 spending vs projections based on the discussed financial strategy"}]

If there are no meaningful tasks, respond with an empty array: []`;
        try {
            let taskResponseContent = '';
            await this.aiGatewayService.streamCompletionWithContext([{ role: 'user', content: taskPrompt }], {
                tenantId,
                userId,
                skipRateLimit: true,
                skipQuotaCheck: true,
            }, (chunk) => {
                taskResponseContent += chunk;
            });
            // Parse the JSON response
            const jsonMatch = taskResponseContent.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                this.logger.debug({
                    message: 'No JSON array found in task generation response',
                    conversationId,
                });
                return;
            }
            const tasks = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(tasks) || tasks.length === 0)
                return;
            // Create notes for each task (max 3)
            // Use relevantConcepts as fallback if conversation has no conceptId yet
            const effectiveConceptId = conceptId ?? relevantConcepts?.[0]?.conceptId ?? undefined;
            const tasksToCreate = tasks.slice(0, 3);
            // Tenant-wide dedup (Story 3.4 AC3): check by conceptId AND title across entire tenant
            let createdCount = 0;
            for (const task of tasksToCreate) {
                if (!task.title)
                    continue;
                const existingId = await this.notesService.findExistingTask(tenantId, {
                    conceptId: effectiveConceptId,
                    title: task.title,
                });
                if (existingId) {
                    this.logger.debug({
                        message: 'Skipping duplicate auto-task',
                        title: task.title,
                        existingId,
                        tenantId,
                    });
                    continue;
                }
                await this.notesService.createNote({
                    title: task.title,
                    content: task.content ?? '',
                    source: prisma_1.NoteSource.CONVERSATION,
                    noteType: prisma_1.NoteType.TASK,
                    status: prisma_1.NoteStatus.PENDING,
                    conversationId,
                    conceptId: effectiveConceptId,
                    messageId,
                    userId,
                    tenantId,
                });
                createdCount++;
            }
            if (createdCount === 0)
                return;
            // Notify frontend that new notes are available
            client.emit('chat:notes-updated', { conversationId, count: createdCount });
            this.logger.log({
                message: 'Auto-tasks generated',
                conversationId,
                taskCount: tasksToCreate.length,
            });
        }
        catch (error) {
            this.logger.warn({
                message: 'Failed to generate auto-tasks',
                conversationId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
    /**
     * Post-processing: auto-classifies a conversation to a curriculum concept
     * using semantic similarity search. Runs fire-and-forget.
     */
    async autoClassifyConversation(client, tenantId, userId, conversationId, userMessage, aiResponse) {
        // Check if conversation already has a concept assigned
        const conv = await this.conversationService.getConversation(tenantId, conversationId, userId);
        if (conv.conceptId)
            return;
        // Use semantic search to find best matching concept
        const matches = await this.conceptMatchingService.findRelevantConcepts(`${userMessage}\n${aiResponse}`, { limit: 1, threshold: 0.75 });
        const topMatch = matches[0];
        if (topMatch) {
            await this.conversationService.updateConceptId(tenantId, conversationId, userId, topMatch.conceptId);
            // Retroactively link existing tasks that had no concept
            await this.notesService
                .updateConceptIdForConversation(conversationId, topMatch.conceptId, tenantId)
                .catch(() => {
                /* ignore — best-effort linkage */
            });
            client.emit('chat:concept-detected', {
                conversationId,
                conceptId: topMatch.conceptId,
                conceptName: topMatch.conceptName,
            });
            this.logger.log({
                message: 'Conversation auto-classified',
                conversationId,
                conceptId: topMatch.conceptId,
                conceptName: topMatch.conceptName,
                score: topMatch.score,
            });
        }
    }
    // ─── Explicit Task Creation ─────────────────────────────────────
    hasExplicitTaskIntent(userMessage) {
        const taskKeywords = [
            'kreiraj task',
            'kreiraj zadat',
            'napravi task',
            'napravi zadat',
            'kreiraj plan',
            'napravi plan',
            'kreiraj workflow',
            'napravi workflow',
            'generiši task',
            'generiši zadat',
            'kreiraj korake',
            'napravi korake',
            'create task',
            'create plan',
            'make a plan',
            'make task',
        ];
        const lowerMsg = userMessage.toLowerCase();
        return taskKeywords.some((kw) => lowerMsg.includes(kw));
    }
    async detectAndCreateExplicitTasks(client, userId, tenantId, conversationId, conceptId, userMessage, aiResponse, relevantConcepts) {
        this.logger.log({
            message: 'Explicit task creation intent detected',
            conversationId,
            userId,
        });
        // Use LLM to extract structured tasks from the AI response
        const extractPrompt = `Na osnovu sledećeg AI odgovora, ekstrahuj konkretne zadatke kao JSON niz.
Svaki zadatak mora imati "title" (kratak, max 80 karaktera) i "content" (opis, max 500 karaktera).
Izdvoji samo konkretne, izvršive stavke — ne opšte observacije.

AI ODGOVOR:
${aiResponse}

Odgovori SAMO sa validnim JSON nizom: [{"title":"...","content":"..."}]
Ako nema zadataka, odgovori sa: []`;
        try {
            let extractedContent = '';
            await this.aiGatewayService.streamCompletionWithContext([{ role: 'user', content: extractPrompt }], { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true }, (chunk) => {
                extractedContent += chunk;
            });
            // Strip markdown code block wrappers (```json ... ``` or ``` ... ```)
            const cleanedContent = extractedContent
                .replace(/```(?:json)?\s*/gi, '')
                .replace(/```/g, '')
                .trim();
            const jsonMatch = cleanedContent.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                this.logger.warn({
                    message: 'No JSON array in explicit task extraction',
                    conversationId,
                    extractedContent: extractedContent.substring(0, 500),
                });
                return;
            }
            const tasks = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(tasks) || tasks.length === 0)
                return;
            // Create task notes in DB (with duplicate prevention)
            const effectiveConceptId = conceptId ?? relevantConcepts?.[0]?.conceptId ?? undefined;
            const createdTaskIds = [];
            // Tenant-wide dedup (Story 3.4 AC3): check by conceptId AND title across entire tenant
            for (const task of tasks.slice(0, 10)) {
                if (!task.title)
                    continue;
                const existingId = await this.notesService.findExistingTask(tenantId, {
                    conceptId: effectiveConceptId,
                    title: task.title,
                });
                if (existingId) {
                    this.logger.debug({
                        message: 'Skipping duplicate explicit task',
                        title: task.title,
                        existingId,
                        tenantId,
                    });
                    continue;
                }
                const result = await this.notesService.createNote({
                    title: task.title,
                    content: task.content ?? '',
                    source: prisma_1.NoteSource.CONVERSATION,
                    noteType: prisma_1.NoteType.TASK,
                    status: prisma_1.NoteStatus.PENDING,
                    conversationId,
                    conceptId: effectiveConceptId,
                    userId,
                    tenantId,
                });
                createdTaskIds.push(result.id);
            }
            if (createdTaskIds.length === 0)
                return;
            // Emit event so frontend shows tasks with execute option
            client.emit('chat:tasks-created-for-execution', {
                conversationId,
                taskIds: createdTaskIds,
                taskCount: createdTaskIds.length,
            });
            // Also notify notes updated
            client.emit('chat:notes-updated', { conversationId, count: createdTaskIds.length });
            this.logger.log({
                message: 'Explicit tasks created',
                conversationId,
                taskCount: createdTaskIds.length,
            });
        }
        catch (error) {
            this.logger.warn({
                message: 'Failed to create explicit tasks',
                conversationId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
    // ─── Workflow / Agent Execution Events ─────────────────────────
    /**
     * Handles "Run Agents" request: builds an execution plan from selected tasks.
     */
    async handleRunAgents(client, payload) {
        const authenticatedClient = client;
        try {
            this.logger.log({
                message: 'Run Agents requested',
                userId: authenticatedClient.userId,
                taskIds: payload.taskIds,
                conversationId: payload.conversationId,
            });
            const plan = await this.workflowService.buildExecutionPlan(payload.taskIds, authenticatedClient.userId, authenticatedClient.tenantId, payload.conversationId);
            const event = {
                plan,
                conversationId: payload.conversationId,
            };
            client.emit('workflow:plan-ready', event);
        }
        catch (error) {
            this.logger.error({
                message: 'Failed to build execution plan',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            client.emit('workflow:error', {
                message: error instanceof Error ? error.message : 'Failed to build plan',
                conversationId: payload.conversationId,
            });
        }
    }
    /**
     * Handles plan approval or rejection.
     * On approval, starts fire-and-forget execution of all plan steps.
     */
    async handleWorkflowApproval(client, payload) {
        const authenticatedClient = client;
        if (!payload.approved) {
            this.workflowService.cancelPlan(payload.planId);
            const event = {
                planId: payload.planId,
                status: 'cancelled',
                completedSteps: 0,
                totalSteps: 0,
                conversationId: payload.conversationId,
            };
            client.emit('workflow:complete', event);
            return;
        }
        // Get plan for step metadata
        const plan = this.workflowService.getActivePlan(payload.planId);
        const totalSteps = plan?.steps.length ?? 0;
        // Create per-concept conversations for execution results
        const conceptConversations = new Map();
        if (plan) {
            const conceptIds = [...new Set(plan.steps.map((s) => s.conceptId))];
            for (const conceptId of conceptIds) {
                const conceptName = plan.steps.find((s) => s.conceptId === conceptId)?.conceptName ??
                    'Zadatak';
                try {
                    const conv = await this.conversationService.createConversation(authenticatedClient.tenantId, authenticatedClient.userId, conceptName, undefined, conceptId);
                    conceptConversations.set(conceptId, conv.id);
                }
                catch (err) {
                    this.logger.warn({
                        message: 'Failed to create concept conversation, using original',
                        conceptId,
                        error: err instanceof Error ? err.message : 'Unknown',
                    });
                }
            }
            // Notify frontend about created conversations
            const conversationsCreated = {
                planId: payload.planId,
                conversations: conceptIds
                    .filter((id) => conceptConversations.has(id))
                    .map((id) => ({
                    conceptId: id,
                    conceptName: plan.steps.find((s) => s.conceptId === id)?.conceptName ?? '',
                    conversationId: conceptConversations.get(id),
                })),
                originalConversationId: payload.conversationId,
            };
            client.emit('workflow:conversations-created', conversationsCreated);
            // Auto-navigate frontend to the first concept conversation
            const firstConv = conversationsCreated.conversations[0];
            if (firstConv) {
                const navEvent = {
                    planId: payload.planId,
                    conversationId: firstConv.conversationId,
                    conceptName: firstConv.conceptName,
                };
                client.emit('workflow:navigate-to-conversation', navEvent);
            }
        }
        // Fire-and-forget execution
        this.workflowService
            .executePlan(payload.planId, payload.conversationId, authenticatedClient.userId, authenticatedClient.tenantId, {
            onStepStart: (stepId) => {
                const stepInfo = plan?.steps.find((s) => s.stepId === stepId);
                const stepIndex = plan?.steps.findIndex((s) => s.stepId === stepId) ?? -1;
                const event = {
                    planId: payload.planId,
                    stepId,
                    stepTitle: stepInfo?.title,
                    stepIndex,
                    totalSteps,
                    status: 'in_progress',
                    conversationId: payload.conversationId,
                };
                client.emit('workflow:step-progress', event);
            },
            onStepChunk: (_stepId, chunk) => {
                client.emit('chat:message-chunk', { content: chunk, index: -1 });
            },
            onStepComplete: (stepId, fullContent, citations) => {
                const stepInfo = plan?.steps.find((s) => s.stepId === stepId);
                const stepIndex = plan?.steps.findIndex((s) => s.stepId === stepId) ?? -1;
                const event = {
                    planId: payload.planId,
                    stepId,
                    stepTitle: stepInfo?.title,
                    stepIndex,
                    totalSteps,
                    status: 'completed',
                    content: fullContent,
                    citations,
                    conversationId: payload.conversationId,
                };
                client.emit('workflow:step-progress', event);
                // Emit complete step message for chat rendering
                const stepMsg = {
                    planId: payload.planId,
                    conversationId: payload.conversationId,
                    messageId: stepId,
                    content: fullContent,
                    stepIndex,
                    totalSteps,
                    inputType: 'confirmation',
                    conceptName: stepInfo?.conceptName ?? '',
                };
                client.emit('workflow:step-message', stepMsg);
            },
            onStepFailed: (stepId, error) => {
                const stepInfo = plan?.steps.find((s) => s.stepId === stepId);
                const stepIndex = plan?.steps.findIndex((s) => s.stepId === stepId) ?? -1;
                const event = {
                    planId: payload.planId,
                    stepId,
                    stepTitle: stepInfo?.title,
                    stepIndex,
                    totalSteps,
                    status: 'failed',
                    content: error,
                    conversationId: payload.conversationId,
                };
                client.emit('workflow:step-progress', event);
            },
            onStepAwaitingConfirmation: (upcomingStep) => {
                const stepIndex = plan?.steps.findIndex((s) => s.stepId === upcomingStep.stepId) ??
                    -1;
                const event = {
                    planId: payload.planId,
                    completedStepId: '',
                    nextStep: {
                        stepId: upcomingStep.stepId,
                        title: upcomingStep.title,
                        description: upcomingStep.description,
                        conceptName: upcomingStep.conceptName,
                        stepIndex,
                        totalSteps,
                    },
                    conversationId: payload.conversationId,
                };
                client.emit('workflow:step-awaiting-confirmation', event);
                // New interactive event with inputType discriminator
                const inputEvent = {
                    planId: payload.planId,
                    stepId: upcomingStep.stepId,
                    stepTitle: upcomingStep.title,
                    stepDescription: upcomingStep.description,
                    conceptName: upcomingStep.conceptName,
                    stepIndex,
                    totalSteps,
                    inputType: 'confirmation',
                    conversationId: payload.conversationId,
                };
                client.emit('workflow:step-awaiting-input', inputEvent);
            },
            onComplete: (status, completedSteps, totalStepsCount) => {
                const event = {
                    planId: payload.planId,
                    status,
                    completedSteps,
                    totalSteps: totalStepsCount,
                    conversationId: payload.conversationId,
                };
                client.emit('workflow:complete', event);
                // Refresh notes on frontend
                client.emit('chat:notes-updated', {
                    conversationId: payload.conversationId,
                    count: 0,
                });
            },
            onTasksDiscovered: (newConceptIds) => {
                client.emit('tree:tasks-discovered', {
                    conceptIds: newConceptIds,
                    conversationId: payload.conversationId,
                    timestamp: new Date().toISOString(),
                });
            },
            saveMessage: async (_role, content, conceptId) => {
                // Route message to the concept's conversation if available
                const targetConvId = conceptId && conceptConversations.has(conceptId)
                    ? conceptConversations.get(conceptId)
                    : payload.conversationId;
                const msg = await this.conversationService.addMessage(authenticatedClient.tenantId, targetConvId, types_2.MessageRole.ASSISTANT, content);
                return msg.id;
            },
        })
            .catch((err) => {
            this.logger.error({
                message: 'Workflow execution failed',
                planId: payload.planId,
                error: err instanceof Error ? err.message : 'Unknown error',
            });
            client.emit('workflow:error', {
                planId: payload.planId,
                message: err instanceof Error ? err.message : 'Execution failed',
                conversationId: payload.conversationId,
            });
        });
    }
    /**
     * Handles cancellation of a running workflow.
     */
    handleWorkflowCancel(client, payload) {
        const cancelled = this.workflowService.cancelPlan(payload.planId);
        if (!cancelled) {
            client.emit('workflow:error', {
                message: 'Plan not found or already completed',
                conversationId: payload.conversationId,
            });
        }
        // The execution loop will detect cancellation and emit workflow:complete
    }
    /**
     * Handles user confirming to continue to the next workflow step.
     * Optionally passes user input to inject as context for the next step.
     */
    handleStepContinue(client, payload) {
        const authenticatedClient = client;
        this.logger.log({
            message: 'User confirmed next workflow step',
            planId: payload.planId,
            hasUserInput: !!payload.userInput,
        });
        // Story 3.2: Store user input as Business Brain memory (fire-and-forget)
        if (payload.userInput && payload.userInput.trim().length > 10) {
            this.memoryService
                .createMemory(authenticatedClient.tenantId, authenticatedClient.userId, {
                type: types_1.MemoryType.FACTUAL_STATEMENT,
                source: types_1.MemorySource.USER_STATED,
                content: payload.userInput.trim(),
                subject: 'workflow-input',
                confidence: 1.0,
            })
                .catch((err) => {
                this.logger.warn({
                    message: 'Failed to store workflow user input as memory',
                    error: err instanceof Error ? err.message : 'Unknown',
                });
            });
        }
        this.workflowService.continueStep(payload.planId, payload.userInput);
    }
    /**
     * Story 3.11: Handles "Execute Task with AI" — AI does the task's work directly
     * and streams the result back. Simpler than the full workflow engine.
     */
    async handleExecuteTaskAi(client, payload) {
        const authenticatedClient = client;
        try {
            this.logger.log({
                message: 'AI task execution requested',
                userId: authenticatedClient.userId,
                taskId: payload.taskId,
            });
            // 1. Load the task note
            const task = await this.prisma.note.findUnique({
                where: { id: payload.taskId },
            });
            if (!task || task.tenantId !== authenticatedClient.tenantId) {
                client.emit('task:ai-error', { taskId: payload.taskId, message: 'Zadatak nije pronađen' });
                return;
            }
            // 1b. Resolve conversation ID early for all emissions
            const convId = task.conversationId ?? payload.conversationId;
            // 1c. Emit immediate acknowledgment so frontend knows execution has started
            client.emit('task:ai-start', {
                taskId: payload.taskId,
                conversationId: convId,
                timestamp: new Date().toISOString(),
            });
            // 2. Load conversation history for context
            let conversationContext = '';
            if (convId) {
                try {
                    const conv = await this.conversationService.getConversation(authenticatedClient.tenantId, convId, authenticatedClient.userId);
                    const recentMessages = conv.messages.slice(-6);
                    conversationContext = recentMessages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
                }
                catch {
                    /* no context available */
                }
            }
            // 3. Build business context
            const businessContext = await this.buildBusinessContext(authenticatedClient.tenantId, authenticatedClient.userId);
            // 4. Build the prompt
            const prompt = `Ti si poslovni asistent. Korisnik želi da AI uradi sledeći zadatak umesto njega.
Uradi zadatak u potpunosti — napiši konkretan rezultat (tekst, analizu, plan, izveštaj, blog post — šta god zadatak traži).
Ne objašnjavaj šta BI radio — URADI posao i prikaži gotov rezultat.

ZADATAK: ${task.title}
${task.content ? `OPIS: ${task.content}` : ''}
${task.expectedOutcome ? `OČEKIVANI REZULTAT: ${task.expectedOutcome}` : ''}

${conversationContext ? `KONTEKST IZ RAZGOVORA:\n${conversationContext}` : ''}

Odgovaraj na srpskom jeziku. Daj kompletan, spreman za upotrebu rezultat.`;
            // 5. Stream the AI response
            let fullContent = '';
            let chunkIndex = 0;
            await this.aiGatewayService.streamCompletionWithContext([{ role: 'user', content: prompt }], {
                tenantId: authenticatedClient.tenantId,
                userId: authenticatedClient.userId,
                conversationId: convId,
                businessContext,
            }, (chunk) => {
                fullContent += chunk;
                client.emit('task:ai-chunk', {
                    taskId: payload.taskId,
                    conversationId: convId,
                    content: chunk,
                    index: chunkIndex++,
                });
            });
            // 6. Save AI output as message in the conversation
            if (convId) {
                await this.conversationService.addMessage(authenticatedClient.tenantId, convId, types_2.MessageRole.ASSISTANT, fullContent);
            }
            // 7. Mark task as completed with AI output as report
            const maxReportLength = 10000;
            if (fullContent.length > maxReportLength) {
                this.logger.warn({
                    message: 'Task AI output truncated for userReport',
                    taskId: payload.taskId,
                    originalLength: fullContent.length,
                    truncatedTo: maxReportLength,
                });
            }
            await this.prisma.note.update({
                where: { id: payload.taskId },
                data: {
                    status: 'COMPLETED',
                    userReport: fullContent.substring(0, maxReportLength),
                },
            });
            // 8. Emit completion
            client.emit('task:ai-complete', {
                taskId: payload.taskId,
                fullContent,
                conversationId: convId,
            });
            // 9. Refresh notes
            client.emit('chat:notes-updated', { conversationId: convId, count: 0 });
            this.logger.log({
                message: 'AI task execution completed',
                taskId: payload.taskId,
                contentLength: fullContent.length,
            });
        }
        catch (error) {
            this.logger.error({
                message: 'AI task execution failed',
                taskId: payload.taskId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            client.emit('task:ai-error', {
                taskId: payload.taskId,
                conversationId: payload.conversationId,
                message: 'Izvršavanje zadatka nije uspelo. Pokušajte ponovo.',
            });
        }
    }
    /**
     * Story 3.12: Handles "Submit Result" — takes completed task output,
     * produces an optimized final deliverable, and scores it 1-10.
     */
    async handleSubmitTaskResult(client, payload) {
        const authenticatedClient = client;
        try {
            this.logger.log({
                message: 'Task result submission requested',
                userId: authenticatedClient.userId,
                taskId: payload.taskId,
            });
            // 1. Load the completed task note
            const task = await this.prisma.note.findUnique({
                where: { id: payload.taskId },
            });
            if (!task || task.tenantId !== authenticatedClient.tenantId) {
                client.emit('task:result-error', {
                    taskId: payload.taskId,
                    message: 'Zadatak nije pronađen',
                });
                return;
            }
            if (task.status !== 'COMPLETED' || !task.userReport) {
                client.emit('task:result-error', {
                    taskId: payload.taskId,
                    message: 'Zadatak nema izveštaj za ocenjivanje',
                });
                return;
            }
            // 2. Emit start acknowledgment
            client.emit('task:result-start', {
                taskId: payload.taskId,
                conversationId: task.conversationId,
                timestamp: new Date().toISOString(),
            });
            // 3. Build the optimization + scoring prompt
            const prompt = `Ti si ekspert za poslovne rezultate. Pregledaj sledeći izlaz zadatka i uradi dve stvari:

1. OPTIMIZUJ rezultat — napravi finalnu, najbolju moguću verziju deliverable-a (poboljšaj strukturu, jasnoću, konkretnost)
2. OCENI rezultat od 1 do 10 na osnovu: praktičnosti, specifičnosti, kompletnosti i relevantnosti

ZADATAK: ${task.title}
${task.content ? `OPIS: ${task.content}` : ''}
${task.expectedOutcome ? `OČEKIVANI REZULTAT: ${task.expectedOutcome}` : ''}

IZLAZ KOJI TREBA OCENITI I OPTIMIZOVATI:
${task.userReport}

FORMAT ODGOVORA:
Prvo napiši optimizovani rezultat.
Na samom kraju, u poslednjoj liniji napiši SAMO: OCENA: X/10

Odgovaraj na srpskom jeziku.`;
            // 4. Stream the optimized result
            let fullResult = '';
            let chunkIndex = 0;
            await this.aiGatewayService.streamCompletionWithContext([{ role: 'user', content: prompt }], {
                tenantId: authenticatedClient.tenantId,
                userId: authenticatedClient.userId,
                conversationId: task.conversationId ?? undefined,
                businessContext: '',
            }, (chunk) => {
                fullResult += chunk;
                client.emit('task:result-chunk', {
                    taskId: payload.taskId,
                    conversationId: task.conversationId,
                    content: chunk,
                    index: chunkIndex++,
                });
            });
            // 5. Extract score from the result (only accept 1-10)
            let score = null;
            const scoreMatch = fullResult.match(/OCENA:\s*(\d{1,2})\s*\/\s*10/i);
            if (scoreMatch) {
                const rawScore = parseInt(scoreMatch[1], 10);
                if (rawScore >= 1 && rawScore <= 10) {
                    score = rawScore * 10; // Scale 1-10 → 10-100
                }
            }
            // 6. Update the task note with optimized result and score
            const maxReportLength = 10000;
            await this.prisma.note.update({
                where: { id: payload.taskId },
                data: {
                    userReport: fullResult.substring(0, maxReportLength),
                    aiScore: score,
                    aiFeedback: score !== null ? `AI ocena: ${score}/100` : null,
                },
            });
            // 7. Emit completion
            client.emit('task:result-complete', {
                taskId: payload.taskId,
                conversationId: task.conversationId,
                score,
                finalResult: fullResult,
                timestamp: new Date().toISOString(),
            });
            // 8. Refresh notes
            client.emit('chat:notes-updated', { conversationId: task.conversationId, count: 0 });
            this.logger.log({
                message: 'Task result submission completed',
                taskId: payload.taskId,
                score,
                resultLength: fullResult.length,
            });
        }
        catch (error) {
            this.logger.error({
                message: 'Task result submission failed',
                taskId: payload.taskId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            client.emit('task:result-error', {
                taskId: payload.taskId,
                conversationId: null,
                message: 'Ocenjivanje rezultata nije uspelo. Pokušajte ponovo.',
            });
        }
    }
    /**
     * Handles YOLO autonomous execution start.
     * Loads all pending tasks, creates per-concept conversations, and starts the scheduler.
     */
    async handleStartYolo(client, payload) {
        const authenticatedClient = client;
        try {
            this.logger.log({
                message: 'YOLO execution requested',
                userId: authenticatedClient.userId,
                conversationId: payload.conversationId,
            });
            // Load all pending TASK notes for this tenant
            const tasks = await this.prisma.note.findMany({
                where: {
                    tenantId: authenticatedClient.tenantId,
                    noteType: 'TASK',
                    status: 'PENDING',
                },
            });
            if (tasks.length === 0) {
                client.emit('workflow:error', {
                    message: 'No pending tasks found',
                    conversationId: payload.conversationId,
                });
                return;
            }
            // Create per-concept conversations
            const conceptConversations = new Map();
            const conceptIds = [...new Set(tasks.filter((t) => t.conceptId).map((t) => t.conceptId))];
            for (const conceptId of conceptIds) {
                const conceptName = tasks.find((t) => t.conceptId === conceptId)?.title ?? 'Zadatak';
                try {
                    const conv = await this.conversationService.createConversation(authenticatedClient.tenantId, authenticatedClient.userId, conceptName, undefined, conceptId);
                    conceptConversations.set(conceptId, conv.id);
                }
                catch (err) {
                    this.logger.warn({
                        message: 'Failed to create concept conversation for YOLO',
                        conceptId,
                        error: err instanceof Error ? err.message : 'Unknown',
                    });
                }
            }
            // Notify frontend about created conversations
            const conversationsPayload = {
                planId: 'yolo-pending',
                conversations: conceptIds
                    .filter((id) => conceptConversations.has(id))
                    .map((id) => ({
                    conceptId: id,
                    conceptName: tasks.find((t) => t.conceptId === id)?.title ?? '',
                    conversationId: conceptConversations.get(id),
                })),
                originalConversationId: payload.conversationId,
            };
            client.emit('workflow:conversations-created', conversationsPayload);
            // Start YOLO scheduler
            const executionBudget = parseInt(process.env['YOLO_EXECUTION_BUDGET'] ?? '50', 10);
            const config = {
                maxConcurrency: 3,
                maxConceptsHardStop: 1000,
                retryAttempts: 3,
                maxExecutionBudget: executionBudget,
            };
            this.yoloScheduler
                .startYoloExecution(authenticatedClient.tenantId, authenticatedClient.userId, payload.conversationId, config, {
                onProgress: (progress) => {
                    client.emit('workflow:yolo-progress', progress);
                },
                onComplete: (result) => {
                    client.emit('workflow:yolo-complete', result);
                    client.emit('chat:notes-updated', {
                        conversationId: payload.conversationId,
                        count: 0,
                    });
                },
                onError: (error) => {
                    client.emit('workflow:error', {
                        message: error,
                        conversationId: payload.conversationId,
                    });
                },
                saveMessage: async (_role, content, conceptId) => {
                    const targetConvId = conceptId && conceptConversations.has(conceptId)
                        ? conceptConversations.get(conceptId)
                        : payload.conversationId;
                    const msg = await this.conversationService.addMessage(authenticatedClient.tenantId, targetConvId, types_2.MessageRole.ASSISTANT, content);
                    return msg.id;
                },
                createConversationForConcept: async (conceptId, conceptName) => {
                    try {
                        const conv = await this.conversationService.createConversation(authenticatedClient.tenantId, authenticatedClient.userId, conceptName, undefined, conceptId);
                        conceptConversations.set(conceptId, conv.id);
                        client.emit('workflow:conversations-created', {
                            planId: 'yolo-discovery',
                            conversations: [{ conceptId, conceptName, conversationId: conv.id }],
                            originalConversationId: payload.conversationId,
                        });
                        return conv.id;
                    }
                    catch (err) {
                        this.logger.warn({
                            message: 'Failed to create conversation for discovered concept',
                            conceptId,
                            error: err instanceof Error ? err.message : 'Unknown',
                        });
                        return null;
                    }
                },
                onConceptDiscovered: (conceptId, conceptName, discoveredConversationId) => {
                    client.emit('chat:concept-detected', {
                        conversationId: payload.conversationId,
                        conceptId,
                        conceptName,
                        discoveredConversationId,
                    });
                },
            }, conceptConversations)
                .catch((err) => {
                this.logger.error({
                    message: 'YOLO execution failed',
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
                client.emit('workflow:error', {
                    message: err instanceof Error ? err.message : 'YOLO execution failed',
                    conversationId: payload.conversationId,
                });
            });
        }
        catch (error) {
            this.logger.error({
                message: 'Failed to start YOLO execution',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            client.emit('workflow:error', {
                message: error instanceof Error ? error.message : 'Failed to start YOLO',
                conversationId: payload.conversationId,
            });
        }
    }
    /**
     * Story 3.2: Handles per-domain YOLO execution start.
     * Scopes YOLO to a single category (domain).
     */
    async handleStartDomainYolo(client, payload) {
        const authenticatedClient = client;
        try {
            this.logger.log({
                message: 'Per-domain YOLO requested',
                userId: authenticatedClient.userId,
                category: payload.category,
                conversationId: payload.conversationId,
            });
            // Create per-concept conversations for discovered tasks
            const conceptConversations = new Map();
            // Start YOLO with category scoping
            const executionBudget = parseInt(process.env['YOLO_EXECUTION_BUDGET'] ?? '50', 10);
            const config = {
                maxConcurrency: 3,
                maxConceptsHardStop: 100,
                retryAttempts: 3,
                maxExecutionBudget: executionBudget,
            };
            this.yoloScheduler
                .startYoloExecution(authenticatedClient.tenantId, authenticatedClient.userId, payload.conversationId, config, {
                onProgress: (progress) => {
                    client.emit('workflow:yolo-progress', progress);
                },
                onComplete: (result) => {
                    client.emit('workflow:yolo-complete', result);
                    client.emit('chat:notes-updated', {
                        conversationId: payload.conversationId,
                        count: 0,
                    });
                },
                onError: (error) => {
                    client.emit('workflow:error', {
                        message: error,
                        conversationId: payload.conversationId,
                    });
                },
                saveMessage: async (_role, content, conceptId) => {
                    const targetConvId = conceptId && conceptConversations.has(conceptId)
                        ? conceptConversations.get(conceptId)
                        : payload.conversationId;
                    const msg = await this.conversationService.addMessage(authenticatedClient.tenantId, targetConvId, types_2.MessageRole.ASSISTANT, content);
                    return msg.id;
                },
                createConversationForConcept: async (conceptId, conceptName) => {
                    try {
                        const conv = await this.conversationService.createConversation(authenticatedClient.tenantId, authenticatedClient.userId, conceptName, undefined, conceptId);
                        conceptConversations.set(conceptId, conv.id);
                        client.emit('workflow:conversations-created', {
                            planId: 'yolo-domain',
                            conversations: [{ conceptId, conceptName, conversationId: conv.id }],
                            originalConversationId: payload.conversationId,
                        });
                        return conv.id;
                    }
                    catch (err) {
                        this.logger.warn({
                            message: 'Failed to create conversation for domain YOLO concept',
                            conceptId,
                            error: err instanceof Error ? err.message : 'Unknown',
                        });
                        return null;
                    }
                },
                onConceptDiscovered: (conceptId, conceptName, discoveredConversationId) => {
                    client.emit('chat:concept-detected', {
                        conversationId: payload.conversationId,
                        conceptId,
                        conceptName,
                        discoveredConversationId,
                    });
                },
            }, conceptConversations, payload.category // Story 3.2: per-domain scope
            )
                .catch((err) => {
                this.logger.error({
                    message: 'Domain YOLO execution failed',
                    category: payload.category,
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
                client.emit('workflow:error', {
                    message: err instanceof Error ? err.message : 'Domain YOLO failed',
                    conversationId: payload.conversationId,
                });
            });
        }
        catch (error) {
            this.logger.error({
                message: 'Failed to start domain YOLO',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            client.emit('workflow:error', {
                message: error instanceof Error ? error.message : 'Failed to start domain YOLO',
                conversationId: payload.conversationId,
            });
        }
    }
    /**
     * Builds, auto-approves, and executes a workflow plan for welcome conversation.
     * Skips the plan overlay — user sees inline progress directly.
     */
    async autoExecuteWorkflow(client, taskIds, conversationId) {
        const authenticatedClient = client;
        // 1. Build the plan
        const plan = await this.workflowService.buildExecutionPlan(taskIds, authenticatedClient.userId, authenticatedClient.tenantId, conversationId);
        const totalSteps = plan.steps.length;
        // 2. Create per-concept conversations
        const conceptConversations = new Map();
        const conceptIds = [...new Set(plan.steps.map((s) => s.conceptId))];
        for (const conceptId of conceptIds) {
            const conceptName = plan.steps.find((s) => s.conceptId === conceptId)?.conceptName ??
                'Zadatak';
            try {
                const conv = await this.conversationService.createConversation(authenticatedClient.tenantId, authenticatedClient.userId, conceptName, undefined, conceptId);
                conceptConversations.set(conceptId, conv.id);
            }
            catch (err) {
                this.logger.warn({
                    message: 'Failed to create concept conversation',
                    conceptId,
                    error: err instanceof Error ? err.message : 'Unknown',
                });
            }
        }
        // 3. Notify frontend about created conversations
        const conversationsCreated = {
            planId: plan.planId,
            conversations: conceptIds
                .filter((id) => conceptConversations.has(id))
                .map((id) => ({
                conceptId: id,
                conceptName: plan.steps.find((s) => s.conceptId === id)?.conceptName ?? '',
                conversationId: conceptConversations.get(id),
            })),
            originalConversationId: conversationId,
        };
        client.emit('workflow:conversations-created', conversationsCreated);
        // Auto-navigate frontend to the first concept conversation
        const firstConv = conversationsCreated.conversations[0];
        if (firstConv) {
            const navEvent = {
                planId: plan.planId,
                conversationId: firstConv.conversationId,
                conceptName: firstConv.conceptName,
            };
            client.emit('workflow:navigate-to-conversation', navEvent);
        }
        // 4. Execute immediately (no plan overlay)
        this.workflowService
            .executePlan(plan.planId, conversationId, authenticatedClient.userId, authenticatedClient.tenantId, {
            onStepStart: (stepId) => {
                const stepInfo = plan.steps.find((s) => s.stepId === stepId);
                const stepIndex = plan.steps.findIndex((s) => s.stepId === stepId);
                const event = {
                    planId: plan.planId,
                    stepId,
                    stepTitle: stepInfo?.title,
                    stepIndex,
                    totalSteps,
                    status: 'in_progress',
                    conversationId,
                };
                client.emit('workflow:step-progress', event);
            },
            onStepChunk: (_stepId, chunk) => {
                client.emit('chat:message-chunk', { content: chunk, index: -1 });
            },
            onStepComplete: (stepId, fullContent, citations) => {
                const stepInfo = plan.steps.find((s) => s.stepId === stepId);
                const stepIndex = plan.steps.findIndex((s) => s.stepId === stepId);
                const event = {
                    planId: plan.planId,
                    stepId,
                    stepTitle: stepInfo?.title,
                    stepIndex,
                    totalSteps,
                    status: 'completed',
                    content: fullContent,
                    citations,
                    conversationId,
                };
                client.emit('workflow:step-progress', event);
                // Emit complete step message for chat rendering
                const stepMsg = {
                    planId: plan.planId,
                    conversationId,
                    messageId: stepId,
                    content: fullContent,
                    stepIndex,
                    totalSteps,
                    inputType: 'confirmation',
                    conceptName: stepInfo?.conceptName ?? '',
                };
                client.emit('workflow:step-message', stepMsg);
            },
            onStepFailed: (stepId, error) => {
                const stepInfo = plan.steps.find((s) => s.stepId === stepId);
                const stepIndex = plan.steps.findIndex((s) => s.stepId === stepId);
                const event = {
                    planId: plan.planId,
                    stepId,
                    stepTitle: stepInfo?.title,
                    stepIndex,
                    totalSteps,
                    status: 'failed',
                    content: error,
                    conversationId,
                };
                client.emit('workflow:step-progress', event);
            },
            onStepAwaitingConfirmation: (upcomingStep) => {
                const stepIndex = plan.steps.findIndex((s) => s.stepId === upcomingStep.stepId);
                const event = {
                    planId: plan.planId,
                    completedStepId: '',
                    nextStep: {
                        stepId: upcomingStep.stepId,
                        title: upcomingStep.title,
                        description: upcomingStep.description,
                        conceptName: upcomingStep.conceptName,
                        stepIndex,
                        totalSteps,
                    },
                    conversationId,
                };
                client.emit('workflow:step-awaiting-confirmation', event);
                // New interactive event with inputType discriminator
                const inputEvent = {
                    planId: plan.planId,
                    stepId: upcomingStep.stepId,
                    stepTitle: upcomingStep.title,
                    stepDescription: upcomingStep.description,
                    conceptName: upcomingStep.conceptName,
                    stepIndex,
                    totalSteps,
                    inputType: 'confirmation',
                    conversationId,
                };
                client.emit('workflow:step-awaiting-input', inputEvent);
            },
            onComplete: (status, completedSteps, totalStepsCount) => {
                const event = {
                    planId: plan.planId,
                    status,
                    completedSteps,
                    totalSteps: totalStepsCount,
                    conversationId,
                };
                client.emit('workflow:complete', event);
                client.emit('chat:notes-updated', { conversationId, count: 0 });
            },
            onTasksDiscovered: (newConceptIds) => {
                client.emit('tree:tasks-discovered', {
                    conceptIds: newConceptIds,
                    conversationId,
                    timestamp: new Date().toISOString(),
                });
            },
            saveMessage: async (_role, content, conceptId) => {
                const targetConvId = conceptId && conceptConversations.has(conceptId)
                    ? conceptConversations.get(conceptId)
                    : conversationId;
                const msg = await this.conversationService.addMessage(authenticatedClient.tenantId, targetConvId, types_2.MessageRole.ASSISTANT, content);
                return msg.id;
            },
        })
            .catch((err) => {
            this.logger.error({
                message: 'Auto-execute plan failed',
                planId: plan.planId,
                error: err instanceof Error ? err.message : 'Unknown error',
            });
            client.emit('workflow:error', {
                planId: plan.planId,
                message: err instanceof Error ? err.message : 'Execution failed',
                conversationId,
            });
        });
    }
    // ─── Discovery Chat (Story 2.17) ─────────────────────────────
    /**
     * Handles discovery chat messages.
     * Ephemeral: no conversation persistence, no concept matching.
     * Web search enabled for supplementing responses.
     */
    async handleDiscoveryMessage(client, payload) {
        const authenticatedClient = client;
        const { content } = payload;
        if (!content) {
            client.emit('discovery:error', {
                message: 'content is required for discovery chat',
            });
            return;
        }
        try {
            // Build business context: tenant profile + business brain memories in parallel
            const [businessContext, brainMemoryContext] = await Promise.all([
                this.buildBusinessContext(authenticatedClient.tenantId, authenticatedClient.userId),
                this.businessContextService
                    .getBusinessContext(authenticatedClient.tenantId)
                    .catch(() => ''),
            ]);
            // Web search for discovery context
            let webContext = '';
            if (this.webSearchService.isAvailable()) {
                try {
                    const results = await this.webSearchService.searchAndExtract(content, 3);
                    if (results.length > 0) {
                        webContext = this.webSearchService.formatSourcesAsObsidian(results);
                    }
                }
                catch {
                    // Non-blocking: skip web search on failure
                }
            }
            const systemPrompt = `Ti si poslovni asistent koji pomaže korisniku da istraži i razume poslovne teme.
Odgovaraj precizno i koncizno na srpskom jeziku.
${businessContext}${brainMemoryContext ? '\n' + brainMemoryContext : ''}${webContext}`;
            // Stream response via discovery-specific events (no persistence)
            let fullContent = '';
            let chunkIndex = 0;
            await this.aiGatewayService.streamCompletionWithContext([{ role: 'user', content }], {
                tenantId: authenticatedClient.tenantId,
                userId: authenticatedClient.userId,
                businessContext: systemPrompt,
            }, (chunk) => {
                fullContent += chunk;
                client.emit('discovery:message-chunk', {
                    chunk,
                    index: chunkIndex++,
                });
            });
            client.emit('discovery:message-complete', {
                fullContent,
                totalChunks: chunkIndex,
            });
            this.logger.log({
                message: 'Discovery chat message processed',
                userId: authenticatedClient.userId,
                contentLength: content.length,
                responseLength: fullContent.length,
                webSearchUsed: webContext.length > 0,
            });
        }
        catch (error) {
            this.logger.error({
                message: 'Discovery chat message failed',
                userId: authenticatedClient.userId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            client.emit('discovery:error', {
                message: error instanceof Error ? error.message : 'Discovery chat failed',
            });
        }
    }
    async buildBusinessContext(tenantId, userId) {
        try {
            const [tenant, onboardingNote] = await Promise.all([
                this.prisma.tenant.findUnique({
                    where: { id: tenantId },
                    select: { name: true, industry: true, description: true },
                }),
                this.notesService.getLatestNoteBySource(userId, tenantId, prisma_1.NoteSource.ONBOARDING),
            ]);
            if (!tenant) {
                return '';
            }
            let context = '--- BUSINESS CONTEXT ---\n';
            context += `Company: ${tenant.name}`;
            if (tenant.industry) {
                context += ` | Industry: ${tenant.industry}`;
            }
            context += '\n';
            if (tenant.description) {
                context += `Description: ${tenant.description}\n`;
            }
            if (onboardingNote?.content) {
                context += `\nBusiness Analysis:\n${onboardingNote.content}\n`;
            }
            context += '--- END BUSINESS CONTEXT ---\n';
            context +=
                'Use this business context to personalize your responses.\nVAŽNO: Odgovaraj na srpskom jeziku.';
            this.logger.log({
                message: 'Business context built for chat',
                tenantId,
                userId,
                hasOnboardingNote: !!onboardingNote,
                contextLength: context.length,
            });
            return context;
        }
        catch (error) {
            this.logger.warn({
                message: 'Failed to build business context, proceeding without it',
                tenantId,
                userId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return '';
        }
    }
    extractToken(client) {
        // Try Authorization header first
        const authHeader = client.handshake.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.slice(7);
        }
        // Try socket.io auth option (client passes auth: { token })
        const authToken = client.handshake.auth?.token;
        if (typeof authToken === 'string' && authToken) {
            return authToken;
        }
        // Try query parameter
        const token = client.handshake.query.token;
        if (typeof token === 'string') {
            return token;
        }
        return null;
    }
    async verifyToken(token) {
        return new Promise((resolve, reject) => {
            const getKey = (header, callback) => {
                if (!header.kid) {
                    callback(new Error('No kid in token header'));
                    return;
                }
                this.jwksClient.getSigningKey(header.kid, (err, key) => {
                    if (err) {
                        callback(err);
                        return;
                    }
                    const signingKey = key?.getPublicKey();
                    callback(null, signingKey);
                });
            };
            (0, jsonwebtoken_1.verify)(token, getKey, {
                audience: this.auth0Audience,
                issuer: `https://${this.auth0Domain}/`,
                algorithms: ['RS256'],
            }, (err, decoded) => {
                if (err) {
                    reject(new common_1.UnauthorizedException('Invalid token'));
                }
                else {
                    resolve(decoded);
                }
            });
        });
    }
};
exports.ConversationGateway = ConversationGateway;
tslib_1.__decorate([
    (0, websockets_1.WebSocketServer)(),
    tslib_1.__metadata("design:type", typeof (_t = typeof socket_io_1.Server !== "undefined" && socket_io_1.Server) === "function" ? _t : Object)
], ConversationGateway.prototype, "server", void 0);
tslib_1.__decorate([
    (0, websockets_1.SubscribeMessage)('chat:message-send'),
    tslib_1.__param(0, (0, websockets_1.ConnectedSocket)()),
    tslib_1.__param(1, (0, websockets_1.MessageBody)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_u = typeof socket_io_1.Socket !== "undefined" && socket_io_1.Socket) === "function" ? _u : Object, Object]),
    tslib_1.__metadata("design:returntype", Promise)
], ConversationGateway.prototype, "handleMessage", null);
tslib_1.__decorate([
    (0, websockets_1.SubscribeMessage)('workflow:run-agents'),
    tslib_1.__param(0, (0, websockets_1.ConnectedSocket)()),
    tslib_1.__param(1, (0, websockets_1.MessageBody)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_v = typeof socket_io_1.Socket !== "undefined" && socket_io_1.Socket) === "function" ? _v : Object, Object]),
    tslib_1.__metadata("design:returntype", typeof (_w = typeof Promise !== "undefined" && Promise) === "function" ? _w : Object)
], ConversationGateway.prototype, "handleRunAgents", null);
tslib_1.__decorate([
    (0, websockets_1.SubscribeMessage)('workflow:approve'),
    tslib_1.__param(0, (0, websockets_1.ConnectedSocket)()),
    tslib_1.__param(1, (0, websockets_1.MessageBody)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_x = typeof socket_io_1.Socket !== "undefined" && socket_io_1.Socket) === "function" ? _x : Object, Object]),
    tslib_1.__metadata("design:returntype", typeof (_y = typeof Promise !== "undefined" && Promise) === "function" ? _y : Object)
], ConversationGateway.prototype, "handleWorkflowApproval", null);
tslib_1.__decorate([
    (0, websockets_1.SubscribeMessage)('workflow:cancel'),
    tslib_1.__param(0, (0, websockets_1.ConnectedSocket)()),
    tslib_1.__param(1, (0, websockets_1.MessageBody)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_z = typeof socket_io_1.Socket !== "undefined" && socket_io_1.Socket) === "function" ? _z : Object, Object]),
    tslib_1.__metadata("design:returntype", void 0)
], ConversationGateway.prototype, "handleWorkflowCancel", null);
tslib_1.__decorate([
    (0, websockets_1.SubscribeMessage)('workflow:step-continue'),
    tslib_1.__param(0, (0, websockets_1.ConnectedSocket)()),
    tslib_1.__param(1, (0, websockets_1.MessageBody)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_0 = typeof socket_io_1.Socket !== "undefined" && socket_io_1.Socket) === "function" ? _0 : Object, Object]),
    tslib_1.__metadata("design:returntype", void 0)
], ConversationGateway.prototype, "handleStepContinue", null);
tslib_1.__decorate([
    (0, websockets_1.SubscribeMessage)('task:execute-ai'),
    tslib_1.__param(0, (0, websockets_1.ConnectedSocket)()),
    tslib_1.__param(1, (0, websockets_1.MessageBody)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_1 = typeof socket_io_1.Socket !== "undefined" && socket_io_1.Socket) === "function" ? _1 : Object, Object]),
    tslib_1.__metadata("design:returntype", typeof (_2 = typeof Promise !== "undefined" && Promise) === "function" ? _2 : Object)
], ConversationGateway.prototype, "handleExecuteTaskAi", null);
tslib_1.__decorate([
    (0, websockets_1.SubscribeMessage)('task:submit-result'),
    tslib_1.__param(0, (0, websockets_1.ConnectedSocket)()),
    tslib_1.__param(1, (0, websockets_1.MessageBody)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_3 = typeof socket_io_1.Socket !== "undefined" && socket_io_1.Socket) === "function" ? _3 : Object, Object]),
    tslib_1.__metadata("design:returntype", typeof (_4 = typeof Promise !== "undefined" && Promise) === "function" ? _4 : Object)
], ConversationGateway.prototype, "handleSubmitTaskResult", null);
tslib_1.__decorate([
    (0, websockets_1.SubscribeMessage)('workflow:start-yolo'),
    tslib_1.__param(0, (0, websockets_1.ConnectedSocket)()),
    tslib_1.__param(1, (0, websockets_1.MessageBody)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_5 = typeof socket_io_1.Socket !== "undefined" && socket_io_1.Socket) === "function" ? _5 : Object, Object]),
    tslib_1.__metadata("design:returntype", typeof (_6 = typeof Promise !== "undefined" && Promise) === "function" ? _6 : Object)
], ConversationGateway.prototype, "handleStartYolo", null);
tslib_1.__decorate([
    (0, websockets_1.SubscribeMessage)('yolo:start-domain'),
    tslib_1.__param(0, (0, websockets_1.ConnectedSocket)()),
    tslib_1.__param(1, (0, websockets_1.MessageBody)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_7 = typeof socket_io_1.Socket !== "undefined" && socket_io_1.Socket) === "function" ? _7 : Object, Object]),
    tslib_1.__metadata("design:returntype", typeof (_8 = typeof Promise !== "undefined" && Promise) === "function" ? _8 : Object)
], ConversationGateway.prototype, "handleStartDomainYolo", null);
tslib_1.__decorate([
    (0, websockets_1.SubscribeMessage)('discovery:send-message'),
    tslib_1.__param(0, (0, websockets_1.ConnectedSocket)()),
    tslib_1.__param(1, (0, websockets_1.MessageBody)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_9 = typeof socket_io_1.Socket !== "undefined" && socket_io_1.Socket) === "function" ? _9 : Object, Object]),
    tslib_1.__metadata("design:returntype", typeof (_10 = typeof Promise !== "undefined" && Promise) === "function" ? _10 : Object)
], ConversationGateway.prototype, "handleDiscoveryMessage", null);
exports.ConversationGateway = ConversationGateway = ConversationGateway_1 = tslib_1.__decorate([
    (0, websockets_1.WebSocketGateway)({
        namespace: '/ws/chat',
        cors: {
            origin: true, // Dynamically set in afterInit based on environment
            credentials: true,
        },
    }),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof conversation_service_1.ConversationService !== "undefined" && conversation_service_1.ConversationService) === "function" ? _a : Object, typeof (_b = typeof ai_gateway_service_1.AiGatewayService !== "undefined" && ai_gateway_service_1.AiGatewayService) === "function" ? _b : Object, typeof (_c = typeof config_1.ConfigService !== "undefined" && config_1.ConfigService) === "function" ? _c : Object, typeof (_d = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _d : Object, typeof (_e = typeof notes_service_1.NotesService !== "undefined" && notes_service_1.NotesService) === "function" ? _e : Object, typeof (_f = typeof concept_matching_service_1.ConceptMatchingService !== "undefined" && concept_matching_service_1.ConceptMatchingService) === "function" ? _f : Object, typeof (_g = typeof citation_injector_service_1.CitationInjectorService !== "undefined" && citation_injector_service_1.CitationInjectorService) === "function" ? _g : Object, typeof (_h = typeof citation_service_1.CitationService !== "undefined" && citation_service_1.CitationService) === "function" ? _h : Object, typeof (_j = typeof memory_context_builder_service_1.MemoryContextBuilderService !== "undefined" && memory_context_builder_service_1.MemoryContextBuilderService) === "function" ? _j : Object, typeof (_k = typeof memory_extraction_service_1.MemoryExtractionService !== "undefined" && memory_extraction_service_1.MemoryExtractionService) === "function" ? _k : Object, typeof (_l = typeof memory_service_1.MemoryService !== "undefined" && memory_service_1.MemoryService) === "function" ? _l : Object, typeof (_m = typeof workflow_service_1.WorkflowService !== "undefined" && workflow_service_1.WorkflowService) === "function" ? _m : Object, typeof (_o = typeof concept_service_1.ConceptService !== "undefined" && concept_service_1.ConceptService) === "function" ? _o : Object, typeof (_p = typeof concept_extraction_service_1.ConceptExtractionService !== "undefined" && concept_extraction_service_1.ConceptExtractionService) === "function" ? _p : Object, typeof (_q = typeof yolo_scheduler_service_1.YoloSchedulerService !== "undefined" && yolo_scheduler_service_1.YoloSchedulerService) === "function" ? _q : Object, typeof (_r = typeof web_search_service_1.WebSearchService !== "undefined" && web_search_service_1.WebSearchService) === "function" ? _r : Object, typeof (_s = typeof business_context_service_1.BusinessContextService !== "undefined" && business_context_service_1.BusinessContextService) === "function" ? _s : Object])
], ConversationGateway);


/***/ }),
/* 152 */
/***/ ((module) => {

module.exports = require("@nestjs/websockets");

/***/ }),
/* 153 */
/***/ ((module) => {

module.exports = require("socket.io");

/***/ }),
/* 154 */
/***/ ((module) => {

module.exports = require("jwks-rsa");

/***/ }),
/* 155 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OnboardingModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const auth_module_1 = __webpack_require__(40);
const ai_gateway_module_1 = __webpack_require__(87);
const notes_module_1 = __webpack_require__(130);
const knowledge_module_1 = __webpack_require__(72);
const conversation_module_1 = __webpack_require__(129);
const web_search_module_1 = __webpack_require__(143);
const file_upload_module_1 = __webpack_require__(39);
const onboarding_controller_1 = __webpack_require__(156);
const onboarding_service_1 = __webpack_require__(157);
const onboarding_metric_service_1 = __webpack_require__(158);
/**
 * Module for the onboarding quick win flow.
 * Provides sub-5-minute first value experience for new users.
 */
let OnboardingModule = class OnboardingModule {
};
exports.OnboardingModule = OnboardingModule;
exports.OnboardingModule = OnboardingModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [
            tenant_context_1.TenantModule, // Provides PlatformPrismaService
            auth_module_1.AuthModule, // Provides AuthService for MfaRequiredGuard
            ai_gateway_module_1.AiGatewayModule, // Provides AiGatewayService
            notes_module_1.NotesModule, // Provides NotesService for saving onboarding output
            knowledge_module_1.KnowledgeModule, // Provides ConceptService for business brain
            conversation_module_1.ConversationModule, // Provides ConversationService for welcome conversation
            web_search_module_1.WebSearchModule, // Provides WebSearchService for website analysis
            file_upload_module_1.FileUploadModule, // Provides FileUploadService for PDF validation
        ],
        controllers: [onboarding_controller_1.OnboardingController],
        providers: [onboarding_service_1.OnboardingService, onboarding_metric_service_1.OnboardingMetricService],
        exports: [onboarding_service_1.OnboardingService, onboarding_metric_service_1.OnboardingMetricService],
    })
], OnboardingModule);


/***/ }),
/* 156 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var OnboardingController_1;
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OnboardingController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const platform_express_1 = __webpack_require__(27);
const onboarding_service_1 = __webpack_require__(157);
const quick_win_dto_1 = __webpack_require__(161);
const jwt_auth_guard_1 = __webpack_require__(45);
const mfa_required_guard_1 = __webpack_require__(58);
const skip_mfa_decorator_1 = __webpack_require__(50);
const current_user_decorator_1 = __webpack_require__(47);
/**
 * Controller for onboarding quick win flow.
 * Handles the wizard for sub-5-minute first value experience.
 * Requires authentication but skips MFA (onboarding happens before MFA setup).
 */
let OnboardingController = OnboardingController_1 = class OnboardingController {
    constructor(onboardingService) {
        this.onboardingService = onboardingService;
        this.logger = new common_1.Logger(OnboardingController_1.name);
    }
    /**
     * POST /api/onboarding/setup-company
     * Saves company details during onboarding step 1.
     */
    async setupCompany(dto, user, correlationId) {
        this.logger.log({
            message: 'Setting up company during onboarding',
            tenantId: user.tenantId,
            userId: user.userId,
            companyName: dto.companyName,
            industry: dto.industry,
            correlationId,
        });
        await this.onboardingService.setupCompany(user.tenantId, user.userId, dto.companyName, dto.industry, dto.description, dto.websiteUrl);
        return {
            data: { success: true },
            ...(correlationId && { correlationId }),
        };
    }
    /**
     * POST /api/onboarding/upload-brochure
     * Extracts text from an uploaded PDF brochure for business context enrichment.
     */
    async uploadBrochure(file, user, correlationId) {
        if (!file) {
            throw new common_1.BadRequestException({
                type: 'no_file',
                title: 'No File Uploaded',
                status: 400,
                detail: 'Please select a PDF file to upload',
            });
        }
        if (file.mimetype !== 'application/pdf') {
            throw new common_1.BadRequestException({
                type: 'invalid_file_type',
                title: 'Invalid File Type',
                status: 400,
                detail: 'Only PDF files are accepted',
            });
        }
        this.logger.log({
            message: 'Uploading brochure PDF for text extraction',
            tenantId: user.tenantId,
            userId: user.userId,
            fileName: file.originalname,
            fileSize: file.size,
            correlationId,
        });
        const extractedText = await this.onboardingService.extractBrochureText(file.buffer);
        this.logger.log({
            message: 'Brochure text extracted successfully',
            tenantId: user.tenantId,
            userId: user.userId,
            extractedLength: extractedText.length,
            correlationId,
        });
        return {
            data: { extractedText },
            ...(correlationId && { correlationId }),
        };
    }
    /**
     * POST /api/onboarding/analyse-business
     * Generates AI-powered business analysis.
     */
    async analyseBusiness(dto, user, correlationId) {
        this.logger.log({
            message: 'Analysing business during onboarding',
            tenantId: user.tenantId,
            userId: user.userId,
            correlationId,
        });
        const result = await this.onboardingService.analyseBusiness(user.tenantId, user.userId, dto.businessState, dto.departments);
        return {
            data: result,
            ...(correlationId && { correlationId }),
        };
    }
    /**
     * POST /api/onboarding/create-business-brain
     * Auto-generates personalized tasks and focus areas.
     */
    async createBusinessBrain(dto, user, correlationId) {
        this.logger.log({
            message: 'Creating business brain during onboarding',
            tenantId: user.tenantId,
            userId: user.userId,
            correlationId,
        });
        const result = await this.onboardingService.createBusinessBrain(user.tenantId, user.userId, dto.businessState, dto.departments);
        return {
            data: result,
            ...(correlationId && { correlationId }),
        };
    }
    /**
     * GET /api/onboarding/status
     * Returns the current onboarding status for the authenticated user.
     */
    async getStatus(user, correlationId) {
        this.logger.log({
            message: 'Getting onboarding status',
            tenantId: user.tenantId,
            userId: user.userId,
            correlationId,
        });
        const status = await this.onboardingService.getStatus(user.tenantId, user.userId);
        return {
            data: status,
            ...(correlationId && { correlationId }),
        };
    }
    /**
     * GET /api/onboarding/tasks
     * Returns all available quick tasks.
     */
    getAllTasks(correlationId) {
        const tasks = this.onboardingService.getAllTasks();
        return {
            data: tasks,
            ...(correlationId && { correlationId }),
        };
    }
    /**
     * GET /api/onboarding/tasks/:industry
     * Returns quick tasks filtered by industry/department.
     */
    getTasksByIndustry(industry, correlationId) {
        this.logger.log({
            message: 'Getting tasks for industry',
            industry,
            correlationId,
        });
        const tasks = this.onboardingService.getTasksForIndustry(industry);
        return {
            data: tasks,
            ...(correlationId && { correlationId }),
        };
    }
    /**
     * POST /api/onboarding/quick-win
     * Executes the quick win task using AI.
     */
    async executeQuickWin(dto, user, correlationId) {
        this.logger.log({
            message: 'Executing quick win',
            tenantId: user.tenantId,
            userId: user.userId,
            taskId: dto.taskId,
            industry: dto.industry,
            correlationId,
        });
        const result = await this.onboardingService.executeQuickWin(user.tenantId, user.userId, dto.taskId, dto.userContext, dto.industry);
        return {
            data: result,
            ...(correlationId && { correlationId }),
        };
    }
    /**
     * PATCH /api/onboarding/set-department
     * Saves the user's department/role selection (Story 3.2).
     */
    async setDepartment(dto, user) {
        await this.onboardingService.setDepartment(user.userId, dto.department ?? null);
        return { data: { success: true } };
    }
    /**
     * POST /api/onboarding/complete
     * Completes onboarding, saves the note, and transitions tenant to ACTIVE.
     */
    async completeOnboarding(dto, user, correlationId) {
        this.logger.log({
            message: 'Completing onboarding',
            tenantId: user.tenantId,
            userId: user.userId,
            taskId: dto.taskId,
            correlationId,
        });
        const result = await this.onboardingService.completeOnboarding(user.tenantId, user.userId, dto.taskId, dto.generatedOutput, dto.executionMode);
        return {
            data: result,
            ...(correlationId && { correlationId }),
        };
    }
};
exports.OnboardingController = OnboardingController;
tslib_1.__decorate([
    (0, common_1.Post)('setup-company'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__param(1, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(2, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_b = typeof quick_win_dto_1.SetupCompanyDto !== "undefined" && quick_win_dto_1.SetupCompanyDto) === "function" ? _b : Object, Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_c = typeof Promise !== "undefined" && Promise) === "function" ? _c : Object)
], OnboardingController.prototype, "setupCompany", null);
tslib_1.__decorate([
    (0, common_1.Post)('upload-brochure'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('brochure')),
    tslib_1.__param(0, (0, common_1.UploadedFile)()),
    tslib_1.__param(1, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(2, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_d = typeof Promise !== "undefined" && Promise) === "function" ? _d : Object)
], OnboardingController.prototype, "uploadBrochure", null);
tslib_1.__decorate([
    (0, common_1.Post)('analyse-business'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__param(1, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(2, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_e = typeof quick_win_dto_1.BusinessContextDto !== "undefined" && quick_win_dto_1.BusinessContextDto) === "function" ? _e : Object, Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_f = typeof Promise !== "undefined" && Promise) === "function" ? _f : Object)
], OnboardingController.prototype, "analyseBusiness", null);
tslib_1.__decorate([
    (0, common_1.Post)('create-business-brain'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__param(1, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(2, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_g = typeof quick_win_dto_1.BusinessContextDto !== "undefined" && quick_win_dto_1.BusinessContextDto) === "function" ? _g : Object, Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_h = typeof Promise !== "undefined" && Promise) === "function" ? _h : Object)
], OnboardingController.prototype, "createBusinessBrain", null);
tslib_1.__decorate([
    (0, common_1.Get)('status'),
    tslib_1.__param(0, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(1, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_j = typeof Promise !== "undefined" && Promise) === "function" ? _j : Object)
], OnboardingController.prototype, "getStatus", null);
tslib_1.__decorate([
    (0, common_1.Get)('tasks'),
    tslib_1.__param(0, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", Object)
], OnboardingController.prototype, "getAllTasks", null);
tslib_1.__decorate([
    (0, common_1.Get)('tasks/:industry'),
    tslib_1.__param(0, (0, common_1.Param)('industry')),
    tslib_1.__param(1, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String, String]),
    tslib_1.__metadata("design:returntype", Object)
], OnboardingController.prototype, "getTasksByIndustry", null);
tslib_1.__decorate([
    (0, common_1.Post)('quick-win'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__param(1, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(2, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_k = typeof quick_win_dto_1.QuickWinDto !== "undefined" && quick_win_dto_1.QuickWinDto) === "function" ? _k : Object, Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_l = typeof Promise !== "undefined" && Promise) === "function" ? _l : Object)
], OnboardingController.prototype, "executeQuickWin", null);
tslib_1.__decorate([
    (0, common_1.Patch)('set-department'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__param(1, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_m = typeof quick_win_dto_1.SetDepartmentDto !== "undefined" && quick_win_dto_1.SetDepartmentDto) === "function" ? _m : Object, Object]),
    tslib_1.__metadata("design:returntype", typeof (_o = typeof Promise !== "undefined" && Promise) === "function" ? _o : Object)
], OnboardingController.prototype, "setDepartment", null);
tslib_1.__decorate([
    (0, common_1.Post)('complete'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__param(1, (0, current_user_decorator_1.CurrentUser)()),
    tslib_1.__param(2, (0, common_1.Headers)('x-correlation-id')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [typeof (_p = typeof quick_win_dto_1.OnboardingCompleteDto !== "undefined" && quick_win_dto_1.OnboardingCompleteDto) === "function" ? _p : Object, Object, String]),
    tslib_1.__metadata("design:returntype", typeof (_q = typeof Promise !== "undefined" && Promise) === "function" ? _q : Object)
], OnboardingController.prototype, "completeOnboarding", null);
exports.OnboardingController = OnboardingController = OnboardingController_1 = tslib_1.__decorate([
    (0, common_1.Controller)('onboarding'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, mfa_required_guard_1.MfaRequiredGuard),
    (0, skip_mfa_decorator_1.SkipMfa)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof onboarding_service_1.OnboardingService !== "undefined" && onboarding_service_1.OnboardingService) === "function" ? _a : Object])
], OnboardingController);


/***/ }),
/* 157 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var OnboardingService_1;
var _a, _b, _c, _d, _e, _f, _g, _h, _j;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OnboardingService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const prisma_1 = __webpack_require__(34);
const ai_gateway_service_1 = __webpack_require__(88);
const notes_service_1 = __webpack_require__(131);
const concept_service_1 = __webpack_require__(104);
const concept_matching_service_1 = __webpack_require__(109);
const conversation_service_1 = __webpack_require__(148);
const web_search_service_1 = __webpack_require__(144);
const brain_seeding_service_1 = __webpack_require__(116);
const onboarding_metric_service_1 = __webpack_require__(158);
const quick_task_templates_1 = __webpack_require__(159);
const department_categories_1 = __webpack_require__(117);
/**
 * Service for managing the onboarding quick win flow.
 * Enables users to experience AI value within 5 minutes of registration.
 */
let OnboardingService = OnboardingService_1 = class OnboardingService {
    constructor(prisma, aiGateway, notesService, metricService, conceptService, conceptMatchingService, conversationService, webSearchService, brainSeedingService) {
        this.prisma = prisma;
        this.aiGateway = aiGateway;
        this.notesService = notesService;
        this.metricService = metricService;
        this.conceptService = conceptService;
        this.conceptMatchingService = conceptMatchingService;
        this.conversationService = conversationService;
        this.webSearchService = webSearchService;
        this.brainSeedingService = brainSeedingService;
        this.logger = new common_1.Logger(OnboardingService_1.name);
    }
    /**
     * Extracts text content from a PDF brochure buffer.
     * Returns the extracted text, truncated to 3000 chars to fit within description limits.
     */
    async extractBrochureText(pdfBuffer) {
        const MAX_PDF_SIZE = 70 * 1024 * 1024; // 70MB
        if (pdfBuffer.length > MAX_PDF_SIZE) {
            throw new common_1.BadRequestException({
                type: 'pdf_too_large',
                title: 'PDF Too Large',
                status: 400,
                detail: 'PDF file must be 70MB or smaller',
            });
        }
        let text;
        try {
            const { PDFParse } = await Promise.resolve().then(() => tslib_1.__importStar(__webpack_require__(160)));
            const parser = new PDFParse({ data: pdfBuffer });
            const result = await parser.getText();
            text = result.text?.trim() ?? '';
            await parser.destroy();
        }
        catch (err) {
            this.logger.warn({
                message: 'Failed to parse PDF',
                error: err instanceof Error ? err.message : 'Unknown',
            });
            throw new common_1.BadRequestException({
                type: 'pdf_parse_error',
                title: 'PDF Parse Error',
                status: 400,
                detail: 'Could not extract text from this PDF. It may be image-only or corrupted.',
            });
        }
        if (!text) {
            throw new common_1.BadRequestException({
                type: 'pdf_empty',
                title: 'No Text Found',
                status: 400,
                detail: 'No text could be extracted from this PDF. It may be image-only.',
            });
        }
        return text.substring(0, 3000);
    }
    /**
     * Saves company details during onboarding step 1.
     * Updates the tenant record with company name, industry, and description.
     * Also creates/updates the User record so chat FK constraints are satisfied.
     * Sets tenant status to ONBOARDING if currently DRAFT.
     */
    async setupCompany(tenantId, userId, companyName, industry, description, websiteUrl) {
        this.logger.log({
            message: 'Setting up company details',
            tenantId,
            userId,
            companyName,
            industry,
            websiteUrl,
        });
        const existing = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
        });
        if (existing) {
            await this.prisma.tenant.update({
                where: { id: tenantId },
                data: {
                    name: companyName,
                    industry,
                    description: description ?? null,
                    status: existing.status === prisma_1.TenantStatus.DRAFT
                        ? prisma_1.TenantStatus.ONBOARDING
                        : existing.status,
                },
            });
        }
        else {
            await this.prisma.tenant.create({
                data: {
                    id: tenantId,
                    name: companyName,
                    industry,
                    description: description ?? null,
                    status: prisma_1.TenantStatus.ONBOARDING,
                },
            });
        }
        // Ensure User record exists (fixes chat FK violation)
        await this.prisma.user.upsert({
            where: { id: userId },
            create: {
                id: userId,
                email: `${userId}@mentor-ai.local`,
                name: companyName,
                role: prisma_1.UserRole.TENANT_OWNER,
                tenantId,
            },
            update: {},
        });
        // Fetch website content if URL provided — enrich description with extracted data
        if (websiteUrl && this.webSearchService.isAvailable()) {
            try {
                const websiteContent = await this.webSearchService.fetchWebpage(websiteUrl);
                if (websiteContent) {
                    const enrichedDesc = [
                        description,
                        `\n\n--- Website Content (${websiteUrl}) ---\n${websiteContent}`,
                    ]
                        .filter(Boolean)
                        .join('');
                    await this.prisma.tenant.update({
                        where: { id: tenantId },
                        data: { description: enrichedDesc.substring(0, 5000) },
                    });
                    this.logger.log({
                        message: 'Enriched tenant description with website content',
                        tenantId,
                        websiteUrl,
                        contentLength: websiteContent.length,
                    });
                }
            }
            catch (err) {
                this.logger.warn({
                    message: 'Failed to fetch website content (non-blocking)',
                    websiteUrl,
                    error: err instanceof Error ? err.message : 'Unknown',
                });
            }
        }
        this.logger.log({
            message: 'Company details and user record saved',
            tenantId,
            userId,
        });
    }
    /**
     * Sets the user's department during onboarding (Story 3.2).
     * null = owner/CEO (sees all categories).
     */
    async setDepartment(userId, department) {
        await this.prisma.user.update({
            where: { id: userId },
            data: { department: department ?? null },
        });
    }
    /**
     * Gets the current onboarding status for a user.
     */
    async getStatus(tenantId, userId) {
        this.logger.log({
            message: 'Getting onboarding status',
            tenantId,
            userId,
        });
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { status: true },
        });
        if (!tenant) {
            this.logger.log({
                message: 'Tenant not found, returning DRAFT status for onboarding',
                tenantId,
            });
            return {
                currentStep: 1,
                tenantStatus: 'DRAFT',
                selectedIndustry: undefined,
                selectedTaskId: undefined,
                startedAt: undefined,
            };
        }
        // If user already has conversations, they've used the system — skip onboarding
        const conversationCount = await this.prisma.conversation.count({
            where: { userId },
        });
        if (conversationCount > 0) {
            // Auto-upgrade tenant to ACTIVE if still in DRAFT/ONBOARDING
            if (tenant.status === 'DRAFT' || tenant.status === 'ONBOARDING') {
                await this.prisma.tenant.update({
                    where: { id: tenantId },
                    data: { status: 'ACTIVE' },
                });
                this.logger.log({
                    message: 'Auto-upgraded tenant to ACTIVE (user has existing conversations)',
                    tenantId,
                    userId,
                    conversationCount,
                });
            }
            return {
                currentStep: 'complete',
                tenantStatus: 'ACTIVE',
                selectedIndustry: undefined,
                selectedTaskId: undefined,
                startedAt: undefined,
            };
        }
        const metric = await this.metricService.getMetric(userId);
        let currentStep = 1;
        if (metric?.completedAt) {
            currentStep = 'complete';
        }
        else if (metric?.quickTaskType) {
            currentStep = 3;
        }
        else if (metric?.industry) {
            currentStep = 2;
        }
        return {
            currentStep,
            tenantStatus: tenant.status,
            selectedIndustry: metric?.industry,
            selectedTaskId: metric?.quickTaskType,
            startedAt: metric?.startedAt,
        };
    }
    /**
     * Analyses the user's business using AI.
     * Fetches tenant details and generates a comprehensive business analysis.
     */
    async analyseBusiness(tenantId, userId, businessState, departments) {
        this.logger.log({
            message: 'Analysing business',
            tenantId,
            userId,
            departments,
        });
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true, industry: true, description: true },
        });
        const companyName = tenant?.name ?? 'Unknown Company';
        const industry = tenant?.industry ?? 'General';
        const companyDescription = tenant?.description ?? '';
        const systemPrompt = `You are a senior business consultant with 20+ years of experience across multiple industries. You provide clear, actionable analysis grounded in proven business frameworks.

Analyze the following business and provide:
1. **Business Overview** — A concise summary of where the business stands
2. **Strengths** — 3-5 key strengths to leverage
3. **Opportunities** — 3-5 growth opportunities specific to their industry and situation
4. **Risk Areas** — 2-3 potential risks or challenges to watch
5. **Strategic Recommendations** — 3-5 concrete, prioritized next steps

Be specific and practical. Avoid generic advice. Reference their industry, departments, and current state directly.`;
        const userPrompt = `Company: ${companyName}
Industry: ${industry}
${companyDescription ? `Description: ${companyDescription}` : ''}

Current Business State: ${businessState}

Active Departments/Functions: ${departments.join(', ')}

Please provide a comprehensive business analysis.`;
        const startTime = Date.now();
        let fullOutput = '';
        const result = await this.aiGateway.streamCompletionWithContext([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ], { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true }, (chunk) => {
            fullOutput += chunk;
        });
        const generationTimeMs = Date.now() - startTime;
        this.logger.log({
            message: 'Business analysis completed',
            tenantId,
            userId,
            generationTimeMs,
            tokens: result.inputTokens + result.outputTokens,
        });
        return { output: fullOutput, generationTimeMs };
    }
    /**
     * Creates a "Business Brain" — auto-generates personalized tasks and focus areas
     * based on the business profile and available concepts.
     */
    async createBusinessBrain(tenantId, userId, businessState, departments) {
        this.logger.log({
            message: 'Creating business brain',
            tenantId,
            userId,
            departments,
        });
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true, industry: true, description: true },
        });
        const companyName = tenant?.name ?? 'Unknown Company';
        const industry = tenant?.industry ?? 'General';
        const companyDescription = tenant?.description ?? '';
        // Fetch relevant concepts to ground the business brain in domain knowledge
        const conceptsResult = await this.conceptService.findAll({ limit: 30 });
        const conceptSummaries = conceptsResult.data
            .map((c) => `- ${c.name} (${c.category}): ${c.definition}`)
            .join('\n');
        const systemPrompt = `You are a senior business strategist and management consultant with 20+ years of experience. Your task is to create a personalized "Business Brain" — a set of actionable, prioritized tasks that will drive measurable business improvement.

For each task, provide:
1. **Title** — Clear, action-oriented title
2. **Description** — 2-3 sentences explaining what to do and WHY it matters for this specific business
3. **Priority** — High / Medium / Low
4. **Department** — Which department owns this task
5. **Related Concept** — Which business concept from the provided list this task applies

Generate 8-10 tasks. Be specific to the company's industry, current state, and departments. Avoid generic advice.`;
        const userPrompt = `Company: ${companyName}
Industry: ${industry}
${companyDescription ? `Description: ${companyDescription}` : ''}

Current Business State: ${businessState}

Active Departments: ${departments.join(', ')}

Available Business Concepts:
${conceptSummaries}

Generate a personalized Business Brain with 8-10 prioritized tasks.`;
        const startTime = Date.now();
        let fullOutput = '';
        const result = await this.aiGateway.streamCompletionWithContext([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ], { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true }, (chunk) => {
            fullOutput += chunk;
        });
        const generationTimeMs = Date.now() - startTime;
        this.logger.log({
            message: 'Business brain created',
            tenantId,
            userId,
            generationTimeMs,
            tokens: result.inputTokens + result.outputTokens,
        });
        return { output: fullOutput, generationTimeMs };
    }
    /**
     * Gets available quick tasks for an industry.
     */
    getTasksForIndustry(industry) {
        const tasks = (0, quick_task_templates_1.getTasksByIndustry)(industry);
        this.logger.log({
            message: 'Retrieved tasks for industry',
            industry,
            taskCount: tasks.length,
        });
        return tasks;
    }
    /**
     * Gets all available quick tasks.
     */
    getAllTasks() {
        return quick_task_templates_1.QUICK_TASK_TEMPLATES;
    }
    /**
     * Executes a quick win task using the AI Gateway.
     */
    async executeQuickWin(tenantId, userId, taskId, userContext, industry) {
        this.logger.log({
            message: 'Executing quick win task',
            tenantId,
            userId,
            taskId,
            industry,
            contextLength: userContext.length,
        });
        const task = (0, quick_task_templates_1.getTaskById)(taskId);
        if (!task) {
            throw new common_1.BadRequestException({
                type: 'invalid_task',
                title: 'Invalid Task',
                status: 400,
                detail: `Task with ID '${taskId}' does not exist`,
            });
        }
        const hasIncomplete = await this.metricService.hasIncompleteOnboarding(userId);
        if (!hasIncomplete) {
            await this.metricService.startOnboarding(tenantId, userId, industry, taskId);
        }
        const systemPrompt = (0, quick_task_templates_1.generateSystemPrompt)(task, industry);
        const userPrompt = (0, quick_task_templates_1.generateUserPrompt)(task, userContext);
        const startTime = Date.now();
        let fullOutput = '';
        let tokensUsed = 0;
        try {
            const result = await this.aiGateway.streamCompletionWithContext([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ], { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true }, (chunk) => {
                fullOutput += chunk;
            });
            tokensUsed = result.inputTokens + result.outputTokens;
        }
        catch (error) {
            this.logger.error({
                message: 'AI Gateway error during quick win',
                tenantId,
                userId,
                taskId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
        const generationTimeMs = Date.now() - startTime;
        this.logger.log({
            message: 'Quick win task completed',
            tenantId,
            userId,
            taskId,
            generationTimeMs,
            tokensUsed,
            outputLength: fullOutput.length,
        });
        return {
            output: fullOutput,
            generationTimeMs,
            tokensUsed,
        };
    }
    /**
     * Completes the onboarding flow, saves the note, and transitions tenant to ACTIVE.
     */
    async completeOnboarding(tenantId, userId, taskId, generatedOutput, executionMode) {
        this.logger.log({
            message: 'Completing onboarding',
            tenantId,
            userId,
            taskId,
        });
        // Determine note title based on strategy or task
        let noteTitle = 'Onboarding Quick Win';
        let timeSavedMinutes = 15;
        if (taskId === 'ANALYSE_BUSINESS') {
            noteTitle = 'Business Analysis';
            timeSavedMinutes = 30;
        }
        else if (taskId === 'CREATE_BUSINESS_BRAIN') {
            noteTitle = 'Business Brain — Tasks & Focus Areas';
            timeSavedMinutes = 45;
        }
        else {
            const task = (0, quick_task_templates_1.getTaskById)(taskId);
            if (task) {
                noteTitle = task.name;
                timeSavedMinutes = task.estimatedTimeSaved;
            }
        }
        // Update tenant status to ACTIVE
        await this.updateTenantStatus(tenantId);
        // Complete the onboarding metric
        await this.metricService.completeOnboarding(userId);
        // Save the generated output as a note
        const note = await this.notesService.createNote({
            title: noteTitle,
            content: generatedOutput,
            source: prisma_1.NoteSource.ONBOARDING,
            userId,
            tenantId,
        });
        // Generate initial action plan from business context via embeddings
        let welcomeConversationId = null;
        try {
            welcomeConversationId = await this.generateInitialPlan(tenantId, userId);
        }
        catch (err) {
            this.logger.warn({
                message: 'Initial plan generation failed (non-blocking)',
                tenantId,
                userId,
                error: err instanceof Error ? err.message : 'Unknown',
            });
        }
        // Story 3.2: Seed Brain pending tasks based on user's department (fire-and-forget)
        // Loads user's department from DB and seeds concept tasks accordingly
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { department: true, role: true },
        });
        this.brainSeedingService
            .seedPendingTasksForUser(userId, tenantId, user?.department ?? null, user?.role ?? 'TENANT_OWNER')
            .catch((err) => {
            this.logger.warn({
                message: 'Brain seeding failed after onboarding (non-blocking)',
                userId,
                tenantId,
                error: err instanceof Error ? err.message : 'Unknown',
            });
        });
        this.logger.log({
            message: 'Onboarding completed successfully',
            tenantId,
            userId,
            timeSavedMinutes,
            noteId: note.id,
            welcomeConversationId,
        });
        return {
            output: generatedOutput,
            timeSavedMinutes,
            noteId: note.id,
            celebrationMessage: `Congratulations! You just saved ~${timeSavedMinutes} minutes!`,
            newTenantStatus: 'ACTIVE',
            welcomeConversationId: welcomeConversationId ?? undefined,
            executionMode: executionMode ?? undefined,
        };
    }
    /**
     * Generates initial action plan by searching Qdrant embeddings with business context.
     * Multi-query approach for maximum coverage, diversified across categories.
     * Creates a welcome conversation with task list.
     */
    async generateInitialPlan(tenantId, userId) {
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true, industry: true, description: true },
        });
        if (!tenant)
            return null;
        // Multi-query approach for maximum concept coverage
        const queries = [
            tenant.industry,
            tenant.description,
            [tenant.name, tenant.industry, tenant.description].filter(Boolean).join('. '),
        ].filter(Boolean);
        const allMatches = new Map();
        for (const query of queries) {
            const matches = await this.conceptMatchingService
                .findRelevantConcepts(query, { limit: 20, threshold: 0.3 })
                .catch(() => []);
            for (const m of matches) {
                const existing = allMatches.get(m.conceptId);
                if (!existing || m.score > existing.score) {
                    allMatches.set(m.conceptId, m);
                }
            }
        }
        // Always include foundation concepts ("Uvod u Poslovanje") first
        const foundationConcepts = await this.prisma.concept.findMany({
            where: { category: { in: [...department_categories_1.FOUNDATION_CATEGORIES] } },
            select: { id: true, name: true, category: true, definition: true },
            orderBy: { sortOrder: 'asc' },
        });
        // Build foundation matches (not from embeddings — guaranteed inclusion)
        const foundationMatches = foundationConcepts.map((c) => ({
            conceptId: c.id,
            conceptName: c.name,
            category: (c.category ??
                'Uvod u Poslovanje'),
            definition: c.definition ?? '',
            score: 1.0, // Max score to ensure they come first
        }));
        // Diversify embedding matches: max 5 per category, sorted by score
        const byCategory = new Map();
        const foundationIds = new Set(foundationConcepts.map((c) => c.id));
        for (const m of allMatches.values()) {
            if (foundationIds.has(m.conceptId))
                continue; // Skip — already in foundation
            const cat = m.category ?? 'General';
            if (!byCategory.has(cat))
                byCategory.set(cat, []);
            byCategory.get(cat).push(m);
        }
        const embeddingMatches = [];
        for (const [, concepts] of byCategory) {
            concepts.sort((a, b) => b.score - a.score);
            embeddingMatches.push(...concepts.slice(0, 5));
        }
        embeddingMatches.sort((a, b) => b.score - a.score);
        // Foundation first, then embedding-matched concepts
        const diversified = [...foundationMatches, ...embeddingMatches];
        if (diversified.length === 0) {
            this.logger.warn({ message: 'No concepts found for initial plan', tenantId });
            return null;
        }
        // Create TASK notes for each matched concept
        for (const match of diversified) {
            const title = this.buildActionTitle(match.conceptName);
            await this.notesService.createNote({
                title,
                content: `Primenite ${match.conceptName} na vaše poslovanje: ${match.definition}`,
                source: prisma_1.NoteSource.ONBOARDING,
                noteType: prisma_1.NoteType.TASK,
                status: prisma_1.NoteStatus.PENDING,
                conceptId: match.conceptId,
                userId,
                tenantId,
            });
        }
        // Build concept summaries for narrative welcome message generation
        const conceptSummaries = diversified
            .map((m, i) => {
            const title = this.buildActionTitle(m.conceptName);
            return `${i + 1}. "${title}" — Koncept: ${m.conceptName}, Definicija: ${m.definition}`;
        })
            .join('\n');
        // Generate narrative welcome message via LLM (explains WHY each task matters)
        const welcomeSystemPrompt = `Ti si poslovni savetnik koji upoznaje klijenta sa personalizovanim akcionim planom.

Napiši dobrodošlicu koja:
1. Pozdravi klijenta i kratko rezimira njihov poslovni profil (1-2 rečenice)
2. Objasni ZAŠTO je svaki zadatak važan za NJIHOVO konkretno poslovanje
3. Objasni REDOSLED — zašto počinjemo sa zadatkom #1, kako svaki naredni nadograđuje prethodni
4. Preporuči da počnu sa zadatkom #1 i objasni zašto

PRAVILA:
- NE koristi [[Naziv Koncepta]] oznake — ovo je pregled plana, ne isporučeni dokument
- NE nabraja korake kao suvu listu — objasni poslovnu vrednost svakog
- Koristi ime kompanije i industrije
- Piši toplo ali profesionalno, kao iskusan konsultant
- Na kraju dodaj instrukcije: odgovorite "da" za sve zadatke, "pokreni 1, 3, 5" za izbor, ili "pokreni prvi" za samo prvi
- Piši ISKLJUČIVO na srpskom jeziku
- Maksimum 400 reči`;
        const welcomeUserPrompt = `Kompanija: ${tenant?.name ?? 'Nepoznata'}
Industrija: ${tenant?.industry ?? 'Opšta'}
${tenant?.description ? `Opis: ${tenant.description}` : ''}

Pripremljeni zadaci (po redosledu):
${conceptSummaries}

Napiši personalizovanu dobrodošlicu.`;
        let welcomeMsg = '';
        try {
            await this.aiGateway.streamCompletionWithContext([
                { role: 'system', content: welcomeSystemPrompt },
                { role: 'user', content: welcomeUserPrompt },
            ], { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true }, (chunk) => {
                welcomeMsg += chunk;
            });
        }
        catch (err) {
            this.logger.warn({
                message: 'Failed to generate narrative welcome message, using fallback',
                error: err instanceof Error ? err.message : 'Unknown',
            });
            // Fallback to simple template if LLM fails
            const taskList = diversified
                .map((m, i) => `${i + 1}. **${this.buildActionTitle(m.conceptName)}**${i === 0 ? ' (preporučeno)' : ''}`)
                .join('\n');
            welcomeMsg = `Dobrodošli! Pripremili smo ${diversified.length} zadataka za vaše poslovanje:\n\n${taskList}\n\nOdgovorite "da" da pokrenete sve zadatke.`;
        }
        // Create welcome conversation linked to the first matched concept
        const conversation = await this.conversationService.createConversation(tenantId, userId, 'Dobrodošli u Mentor AI', undefined, // personaType
        diversified[0]?.conceptId // link to first matched concept for tree display
        );
        await this.conversationService.addMessage(tenantId, conversation.id, 'ASSISTANT', welcomeMsg);
        // Link all onboarding task notes to the welcome conversation
        // so they appear in the notes panel when viewing this conversation
        const conceptIds = diversified.map((m) => m.conceptId);
        await this.notesService.linkNotesToConversation(conceptIds, conversation.id, userId, tenantId);
        this.logger.log({
            message: 'Initial plan generated from embeddings',
            tenantId,
            userId,
            taskCount: diversified.length,
            concepts: diversified.map((m) => m.conceptName),
            welcomeConversationId: conversation.id,
        });
        return conversation.id;
    }
    buildActionTitle(conceptName) {
        const lower = conceptName.toLowerCase();
        if (lower.includes('swot'))
            return 'Izvršite SWOT Analizu';
        if (lower.includes('value proposition'))
            return 'Definišite Vrednosnu Ponudu';
        if (lower.includes('marketing plan') || lower.includes('marketing strategy'))
            return 'Kreirajte Marketing Plan';
        if (lower.includes('business model'))
            return 'Mapirajte Poslovni Model';
        if (lower.includes('cash flow'))
            return 'Analizirajte Novčani Tok';
        if (lower.includes('pricing'))
            return 'Razvijte Strategiju Cena';
        if (lower.includes('competitor') || lower.includes('competitive'))
            return 'Analizirajte Konkurenciju';
        if (lower.includes('target market') || lower.includes('segmentation'))
            return 'Definišite Ciljno Tržište';
        if (lower.includes('financial plan'))
            return 'Kreirajte Finansijski Plan';
        if (lower.includes('brand'))
            return 'Razvijte Strategiju Brenda';
        return `Primenite ${conceptName}`;
    }
    /**
     * Updates the tenant status from ONBOARDING to ACTIVE.
     */
    async updateTenantStatus(tenantId) {
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { status: true },
        });
        if (!tenant) {
            throw new common_1.NotFoundException({
                type: 'tenant_not_found',
                title: 'Tenant Not Found',
                status: 404,
                detail: 'Cannot update status for non-existent tenant',
            });
        }
        if (tenant.status !== prisma_1.TenantStatus.DRAFT &&
            tenant.status !== prisma_1.TenantStatus.ONBOARDING) {
            this.logger.log({
                message: 'Tenant already active, skipping status update',
                tenantId,
                currentStatus: tenant.status,
            });
            return;
        }
        await this.prisma.tenant.update({
            where: { id: tenantId },
            data: { status: prisma_1.TenantStatus.ACTIVE },
        });
        this.logger.log({
            message: 'Tenant status updated to ACTIVE',
            tenantId,
            previousStatus: tenant.status,
            newStatus: 'ACTIVE',
        });
    }
};
exports.OnboardingService = OnboardingService;
exports.OnboardingService = OnboardingService = OnboardingService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object, typeof (_b = typeof ai_gateway_service_1.AiGatewayService !== "undefined" && ai_gateway_service_1.AiGatewayService) === "function" ? _b : Object, typeof (_c = typeof notes_service_1.NotesService !== "undefined" && notes_service_1.NotesService) === "function" ? _c : Object, typeof (_d = typeof onboarding_metric_service_1.OnboardingMetricService !== "undefined" && onboarding_metric_service_1.OnboardingMetricService) === "function" ? _d : Object, typeof (_e = typeof concept_service_1.ConceptService !== "undefined" && concept_service_1.ConceptService) === "function" ? _e : Object, typeof (_f = typeof concept_matching_service_1.ConceptMatchingService !== "undefined" && concept_matching_service_1.ConceptMatchingService) === "function" ? _f : Object, typeof (_g = typeof conversation_service_1.ConversationService !== "undefined" && conversation_service_1.ConversationService) === "function" ? _g : Object, typeof (_h = typeof web_search_service_1.WebSearchService !== "undefined" && web_search_service_1.WebSearchService) === "function" ? _h : Object, typeof (_j = typeof brain_seeding_service_1.BrainSeedingService !== "undefined" && brain_seeding_service_1.BrainSeedingService) === "function" ? _j : Object])
], OnboardingService);


/***/ }),
/* 158 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var OnboardingMetricService_1;
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OnboardingMetricService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const cuid2_1 = __webpack_require__(32);
/**
 * Service for tracking onboarding metrics, specifically time-to-first-value.
 * Records when users start and complete the onboarding quick win flow.
 */
let OnboardingMetricService = OnboardingMetricService_1 = class OnboardingMetricService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(OnboardingMetricService_1.name);
    }
    /**
     * Records the start of the onboarding process for a user.
     *
     * @param tenantId - The tenant ID
     * @param userId - The user ID
     * @param industry - The selected industry
     * @param quickTaskType - The type of quick task selected
     * @returns The created metric record
     */
    async startOnboarding(tenantId, userId, industry, quickTaskType) {
        const id = `obm_${(0, cuid2_1.createId)()}`;
        this.logger.log({
            message: 'Recording onboarding start',
            tenantId,
            userId,
            industry,
            quickTaskType,
            metricId: id,
        });
        const metric = await this.prisma.onboardingMetric.create({
            data: {
                id,
                tenantId,
                userId,
                startedAt: new Date(),
                industry,
                quickTaskType,
            },
        });
        return this.toResponse(metric);
    }
    /**
     * Marks the onboarding as complete and calculates time-to-first-value.
     *
     * @param userId - The user ID
     * @returns The updated metric record with completion time
     */
    async completeOnboarding(userId) {
        // Find the most recent incomplete onboarding metric for this user
        const metric = await this.prisma.onboardingMetric.findFirst({
            where: {
                userId,
                completedAt: null,
            },
            orderBy: {
                startedAt: 'desc',
            },
        });
        if (!metric) {
            this.logger.warn({
                message: 'No incomplete onboarding metric found for user',
                userId,
            });
            return null;
        }
        const completedAt = new Date();
        const timeToFirstValueMs = completedAt.getTime() - metric.startedAt.getTime();
        this.logger.log({
            message: 'Recording onboarding completion',
            userId,
            metricId: metric.id,
            timeToFirstValueMs,
            timeToFirstValueMinutes: Math.round(timeToFirstValueMs / 60000),
        });
        const updated = await this.prisma.onboardingMetric.update({
            where: { id: metric.id },
            data: {
                completedAt,
                timeToFirstValueMs,
            },
        });
        return this.toResponse(updated);
    }
    /**
     * Gets the onboarding metric for a user.
     *
     * @param userId - The user ID
     * @returns The most recent metric record or null
     */
    async getMetric(userId) {
        const metric = await this.prisma.onboardingMetric.findFirst({
            where: { userId },
            orderBy: { startedAt: 'desc' },
        });
        if (!metric) {
            return null;
        }
        return this.toResponse(metric);
    }
    /**
     * Checks if a user has an incomplete onboarding session.
     *
     * @param userId - The user ID
     * @returns True if there's an incomplete onboarding
     */
    async hasIncompleteOnboarding(userId) {
        const count = await this.prisma.onboardingMetric.count({
            where: {
                userId,
                completedAt: null,
            },
        });
        return count > 0;
    }
    /**
     * Converts a Prisma OnboardingMetric to the API response type.
     */
    toResponse(metric) {
        return {
            id: metric.id,
            tenantId: metric.tenantId,
            userId: metric.userId,
            startedAt: metric.startedAt.toISOString(),
            completedAt: metric.completedAt?.toISOString() ?? null,
            timeToFirstValueMs: metric.timeToFirstValueMs,
            quickTaskType: metric.quickTaskType,
            industry: metric.industry,
        };
    }
};
exports.OnboardingMetricService = OnboardingMetricService;
exports.OnboardingMetricService = OnboardingMetricService = OnboardingMetricService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object])
], OnboardingMetricService);


/***/ }),
/* 159 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QUICK_TASK_TEMPLATES = void 0;
exports.getTasksByIndustry = getTasksByIndustry;
exports.getTaskById = getTaskById;
exports.generateSystemPrompt = generateSystemPrompt;
exports.generateUserPrompt = generateUserPrompt;
const types_1 = __webpack_require__(84);
/**
 * @deprecated Story 3.2 — Quick-task templates are superseded by the
 * Autonomous Business Brain concept seeding (BrainSeedingService).
 * Kept for backward compatibility with legacy onboarding flows.
 * New onboarding uses brain seeding via department-based concept categories.
 */
exports.QUICK_TASK_TEMPLATES = [
    // Finance tasks
    {
        id: 'finance-email',
        name: 'Draft a Financial Summary Email',
        description: 'Create a professional email summarizing financial metrics or updates',
        department: types_1.Department.FINANCE,
        estimatedTimeSaved: 15,
    },
    {
        id: 'finance-report',
        name: 'Create a Budget Report Outline',
        description: 'Generate an outline for a budget or financial report',
        department: types_1.Department.FINANCE,
        estimatedTimeSaved: 20,
    },
    // Marketing tasks
    {
        id: 'marketing-brief',
        name: 'Create a Campaign Brief Outline',
        description: 'Generate a marketing campaign brief with goals and strategy',
        department: types_1.Department.MARKETING,
        estimatedTimeSaved: 15,
    },
    {
        id: 'marketing-social',
        name: 'Draft Social Media Posts',
        description: 'Create engaging social media content for your brand',
        department: types_1.Department.MARKETING,
        estimatedTimeSaved: 10,
    },
    // Technology tasks
    {
        id: 'tech-memo',
        name: 'Write a Technical Decision Memo',
        description: 'Document a technical decision with rationale and trade-offs',
        department: types_1.Department.TECHNOLOGY,
        estimatedTimeSaved: 20,
    },
    {
        id: 'tech-spec',
        name: 'Create a Feature Specification',
        description: 'Generate a specification outline for a new feature',
        department: types_1.Department.TECHNOLOGY,
        estimatedTimeSaved: 25,
    },
    // Operations tasks
    {
        id: 'ops-agenda',
        name: 'Generate a Meeting Agenda',
        description: 'Create a structured agenda for your upcoming meeting',
        department: types_1.Department.OPERATIONS,
        estimatedTimeSaved: 10,
    },
    {
        id: 'ops-process',
        name: 'Draft a Process Document',
        description: 'Outline a standard operating procedure or process',
        department: types_1.Department.OPERATIONS,
        estimatedTimeSaved: 20,
    },
    // Legal tasks
    {
        id: 'legal-checklist',
        name: 'Draft a Contract Review Checklist',
        description: 'Create a checklist for reviewing contract terms',
        department: types_1.Department.LEGAL,
        estimatedTimeSaved: 15,
    },
    {
        id: 'legal-summary',
        name: 'Summarize Legal Requirements',
        description: 'Outline key legal requirements or compliance points',
        department: types_1.Department.LEGAL,
        estimatedTimeSaved: 20,
    },
    // Creative tasks
    {
        id: 'creative-pitch',
        name: 'Create a Project Pitch Outline',
        description: 'Generate a compelling pitch for your creative project',
        department: types_1.Department.CREATIVE,
        estimatedTimeSaved: 15,
    },
    {
        id: 'creative-brief',
        name: 'Draft a Creative Brief',
        description: 'Create a brief outlining project goals and creative direction',
        department: types_1.Department.CREATIVE,
        estimatedTimeSaved: 20,
    },
    // Strategy tasks
    {
        id: 'strategy-framework',
        name: 'Create a Strategic Analysis Framework',
        description: 'Generate a SWOT or competitive analysis framework for your business',
        department: types_1.Department.STRATEGY,
        estimatedTimeSaved: 20,
    },
    {
        id: 'strategy-landscape',
        name: 'Draft a Competitive Landscape Overview',
        description: 'Outline key competitors, market positioning, and strategic opportunities',
        department: types_1.Department.STRATEGY,
        estimatedTimeSaved: 25,
    },
    // Sales tasks
    {
        id: 'sales-pipeline',
        name: 'Build a Sales Pipeline Template',
        description: 'Create a structured sales pipeline with stages and qualification criteria',
        department: types_1.Department.SALES,
        estimatedTimeSaved: 20,
    },
    {
        id: 'sales-proposal',
        name: 'Draft a Client Proposal Outline',
        description: 'Generate a professional proposal outline for a prospective client',
        department: types_1.Department.SALES,
        estimatedTimeSaved: 25,
    },
];
/**
 * Get tasks filtered by department/industry.
 *
 * @param industry - The department/industry to filter by
 * @returns Array of quick tasks for the specified industry
 */
function getTasksByIndustry(industry) {
    return exports.QUICK_TASK_TEMPLATES.filter((task) => task.department.toLowerCase() === industry.toLowerCase());
}
/**
 * Get a specific task by ID.
 *
 * @param taskId - The task ID to find
 * @returns The quick task or undefined if not found
 */
function getTaskById(taskId) {
    return exports.QUICK_TASK_TEMPLATES.find((task) => task.id === taskId);
}
/**
 * Generate the system prompt for a quick task.
 *
 * @param task - The quick task
 * @param industry - The selected industry
 * @returns Optimized system prompt for the AI
 */
function generateSystemPrompt(task, industry) {
    return `You are a professional ${industry.toLowerCase()} assistant with expertise in ${task.department.toLowerCase()}.
Your task is to generate a high-quality, immediately usable ${task.name.toLowerCase()}.
Be concise but comprehensive. Provide professional, actionable content.
Format the output clearly with appropriate sections and bullet points where helpful.
The user is new to this platform and this is their first interaction - make it impressive and valuable.`;
}
/**
 * Generate the user prompt for a quick task.
 *
 * @param task - The quick task
 * @param userContext - User-provided context
 * @returns User prompt for the AI
 */
function generateUserPrompt(task, userContext) {
    return `Task: ${task.name}
Description: ${task.description}

User's context and requirements:
${userContext}

Please generate a professional, ready-to-use output that demonstrates immediate value.`;
}


/***/ }),
/* 160 */
/***/ ((module) => {

module.exports = require("pdf-parse");

/***/ }),
/* 161 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OnboardingCompleteDto = exports.SetDepartmentDto = exports.QuickWinDto = exports.BusinessContextDto = exports.SetupCompanyDto = void 0;
const tslib_1 = __webpack_require__(4);
const class_validator_1 = __webpack_require__(37);
/**
 * DTO for setting up company details during onboarding step 1.
 */
class SetupCompanyDto {
}
exports.SetupCompanyDto = SetupCompanyDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MinLength)(2, { message: 'Company name must be at least 2 characters' }),
    (0, class_validator_1.MaxLength)(100, { message: 'Company name must be 100 characters or less' }),
    tslib_1.__metadata("design:type", String)
], SetupCompanyDto.prototype, "companyName", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MinLength)(2, { message: 'Industry must be at least 2 characters' }),
    (0, class_validator_1.MaxLength)(100, { message: 'Industry must be 100 characters or less' }),
    tslib_1.__metadata("design:type", String)
], SetupCompanyDto.prototype, "industry", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.MaxLength)(3000, { message: 'Description must be 3000 characters or less' }),
    tslib_1.__metadata("design:type", String)
], SetupCompanyDto.prototype, "description", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.MaxLength)(500, { message: 'Website URL must be 500 characters or less' }),
    tslib_1.__metadata("design:type", String)
], SetupCompanyDto.prototype, "websiteUrl", void 0);
/**
 * DTO for business context during onboarding step 3.
 */
class BusinessContextDto {
}
exports.BusinessContextDto = BusinessContextDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(1000, { message: 'Business state must be 1000 characters or less' }),
    tslib_1.__metadata("design:type", String)
], BusinessContextDto.prototype, "businessState", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    tslib_1.__metadata("design:type", Array)
], BusinessContextDto.prototype, "departments", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], BusinessContextDto.prototype, "strategy", void 0);
/**
 * DTO for executing a quick win task during onboarding.
 */
class QuickWinDto {
}
exports.QuickWinDto = QuickWinDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], QuickWinDto.prototype, "taskId", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(280, { message: 'Context must be 280 characters or less' }),
    tslib_1.__metadata("design:type", String)
], QuickWinDto.prototype, "userContext", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], QuickWinDto.prototype, "industry", void 0);
/**
 * DTO for setting the user's department/role during onboarding (Story 3.2).
 */
class SetDepartmentDto {
}
exports.SetDepartmentDto = SetDepartmentDto;
tslib_1.__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)([
        'MARKETING',
        'FINANCE',
        'SALES',
        'OPERATIONS',
        'TECHNOLOGY',
        'STRATEGY',
        'LEGAL',
        'CREATIVE',
        null,
    ], { message: 'department must be a valid Department enum value or null' }),
    tslib_1.__metadata("design:type", Object)
], SetDepartmentDto.prototype, "department", void 0);
/**
 * DTO for completing onboarding and saving the first note.
 */
class OnboardingCompleteDto {
}
exports.OnboardingCompleteDto = OnboardingCompleteDto;
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], OnboardingCompleteDto.prototype, "taskId", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    tslib_1.__metadata("design:type", String)
], OnboardingCompleteDto.prototype, "generatedOutput", void 0);
tslib_1.__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    tslib_1.__metadata("design:type", String)
], OnboardingCompleteDto.prototype, "executionMode", void 0);


/***/ }),
/* 162 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PersonasModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const auth_module_1 = __webpack_require__(40);
const personas_service_1 = __webpack_require__(163);
const personas_controller_1 = __webpack_require__(164);
/**
 * Module for department persona management.
 * Provides persona definitions and API endpoints for persona selection.
 */
let PersonasModule = class PersonasModule {
};
exports.PersonasModule = PersonasModule;
exports.PersonasModule = PersonasModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule], // Provides AuthService for MfaRequiredGuard
        controllers: [personas_controller_1.PersonasController],
        providers: [personas_service_1.PersonasService],
        exports: [personas_service_1.PersonasService],
    })
], PersonasModule);


/***/ }),
/* 163 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var PersonasService_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PersonasService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const types_1 = __webpack_require__(84);
/**
 * Static persona definitions with prs_ prefix IDs.
 * These are predefined personas representing C-suite and department leads.
 * Colors and names are sourced from shared constants for consistency.
 */
const PERSONAS = {
    CFO: {
        id: 'prs_cfo001',
        type: types_1.PersonaType.CFO,
        name: 'Chief Financial Officer',
        shortName: types_1.PERSONA_NAMES[types_1.PersonaType.CFO],
        description: 'Financial strategy, budgeting, forecasting, ROI analysis, and fiscal responsibility',
        avatarUrl: '/assets/images/personas/cfo-avatar.svg',
        color: types_1.PERSONA_COLORS[types_1.PersonaType.CFO],
    },
    CMO: {
        id: 'prs_cmo002',
        type: types_1.PersonaType.CMO,
        name: 'Chief Marketing Officer',
        shortName: types_1.PERSONA_NAMES[types_1.PersonaType.CMO],
        description: 'Brand strategy, marketing campaigns, growth initiatives, and customer acquisition',
        avatarUrl: '/assets/images/personas/cmo-avatar.svg',
        color: types_1.PERSONA_COLORS[types_1.PersonaType.CMO],
    },
    CTO: {
        id: 'prs_cto003',
        type: types_1.PersonaType.CTO,
        name: 'Chief Technology Officer',
        shortName: types_1.PERSONA_NAMES[types_1.PersonaType.CTO],
        description: 'Technical architecture, software development, infrastructure, and technology strategy',
        avatarUrl: '/assets/images/personas/cto-avatar.svg',
        color: types_1.PERSONA_COLORS[types_1.PersonaType.CTO],
    },
    OPERATIONS: {
        id: 'prs_ops004',
        type: types_1.PersonaType.OPERATIONS,
        name: 'Chief Operations Officer',
        shortName: types_1.PERSONA_NAMES[types_1.PersonaType.OPERATIONS],
        description: 'Process optimization, operational efficiency, supply chain, and resource management',
        avatarUrl: '/assets/images/personas/operations-avatar.svg',
        color: types_1.PERSONA_COLORS[types_1.PersonaType.OPERATIONS],
    },
    LEGAL: {
        id: 'prs_leg005',
        type: types_1.PersonaType.LEGAL,
        name: 'General Counsel',
        shortName: types_1.PERSONA_NAMES[types_1.PersonaType.LEGAL],
        description: 'Compliance, contracts, risk management, intellectual property, and regulatory affairs',
        avatarUrl: '/assets/images/personas/legal-avatar.svg',
        color: types_1.PERSONA_COLORS[types_1.PersonaType.LEGAL],
    },
    CREATIVE: {
        id: 'prs_cre006',
        type: types_1.PersonaType.CREATIVE,
        name: 'Chief Creative Officer',
        shortName: types_1.PERSONA_NAMES[types_1.PersonaType.CREATIVE],
        description: 'Design thinking, brand identity, creative strategy, and innovation',
        avatarUrl: '/assets/images/personas/creative-avatar.svg',
        color: types_1.PERSONA_COLORS[types_1.PersonaType.CREATIVE],
    },
    CSO: {
        id: 'prs_cso007',
        type: types_1.PersonaType.CSO,
        name: 'Chief Strategy Officer',
        shortName: types_1.PERSONA_NAMES[types_1.PersonaType.CSO],
        description: 'Business strategy, competitive analysis, market positioning, and strategic planning',
        avatarUrl: '/assets/images/personas/cso-avatar.svg',
        color: types_1.PERSONA_COLORS[types_1.PersonaType.CSO],
    },
    SALES: {
        id: 'prs_sal008',
        type: types_1.PersonaType.SALES,
        name: 'VP of Sales',
        shortName: types_1.PERSONA_NAMES[types_1.PersonaType.SALES],
        description: 'Sales strategy, pipeline management, client relationships, and revenue growth',
        avatarUrl: '/assets/images/personas/sales-avatar.svg',
        color: types_1.PERSONA_COLORS[types_1.PersonaType.SALES],
    },
};
/**
 * Service for managing department personas.
 * Provides static persona definitions for AI conversation context.
 */
let PersonasService = PersonasService_1 = class PersonasService {
    constructor() {
        this.logger = new common_1.Logger(PersonasService_1.name);
    }
    /**
     * Retrieves all available personas.
     * @returns Array of all persona definitions
     */
    getPersonas() {
        this.logger.log({ message: 'Retrieving all personas' });
        return Object.values(PERSONAS);
    }
    /**
     * Retrieves a specific persona by type.
     * @param type - PersonaType enum value
     * @returns Persona definition
     * @throws NotFoundException if persona type is invalid
     */
    getPersonaByType(type) {
        const persona = PERSONAS[type];
        if (!persona) {
            this.logger.warn({ message: 'Persona not found', type });
            throw new common_1.NotFoundException({
                type: 'persona_not_found',
                title: 'Persona Not Found',
                status: 404,
                detail: `Persona with type '${type}' not found. Valid types: ${Object.keys(PERSONAS).join(', ')}`,
            });
        }
        this.logger.log({ message: 'Persona retrieved', type, personaId: persona.id });
        return persona;
    }
    /**
     * Validates if a persona type is valid.
     * @param type - PersonaType string to validate
     * @returns Boolean indicating validity
     */
    isValidPersonaType(type) {
        return type in PERSONAS;
    }
};
exports.PersonasService = PersonasService;
exports.PersonasService = PersonasService = PersonasService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)()
], PersonasService);


/***/ }),
/* 164 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PersonasController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const jwt_auth_guard_1 = __webpack_require__(45);
const mfa_required_guard_1 = __webpack_require__(58);
const personas_service_1 = __webpack_require__(163);
/**
 * Controller for persona-related API endpoints.
 * All endpoints require authentication and MFA verification.
 */
let PersonasController = class PersonasController {
    constructor(personasService) {
        this.personasService = personasService;
    }
    /**
     * GET /api/v1/personas
     * Retrieves all available department personas.
     * @returns Array of all persona definitions
     */
    getPersonas() {
        const personas = this.personasService.getPersonas();
        return { data: personas };
    }
    /**
     * GET /api/v1/personas/:type
     * Retrieves a specific persona by type.
     * @param type - Persona type (CFO, CMO, CTO, OPERATIONS, LEGAL, CREATIVE)
     * @returns Single persona definition
     * @throws NotFoundException if type is invalid
     */
    getPersonaByType(type) {
        const persona = this.personasService.getPersonaByType(type.toUpperCase());
        return { data: persona };
    }
};
exports.PersonasController = PersonasController;
tslib_1.__decorate([
    (0, common_1.Get)(),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", Object)
], PersonasController.prototype, "getPersonas", null);
tslib_1.__decorate([
    (0, common_1.Get)(':type'),
    tslib_1.__param(0, (0, common_1.Param)('type')),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [String]),
    tslib_1.__metadata("design:returntype", Object)
], PersonasController.prototype, "getPersonaByType", null);
exports.PersonasController = PersonasController = tslib_1.__decorate([
    (0, common_1.Controller)('v1/personas'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, mfa_required_guard_1.MfaRequiredGuard),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof personas_service_1.PersonasService !== "undefined" && personas_service_1.PersonasService) === "function" ? _a : Object])
], PersonasController);


/***/ }),
/* 165 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.QdrantModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const config_1 = __webpack_require__(5);
const qdrant_client_service_1 = __webpack_require__(111);
/**
 * Global module for Qdrant vector database client.
 * Marked @Global so all modules can inject QdrantClientService
 * without explicit imports.
 */
let QdrantModule = class QdrantModule {
};
exports.QdrantModule = QdrantModule;
exports.QdrantModule = QdrantModule = tslib_1.__decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [config_1.ConfigModule],
        providers: [qdrant_client_service_1.QdrantClientService],
        exports: [qdrant_client_service_1.QdrantClientService],
    })
], QdrantModule);


/***/ }),
/* 166 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AdminModule = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const data_integrity_controller_1 = __webpack_require__(167);
const data_integrity_service_1 = __webpack_require__(168);
let AdminModule = class AdminModule {
};
exports.AdminModule = AdminModule;
exports.AdminModule = AdminModule = tslib_1.__decorate([
    (0, common_1.Module)({
        imports: [tenant_context_1.TenantModule],
        controllers: [data_integrity_controller_1.DataIntegrityController],
        providers: [data_integrity_service_1.DataIntegrityService],
    })
], AdminModule);


/***/ }),
/* 167 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DataIntegrityController = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const data_integrity_service_1 = __webpack_require__(168);
let DataIntegrityController = class DataIntegrityController {
    constructor(integrityService) {
        this.integrityService = integrityService;
    }
    async checkIntegrity() {
        return this.integrityService.runFullCheck();
    }
};
exports.DataIntegrityController = DataIntegrityController;
tslib_1.__decorate([
    (0, common_1.Get)('data-integrity'),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", []),
    tslib_1.__metadata("design:returntype", typeof (_b = typeof Promise !== "undefined" && Promise) === "function" ? _b : Object)
], DataIntegrityController.prototype, "checkIntegrity", null);
exports.DataIntegrityController = DataIntegrityController = tslib_1.__decorate([
    (0, common_1.Controller)('v1/admin'),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof data_integrity_service_1.DataIntegrityService !== "undefined" && data_integrity_service_1.DataIntegrityService) === "function" ? _a : Object])
], DataIntegrityController);


/***/ }),
/* 168 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var DataIntegrityService_1;
var _a, _b;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DataIntegrityService = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
const tenant_context_1 = __webpack_require__(9);
const qdrant_client_service_1 = __webpack_require__(111);
let DataIntegrityService = DataIntegrityService_1 = class DataIntegrityService {
    constructor(prisma, qdrantClient) {
        this.prisma = prisma;
        this.qdrantClient = qdrantClient;
        this.logger = new common_1.Logger(DataIntegrityService_1.name);
        this.COLLECTION_NAME = 'concepts';
    }
    async runFullCheck() {
        const issues = [];
        // 1. Concept stats from PostgreSQL
        const concepts = await this.prisma.concept.findMany({
            select: { id: true, embeddingId: true, curriculumId: true, slug: true },
        });
        const total = concepts.length;
        const withEmbeddingId = concepts.filter((c) => c.embeddingId).length;
        const withCurriculumId = concepts.filter((c) => c.curriculumId).length;
        if (total === 0) {
            issues.push('No concepts found in database — run seed script');
        }
        if (withEmbeddingId === 0 && total > 0) {
            issues.push('No concepts have embeddings — run embedding script');
        }
        // 2. Qdrant stats
        let qdrantAvailable = false;
        let pointCount = null;
        let collectionExists = false;
        if (this.qdrantClient.isAvailable()) {
            qdrantAvailable = true;
            try {
                const client = this.qdrantClient.getClient();
                const collections = await client.getCollections();
                collectionExists = collections.collections.some((c) => c.name === this.COLLECTION_NAME);
                if (collectionExists) {
                    const info = await client.getCollection(this.COLLECTION_NAME);
                    pointCount = info.points_count ?? null;
                }
                else {
                    issues.push(`Qdrant collection '${this.COLLECTION_NAME}' does not exist`);
                }
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown';
                issues.push(`Qdrant query failed: ${msg}`);
                qdrantAvailable = false;
            }
        }
        else {
            issues.push('Qdrant not configured (QDRANT_URL missing)');
        }
        // 3. Sync check
        let syncStatus = 'unavailable';
        let mismatchCount = 0;
        if (qdrantAvailable && pointCount !== null) {
            mismatchCount = Math.abs(withEmbeddingId - pointCount);
            if (mismatchCount === 0 && withEmbeddingId === pointCount) {
                syncStatus = 'synced';
            }
            else {
                syncStatus = 'drift';
                issues.push(`DB has ${withEmbeddingId} concepts with embeddingId but Qdrant has ${pointCount} points (diff: ${mismatchCount})`);
            }
        }
        // Check for duplicate slugs
        const slugs = concepts.map((c) => c.slug);
        const dupSlugs = slugs.filter((s, i) => slugs.indexOf(s) !== i);
        if (dupSlugs.length > 0) {
            issues.push(`Duplicate slugs found: ${dupSlugs.join(', ')}`);
        }
        // Check for duplicate curriculumIds
        const currIds = concepts.filter((c) => c.curriculumId).map((c) => c.curriculumId);
        const dupCurrIds = currIds.filter((id, i) => currIds.indexOf(id) !== i);
        if (dupCurrIds.length > 0) {
            issues.push(`Duplicate curriculumIds: ${dupCurrIds.join(', ')}`);
        }
        const report = {
            timestamp: new Date().toISOString(),
            concepts: {
                total,
                withEmbeddingId,
                withoutEmbeddingId: total - withEmbeddingId,
                withCurriculumId,
                withoutCurriculumId: total - withCurriculumId,
            },
            qdrant: {
                available: qdrantAvailable,
                pointCount,
                collectionExists,
            },
            sync: {
                status: syncStatus,
                mismatchCount,
            },
            issues,
        };
        this.logger.log({
            message: 'Data integrity check completed',
            syncStatus,
            issueCount: issues.length,
        });
        return report;
    }
};
exports.DataIntegrityService = DataIntegrityService;
exports.DataIntegrityService = DataIntegrityService = DataIntegrityService_1 = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [typeof (_a = typeof tenant_context_1.PlatformPrismaService !== "undefined" && tenant_context_1.PlatformPrismaService) === "function" ? _a : Object, typeof (_b = typeof qdrant_client_service_1.QdrantClientService !== "undefined" && qdrant_client_service_1.QdrantClientService) === "function" ? _b : Object])
], DataIntegrityService);


/***/ }),
/* 169 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


var AllExceptionsFilter_1;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AllExceptionsFilter = void 0;
const tslib_1 = __webpack_require__(4);
const common_1 = __webpack_require__(1);
let AllExceptionsFilter = AllExceptionsFilter_1 = class AllExceptionsFilter {
    constructor() {
        this.logger = new common_1.Logger(AllExceptionsFilter_1.name);
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        const correlationId = request.headers['x-correlation-id'];
        const problem = this.buildProblemDetails(exception, request, correlationId);
        this.logException(exception, problem);
        response
            .status(problem.status)
            .header('Content-Type', 'application/problem+json')
            .json(problem);
    }
    buildProblemDetails(exception, request, correlationId) {
        if (exception instanceof common_1.HttpException) {
            return this.fromHttpException(exception, request, correlationId);
        }
        return this.fromUnknown(exception, request, correlationId);
    }
    fromHttpException(exception, request, correlationId) {
        const status = exception.getStatus();
        const exceptionResponse = exception.getResponse();
        // If the controller already threw RFC 7807 shape, preserve it
        if (this.isRfc7807(exceptionResponse)) {
            return {
                type: exceptionResponse.type,
                title: exceptionResponse.title,
                status,
                detail: exceptionResponse.detail,
                instance: request.url,
                ...(correlationId && { correlationId }),
                ...(exceptionResponse.errors && { errors: exceptionResponse.errors }),
            };
        }
        // NestJS ValidationPipe errors come as { statusCode, message: string[], error }
        if (this.isValidationError(exceptionResponse)) {
            return {
                type: 'validation_error',
                title: 'Validation Failed',
                status,
                detail: 'One or more fields failed validation',
                instance: request.url,
                ...(correlationId && { correlationId }),
                errors: exceptionResponse.message.map((msg) => ({
                    field: this.extractFieldFromMessage(msg),
                    message: msg,
                })),
            };
        }
        // Standard NestJS exception (string or { message, error, statusCode })
        const detail = typeof exceptionResponse === 'string'
            ? exceptionResponse
            : exceptionResponse.message?.toString() ||
                exception.message;
        return {
            type: this.statusToType(status),
            title: this.statusToTitle(status),
            status,
            detail,
            instance: request.url,
            ...(correlationId && { correlationId }),
        };
    }
    fromUnknown(exception, request, correlationId) {
        const detail = exception instanceof Error ? exception.message : 'An unexpected error occurred';
        return {
            type: 'internal_error',
            title: 'Internal Server Error',
            status: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
            detail,
            instance: request.url,
            ...(correlationId && { correlationId }),
        };
    }
    isRfc7807(response) {
        if (typeof response !== 'object' || response === null)
            return false;
        const obj = response;
        return (typeof obj.type === 'string' &&
            typeof obj.title === 'string' &&
            typeof obj.detail === 'string');
    }
    isValidationError(response) {
        if (typeof response !== 'object' || response === null)
            return false;
        const obj = response;
        return Array.isArray(obj.message) && typeof obj.statusCode === 'number';
    }
    extractFieldFromMessage(message) {
        // NestJS validation messages typically start with the property name
        const match = message.match(/^(\w+)\s/);
        return match?.[1] ?? 'unknown';
    }
    logException(exception, problem) {
        const logContext = {
            type: problem.type,
            status: problem.status,
            instance: problem.instance,
            correlationId: problem.correlationId,
        };
        if (problem.status >= 500) {
            this.logger.error(`[${problem.correlationId || 'no-correlation'}] ${problem.detail}`, exception instanceof Error ? exception.stack : undefined, logContext);
        }
        else if (problem.status >= 400) {
            this.logger.warn(`[${problem.correlationId || 'no-correlation'}] ${problem.type}: ${problem.detail}`);
        }
    }
    statusToType(status) {
        const map = {
            400: 'bad_request',
            401: 'unauthorized',
            403: 'forbidden',
            404: 'not_found',
            409: 'conflict',
            422: 'unprocessable_entity',
            429: 'too_many_requests',
            500: 'internal_error',
            502: 'bad_gateway',
            503: 'service_unavailable',
        };
        return map[status] || `http_error_${status}`;
    }
    statusToTitle(status) {
        const map = {
            400: 'Bad Request',
            401: 'Unauthorized',
            403: 'Forbidden',
            404: 'Not Found',
            409: 'Conflict',
            422: 'Unprocessable Entity',
            429: 'Too Many Requests',
            500: 'Internal Server Error',
            502: 'Bad Gateway',
            503: 'Service Unavailable',
        };
        return map[status] || `HTTP Error ${status}`;
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = AllExceptionsFilter_1 = tslib_1.__decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);


/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
var exports = __webpack_exports__;

/**
 * Mentor AI API Server
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
const common_1 = __webpack_require__(1);
const core_1 = __webpack_require__(2);
const app_module_1 = __webpack_require__(3);
const all_exceptions_filter_1 = __webpack_require__(169);
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const globalPrefix = 'api';
    app.setGlobalPrefix(globalPrefix);
    // CORS: use CORS_ORIGIN env var in production, localhost in dev
    const corsOrigin = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',')
        : ['http://localhost:4200', 'http://127.0.0.1:4200'];
    app.enableCors({
        origin: corsOrigin,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Tenant-Id', 'X-Correlation-Id'],
        credentials: true,
    });
    // Global exception filter — RFC 7807 ProblemDetails for all errors
    app.useGlobalFilters(new all_exceptions_filter_1.AllExceptionsFilter());
    // Enable validation with class-validator
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    const port = process.env.PORT || 3000;
    await app.listen(port);
    common_1.Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`);
    if (process.env.DEV_MODE === 'true') {
        common_1.Logger.warn('⚠️  DEV MODE ENABLED - Authentication bypassed for development');
    }
}
bootstrap();

})();

/******/ })()
;
//# sourceMappingURL=main.js.map