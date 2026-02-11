"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "TenantId", {
    enumerable: true,
    get: function() {
        return TenantId;
    }
});
const _common = require("@nestjs/common");
const TenantId = (0, _common.createParamDecorator)((data, ctx)=>{
    const request = ctx.switchToHttp().getRequest();
    const tenantId = request.tenantId;
    if (!tenantId) {
        throw new _common.ForbiddenException({
            type: 'tenant_context_missing',
            title: 'Tenant Context Missing',
            status: 403,
            detail: 'Tenant context not available. Ensure TenantMiddleware is configured.'
        });
    }
    return tenantId;
});

//# sourceMappingURL=tenant-id.decorator.js.map