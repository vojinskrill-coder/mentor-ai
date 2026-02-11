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
    getTenantDeletionCompleteEmailHtml: function() {
        return getTenantDeletionCompleteEmailHtml;
    },
    getTenantDeletionCompleteEmailText: function() {
        return getTenantDeletionCompleteEmailText;
    }
});
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function getTenantDeletionCompleteEmailHtml(data) {
    const name = escapeHtml(data.userName);
    const tenant = escapeHtml(data.tenantName);
    const certRef = escapeHtml(data.certificateReference);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your workspace has been deleted</title>
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
              <h2 style="color:#18181b;margin:0 0 16px;">Workspace Deletion Complete</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Hi${name ? ` ${name}` : ''},
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                As requested, the workspace <strong>${tenant}</strong> has been permanently deleted.
              </p>

              <div style="background-color:#f4f4f5;border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0;">
                <p style="color:#3f3f46;font-size:14px;margin:0 0 8px;">
                  <strong>GDPR Deletion Certificate Reference:</strong>
                </p>
                <p style="color:#71717a;font-size:14px;font-family:monospace;margin:0;">
                  ${certRef}
                </p>
              </div>

              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                In accordance with GDPR requirements:
              </p>
              <ul style="color:#3f3f46;font-size:14px;line-height:1.6;margin:0 0 16px;padding-left:20px;">
                <li>All personal data has been deleted or anonymized</li>
                <li>Audit logs have been anonymized and retained for compliance</li>
                <li>User identifiers have been replaced with cryptographic hashes</li>
              </ul>

              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:16px 0 0;">
                Thank you for using Mentor AI. If you have any questions about this deletion or need a copy of your GDPR deletion certificate, please contact support@mentor-ai.com with your certificate reference.
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
function getTenantDeletionCompleteEmailText(data) {
    return [
        `Workspace Deletion Complete - ${data.tenantName}`,
        '',
        `Hi${data.userName ? ` ${data.userName}` : ''},`,
        '',
        `As requested, the workspace "${data.tenantName}" has been permanently deleted.`,
        '',
        `GDPR Deletion Certificate Reference: ${data.certificateReference}`,
        '',
        'In accordance with GDPR requirements:',
        '- All personal data has been deleted or anonymized',
        '- Audit logs have been anonymized and retained for compliance',
        '- User identifiers have been replaced with cryptographic hashes',
        '',
        'Thank you for using Mentor AI. If you have any questions about this deletion or need a copy of your GDPR deletion certificate, please contact support@mentor-ai.com with your certificate reference.'
    ].join('\n');
}

//# sourceMappingURL=tenant-deletion-complete.template.js.map