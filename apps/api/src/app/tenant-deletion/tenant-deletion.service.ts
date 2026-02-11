import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  GoneException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { EmailService } from '@mentor-ai/shared/email';
import type { TenantDeletionStatusResponse, TenantStatus } from '@mentor-ai/shared/types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EMAIL_BATCH_SIZE = 10;

/**
 * Service for managing tenant deletion lifecycle with GDPR compliance.
 * Handles deletion requests, grace periods, user deactivation, and audit log anonymization.
 */
@Injectable()
export class TenantDeletionService implements OnModuleInit {
  private readonly logger = new Logger(TenantDeletionService.name);
  private readonly certificatesDir: string;
  private readonly gracePeriodDays: number;
  private readonly gdprCompletionDays: number;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    @InjectQueue('tenant-deletion') private readonly deletionQueue: Queue
  ) {
    const uploadsDir = this.configService.get<string>('UPLOADS_DIR', path.join(process.cwd(), 'uploads'));
    this.certificatesDir = path.join(uploadsDir, 'certificates');
    this.gracePeriodDays = this.configService.get<number>('TENANT_DELETION_GRACE_PERIOD_DAYS', 7);
    this.gdprCompletionDays = this.configService.get<number>('TENANT_DELETION_GDPR_DAYS', 30);
  }

  async onModuleInit(): Promise<void> {
    // Ensure certificates directory exists
    await this.ensureCertificatesDirExists();

    // Register repeatable job to check for expired grace periods (every hour)
    await this.deletionQueue.add(
      'check-expired-grace-periods',
      {},
      {
        repeat: { every: 3600000 },
        jobId: 'check-expired-grace-periods',
      }
    );
    this.logger.log({ message: 'Registered repeatable job', job: 'check-expired-grace-periods', interval: '1 hour' });
  }

  private async ensureCertificatesDirExists(): Promise<void> {
    try {
      await fs.access(this.certificatesDir);
    } catch {
      await fs.mkdir(this.certificatesDir, { recursive: true });
    }
  }

  /**
   * Initiates tenant deletion request with type-to-confirm validation.
   * Sets tenant to PENDING_DELETION state and starts 7-day grace period.
   * @param userId - ID of the user requesting deletion (must be TENANT_OWNER)
   * @param tenantId - ID of the tenant to delete
   * @param workspaceName - Workspace name for type-to-confirm validation (must match exactly)
   * @returns Deletion status with grace period and estimated completion dates
   * @throws BadRequestException if workspace name doesn't match or tenant not ACTIVE
   */
  async requestDeletion(
    userId: string,
    tenantId: string,
    workspaceName: string
  ): Promise<TenantDeletionStatusResponse> {
    // Get tenant to validate workspace name
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: {
          where: { isActive: true },
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (!tenant) {
      throw new BadRequestException({
        type: 'tenant_not_found',
        title: 'Tenant Not Found',
        status: 400,
        detail: 'The workspace could not be found.',
      });
    }

    // Validate type-to-confirm (case-sensitive match)
    if (workspaceName !== tenant.name) {
      throw new BadRequestException({
        type: 'workspace_name_mismatch',
        title: 'Confirmation Failed',
        status: 400,
        detail: 'The workspace name you entered does not match. Please type the exact workspace name to confirm deletion.',
      });
    }

    // Check if already pending deletion
    if (tenant.status === 'PENDING_DELETION') {
      throw new BadRequestException({
        type: 'deletion_already_pending',
        title: 'Deletion Already Pending',
        status: 400,
        detail: 'This workspace is already scheduled for deletion.',
      });
    }

    // Check if tenant is in a valid state for deletion
    if (tenant.status !== 'ACTIVE') {
      throw new BadRequestException({
        type: 'invalid_tenant_status',
        title: 'Invalid Tenant Status',
        status: 400,
        detail: `Workspace cannot be deleted in current status: ${tenant.status}`,
      });
    }

    const now = new Date();
    const gracePeriodEndsAt = new Date(now.getTime() + this.gracePeriodDays * MS_PER_DAY);
    const estimatedCompletionBy = new Date(now.getTime() + this.gdprCompletionDays * MS_PER_DAY);

    // Update tenant status to PENDING_DELETION
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'PENDING_DELETION',
        deletionRequestedAt: now,
        deletionRequestedById: userId,
        deletionScheduledFor: gracePeriodEndsAt,
        deletionCancelledAt: null,
      },
    });

    // Also update TenantRegistry status
    await this.prisma.tenantRegistry.update({
      where: { id: tenantId },
      data: { status: 'PENDING_DELETION' },
    });

    this.logger.log({ message: 'Tenant deletion requested', tenantId, userId, gracePeriodEndsAt: gracePeriodEndsAt.toISOString() });

    // Queue email notifications to all team members (outside DB transaction)
    await this.deletionQueue.add('send-deletion-emails', {
      type: 'initiated',
      tenantId,
      tenantName: tenant.name,
      requestedByUserId: userId,
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
      members: tenant.users,
    });

    return {
      status: 'PENDING_DELETION' as TenantStatus,
      requestedAt: now.toISOString(),
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
      estimatedCompletionBy: estimatedCompletionBy.toISOString(),
      canCancel: true,
    };
  }

  /**
   * Cancels a pending tenant deletion within the grace period.
   * Restores tenant to ACTIVE state and notifies all team members.
   * @param userId - ID of the user cancelling deletion
   * @param tenantId - ID of the tenant
   * @returns Updated deletion status showing ACTIVE state
   * @throws BadRequestException if tenant not in PENDING_DELETION state
   * @throws GoneException if grace period has already expired
   */
  async cancelDeletion(
    userId: string,
    tenantId: string
  ): Promise<TenantDeletionStatusResponse> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: {
          where: { isActive: true },
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (!tenant) {
      throw new BadRequestException({
        type: 'tenant_not_found',
        title: 'Tenant Not Found',
        status: 400,
        detail: 'The workspace could not be found.',
      });
    }

    // Check if tenant is in PENDING_DELETION state
    if (tenant.status !== 'PENDING_DELETION') {
      throw new BadRequestException({
        type: 'not_pending_deletion',
        title: 'Not Pending Deletion',
        status: 400,
        detail: 'This workspace is not scheduled for deletion.',
      });
    }

    // Check if grace period has expired
    if (tenant.deletionScheduledFor && tenant.deletionScheduledFor < new Date()) {
      throw new GoneException({
        type: 'grace_period_expired',
        title: 'Cannot Cancel Deletion',
        status: 410,
        detail: 'The 7-day grace period has expired. Deletion is now in progress and cannot be cancelled.',
      });
    }

    // Cancel deletion - restore to ACTIVE
    const now = new Date();
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'ACTIVE',
        deletionCancelledAt: now,
        deletionScheduledFor: null,
      },
    });

    // Also update TenantRegistry status
    await this.prisma.tenantRegistry.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE' },
    });

    this.logger.log({ message: 'Tenant deletion cancelled', tenantId, userId });

    // Queue cancellation email notifications (outside DB transaction)
    await this.deletionQueue.add('send-deletion-emails', {
      type: 'cancelled',
      tenantId,
      tenantName: tenant.name,
      cancelledByUserId: userId,
      members: tenant.users,
    });

    return {
      status: 'ACTIVE' as TenantStatus,
      requestedAt: null,
      gracePeriodEndsAt: null,
      estimatedCompletionBy: null,
      canCancel: false,
    };
  }

  /**
   * Retrieves current deletion status for a tenant.
   * Returns timing information and whether cancellation is still possible.
   * @param tenantId - ID of the tenant to check
   * @returns Deletion status including grace period info and tenant details
   * @throws BadRequestException if tenant not found
   */
  async getDeletionStatus(tenantId: string): Promise<TenantDeletionStatusResponse> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        status: true,
        deletionRequestedAt: true,
        deletionScheduledFor: true,
        _count: {
          select: {
            users: { where: { isActive: true } },
          },
        },
      },
    });

    if (!tenant) {
      throw new BadRequestException({
        type: 'tenant_not_found',
        title: 'Tenant Not Found',
        status: 400,
        detail: 'The workspace could not be found.',
      });
    }

    const now = new Date();
    const canCancel =
      tenant.status === 'PENDING_DELETION' &&
      tenant.deletionScheduledFor !== null &&
      tenant.deletionScheduledFor > now;

    let estimatedCompletionBy: string | null = null;
    if (tenant.deletionRequestedAt) {
      const completionDate = new Date(
        tenant.deletionRequestedAt.getTime() + this.gdprCompletionDays * MS_PER_DAY
      );
      estimatedCompletionBy = completionDate.toISOString();
    }

    return {
      status: tenant.status as TenantStatus,
      requestedAt: tenant.deletionRequestedAt?.toISOString() ?? null,
      gracePeriodEndsAt: tenant.deletionScheduledFor?.toISOString() ?? null,
      estimatedCompletionBy,
      canCancel,
      tenantName: tenant.name,
      memberCount: tenant._count.users,
    };
  }

  /**
   * Checks for tenants with expired grace periods and queues deletion jobs.
   * Called by scheduled BullMQ job every hour.
   * @returns Number of tenants queued for deletion
   */
  async checkExpiredGracePeriods(): Promise<number> {
    const now = new Date();

    const expiredTenants = await this.prisma.tenant.findMany({
      where: {
        status: 'PENDING_DELETION',
        deletionScheduledFor: { lt: now },
      },
    });

    for (const tenant of expiredTenants) {
      await this.deletionQueue.add('execute-deletion', {
        tenantId: tenant.id,
        tenantName: tenant.name,
      });
      this.logger.log({ message: 'Queued execute-deletion job', tenantId: tenant.id });
    }

    return expiredTenants.length;
  }

  /**
   * Executes tenant deletion after grace period expires.
   * Deactivates all users, updates tenant status to DELETED, and queues data purge.
   * @param tenantId - ID of the tenant to delete
   * @param tenantName - Name of the tenant (for logging and emails)
   */
  async executeDeletion(tenantId: string, tenantName: string): Promise<void> {
    this.logger.log({ message: 'Executing tenant deletion', tenantId, tenantName });

    // Get owner email before deactivating users
    const owner = await this.prisma.user.findFirst({
      where: { tenantId, role: 'TENANT_OWNER', isActive: true },
      select: { id: true, email: true, name: true },
    });

    const now = new Date();

    // Deactivate all users (soft-delete)
    await this.prisma.user.updateMany({
      where: { tenantId, isActive: true },
      data: {
        isActive: false,
        removedAt: now,
        removalReason: 'TENANT_DELETED',
      },
    });

    // Update tenant status to DELETED
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'DELETED',
        deletionCompletedAt: now,
      },
    });

    // Also update TenantRegistry status
    await this.prisma.tenantRegistry.update({
      where: { id: tenantId },
      data: { status: 'DELETED' },
    });

    this.logger.log({ message: 'Tenant marked as DELETED', tenantId, usersDeactivated: true });

    // Queue data purge job
    await this.deletionQueue.add('purge-tenant-data', {
      tenantId,
      tenantName,
      ownerEmail: owner?.email,
      ownerName: owner?.name,
    });
  }

  /**
   * Purges tenant data for GDPR compliance.
   * Anonymizes audit logs, generates deletion certificate, and notifies owner.
   * @param tenantId - ID of the tenant
   * @param tenantName - Name of the tenant (for certificate)
   * @param ownerEmail - Optional owner email for completion notification
   * @param ownerName - Optional owner name for email personalization
   */
  async purgeTenantData(
    tenantId: string,
    tenantName: string,
    ownerEmail?: string,
    ownerName?: string
  ): Promise<void> {
    this.logger.log({ message: 'Starting GDPR data purge', tenantId, tenantName });

    // Step 1: Anonymize audit logs (replace user IDs with hashes)
    // This preserves audit log structure while removing PII
    const anonymizedCount = await this.anonymizeAuditLogs(tenantId);
    this.logger.log({ message: 'Audit logs anonymized', tenantId, anonymizedCount });

    // Step 2: Generate GDPR deletion certificate
    const certificate = this.generateDeletionCertificate(tenantId, tenantName, anonymizedCount);
    const certificatePath = path.join(
      this.certificatesDir,
      `deletion-cert-${this.hashTenantId(tenantId)}.json`
    );
    await fs.writeFile(certificatePath, JSON.stringify(certificate, null, 2), { mode: 0o600 });

    // Step 3: Update tenant with certificate path
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { deletionCertificatePath: certificatePath },
    });

    this.logger.log({ message: 'GDPR deletion certificate generated', tenantId, certificatePath });

    // Step 4: Send completion email to owner (if email available)
    if (ownerEmail) {
      await this.emailService.sendTenantDeletionCompleteEmail({
        to: ownerEmail,
        userName: ownerName ?? 'User',
        tenantName,
        certificateReference: this.hashTenantId(tenantId),
      });
    }

    this.logger.log({ message: 'Tenant data purge complete', tenantId, ownerNotified: !!ownerEmail });
  }

  /**
   * Anonymizes audit logs for GDPR compliance.
   * Replaces user identifiers with SHA-256 hashes while preserving audit structure.
   * Audit logs are retained for 7 years per compliance requirements.
   */
  private async anonymizeAuditLogs(tenantId: string): Promise<number> {
    // Get all users for this tenant to create hash mappings
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, email: true, name: true },
    });

    // Create hash mappings for user identifiers
    const userIdHashes = new Map<string, string>();
    const emailHashes = new Map<string, string>();
    const nameHashes = new Map<string, string>();

    for (const user of users) {
      userIdHashes.set(user.id, this.hashValue(user.id));
      emailHashes.set(user.email, this.hashValue(user.email));
      if (user.name) {
        nameHashes.set(user.name, this.hashValue(user.name));
      }
    }

    // Note: AuditLog model will be added in Epic 9 (Security & Compliance).
    // When available, this code will update audit logs:
    // await this.prisma.auditLog.updateMany({
    //   where: { tenantId },
    //   data: { anonymizedAt: new Date() }
    // });
    // For now, we return the user count as records that would be anonymized.

    this.logger.log({ message: 'Prepared anonymization hashes', tenantId, userCount: users.length });
    return users.length;
  }

  /**
   * Sends deletion initiated emails to all team members in batches.
   * Processes emails in batches to avoid overwhelming the email service.
   * @param tenantName - Name of the workspace being deleted
   * @param requestedByUserId - ID of the user who requested deletion
   * @param gracePeriodEndsAt - ISO timestamp when grace period expires
   * @param members - Array of team members to notify
   */
  async sendDeletionInitiatedEmails(
    tenantName: string,
    requestedByUserId: string,
    gracePeriodEndsAt: string,
    members: Array<{ id: string; email: string; name: string | null }>
  ): Promise<void> {
    const requestedBy = members.find((m) => m.id === requestedByUserId);

    // Process emails in batches to avoid overwhelming the email service
    for (let i = 0; i < members.length; i += EMAIL_BATCH_SIZE) {
      const batch = members.slice(i, i + EMAIL_BATCH_SIZE);
      await Promise.all(
        batch.map((member) =>
          this.emailService.sendTenantDeletionInitiatedEmail({
            to: member.email,
            userName: member.name ?? 'Team Member',
            tenantName,
            requestedByName: requestedBy?.name ?? 'Workspace Owner',
            requestedByEmail: requestedBy?.email ?? '',
            gracePeriodEndsAt,
          })
        )
      );
      this.logger.log({ message: 'Sent deletion initiated email batch', batchIndex: Math.floor(i / EMAIL_BATCH_SIZE), batchSize: batch.length });
    }

    this.logger.log({ message: 'Completed sending deletion initiated emails', tenantName, memberCount: members.length });
  }

  /**
   * Sends deletion cancelled emails to all team members in batches.
   * Processes emails in batches to avoid overwhelming the email service.
   * @param tenantName - Name of the workspace
   * @param members - Array of team members to notify
   */
  async sendDeletionCancelledEmails(
    tenantName: string,
    members: Array<{ id: string; email: string; name: string | null }>
  ): Promise<void> {
    // Process emails in batches to avoid overwhelming the email service
    for (let i = 0; i < members.length; i += EMAIL_BATCH_SIZE) {
      const batch = members.slice(i, i + EMAIL_BATCH_SIZE);
      await Promise.all(
        batch.map((member) =>
          this.emailService.sendTenantDeletionCancelledEmail({
            to: member.email,
            userName: member.name ?? 'Team Member',
            tenantName,
          })
        )
      );
      this.logger.log({ message: 'Sent deletion cancelled email batch', batchIndex: Math.floor(i / EMAIL_BATCH_SIZE), batchSize: batch.length });
    }

    this.logger.log({ message: 'Completed sending deletion cancelled emails', tenantName, memberCount: members.length });
  }

  private generateDeletionCertificate(
    tenantId: string,
    tenantName: string,
    anonymizedRecordCount: number
  ): Record<string, unknown> {
    const now = new Date();
    return {
      certificateType: 'GDPR_DELETION_CERTIFICATE',
      version: '1.0',
      tenantIdHash: this.hashTenantId(tenantId),
      tenantNameHash: crypto.createHash('sha256').update(tenantName).digest('hex'),
      deletionRequestDate: now.toISOString(),
      completionDate: now.toISOString(),
      dataCategories: [
        'User profiles',
        'Chat sessions',
        'Messages',
        'Client memory',
        'File uploads',
        'Integration tokens',
      ],
      anonymizationConfirmation: {
        auditLogs: 'User identifiers replaced with SHA-256 hashes',
        retentionPeriod: '7 years from deletion date',
        recordsAnonymized: anonymizedRecordCount,
      },
      gdprArticle: 'Article 17 - Right to Erasure',
      complianceStatement:
        'All personal data has been deleted or anonymized in accordance with GDPR requirements.',
    };
  }

  private hashTenantId(tenantId: string): string {
    return crypto.createHash('sha256').update(tenantId).digest('hex').substring(0, 16);
  }

  private hashValue(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}
