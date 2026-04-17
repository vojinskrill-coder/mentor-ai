import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { MaturityStage, StageConceptStatus } from '@mentor-ai/shared/types';
import { createId } from '@paralleldrive/cuid2';

interface StalenessResult {
  assignmentId: string;
  conceptId: string;
  reason: string;
}

@Injectable()
export class StalenessDetectorService {
  private readonly logger = new Logger(StalenessDetectorService.name);

  /** Concepts older than this many days are candidates for staleness */
  private readonly TIME_DECAY_DAYS = 30;

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Check if a single completed assignment is stale.
   *
   * Staleness triggers:
   * 1. PREREQUISITE_RERUN: A prerequisite concept was re-executed after this one completed
   * 2. TIME_DECAY: More than 30 days since completion
   */
  async checkStaleness(
    tenantId: string,
    assignmentId: string
  ): Promise<{ isStale: boolean; reason?: string }> {
    const assignment = await this.prisma.stageConceptAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment || assignment.status !== StageConceptStatus.COMPLETED || !assignment.completedAt) {
      return { isStale: false };
    }

    // Check 1: PREREQUISITE_RERUN
    // Find prerequisite concepts for this assignment's concept
    const prerequisites = await this.prisma.conceptRelationship.findMany({
      where: {
        targetConceptId: assignment.conceptId,
        relationshipType: 'PREREQUISITE',
      },
      select: { sourceConceptId: true },
    });

    if (prerequisites.length > 0) {
      const prereqConceptIds = prerequisites.map((p) => p.sourceConceptId);

      // Check if any prerequisite was completed AFTER this assignment
      const rerunPrereqs = await this.prisma.stageConceptAssignment.findMany({
        where: {
          tenantId,
          conceptId: { in: prereqConceptIds },
          stage: assignment.stage,
          status: StageConceptStatus.COMPLETED,
          completedAt: { gt: assignment.completedAt },
        },
        select: { conceptId: true },
      });

      if (rerunPrereqs.length > 0) {
        const firstPrereq = rerunPrereqs[0]!;
        const concept = await this.prisma.concept.findUnique({
          where: { id: firstPrereq.conceptId },
          select: { name: true },
        });
        return {
          isStale: true,
          reason: `Prerequisite concept "${concept?.name || firstPrereq.conceptId}" was re-executed after this concept was completed`,
        };
      }
    }

    // Check 2: TIME_DECAY
    const daysSinceCompletion = Math.floor(
      (Date.now() - assignment.completedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceCompletion > this.TIME_DECAY_DAYS) {
      return {
        isStale: true,
        reason: `Analysis is older than ${this.TIME_DECAY_DAYS} days (${daysSinceCompletion} days)`,
      };
    }

    return { isStale: false };
  }

  /**
   * Batch scan: check all COMPLETED assignments in a stage for staleness.
   * Uses batch queries (4 total) instead of per-assignment queries.
   */
  async scanStage(
    tenantId: string,
    stage: MaturityStage
  ): Promise<StalenessResult[]> {
    // Query 1: Load all COMPLETED assignments
    const completedAssignments = await this.prisma.stageConceptAssignment.findMany({
      where: { tenantId, stage, status: StageConceptStatus.COMPLETED },
    });

    if (completedAssignments.length === 0) return [];

    const conceptIds = completedAssignments.map((a) => a.conceptId);

    // Query 2: Batch load ALL prerequisites for ALL completed concepts
    const allPrereqs = await this.prisma.conceptRelationship.findMany({
      where: {
        targetConceptId: { in: conceptIds },
        relationshipType: 'PREREQUISITE',
      },
      select: { sourceConceptId: true, targetConceptId: true },
    });

    // Group prerequisites by target concept
    const prereqsByTarget = new Map<string, string[]>();
    const allPrereqConceptIds = new Set<string>();
    for (const p of allPrereqs) {
      const list = prereqsByTarget.get(p.targetConceptId) ?? [];
      list.push(p.sourceConceptId);
      prereqsByTarget.set(p.targetConceptId, list);
      allPrereqConceptIds.add(p.sourceConceptId);
    }

    // Query 3: Batch load prerequisite assignments that completed
    const prereqAssignments = allPrereqConceptIds.size > 0
      ? await this.prisma.stageConceptAssignment.findMany({
          where: {
            tenantId,
            conceptId: { in: [...allPrereqConceptIds] },
            stage,
            status: StageConceptStatus.COMPLETED,
          },
          select: { conceptId: true, completedAt: true },
        })
      : [];

    const prereqCompletionMap = new Map<string, Date>();
    for (const pa of prereqAssignments) {
      if (pa.completedAt) {
        prereqCompletionMap.set(pa.conceptId, pa.completedAt);
      }
    }

    // Query 4: Batch load concept names for stale reason messages
    const conceptNames = allPrereqConceptIds.size > 0
      ? await this.prisma.concept.findMany({
          where: { id: { in: [...allPrereqConceptIds] } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(conceptNames.map((c) => [c.id, c.name]));

    // Process in-memory — no more DB queries
    const staleResults: StalenessResult[] = [];

    for (const assignment of completedAssignments) {
      if (!assignment.completedAt) continue;

      // Check 1: PREREQUISITE_RERUN
      const prereqIds = prereqsByTarget.get(assignment.conceptId) ?? [];
      let foundStale = false;
      for (const prereqId of prereqIds) {
        const prereqCompletedAt = prereqCompletionMap.get(prereqId);
        if (prereqCompletedAt && prereqCompletedAt > assignment.completedAt) {
          staleResults.push({
            assignmentId: assignment.id,
            conceptId: assignment.conceptId,
            reason: `Prerequisite concept "${nameMap.get(prereqId) || prereqId}" was re-executed after this concept was completed`,
          });
          foundStale = true;
          break;
        }
      }

      if (foundStale) continue;

      // Check 2: TIME_DECAY
      const daysSinceCompletion = Math.floor(
        (Date.now() - assignment.completedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceCompletion > this.TIME_DECAY_DAYS) {
        staleResults.push({
          assignmentId: assignment.id,
          conceptId: assignment.conceptId,
          reason: `Analysis is older than ${this.TIME_DECAY_DAYS} days (${daysSinceCompletion} days)`,
        });
      }
    }

    if (staleResults.length > 0) {
      this.logger.log({
        message: 'Staleness scan complete',
        tenantId,
        stage,
        totalCompleted: completedAssignments.length,
        staleCount: staleResults.length,
      });
    }

    return staleResults;
  }

  /**
   * Mark a concept as STALE and create a new PENDING task Note for re-execution.
   * Uses a transaction to prevent duplicate Notes from concurrent calls.
   */
  async triggerReExecution(
    tenantId: string,
    conceptId: string,
    reason: string,
    userId: string,
    stage?: MaturityStage
  ): Promise<{ newNoteId: string; version: number }> {
    return this.prisma.$transaction(async (tx) => {
      // Atomic: find COMPLETED assignment inside transaction
      const where: Record<string, unknown> = {
        tenantId,
        conceptId,
        status: StageConceptStatus.COMPLETED,
      };
      if (stage) where['stage'] = stage;

      const assignment = await tx.stageConceptAssignment.findFirst({ where });

      if (!assignment) {
        throw new Error(`No completed assignment found for concept ${conceptId}`);
      }

      const concept = await tx.concept.findUnique({
        where: { id: conceptId },
        select: { name: true },
      });

      const newNoteId = `note_${createId()}`;
      const newVersion = assignment.version + 1;

      // Create new PENDING task note, linked to previous via reusedFromNoteId
      await tx.note.create({
        data: {
          id: newNoteId,
          title: `${concept?.name || conceptId} (v${newVersion})`,
          content: `Re-analysis of concept: ${concept?.name || conceptId}\nReason: ${reason}`,
          source: 'CONVERSATION',
          noteType: 'TASK',
          status: 'PENDING',
          conceptId,
          userId,
          tenantId,
          reusedFromNoteId: assignment.noteId,
        },
      });

      // Update assignment: mark STALE, increment version, link to new note
      await tx.stageConceptAssignment.update({
        where: { id: assignment.id },
        data: {
          status: StageConceptStatus.STALE,
          staleReason: reason,
          version: newVersion,
          noteId: newNoteId,
        },
      });

      this.logger.log({
        message: 'Re-execution triggered',
        tenantId,
        conceptId,
        conceptName: concept?.name,
        reason,
        newVersion,
        newNoteId,
      });

      return { newNoteId, version: newVersion };
    });
  }
}
