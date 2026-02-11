export interface BackupOwnerDesignationEmailData {
  designatedName: string;
  tenantName: string;
  designatedBy: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getBackupOwnerDesignationEmailHtml(
  data: BackupOwnerDesignationEmailData
): string {
  const name = escapeHtml(data.designatedName);
  const tenant = escapeHtml(data.tenantName);
  const by = escapeHtml(data.designatedBy);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've been designated as Backup Owner</title>
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
              <h2 style="color:#18181b;margin:0 0 16px;">Backup Owner Designation</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                Hi${name ? ` ${name}` : ''},
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                You have been designated as the <strong>Backup Owner</strong> for <strong>${tenant}</strong> by ${by}.
              </p>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                <strong>What this means:</strong> If the primary workspace owner loses access to their account (e.g., lost 2FA device), you can initiate account recovery to reset their two-factor authentication and restore their access.
              </p>
              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:0;">
                No action is needed from you at this time. You will only need to act if the primary owner requests account recovery assistance.
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

export function getBackupOwnerDesignationEmailText(
  data: BackupOwnerDesignationEmailData
): string {
  return [
    `Backup Owner Designation - ${data.tenantName}`,
    '',
    `Hi${data.designatedName ? ` ${data.designatedName}` : ''},`,
    '',
    `You have been designated as the Backup Owner for ${data.tenantName} by ${data.designatedBy}.`,
    '',
    'What this means: If the primary workspace owner loses access to their account (e.g., lost 2FA device), you can initiate account recovery to reset their two-factor authentication and restore their access.',
    '',
    'No action is needed from you at this time. You will only need to act if the primary owner requests account recovery assistance.',
  ].join('\n');
}
