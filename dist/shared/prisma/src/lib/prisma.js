// Re-export Prisma client and types from @prisma/client
// This provides a clean import path: @mentor-ai/shared/prisma
// The Prisma client is generated from apps/api/prisma/schema.prisma
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
    Department: function() {
        return _client.Department;
    },
    InvitationStatus: function() {
        return _client.InvitationStatus;
    },
    NoteSource: function() {
        return _client.NoteSource;
    },
    NoteStatus: function() {
        return _client.NoteStatus;
    },
    NoteType: function() {
        return _client.NoteType;
    },
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

//# sourceMappingURL=prisma.js.map