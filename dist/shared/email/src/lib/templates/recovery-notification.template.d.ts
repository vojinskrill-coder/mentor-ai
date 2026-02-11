export interface RecoveryNotificationEmailData {
    ownerName: string;
    tenantName: string;
    backupOwnerName: string;
    recoveryTimestamp: string;
    ipAddress: string;
}
export declare function getRecoveryNotificationEmailHtml(data: RecoveryNotificationEmailData): string;
export declare function getRecoveryNotificationEmailText(data: RecoveryNotificationEmailData): string;
