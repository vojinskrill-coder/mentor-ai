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
    TENANT_ID_HEADER: function() {
        return TENANT_ID_HEADER;
    },
    TENANT_ID_KEY: function() {
        return TENANT_ID_KEY;
    },
    TenantMiddleware: function() {
        return TenantMiddleware;
    }
});
const _extends = require("@swc/helpers/_/_extends");
const _ts_decorate = require("@swc/helpers/_/_ts_decorate");
const _ts_metadata = require("@swc/helpers/_/_ts_metadata");
const _common = require("@nestjs/common");
const _config = require("@nestjs/config");
const _platformprismaservice = require("./platform-prisma.service");
const _client = require("@prisma/client");
const TENANT_ID_HEADER = 'x-tenant-id';
const TENANT_ID_KEY = 'tenantId';
let TenantMiddleware = class TenantMiddleware {
    async use(req, res, next) {
        // Skip tenant validation for excluded paths
        if (this.isExcludedPath(req.path)) {
            return next();
        }
        // Dev mode: try to extract tenantId from JWT if a real token is present,
        // otherwise fall back to dev-tenant-001
        if (this.configService.get('DEV_MODE') === 'true') {
            var _req_headers;
            const authHeader = (_req_headers = req.headers) == null ? void 0 : _req_headers.authorization;
            if ((authHeader == null ? void 0 : authHeader.startsWith('Bearer ')) && !authHeader.includes('dev-mode-token')) {
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
                } catch (e) {
                // Token decode failed - use dev fallback
                }
            }
            req.tenantId = 'dev-tenant-001';
            return next();
        }
        const tenantId = req.headers[TENANT_ID_HEADER];
        const correlationId = req.headers['x-correlation-id'];
        // Validate tenant ID is present
        if (!tenantId) {
            throw new _common.ForbiddenException(this.createRfc7807Error('tenant_id_missing', 'Tenant ID Required', 'X-Tenant-Id header is required for this request', correlationId));
        }
        // Validate tenant ID format (must have tnt_ prefix)
        if (!tenantId.startsWith('tnt_')) {
            throw new _common.ForbiddenException(this.createRfc7807Error('invalid_tenant_id_format', 'Invalid Tenant ID Format', 'Tenant ID must start with "tnt_" prefix', correlationId));
        }
        // Validate tenant exists and is active
        const tenant = await this.platformPrisma.tenantRegistry.findUnique({
            where: {
                id: tenantId
            }
        });
        if (!tenant) {
            throw new _common.ForbiddenException(this.createRfc7807Error('tenant_not_found', 'Tenant Not Found', 'No tenant found for provided X-Tenant-Id header', correlationId));
        }
        if (tenant.status !== _client.TenantStatus.ACTIVE) {
            throw new _common.ForbiddenException(this.createRfc7807Error('tenant_not_active', 'Tenant Not Active', `Tenant is currently ${tenant.status.toLowerCase()}`, correlationId));
        }
        // Attach tenant ID to request for downstream use
        req.tenantId = tenantId;
        next();
    }
    isExcludedPath(path) {
        return this.excludedPaths.some((excluded)=>path === excluded || path.startsWith(`${excluded}/`));
    }
    createRfc7807Error(type, title, detail, correlationId) {
        return _extends._({
            type,
            title,
            status: 403,
            detail
        }, correlationId && {
            correlationId
        });
    }
    constructor(platformPrisma, configService){
        this.platformPrisma = platformPrisma;
        this.configService = configService;
        this.excludedPaths = [
            '/health',
            '/api/health',
            '/api/v1/health'
        ];
    }
};
TenantMiddleware = _ts_decorate._([
    (0, _common.Injectable)(),
    _ts_metadata._("design:type", Function),
    _ts_metadata._("design:paramtypes", [
        typeof _platformprismaservice.PlatformPrismaService === "undefined" ? Object : _platformprismaservice.PlatformPrismaService,
        typeof _config.ConfigService === "undefined" ? Object : _config.ConfigService
    ])
], TenantMiddleware);

//# sourceMappingURL=tenant.middleware.js.map