export interface InvitationEmailData {
  inviterName: string;
  tenantName: string;
  inviteLink: string;
  department: string;
  expiresInDays: number;
}

export function getInvitationEmailHtml(data: InvitationEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to join ${data.tenantName} on Mentor AI</title>
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
              <h2 style="color:#18181b;margin:0 0 16px;">You're invited!</h2>
              <p style="color:#3f3f46;font-size:16px;line-height:1.5;margin:0 0 16px;">
                <strong>${data.inviterName}</strong> has invited you to join
                <strong>${data.tenantName}</strong> on Mentor AI as a Team Member
                in the <strong>${data.department}</strong> department.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td style="background-color:#18181b;border-radius:6px;padding:12px 32px;">
                    <a href="${data.inviteLink}" style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:0 0 8px;">
                This invitation expires in ${data.expiresInDays} days.
              </p>
              <p style="color:#71717a;font-size:14px;line-height:1.5;margin:0;">
                If you didn't expect this invitation, you can safely ignore this email.
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

export function getInvitationEmailText(data: InvitationEmailData): string {
  return [
    `You're invited to join ${data.tenantName} on Mentor AI!`,
    '',
    `${data.inviterName} has invited you to join ${data.tenantName} as a Team Member in the ${data.department} department.`,
    '',
    `Accept your invitation: ${data.inviteLink}`,
    '',
    `This invitation expires in ${data.expiresInDays} days.`,
    '',
    `If you didn't expect this invitation, you can safely ignore this email.`,
  ].join('\n');
}
