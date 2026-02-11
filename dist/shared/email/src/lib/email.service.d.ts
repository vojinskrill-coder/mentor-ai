import { ConfigService } from '@nestjs/config';
export interface SendEmailResult {
    success: boolean;
    messageId?: string;
}
export interface InvitationEmailParams {
    to: string;
    inviterName: string;
    tenantName: string;
    inviteLink: string;
    department: string;
}
export interface RemovalNotificationParams {
    to: string;
    memberName: string;
    tenantName: string;
    strategy: 'REASSIGN' | 'ARCHIVE';
    contactEmail?: string;
}
export interface BackupOwnerDesignationEmailParams {
    to: string;
    tenantName: string;
    designatedBy: string;
    designatedName: string;
}
export interface RecoveryNotificationEmailParams {
    to: string;
    ownerName: string;
    tenantName: string;
    backupOwnerName: string;
    recoveryTimestamp: Date;
    ipAddress: string;
}
export interface DataExportCompleteEmailParams {
    to: string;
    userName: string;
    format: string;
    fileSize: string;
    downloadUrl: string;
    expiresAt: string;
}
export interface TenantDeletionInitiatedEmailParams {
    to: string;
    userName: string;
    tenantName: string;
    requestedByName: string;
    requestedByEmail: string;
    gracePeriodEndsAt: string;
}
export interface TenantDeletionCancelledEmailParams {
    to: string;
    userName: string;
    tenantName: string;
}
export interface TenantDeletionCompleteEmailParams {
    to: string;
    userName: string;
    tenantName: string;
    certificateReference: string;
}
export declare class EmailService {
    private readonly configService;
    private readonly logger;
    private transporter;
    private readonly fromAddress;
    constructor(configService: ConfigService);
    sendInvitationEmail(params: InvitationEmailParams): Promise<SendEmailResult>;
    sendRemovalNotificationEmail(params: RemovalNotificationParams): Promise<SendEmailResult>;
    sendBackupOwnerDesignationEmail(params: BackupOwnerDesignationEmailParams): Promise<SendEmailResult>;
    sendRecoveryNotificationEmail(params: RecoveryNotificationEmailParams): Promise<SendEmailResult>;
    sendDataExportCompleteEmail(params: DataExportCompleteEmailParams): Promise<SendEmailResult>;
    sendTenantDeletionInitiatedEmail(params: TenantDeletionInitiatedEmailParams): Promise<SendEmailResult>;
    sendTenantDeletionCancelledEmail(params: TenantDeletionCancelledEmailParams): Promise<SendEmailResult>;
    sendTenantDeletionCompleteEmail(params: TenantDeletionCompleteEmailParams): Promise<SendEmailResult>;
}
