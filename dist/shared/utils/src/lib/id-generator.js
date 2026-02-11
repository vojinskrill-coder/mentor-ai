/**
 * Entity ID generators with prefixes
 * Uses cuid2 for collision-resistant, URL-safe IDs
 * Prefixes identify entity types: usr_ (user), tnt_ (tenant)
 */ "use strict";
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
    ID_PREFIX: function() {
        return ID_PREFIX;
    },
    generateInvitationId: function() {
        return generateInvitationId;
    },
    generateInviteToken: function() {
        return generateInviteToken;
    },
    generateTenantId: function() {
        return generateTenantId;
    },
    generateUserId: function() {
        return generateUserId;
    },
    hasValidPrefix: function() {
        return hasValidPrefix;
    },
    stripPrefix: function() {
        return stripPrefix;
    }
});
const _cuid2 = require("@paralleldrive/cuid2");
const ID_PREFIX = {
    USER: 'usr_',
    TENANT: 'tnt_',
    INVITATION: 'inv_'
};
function generateUserId() {
    return `${ID_PREFIX.USER}${(0, _cuid2.createId)()}`;
}
function generateTenantId() {
    return `${ID_PREFIX.TENANT}${(0, _cuid2.createId)()}`;
}
function generateInvitationId() {
    return `${ID_PREFIX.INVITATION}${(0, _cuid2.createId)()}`;
}
function generateInviteToken() {
    return (0, _cuid2.createId)();
}
function hasValidPrefix(id, prefix) {
    return id.startsWith(prefix);
}
function stripPrefix(id) {
    const prefixMatch = Object.values(ID_PREFIX).find((p)=>id.startsWith(p));
    return prefixMatch ? id.slice(prefixMatch.length) : id;
}

//# sourceMappingURL=id-generator.js.map