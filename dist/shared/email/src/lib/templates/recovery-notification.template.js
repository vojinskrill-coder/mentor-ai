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
    getRecoveryNotificationEmailHtml: function() {
        return getRecoveryNotificationEmailHtml;
    },
    getRecoveryNotificationEmailText: function() {
        return getRecoveryNotificationEmailText;
    }
});
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function getRecoveryNotificationEmailHtml(data) {
    const owner = escapeHtml(data.ownerName);
    const tenant = escapeHtml(data.tenantName);
    const backup = escapeHtml(data.backupOwnerName);
    const timestamp = escapeHtml(data.recoveryTimestamp);
    const ip = escapeHtml(data.ipAddress);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Recovery Action Taken</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#18181b;padding:24px 32px;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Mentor AI</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="color:#dc2626;margin:0 0 16px;">Account Recovery Action</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Hi${owner ? ` ${owner}` : ''},
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Your two-factor authentication (2FA) for <strong>${tenant}</strong> has been reset by your designated Backup Owner, <strong>${backup}</strong>.
              </p>
              <table width="100%" cellpadding="8" cellspacing="0" style="background-color:#fef2f2;border-radius:4px;margin:0 0 16px;">
                <tr>
                  <td style="color:#3f3f46;font-size:14px;">
                    <strong>Recovery Details:</strong><br>
                    Initiated by: ${backup}<br>
                    Timestamp: ${timestamp}<br>
                    IP Address: ${ip}
                  </td>
                </tr>
              </table>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                <strong>What you need to do:</strong> On your next login, you will be prompted to set up a new 2FA method. Please do so immediately to secure your account.
              </p>
              <p style="color:#dc2626;font-size:14px;line-height:1.5;margin:0;">
                If you did not authorize this recovery, please contact support immediately.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f4f4f5;padding:16px 32px;text-align:center;">
              <p style="color:#a1a1aa;font-size:12px;margin:0;">
                &copy; ${new Date().getFullYear()} Mentor AI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}
function getRecoveryNotificationEmailText(data) {
    return [
        `IMPORTANT: Account Recovery Action - ${data.tenantName}`,
        '',
        `Hi${data.ownerName ? ` ${data.ownerName}` : ''},`,
        '',
        `Your two-factor authentication (2FA) for ${data.tenantName} has been reset by your designated Backup Owner, ${data.backupOwnerName}.`,
        '',
        'Recovery Details:',
        `  Initiated by: ${data.backupOwnerName}`,
        `  Timestamp: ${data.recoveryTimestamp}`,
        `  IP Address: ${data.ipAddress}`,
        '',
        'What you need to do: On your next login, you will be prompted to set up a new 2FA method. Please do so immediately to secure your account.',
        '',
        'If you did not authorize this recovery, please contact support immediately.'
    ].join('\n');
}

//# sourceMappingURL=recovery-notification.template.js.map