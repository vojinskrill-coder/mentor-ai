import { Injectable } from '@nestjs/common';
import type { ExportDataSection } from '@mentor-ai/shared/types';
import type { PrismaClient } from '@prisma/client';
import { BaseCollector } from './base.collector';

@Injectable()
export class InvitationsCollector extends BaseCollector {
  readonly key = 'invitations';
  readonly title = 'Invitation History';

  async collect(
    prisma: PrismaClient,
    userId: string,
    tenantId: string
  ): Promise<ExportDataSection> {
    const sentInvitations = await prisma.invitation.findMany({
      where: { invitedById: userId, tenantId },
      select: {
        id: true,
        email: true,
        department: true,
        role: true,
        status: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const receivedInvitation = await prisma.invitation.findFirst({
      where: { acceptedByUserId: userId, tenantId },
      select: {
        id: true,
        department: true,
        role: true,
        status: true,
        createdAt: true,
        invitedBy: {
          select: { email: true, name: true },
        },
      },
    });

    const items: Record<string, unknown>[] = [];

    if (receivedInvitation) {
      items.push({
        type: 'received',
        invitationId: receivedInvitation.id,
        department: receivedInvitation.department,
        role: receivedInvitation.role,
        status: receivedInvitation.status,
        invitedBy: receivedInvitation.invitedBy.email,
        date: receivedInvitation.createdAt.toISOString(),
      });
    }

    for (const inv of sentInvitations) {
      items.push({
        type: 'sent',
        invitationId: inv.id,
        recipientEmail: inv.email,
        department: inv.department,
        role: inv.role,
        status: inv.status,
        sentAt: inv.createdAt.toISOString(),
        expiresAt: inv.expiresAt.toISOString(),
      });
    }

    return {
      key: this.key,
      title: this.title,
      items,
      itemCount: items.length,
    };
  }
}
