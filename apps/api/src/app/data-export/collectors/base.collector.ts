import type { ExportDataSection } from '@mentor-ai/shared/types';
import type { PrismaClient } from '@prisma/client';

export abstract class BaseCollector {
  abstract readonly key: string;
  abstract readonly title: string;

  abstract collect(
    prisma: PrismaClient,
    userId: string,
    tenantId: string
  ): Promise<ExportDataSection>;
}
