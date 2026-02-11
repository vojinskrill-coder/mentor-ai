import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { EmailService } from '@mentor-ai/shared/email';
import type {
  RemovalStrategy,
  BackupOwnerResponse,
  BackupOwnerStatus,
  RecoveryResult,
} from '@mentor-ai/shared/types';

export { type RemovalStrategy };

export interface TeamMemberResult {
  id: string;
  email: string;
  name: string | null;
  role: string;
  department: string | null;
  createdAt: Date;
}

export interface RemovalResult {
  removedUserId: string;
  strategy: RemovalStrategy;
}


@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly emailService: EmailService
  ) {}

  async getTeamMembers(tenantId: string): Promise<TeamMemberResult[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        invitationAccepted: {
          select: { department: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.invitationAccepted?.department ?? null,
      createdAt: user.createdAt,
    }));
  }

  async getMemberById(
    memberId: string,
    tenantId: string
  ): Promise<TeamMemberResult> {
    const user = await this.prisma.user.findFirst({
      where: { id: memberId, tenantId, isActive: true },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        invitationAccepted: {
          select: { department: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        type: 'member_not_found',
        title: 'Member Not Found',
        status: 404,
        detail: 'The specified team member was not found.',
      });
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.invitationAccepted?.department ?? null,
      createdAt: user.createdAt,
    };
  }

  async removeMember(
    memberId: string,
    tenantId: string,
    ownerId: string,
    strategy: RemovalStrategy
  ): Promise<RemovalResult> {
    // Verify member exists and belongs to tenant
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, tenantId, isActive: true },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!member) {
      throw new NotFoundException({
        type: 'member_not_found',
        title: 'Member Not Found',
        status: 404,
        detail: 'The specified team member was not found.',
      });
    }

    // Self-removal prevention (AC4)
    if (memberId === ownerId) {
      // Check if this is the only owner
      const ownerCount = await this.prisma.user.count({
        where: {
          tenantId,
          role: 'TENANT_OWNER',
          isActive: true,
        },
      });

      if (ownerCount <= 1) {
        throw new ForbiddenException({
          type: 'self_removal_denied',
          title: 'Cannot Remove Yourself',
          status: 403,
          detail:
            'You cannot remove yourself. Designate a backup Owner first.',
        });
      }
    }

    // Soft delete in a transaction
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: memberId },
        data: {
          isActive: false,
          removedAt: new Date(),
          removedById: ownerId,
          removalReason: strategy,
        },
      });

      // Future: reassign notes/conversations when those models exist
    });

    // Send removal notification email AFTER transaction commits (per dev notes)
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { email: true },
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const emailResult = await this.emailService.sendRemovalNotificationEmail({
      to: member.email,
      memberName: member.name ?? '',
      tenantName: tenant?.name ?? 'Your workspace',
      strategy,
      contactEmail: owner?.email,
    });

    if (!emailResult.success) {
      this.logger.warn(
        `Failed to send removal notification to ${member.email} for tenant ${tenantId}`
      );
    }

    this.logger.log(
      `Member ${memberId} removed from tenant ${tenantId} by ${ownerId} with strategy ${strategy}`
    );

    return { removedUserId: memberId, strategy };
  }

  async getBackupOwner(
    tenantId: string
  ): Promise<BackupOwnerResponse | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        backupOwner: {
          select: {
            id: true,
            email: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    if (
      !tenant?.backupOwner ||
      !tenant.backupOwner.isActive ||
      !tenant.backupOwnerDesignatedAt
    ) {
      return null;
    }

    return {
      id: tenant.backupOwner.id,
      email: tenant.backupOwner.email,
      name: tenant.backupOwner.name,
      designatedAt: tenant.backupOwnerDesignatedAt.toISOString(),
    };
  }

  async getEligibleBackupOwners(
    tenantId: string
  ): Promise<TeamMemberResult[]> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { backupOwnerId: true },
    });

    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        role: { not: 'TENANT_OWNER' },
        ...(tenant?.backupOwnerId
          ? { id: { not: tenant.backupOwnerId } }
          : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        invitationAccepted: {
          select: { department: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.invitationAccepted?.department ?? null,
      createdAt: user.createdAt,
    }));
  }

  async designateBackupOwner(
    tenantId: string,
    backupOwnerId: string,
    designatedById: string
  ): Promise<BackupOwnerResponse> {
    const now = new Date();

    // Validate and designate in a transaction to prevent TOCTOU race
    const candidate = await this.prisma.$transaction(async (tx) => {
      // Verify candidate exists, is active, belongs to tenant
      const user = await tx.user.findFirst({
        where: { id: backupOwnerId, tenantId, isActive: true },
        select: { id: true, email: true, name: true, role: true },
      });

      if (!user) {
        throw new NotFoundException({
          type: 'member_not_found',
          title: 'Member Not Found',
          status: 404,
          detail: 'The specified team member was not found or is inactive.',
        });
      }

      // Prevent TENANT_OWNER from being backup owner
      if (user.role === 'TENANT_OWNER') {
        throw new BadRequestException({
          type: 'invalid_backup_candidate',
          title: 'Invalid Backup Owner Candidate',
          status: 400,
          detail:
            'A Tenant Owner cannot be designated as backup owner. Choose an Admin or Member.',
        });
      }

      // Update tenant with backup owner
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          backupOwnerId: user.id,
          backupOwnerDesignatedAt: now,
        },
      });

      return user;
    });

    // Send email notification AFTER transaction commits
    const designator = await this.prisma.user.findUnique({
      where: { id: designatedById },
      select: { name: true, email: true },
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const emailResult =
      await this.emailService.sendBackupOwnerDesignationEmail({
        to: candidate.email,
        tenantName: tenant?.name ?? 'Your workspace',
        designatedBy: designator?.name ?? designator?.email ?? 'Workspace Owner',
        designatedName: candidate.name ?? '',
      });

    if (!emailResult.success) {
      this.logger.warn(
        `Failed to send backup owner designation email to ${candidate.email} for tenant ${tenantId}`
      );
    }

    this.logger.log(
      `Backup owner designated: ${candidate.id} for tenant ${tenantId} by ${designatedById}`
    );

    return {
      id: candidate.id,
      email: candidate.email,
      name: candidate.name,
      designatedAt: now.toISOString(),
    };
  }

  async removeBackupDesignation(tenantId: string): Promise<void> {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        backupOwnerId: null,
        backupOwnerDesignatedAt: null,
      },
    });

    this.logger.log(`Backup owner designation removed for tenant ${tenantId}`);
  }

  async initiateRecovery(
    tenantId: string,
    backupOwnerId: string,
    ipAddress: string
  ): Promise<RecoveryResult> {
    // Verify caller IS the designated backup owner AND is still active
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        backupOwnerId: true,
        name: true,
        backupOwner: {
          select: { isActive: true },
        },
      },
    });

    if (
      !tenant ||
      tenant.backupOwnerId !== backupOwnerId ||
      !tenant.backupOwner?.isActive
    ) {
      throw new ForbiddenException({
        type: 'not_backup_owner',
        title: 'Not Authorized',
        status: 403,
        detail: 'You are not the designated backup owner for this workspace.',
      });
    }

    // Find the primary owner
    const primaryOwner = await this.prisma.user.findFirst({
      where: { tenantId, role: 'TENANT_OWNER', isActive: true },
      select: { id: true, email: true, name: true },
    });

    if (!primaryOwner) {
      throw new NotFoundException({
        type: 'owner_not_found',
        title: 'Owner Not Found',
        status: 404,
        detail: 'Could not find the primary owner for this workspace.',
      });
    }

    // Reset primary owner's 2FA
    await this.prisma.user.update({
      where: { id: primaryOwner.id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
    });

    // Send recovery notification email AFTER DB update
    const backupOwner = await this.prisma.user.findUnique({
      where: { id: backupOwnerId },
      select: { name: true },
    });

    const emailResult =
      await this.emailService.sendRecoveryNotificationEmail({
        to: primaryOwner.email,
        ownerName: primaryOwner.name ?? '',
        tenantName: tenant.name ?? 'Your workspace',
        backupOwnerName: backupOwner?.name ?? 'Backup Owner',
        recoveryTimestamp: new Date(),
        ipAddress,
      });

    if (!emailResult.success) {
      this.logger.warn(
        `Failed to send recovery notification to ${primaryOwner.email} for tenant ${tenantId}`
      );
    }

    this.logger.log(
      `Recovery initiated for tenant ${tenantId} by backup owner ${backupOwnerId} from IP ${ipAddress}`
    );

    return {
      recoveredUserId: primaryOwner.id,
      message: 'Recovery completed. Primary owner 2FA has been reset.',
    };
  }

  async getBackupOwnerStatus(
    tenantId: string
  ): Promise<BackupOwnerStatus> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        createdAt: true,
        backupOwnerId: true,
        backupOwner: {
          select: { isActive: true },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException({
        type: 'tenant_not_found',
        title: 'Tenant Not Found',
        status: 404,
        detail: 'The specified tenant was not found.',
      });
    }

    const hasBackupOwner =
      !!tenant.backupOwnerId && !!tenant.backupOwner?.isActive;
    const tenantAgeDays = Math.floor(
      (Date.now() - tenant.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    const showWarning = !hasBackupOwner && tenantAgeDays >= 30;

    return { hasBackupOwner, tenantAgeDays, showWarning };
  }
}
