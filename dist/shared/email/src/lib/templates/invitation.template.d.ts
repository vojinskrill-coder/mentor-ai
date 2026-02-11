export interface InvitationEmailData {
    inviterName: string;
    tenantName: string;
    inviteLink: string;
    department: string;
    expiresInDays: number;
}
export declare function getInvitationEmailHtml(data: InvitationEmailData): string;
export declare function getInvitationEmailText(data: InvitationEmailData): string;
