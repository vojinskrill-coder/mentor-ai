/**
 * Shared utility functions for Mentor AI
 * These utilities are used across both frontend (Angular) and backend (NestJS)
 */ /** Generate a unique ID */ "use strict";
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
    delay: function() {
        return delay;
    },
    generateId: function() {
        return generateId;
    },
    isDefined: function() {
        return isDefined;
    },
    safeJsonParse: function() {
        return safeJsonParse;
    },
    truncate: function() {
        return truncate;
    }
});
function generateId() {
    return crypto.randomUUID();
}
function isDefined(value) {
    return value !== null && value !== undefined;
}
function safeJsonParse(json, fallback) {
    try {
        return JSON.parse(json);
    } catch (e) {
        return fallback;
    }
}
function delay(ms) {
    return new Promise((resolve)=>setTimeout(resolve, ms));
}
function truncate(str, maxLength) {
    if (str.length <= maxLength) {
        return str;
    }
    return str.slice(0, maxLength - 3) + '...';
}

//# sourceMappingURL=utils.js.map