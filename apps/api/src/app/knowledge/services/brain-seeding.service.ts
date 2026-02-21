/**
 * Brain Seeding Service (Story 3.2)
 *
 * Creates initial PENDING task Notes for a new user based on their department.
 * Seeds the Business Brain tree with concepts the user should explore.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';
import { createId } from '@paralleldrive/cuid2';
import {
  getVisibleCategories,
  FOUNDATION_CATEGORIES,
  ALL_CATEGORIES,
} from '../config/department-categories';

@Injectable()
export class BrainSeedingService {
  private readonly logger = new Logger(BrainSeedingService.name);

  /** Max concepts to seed per category for owner initial run */
  private readonly OWNER_KEY_CONCEPTS_PER_CATEGORY = 4;
  /** Max total seed tasks for owner */
  private readonly OWNER_MAX_SEED_TOTAL = 40;
  /** Max total seed tasks for department user */
  private readonly DEPT_MAX_SEED_TOTAL = 30;

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Seeds PENDING task Notes for a new user.
   * Idempotent — skips if user already has pending tasks.
   *
   * For department users: seeds all concepts in visible categories.
   * For PLATFORM_OWNER / TENANT_OWNER: seeds foundation fully + key concepts per category.
   */
  async seedPendingTasksForUser(
    userId: string,
    tenantId: string,
    department: string | null,
    role: string
  ): Promise<{ seeded: number }> {
    // Idempotency guard: skip if user already has pending tasks
    const existingCount = await this.prisma.note.count({
      where: {
        userId,
        tenantId,
        noteType: NoteType.TASK,
        status: NoteStatus.PENDING,
        conceptId: { not: null },
      },
    });

    if (existingCount > 0) {
      this.logger.log({
        message: 'Skipping brain seeding — user already has pending tasks',
        userId,
        tenantId,
        existingCount,
      });
      return { seeded: 0 };
    }

    const isOwner = role === 'PLATFORM_OWNER' || role === 'TENANT_OWNER' || !department;

    let conceptsToSeed: Array<{ id: string; name: string; category: string }>;

    if (isOwner) {
      conceptsToSeed = await this.getOwnerSeedConcepts();
    } else {
      conceptsToSeed = await this.getDepartmentSeedConcepts(department, role);
    }

    if (conceptsToSeed.length === 0) {
      this.logger.warn({
        message: 'No concepts found for brain seeding',
        userId,
        tenantId,
        department,
      });
      return { seeded: 0 };
    }

    // Batch create PENDING task Notes
    const noteData = conceptsToSeed.map((concept) => ({
      id: `note_${createId()}`,
      title: concept.name,
      content: `Istraži koncept: ${concept.name}`,
      source: NoteSource.ONBOARDING,
      noteType: NoteType.TASK,
      status: NoteStatus.PENDING,
      conceptId: concept.id,
      userId,
      tenantId,
    }));

    await this.prisma.note.createMany({ data: noteData });

    this.logger.log({
      message: 'Brain seeding complete',
      userId,
      tenantId,
      department,
      role,
      seeded: noteData.length,
      categories: [...new Set(conceptsToSeed.map((c) => c.category))],
    });

    return { seeded: noteData.length };
  }

  /**
   * Owner seed: foundation categories fully + key concepts per other category.
   */
  private async getOwnerSeedConcepts(): Promise<
    Array<{ id: string; name: string; category: string }>
  > {
    // Seed all foundation concepts
    const foundationConcepts = await this.prisma.concept.findMany({
      where: {
        category: { in: [...FOUNDATION_CATEGORIES] },
      },
      select: { id: true, name: true, category: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Seed key concepts from other categories (first N per category)
    const otherCategories = (ALL_CATEGORIES as readonly string[]).filter(
      (c) => !(FOUNDATION_CATEGORIES as readonly string[]).includes(c)
    );

    // Single query for all non-foundation concepts, then slice per category client-side
    const allOtherConcepts = await this.prisma.concept.findMany({
      where: { category: { in: [...otherCategories] } },
      select: { id: true, name: true, category: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    });

    const otherConcepts: Array<{ id: string; name: string; category: string }> = [];
    const seenPerCategory = new Map<string, number>();
    for (const concept of allOtherConcepts) {
      const count = seenPerCategory.get(concept.category) ?? 0;
      if (count < this.OWNER_KEY_CONCEPTS_PER_CATEGORY) {
        otherConcepts.push({ id: concept.id, name: concept.name, category: concept.category });
        seenPerCategory.set(concept.category, count + 1);
      }
    }

    const combined = [...foundationConcepts, ...otherConcepts];
    return combined.slice(0, this.OWNER_MAX_SEED_TOTAL);
  }

  /**
   * Department seed: all concepts in visible categories (foundation + department).
   */
  private async getDepartmentSeedConcepts(
    department: string | null,
    role: string
  ): Promise<Array<{ id: string; name: string; category: string }>> {
    const visibleCategories = getVisibleCategories(department, role);

    if (!visibleCategories) {
      // No filter = owner path (shouldn't reach here but fallback)
      return this.getOwnerSeedConcepts();
    }

    const concepts = await this.prisma.concept.findMany({
      where: { category: { in: visibleCategories } },
      select: { id: true, name: true, category: true },
      orderBy: { sortOrder: 'asc' },
      take: this.DEPT_MAX_SEED_TOTAL,
    });

    return concepts;
  }
}
