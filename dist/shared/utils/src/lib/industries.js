/**
 * Industry options for tenant registration
 * These values are used in the registration form dropdown
 * and validated on the backend
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
    INDUSTRIES: function() {
        return INDUSTRIES;
    },
    isValidIndustry: function() {
        return isValidIndustry;
    }
});
const INDUSTRIES = [
    'Technology',
    'Healthcare',
    'Finance',
    'Retail',
    'Manufacturing',
    'Education',
    'Real Estate',
    'Legal',
    'Marketing',
    'Consulting',
    'Other'
];
function isValidIndustry(value) {
    return INDUSTRIES.includes(value);
}

//# sourceMappingURL=industries.js.map