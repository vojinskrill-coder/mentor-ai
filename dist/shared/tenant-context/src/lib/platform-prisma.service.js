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
let PlatformPrismaService = class PlatformPrismaService extends _client.PrismaClient {
    async onModuleInit() {
        await this.$connect();
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