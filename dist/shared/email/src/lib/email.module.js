"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "EmailModule", {
    enumerable: true,
    get: function() {
        return EmailModule;
    }
});
const _ts_decorate = require("@swc/helpers/_/_ts_decorate");
const _common = require("@nestjs/common");
const _config = require("@nestjs/config");
const _emailservice = require("./email.service");
let EmailModule = class EmailModule {
};
EmailModule = _ts_decorate._([
    (0, _common.Module)({
        imports: [
            _config.ConfigModule
        ],
        providers: [
            _emailservice.EmailService
        ],
        exports: [
            _emailservice.EmailService
        ]
    })
], EmailModule);

//# sourceMappingURL=email.module.js.map