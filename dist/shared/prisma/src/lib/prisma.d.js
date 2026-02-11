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
    Prisma: function() {
        return _client.Prisma;
    },
    PrismaClient: function() {
        return _client.PrismaClient;
    },
    TenantStatus: function() {
        return _client.TenantStatus;
    },
    UserRole: function() {
        return _client.UserRole;
    }
});
const _client = require("@prisma/client");

//# sourceMappingURL=prisma.d.js.map