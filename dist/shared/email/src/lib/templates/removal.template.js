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
    getRemovalEmailHtml: function() {
        return getRemovalEmailHtml;
    },
    getRemovalEmailText: function() {
        return getRemovalEmailText;
    }
});
function getRemovalEmailHtml(data) {
    const dataHandling = data.strategy === 'REASSIGN' ? 'Your notes and saved outputs have been reassigned to the workspace owner. Your conversations have been archived.' : 'Your data has been archived and retained securely.';
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your access to ${data.tenantName} has been removed</title>
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
              <h2 style="color:#18181b;margin:0 0 16px;">Access Update</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Hi${data.memberName ? ` ${data.memberName}` : ''},
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Your access to <strong>${data.tenantName}</strong> on Mentor AI has been removed by the workspace owner.
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                <strong>Your data:</strong> ${dataHandling}
              </p>
              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:0;">
                If you have questions about this change, please contact your workspace administrator${data.contactEmail ? ` at ${data.contactEmail}` : ''}.
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
function getRemovalEmailText(data) {
    const dataHandling = data.strategy === 'REASSIGN' ? 'Your notes and saved outputs have been reassigned to the workspace owner. Your conversations have been archived.' : 'Your data has been archived and retained securely.';
    return [
        `Access Update - ${data.tenantName}`,
        '',
        `Hi${data.memberName ? ` ${data.memberName}` : ''},`,
        '',
        `Your access to ${data.tenantName} on Mentor AI has been removed by the workspace owner.`,
        '',
        `Your data: ${dataHandling}`,
        '',
        `If you have questions about this change, please contact your workspace administrator${data.contactEmail ? ` at ${data.contactEmail}` : ''}.`
    ].join('\n');
}

//# sourceMappingURL=removal.template.js.map