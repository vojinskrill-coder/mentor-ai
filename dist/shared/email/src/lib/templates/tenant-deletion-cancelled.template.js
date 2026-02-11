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
    getTenantDeletionCancelledEmailHtml: function() {
        return getTenantDeletionCancelledEmailHtml;
    },
    getTenantDeletionCancelledEmailText: function() {
        return getTenantDeletionCancelledEmailText;
    }
});
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function getTenantDeletionCancelledEmailHtml(data) {
    const name = escapeHtml(data.userName);
    const tenant = escapeHtml(data.tenantName);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workspace deletion cancelled</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#16a34a;padding:24px 32px;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Mentor AI</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="color:#16a34a;margin:0 0 16px;">✓ Workspace Deletion Cancelled</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Hi${name ? ` ${name}` : ''},
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Good news! The scheduled deletion of <strong>${tenant}</strong> has been cancelled.
              </p>

              <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
                <p style="color:#166534;font-size:16px;margin:0;">
                  Your workspace has been fully restored. All data and team member access remain intact.
                </p>
              </div>

              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:16px 0 0;">
                No action is needed from you. You can continue using Mentor AI as normal.
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
function getTenantDeletionCancelledEmailText(data) {
    return [
        `${data.tenantName} deletion cancelled`,
        '',
        `Hi${data.userName ? ` ${data.userName}` : ''},`,
        '',
        `Good news! The scheduled deletion of "${data.tenantName}" has been cancelled.`,
        '',
        'Your workspace has been fully restored. All data and team member access remain intact.',
        '',
        'No action is needed from you. You can continue using Mentor AI as normal.'
    ].join('\n');
}

//# sourceMappingURL=tenant-deletion-cancelled.template.js.map