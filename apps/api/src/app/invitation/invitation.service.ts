import {
  Injectable,
  Logger,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  GoneException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import {
  generateInvitationId,
  generateInviteToken,
} from '@mentor-ai/shared/utils';
import { InvitationStatus, Department, UserRole } from '@mentor-ai/shared/prisma';
import { EmailService } from '@mentor-ai/shared/email';
import { CreateInvitationDto } from './dto/create-invitation.dto';

export interface InvitationResult {
  id: string;
  email: string;
  department: Department;
  status: InvitationStatus;
  token: string;
  expiresAt: Date;
  tenantId: string;
  invitedById: string;
  createdAt: Date;
}

export interface UserLimitCheck {
  allowed: boolean;
  currentCount: number;
  limit: number;
}

export interface InvitationWithDetails {
  id: string;
  email: string;
  department: Department;
  role: UserRole;
  status: InvitationStatus;
  token: string;
  expiresAt: Date;
  tenantId: string;
  invitedById: string;
  acceptedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  tenant: { name: string };
  invitedBy: { email: string; name: string | null };
}

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);
  private readonly maxTeamMembers: number;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService
  ) {
    this.maxTeamMembers = this.configService.get<number>(
      'MAX_TEAM_MEMBERS',
      5
    );
    this.appUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:4200'
    );
  }

  async checkUserLimit(tenantId: string): Promise<UserLimitCheck> {
    const [activeUsers, pendingInvitations] = await Promise.all([
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.invitation.count({
        where: {
          tenantId,
          status: InvitationStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
      }),
    ]);

    const currentCount = activeUsers + pendingInvitations;
    return {
      allowed: currentCount < this.maxTeamMembers,
      currentCount,
      limit: this.maxTeamMembers,
    };
  }

  async createInvitation(
    dto: CreateInvitationDto,
    inviterId: string,
    tenantId: string
  ): Promise<InvitationResult> {
    const normalizedEmail = dto.email.toLowerCase();

    // Check user limit
    const limitCheck = await this.checkUserLimit(tenantId);
    if (!limitCheck.allowed) {
      throw new ForbiddenException({
        type: 'user_limit_reached',
        title: 'User Limit Reached',
        status: 403,
        detail:
          'User limit reached. Upgrade your plan to add more team members.',
        currentCount: limitCheck.currentCount,
        limit: limitCheck.limit,
      });
    }

    // Check for duplicate pending invitation
    const existingInvitation = await this.prisma.invitation.findFirst({
      where: {
        email: normalizedEmail,
        tenantId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvitation) {
      throw new ConflictException({
        type: 'duplicate_invitation',
        title: 'Duplicate Invitation',
        status: 409,
        detail:
          'A pending invitation already exists for this email address in your workspace.',
      });
    }

    // Check if email is already a member of the tenant
    const existingMember = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, tenantId },
    });

    if (existingMember) {
      throw new ConflictException({
        type: 'already_member',
        title: 'Already a Member',
        status: 409,
        detail: 'This user is already a member of your workspace.',
      });
    }

    const invitationId = generateInvitationId();
    const token = generateInviteToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await this.prisma.invitation.create({
      data: {
        id: invitationId,
        email: normalizedEmail,
        department: dto.department,
        status: InvitationStatus.PENDING,
        token,
        expiresAt,
        tenantId,
        invitedById: inviterId,
      },
    });

    // Send invitation email
    const inviter = await this.prisma.user.findUnique({
      where: { id: inviterId },
      select: { name: true, email: true },
    });
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const inviteLink = `${this.appUrl}/invite/${token}`;

    const emailResult = await this.emailService.sendInvitationEmail({
      to: normalizedEmail,
      inviterName: inviter?.name ?? inviter?.email ?? 'A team member',
      tenantName: tenant?.name ?? 'Your workspace',
      inviteLink,
      department: dto.department,
    });

    if (!emailResult.success) {
      this.logger.warn(
        `Failed to send invitation email to ${normalizedEmail} for tenant ${tenantId}`
      );
    }

    return {
      id: invitation.id,
      email: invitation.email,
      department: invitation.department,
      status: invitation.status,
      token: invitation.token,
      expiresAt: invitation.expiresAt,
      tenantId: invitation.tenantId,
      invitedById: invitation.invitedById,
      createdAt: invitation.createdAt,
    };
  }

  async getInvitationsByTenant(
    tenantId: string
  ): Promise<InvitationWithDetails[]> {
    return this.prisma.invitation.findMany({
      where: { tenantId },
      include: {
        tenant: { select: { name: true } },
        invitedBy: { select: { email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingInvitations(
    tenantId: string
  ): Promise<InvitationWithDetails[]> {
    const now = new Date();

    // Auto-expire stale invitations
    await this.prisma.invitation.updateMany({
      where: {
        tenantId,
        status: InvitationStatus.PENDING,
        expiresAt: { lt: now },
      },
      data: { status: InvitationStatus.EXPIRED },
    });

    return this.prisma.invitation.findMany({
      where: {
        tenantId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: now },
      },
      include: {
        tenant: { select: { name: true } },
        invitedBy: { select: { email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async validateInviteToken(token: string): Promise<InvitationWithDetails> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: {
        tenant: { select: { name: true } },
        invitedBy: { select: { email: true, name: true } },
      },
    });

    if (!invitation) {
      throw new NotFoundException({
        type: 'invitation_not_found',
        title: 'Invitation Not Found',
        status: 404,
        detail: 'This invitation link is invalid.',
      });
    }

    if (invitation.status === InvitationStatus.REVOKED) {
      throw new GoneException({
        type: 'invitation_revoked',
        title: 'Invitation Revoked',
        status: 410,
        detail:
          'This invitation has been revoked. Please request a new invite.',
      });
    }

    if (
      invitation.status === InvitationStatus.EXPIRED ||
      invitation.expiresAt < new Date()
    ) {
      // Auto-update status if expired
      if (invitation.status === InvitationStatus.PENDING) {
        await this.prisma.invitation.update({
          where: { id: invitation.id },
          data: { status: InvitationStatus.EXPIRED },
        });
      }

      throw new GoneException({
        type: 'invitation_expired',
        title: 'Invitation Expired',
        status: 410,
        detail:
          'This invitation has expired. Please request a new invite.',
      });
    }

    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new ConflictException({
        type: 'invitation_already_accepted',
        title: 'Already Accepted',
        status: 409,
        detail: 'This invitation has already been accepted.',
      });
    }

    return invitation;
  }

  async acceptInvitation(
    token: string,
    userId: string,
    userEmail: string
  ): Promise<{ tenantId: string; role: string; department: Department }> {
    const invitation = await this.validateInviteToken(token);

    // Use transaction for atomicity
    return this.prisma.$transaction(async (tx) => {
      // Check if user already belongs to this tenant
      const existingUser = await tx.user.findFirst({
        where: { email: userEmail.toLowerCase(), tenantId: invitation.tenantId },
      });

      if (existingUser) {
        // User already a member, just mark invitation accepted
        await tx.invitation.update({
          where: { id: invitation.id },
          data: {
            status: InvitationStatus.ACCEPTED,
            acceptedByUserId: existingUser.id,
          },
        });

        return {
          tenantId: invitation.tenantId,
          role: existingUser.role,
          department: invitation.department,
        };
      }

      // Add user to the invited tenant
      await tx.user.update({
        where: { id: userId },
        data: {
          tenantId: invitation.tenantId,
          role: invitation.role,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedByUserId: userId,
        },
      });

      return {
        tenantId: invitation.tenantId,
        role: invitation.role,
        department: invitation.department,
      };
    });
  }

  async revokeInvitation(
    invitationId: string,
    tenantId: string
  ): Promise<void> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      throw new NotFoundException({
        type: 'invitation_not_found',
        title: 'Invitation Not Found',
        status: 404,
        detail: 'The specified invitation was not found.',
      });
    }

    if (invitation.tenantId !== tenantId) {
      throw new ForbiddenException({
        type: 'invitation_access_denied',
        title: 'Access Denied',
        status: 403,
        detail: 'You do not have permission to revoke this invitation.',
      });
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ConflictException({
        type: 'invitation_not_pending',
        title: 'Cannot Revoke',
        status: 409,
        detail: `Cannot revoke invitation with status: ${invitation.status}`,
      });
    }

    await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.REVOKED },
    });
  }
}
