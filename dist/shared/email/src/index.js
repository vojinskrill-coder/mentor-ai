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
    EmailModule: function() {
        return _emailmodule.EmailModule;
    },
    EmailService: function() {
        return _emailservice.EmailService;
    },
    getInvitationEmailHtml: function() {
        return _invitationtemplate.getInvitationEmailHtml;
    },
    getInvitationEmailText: function() {
        return _invitationtemplate.getInvitationEmailText;
    }
});
const _emailservice = require("./lib/email.service");
const _emailmodule = require("./lib/email.module");
const _invitationtemplate = require("./lib/templates/invitation.template");

//# sourceMappingURL=index.js.map