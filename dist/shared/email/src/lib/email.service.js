"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "EmailService", {
    enumerable: true,
    get: function() {
        return EmailService;
    }
});
const _interop_require_wildcard = require("@swc/helpers/_/_interop_require_wildcard");
const _ts_decorate = require("@swc/helpers/_/_ts_decorate");
const _ts_metadata = require("@swc/helpers/_/_ts_metadata");
const _common = require("@nestjs/common");
const _config = require("@nestjs/config");
const _nodemailer = /*#__PURE__*/ _interop_require_wildcard._(require("nodemailer"));
const _invitationtemplate = require("./templates/invitation.template");
const _removaltemplate = require("./templates/removal.template");
const _backupownerdesignationtemplate = require("./templates/backup-owner-designation.template");
const _recoverynotificationtemplate = require("./templates/recovery-notification.template");
const _dataexportcompletetemplate = require("./templates/data-export-complete.template");
const _tenantdeletioninitiatedtemplate = require("./templates/tenant-deletion-initiated.template");
const _tenantdeletioncancelledtemplate = require("./templates/tenant-deletion-cancelled.template");
const _tenantdeletioncompletetemplate = require("./templates/tenant-deletion-complete.template");
let EmailService = class EmailService {
    async sendInvitationEmail(params) {
        const { to, inviterName, tenantName, inviteLink, department } = params;
        const html = (0, _invitationtemplate.getInvitationEmailHtml)({
            inviterName,
            tenantName,
            inviteLink,
            department,
            expiresInDays: 7
        });
        const text = (0, _invitationtemplate.getInvitationEmailText)({
            inviterName,
            tenantName,
            inviteLink,
            department,
            expiresInDays: 7
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `You're invited to join ${tenantName} on Mentor AI`,
                html,
                text
            });
            return {
                success: true,
                messageId: info.messageId
            };
        } catch (error) {
            this.logger.error(`Failed to send email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
                success: false
            };
        }
    }
    async sendRemovalNotificationEmail(params) {
        const { to, memberName, tenantName, strategy, contactEmail } = params;
        const html = (0, _removaltemplate.getRemovalEmailHtml)({
            memberName,
            tenantName,
            strategy,
            contactEmail
        });
        const text = (0, _removaltemplate.getRemovalEmailText)({
            memberName,
            tenantName,
            strategy,
            contactEmail
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `Your access to ${tenantName} has been updated`,
                html,
                text
            });
            return {
                success: true,
                messageId: info.messageId
            };
        } catch (error) {
            this.logger.error(`Failed to send removal notification to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
                success: false
            };
        }
    }
    async sendBackupOwnerDesignationEmail(params) {
        const { to, tenantName, designatedBy, designatedName } = params;
        const html = (0, _backupownerdesignationtemplate.getBackupOwnerDesignationEmailHtml)({
            designatedName,
            tenantName,
            designatedBy
        });
        const text = (0, _backupownerdesignationtemplate.getBackupOwnerDesignationEmailText)({
            designatedName,
            tenantName,
            designatedBy
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `You've been designated as Backup Owner for ${tenantName}`,
                html,
                text
            });
            return {
                success: true,
                messageId: info.messageId
            };
        } catch (error) {
            this.logger.error(`Failed to send backup owner designation email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
                success: false
            };
        }
    }
    async sendRecoveryNotificationEmail(params) {
        const { to, ownerName, tenantName, backupOwnerName, recoveryTimestamp, ipAddress } = params;
        const html = (0, _recoverynotificationtemplate.getRecoveryNotificationEmailHtml)({
            ownerName,
            tenantName,
            backupOwnerName,
            recoveryTimestamp: recoveryTimestamp.toISOString(),
            ipAddress
        });
        const text = (0, _recoverynotificationtemplate.getRecoveryNotificationEmailText)({
            ownerName,
            tenantName,
            backupOwnerName,
            recoveryTimestamp: recoveryTimestamp.toISOString(),
            ipAddress
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `Account Recovery Action - ${tenantName}`,
                html,
                text
            });
            return {
                success: true,
                messageId: info.messageId
            };
        } catch (error) {
            this.logger.error(`Failed to send recovery notification to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
                success: false
            };
        }
    }
    async sendDataExportCompleteEmail(params) {
        const { to, userName, format, fileSize, downloadUrl, expiresAt } = params;
        const html = (0, _dataexportcompletetemplate.getDataExportCompleteEmailHtml)({
            userName,
            format,
            fileSize,
            downloadUrl,
            expiresAt
        });
        const text = (0, _dataexportcompletetemplate.getDataExportCompleteEmailText)({
            userName,
            format,
            fileSize,
            downloadUrl,
            expiresAt
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `Your data export is ready — Mentor AI`,
                html,
                text
            });
            return {
                success: true,
                messageId: info.messageId
            };
        } catch (error) {
            this.logger.error(`Failed to send data export email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
                success: false
            };
        }
    }
    async sendTenantDeletionInitiatedEmail(params) {
        const { to, userName, tenantName, requestedByName, requestedByEmail, gracePeriodEndsAt } = params;
        const html = (0, _tenantdeletioninitiatedtemplate.getTenantDeletionInitiatedEmailHtml)({
            userName,
            tenantName,
            requestedByName,
            requestedByEmail,
            gracePeriodEndsAt
        });
        const text = (0, _tenantdeletioninitiatedtemplate.getTenantDeletionInitiatedEmailText)({
            userName,
            tenantName,
            requestedByName,
            requestedByEmail,
            gracePeriodEndsAt
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `Important: ${tenantName} scheduled for deletion — Mentor AI`,
                html,
                text
            });
            return {
                success: true,
                messageId: info.messageId
            };
        } catch (error) {
            this.logger.error(`Failed to send tenant deletion initiated email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
                success: false
            };
        }
    }
    async sendTenantDeletionCancelledEmail(params) {
        const { to, userName, tenantName } = params;
        const html = (0, _tenantdeletioncancelledtemplate.getTenantDeletionCancelledEmailHtml)({
            userName,
            tenantName
        });
        const text = (0, _tenantdeletioncancelledtemplate.getTenantDeletionCancelledEmailText)({
            userName,
            tenantName
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `${tenantName} deletion cancelled — Mentor AI`,
                html,
                text
            });
            return {
                success: true,
                messageId: info.messageId
            };
        } catch (error) {
            this.logger.error(`Failed to send tenant deletion cancelled email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
                success: false
            };
        }
    }
    async sendTenantDeletionCompleteEmail(params) {
        const { to, userName, tenantName, certificateReference } = params;
        const html = (0, _tenantdeletioncompletetemplate.getTenantDeletionCompleteEmailHtml)({
            userName,
            tenantName,
            certificateReference
        });
        const text = (0, _tenantdeletioncompletetemplate.getTenantDeletionCompleteEmailText)({
            userName,
            tenantName,
            certificateReference
        });
        try {
            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: `Your workspace has been deleted — Mentor AI`,
                html,
                text
            });
            return {
                success: true,
                messageId: info.messageId
            };
        } catch (error) {
            this.logger.error(`Failed to send tenant deletion complete email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return {
                success: false
            };
        }
    }
    constructor(configService){
        this.configService = configService;
        this.logger = new _common.Logger(EmailService.name);
        const host = this.configService.get('SMTP_HOST', 'localhost');
        const port = this.configService.get('SMTP_PORT', 587);
        const user = this.configService.get('SMTP_USER', '');
        const pass = this.configService.get('SMTP_PASS', '');
        this.fromAddress = this.configService.get('EMAIL_FROM', 'noreply@mentor-ai.com');
        this.transporter = _nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: user ? {
                user,
                pass
            } : undefined
        });
    }
};
EmailService = _ts_decorate._([
    (0, _common.Injectable)(),
    _ts_metadata._("design:type", Function),
    _ts_metadata._("design:paramtypes", [
        typeof _config.ConfigService === "undefined" ? Object : _config.ConfigService
    ])
], EmailService);

//# sourceMappingURL=email.service.js.map