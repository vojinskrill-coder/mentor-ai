"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "PlatformPrismaService", {
    enumerable: true,
    get: function() {
        return PlatformPrismaService;
    }
});
const _ts_decorate = require("@swc/helpers/_/_ts_decorate");
const _ts_metadata = require("@swc/helpers/_/_ts_metadata");
const _common = require("@nestjs/common");
const _config = require("@nestjs/config");
const _client = require("@prisma/client");
const DB_RETRY_INTERVAL_MS = 10000; // 10 seconds
const DB_RETRY_MAX_MS = 120000; // 2 minutes
const RETRYABLE_ERRORS = [
    'Can\'t reach database server',
    'Connection refused',
    'Connection timed out',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'connection is not allowed',
    'too many connections',
    'server closed the connection unexpectedly'
];
let PlatformPrismaService = class PlatformPrismaService extends _client.PrismaClient {
    async onModuleInit() {
        await this.$connect();
        // Add retry middleware for all Prisma operations
        this.$use(async (params, next)=>{
            const start = Date.now();
            let attempt = 0;
            while(true){
                try {
                    return await next(params);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    const isRetryable = RETRYABLE_ERRORS.some((e)=>msg.includes(e));
                    const elapsed = Date.now() - start;
                    if (!isRetryable || elapsed >= DB_RETRY_MAX_MS) {
                        throw err; // Non-retryable or timeout exceeded
                    }
                    attempt++;
                    this.logger.warn({
                        message: `DB connection failed, retry ${attempt} in ${DB_RETRY_INTERVAL_MS / 1000}s`,
                        model: params.model,
                        action: params.action,
                        error: msg.substring(0, 100),
                        elapsedMs: elapsed
                    });
                    // Reconnect and wait
                    try {
                        await this.$disconnect();
                    } catch (e) {}
                    await new Promise((r)=>setTimeout(r, DB_RETRY_INTERVAL_MS));
                    try {
                        await this.$connect();
                    } catch (e) {}
                }
            }
        });
    }
    async onModuleDestroy() {
        await this.$disconnect();
    }
    constructor(configService){
        const databaseUrl = configService.get('DATABASE_URL');
        if (!databaseUrl) {
            throw new Error('DATABASE_URL environment variable is required but not set. ' + 'Please configure DATABASE_URL in your .env file. ' + 'Example: DATABASE_URL=postgresql://user:password@localhost:5432/mentor_ai_platform');
        }
        super({
            datasources: {
                db: {
                    url: databaseUrl
                }
            }
        });
        this.logger = new _common.Logger(PlatformPrismaService.name);
    }
};
PlatformPrismaService = _ts_decorate._([
    (0, _common.Injectable)(),
    _ts_metadata._("design:type", Function),
    _ts_metadata._("design:paramtypes", [
        typeof _config.ConfigService === "undefined" ? Object : _config.ConfigService
    ])
], PlatformPrismaService);

//# sourceMappingURL=platform-prisma.service.js.map