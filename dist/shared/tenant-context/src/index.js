// Tenant Context Library
// Provides multi-tenant database routing and context management
// Services
"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    PlatformPrismaService: function() {
        return _platformprismaservice.PlatformPrismaService;
    },
    TENANT_ID_HEADER: function() {
        return _tenantmiddleware.TENANT_ID_HEADER;
    },
    TENANT_ID_KEY: function() {
        return _tenantmiddleware.TENANT_ID_KEY;
    },
    TenantId: function() {
        return _tenantiddecorator.TenantId;
    },
    TenantMiddleware: function() {
        return _tenantmiddleware.TenantMiddleware;
    },
    TenantModule: function() {
        return _tenantmodule.TenantModule;
    },
    TenantPrismaService: function() {
        return _tenantprismaservice.TenantPrismaService;
    }
});
const _tenantprismaservice = require("./lib/tenant-prisma.service");
const _platformprismaservice = require("./lib/platform-prisma.service");
const _tenantmiddleware = require("./lib/tenant.middleware");
const _tenantiddecorator = require("./lib/tenant-id.decorator");
const _tenantmodule = require("./lib/tenant.module");

//# sourceMappingURL=index.js.map