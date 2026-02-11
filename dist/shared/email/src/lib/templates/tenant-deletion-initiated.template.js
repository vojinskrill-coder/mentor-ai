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
    getTenantDeletionInitiatedEmailHtml: function() {
        return getTenantDeletionInitiatedEmailHtml;
    },
    getTenantDeletionInitiatedEmailText: function() {
        return getTenantDeletionInitiatedEmailText;
    }
});
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function formatDate(isoDate) {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    });
}
function getTenantDeletionInitiatedEmailHtml(data) {
    const name = escapeHtml(data.userName);
    const tenant = escapeHtml(data.tenantName);
    const requestedBy = escapeHtml(data.requestedByName);
    const requestedByEmail = escapeHtml(data.requestedByEmail);
    const gracePeriodEnds = formatDate(data.gracePeriodEndsAt);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Important: Workspace scheduled for deletion</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#dc2626;padding:24px 32px;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Mentor AI</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="color:#dc2626;margin:0 0 16px;">⚠️ Workspace Scheduled for Deletion</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Hi${name ? ` ${name}` : ''},
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                The workspace <strong>${tenant}</strong> has been scheduled for deletion by ${requestedBy}.
              </p>

              <div style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0;">
                <p style="color:#991b1b;font-size:16px;font-weight:bold;margin:0 0 8px;">What this means:</p>
                <ul style="color:#991b1b;font-size:14px;line-height:1.6;margin:0;padding-left:20px;">
                  <li>All workspace data will be permanently deleted</li>
                  <li>All team members will lose access</li>
                  <li>This action cannot be undone after the grace period</li>
                </ul>
              </div>

              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:16px 0 8px;">
                <strong>Deletion scheduled for:</strong>
              </p>
              <p style="color:#dc2626;font-size:18px;font-weight:bold;margin:0 0 16px;">
                ${gracePeriodEnds}
              </p>

              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                The workspace owner can cancel this deletion within the 7-day grace period. After this time, deletion will proceed automatically.
              </p>

              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:16px 0 0;">
                If you believe this was a mistake, please contact the workspace owner at ${requestedByEmail}.
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
function getTenantDeletionInitiatedEmailText(data) {
    const gracePeriodEnds = formatDate(data.gracePeriodEndsAt);
    return [
        `IMPORTANT: ${data.tenantName} scheduled for deletion`,
        '',
        `Hi${data.userName ? ` ${data.userName}` : ''},`,
        '',
        `The workspace "${data.tenantName}" has been scheduled for deletion by ${data.requestedByName}.`,
        '',
        'What this means:',
        '- All workspace data will be permanently deleted',
        '- All team members will lose access',
        '- This action cannot be undone after the grace period',
        '',
        `Deletion scheduled for: ${gracePeriodEnds}`,
        '',
        'The workspace owner can cancel this deletion within the 7-day grace period. After this time, deletion will proceed automatically.',
        '',
        `If you believe this was a mistake, please contact the workspace owner at ${data.requestedByEmail}.`
    ].join('\n');
}

//# sourceMappingURL=tenant-deletion-initiated.template.js.map