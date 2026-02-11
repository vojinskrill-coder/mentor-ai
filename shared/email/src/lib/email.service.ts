import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  getInvitationEmailHtml,
  getInvitationEmailText,
} from './templates/invitation.template';
import {
  getRemovalEmailHtml,
  getRemovalEmailText,
} from './templates/removal.template';
import {
  getBackupOwnerDesignationEmailHtml,
  getBackupOwnerDesignationEmailText,
} from './templates/backup-owner-designation.template';
import {
  getRecoveryNotificationEmailHtml,
  getRecoveryNotificationEmailText,
} from './templates/recovery-notification.template';
import {
  getDataExportCompleteEmailHtml,
  getDataExportCompleteEmailText,
} from './templates/data-export-complete.template';
import {
  getTenantDeletionInitiatedEmailHtml,
  getTenantDeletionInitiatedEmailText,
} from './templates/tenant-deletion-initiated.template';
import {
  getTenantDeletionCancelledEmailHtml,
  getTenantDeletionCancelledEmailText,
} from './templates/tenant-deletion-cancelled.template';
import {
  getTenantDeletionCompleteEmailHtml,
  getTenantDeletionCompleteEmailText,
} from './templates/tenant-deletion-complete.template';

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

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST', 'localhost');
    const port = this.configService.get<number>('SMTP_PORT', 587);
    const user = this.configService.get<string>('SMTP_USER', '');
    const pass = this.configService.get<string>('SMTP_PASS', '');
    this.fromAddress = this.configService.get<string>(
      'EMAIL_FROM',
      'noreply@mentor-ai.com'
    );

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });
  }

  async sendInvitationEmail(
    params: InvitationEmailParams
  ): Promise<SendEmailResult> {
    const { to, inviterName, tenantName, inviteLink, department } = params;

    const html = getInvitationEmailHtml({
      inviterName,
      tenantName,
      inviteLink,
      department,
      expiresInDays: 7,
    });

    const text = getInvitationEmailText({
      inviterName,
      tenantName,
      inviteLink,
      department,
      expiresInDays: 7,
    });

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: `You're invited to join ${tenantName} on Mentor AI`,
        html,
        text,
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { success: false };
    }
  }

  async sendRemovalNotificationEmail(
    params: RemovalNotificationParams
  ): Promise<SendEmailResult> {
    const { to, memberName, tenantName, strategy, contactEmail } = params;

    const html = getRemovalEmailHtml({
      memberName,
      tenantName,
      strategy,
      contactEmail,
    });

    const text = getRemovalEmailText({
      memberName,
      tenantName,
      strategy,
      contactEmail,
    });

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: `Your access to ${tenantName} has been updated`,
        html,
        text,
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      this.logger.error(
        `Failed to send removal notification to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { success: false };
    }
  }

  async sendBackupOwnerDesignationEmail(
    params: BackupOwnerDesignationEmailParams
  ): Promise<SendEmailResult> {
    const { to, tenantName, designatedBy, designatedName } = params;

    const html = getBackupOwnerDesignationEmailHtml({
      designatedName,
      tenantName,
      designatedBy,
    });

    const text = getBackupOwnerDesignationEmailText({
      designatedName,
      tenantName,
      designatedBy,
    });

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: `You've been designated as Backup Owner for ${tenantName}`,
        html,
        text,
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      this.logger.error(
        `Failed to send backup owner designation email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { success: false };
    }
  }

  async sendRecoveryNotificationEmail(
    params: RecoveryNotificationEmailParams
  ): Promise<SendEmailResult> {
    const { to, ownerName, tenantName, backupOwnerName, recoveryTimestamp, ipAddress } = params;

    const html = getRecoveryNotificationEmailHtml({
      ownerName,
      tenantName,
      backupOwnerName,
      recoveryTimestamp: recoveryTimestamp.toISOString(),
      ipAddress,
    });

    const text = getRecoveryNotificationEmailText({
      ownerName,
      tenantName,
      backupOwnerName,
      recoveryTimestamp: recoveryTimestamp.toISOString(),
      ipAddress,
    });

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: `Account Recovery Action - ${tenantName}`,
        html,
        text,
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      this.logger.error(
        `Failed to send recovery notification to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { success: false };
    }
  }

  async sendDataExportCompleteEmail(
    params: DataExportCompleteEmailParams
  ): Promise<SendEmailResult> {
    const { to, userName, format, fileSize, downloadUrl, expiresAt } = params;

    const html = getDataExportCompleteEmailHtml({
      userName,
      format,
      fileSize,
      downloadUrl,
      expiresAt,
    });

    const text = getDataExportCompleteEmailText({
      userName,
      format,
      fileSize,
      downloadUrl,
      expiresAt,
    });

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: `Your data export is ready — Mentor AI`,
        html,
        text,
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      this.logger.error(
        `Failed to send data export email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { success: false };
    }
  }

  async sendTenantDeletionInitiatedEmail(
    params: TenantDeletionInitiatedEmailParams
  ): Promise<SendEmailResult> {
    const { to, userName, tenantName, requestedByName, requestedByEmail, gracePeriodEndsAt } = params;

    const html = getTenantDeletionInitiatedEmailHtml({
      userName,
      tenantName,
      requestedByName,
      requestedByEmail,
      gracePeriodEndsAt,
    });

    const text = getTenantDeletionInitiatedEmailText({
      userName,
      tenantName,
      requestedByName,
      requestedByEmail,
      gracePeriodEndsAt,
    });

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: `Important: ${tenantName} scheduled for deletion — Mentor AI`,
        html,
        text,
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      this.logger.error(
        `Failed to send tenant deletion initiated email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { success: false };
    }
  }

  async sendTenantDeletionCancelledEmail(
    params: TenantDeletionCancelledEmailParams
  ): Promise<SendEmailResult> {
    const { to, userName, tenantName } = params;

    const html = getTenantDeletionCancelledEmailHtml({
      userName,
      tenantName,
    });

    const text = getTenantDeletionCancelledEmailText({
      userName,
      tenantName,
    });

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: `${tenantName} deletion cancelled — Mentor AI`,
        html,
        text,
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      this.logger.error(
        `Failed to send tenant deletion cancelled email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { success: false };
    }
  }

  async sendTenantDeletionCompleteEmail(
    params: TenantDeletionCompleteEmailParams
  ): Promise<SendEmailResult> {
    const { to, userName, tenantName, certificateReference } = params;

    const html = getTenantDeletionCompleteEmailHtml({
      userName,
      tenantName,
      certificateReference,
    });

    const text = getTenantDeletionCompleteEmailText({
      userName,
      tenantName,
      certificateReference,
    });

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: `Your workspace has been deleted — Mentor AI`,
        html,
        text,
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      this.logger.error(
        `Failed to send tenant deletion complete email to ${to}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { success: false };
    }
  }
}
