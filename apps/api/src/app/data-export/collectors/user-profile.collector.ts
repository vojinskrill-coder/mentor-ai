import { Injectable } from '@nestjs/common';
import type { ExportDataSection } from '@mentor-ai/shared/types';
import type { PrismaClient } from '@prisma/client';
import { BaseCollector } from './base.collector';

@Injectable()
export class UserProfileCollector extends BaseCollector {
  readonly key = 'profile';
  readonly title = 'User Profile';

  async collect(
    prisma: PrismaClient,
    userId: string,
    tenantId: string
  ): Promise<ExportDataSection> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        mfaEnabled: true,
      },
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        industry: true,
      },
    });

    const items: Record<string, unknown>[] = [];

    if (user) {
      items.push({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
        accountCreated: user.createdAt.toISOString(),
        lastUpdated: user.updatedAt.toISOString(),
        tenantName: tenant?.name ?? null,
        tenantIndustry: tenant?.industry ?? null,
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
