"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "TenantModule", {
    enumerable: true,
    get: function() {
        return TenantModule;
    }
});
const _ts_decorate = require("@swc/helpers/_/_ts_decorate");
const _common = require("@nestjs/common");
const _config = require("@nestjs/config");
const _tenantprismaservice = require("./tenant-prisma.service");
const _platformprismaservice = require("./platform-prisma.service");
const _tenantmiddleware = require("./tenant.middleware");
let TenantModule = class TenantModule {
    configure(consumer) {
        consumer.apply(_tenantmiddleware.TenantMiddleware).forRoutes('*');
    }
};
TenantModule = _ts_decorate._([
    (0, _common.Module)({
        imports: [
            _config.ConfigModule
        ],
        providers: [
            _tenantprismaservice.TenantPrismaService,
            _platformprismaservice.PlatformPrismaService,
            _tenantmiddleware.TenantMiddleware
        ],
        exports: [
            _tenantprismaservice.TenantPrismaService,
            _platformprismaservice.PlatformPrismaService
        ]
    })
], TenantModule);

//# sourceMappingURL=tenant.module.js.map