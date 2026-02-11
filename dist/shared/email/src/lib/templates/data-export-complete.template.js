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
    getDataExportCompleteEmailHtml: function() {
        return getDataExportCompleteEmailHtml;
    },
    getDataExportCompleteEmailText: function() {
        return getDataExportCompleteEmailText;
    }
});
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function getDataExportCompleteEmailHtml(data) {
    const name = escapeHtml(data.userName);
    const format = escapeHtml(data.format);
    const fileSize = escapeHtml(data.fileSize);
    const downloadUrl = escapeHtml(data.downloadUrl);
    const expiresAt = escapeHtml(data.expiresAt);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Data Export is Ready</title>
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
              <h2 style="color:#18181b;margin:0 0 16px;">Your Data Export is Ready</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Hi${name ? ` ${name}` : ''},
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Your data export in <strong>${format}</strong> format is ready for download.
              </p>
              <table width="100%" cellpadding="8" cellspacing="0" style="background-color:#f0f9ff;border-radius:4px;margin:0 0 16px;">
                <tr>
                  <td style="color:#3f3f46;font-size:14px;">
                    <strong>Export Details:</strong><br>
                    Format: ${format}<br>
                    File Size: ${fileSize}<br>
                    Expires: ${expiresAt}
                  </td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
                <tr>
                  <td style="background-color:#3b82f6;border-radius:6px;padding:12px 24px;">
                    <a href="${downloadUrl}" style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">Download Export</a>
                  </td>
                </tr>
              </table>
              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:0;">
                This download link will expire in 24 hours. After that, you'll need to request a new export.
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
function getDataExportCompleteEmailText(data) {
    return [
        `Your Data Export is Ready — Mentor AI`,
        '',
        `Hi${data.userName ? ` ${data.userName}` : ''},`,
        '',
        `Your data export in ${data.format} format is ready for download.`,
        '',
        'Export Details:',
        `  Format: ${data.format}`,
        `  File Size: ${data.fileSize}`,
        `  Expires: ${data.expiresAt}`,
        '',
        `Download: ${data.downloadUrl}`,
        '',
        'This download link will expire in 24 hours. After that, you will need to request a new export.'
    ].join('\n');
}

//# sourceMappingURL=data-export-complete.template.js.map