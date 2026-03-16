import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';
import {
  MaturityStage,
  PersonaType,
  StageConceptStatus,
  StageProgressSummary,
  PrerequisiteCheckResult,
  PersonaStageProgress,
} from '@mentor-ai/shared/types';
import { StageClassifierService } from './stage-classifier.service';
import { WsServerHolder } from './ws-server-holder.service';
import { HeadlessExecutorService } from './headless-executor.service';
import { CrossPersonaIntelligenceService } from './cross-persona-intelligence.service';
import { Department } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import {
  DEPARTMENT_CATEGORY_MAP,
  FOUNDATION_CATEGORIES,
} from '../knowledge/config/department-categories';

/** Maps PersonaType to Department for category resolution */
const PERSONA_TO_DEPARTMENT: Record<PersonaType, Department> = {
  [PersonaType.CFO]: Department.FINANCE,
  [PersonaType.CMO]: Department.MARKETING,
  [PersonaType.CTO]: Department.TECHNOLOGY,
  [PersonaType.OPERATIONS]: Department.OPERATIONS,
  [PersonaType.LEGAL]: Department.LEGAL,
  [PersonaType.CREATIVE]: Department.CREATIVE,
  [PersonaType.CSO]: Department.STRATEGY,
  [PersonaType.SALES]: Department.SALES,
};

const STAGE_ORDER: MaturityStage[] = [
  MaturityStage.BASIC,
  MaturityStage.ADVANCED,
  MaturityStage.AUTONOMOUS,
];

@Injectable()
export class MaturityEngineService {
  private readonly logger = new Logger(MaturityEngineService.name);
  /** Tracks running stage executions per tenant to prevent concurrent runs */
  private readonly runningExecutions = new Set<string>();
  /** Tracks running stage initializations per tenant */
  private readonly initializingTenants = new Set<string>();
  /** Tracks execution progress per tenant for API polling (dashboard page load) */
  private readonly executionProgress = new Map<string, {
    total: number; executed: number; failed: number; current: string | null;
  }>();

  private readonly stageConcurrency: number;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly classifier: StageClassifierService,
    private readonly wsHolder: WsServerHolder,
    @Inject(forwardRef(() => HeadlessExecutorService))
    private readonly headlessExecutor: HeadlessExecutorService,
    private readonly crossPersonaIntelligence: CrossPersonaIntelligenceService,
    private readonly configService: ConfigService,
  ) {
    // Run up to 3 independent tasks in parallel within each wave.
    // Agent jobs within each task run sequentially (executeJobsInOrder),
    // so peak concurrent OpenClaw processes = STAGE_MAX_CONCURRENCY.
    // OpenClaw gateway maxConcurrent=5 with persistent sessions means
    // max 5 agents can write to session files simultaneously.
    // Higher values cause session file lock contention (10s timeout → kill).
    this.stageConcurrency = parseInt(
      this.configService.get<string>('STAGE_MAX_CONCURRENCY') ?? '3', 10,
    );
  }

  // ─── Stage Initialization ───

  /**
   * Initialize a stage for a tenant. For each of 8 personas:
   * 1. Load visible concepts for that persona's department categories
   * 2. Call StageClassifier to select relevant ones
   * 3. Create StageConceptAssignment rows
   * 4. Handle cross-persona overlaps via unique constraint
   */
  async initializeStage(
    tenantId: string,
    stage: MaturityStage,
    userId: string
  ): Promise<{ assignmentCount: number }> {
    this.logger.log({ message: 'Initializing stage', tenantId, stage });
    this.initializingTenants.add(tenantId);

    try {
      // Idempotency guard: skip if stage already has assignments
      const existingCount = await this.prisma.stageConceptAssignment.count({
        where: { tenantId, stage },
      });
      if (existingCount > 0) {
        this.logger.log({ message: 'Stage already initialized, skipping', tenantId, stage, existingCount });
        return { assignmentCount: existingCount };
      }

      // Set tenant maturity stage if not set
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { maturityStage: stage },
      });

      const allPersonas = Object.values(PersonaType) as PersonaType[];
      let totalAssignments = 0;

      for (let i = 0; i < allPersonas.length; i++) {
        const personaType = allPersonas[i]!;

        // Emit progress so frontend can show "Pripremam CFO... (3/8)"
        this.wsHolder.emitToTenant(tenantId, 'maturity:init-progress', {
          stage,
          persona: personaType,
          personaIndex: i,
          totalPersonas: allPersonas.length,
          assignedSoFar: totalAssignments,
        });

        try {
          const count = await this.classifyAndAssignForPersona(
            tenantId,
            stage,
            personaType,
            userId
          );
          totalAssignments += count;
        } catch (err) {
          this.logger.error({
            message: 'Failed to classify for persona',
            personaType,
            stage,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      }

      // Reconcile: mark assignments COMPLETED if brain-seeded notes already finished
      await this.reconcileBrainSeededCompletions(tenantId, stage);

      // Create Note TASK records for all PENDING assignments (bridges gap with Brain tree)
      const noteCount = await this.createNotesForPendingAssignments(tenantId, stage, userId);

      // Re-count after reconciliation
      const finalCount = await this.prisma.stageConceptAssignment.count({
        where: { tenantId, stage },
      });

      this.logger.log({
        message: 'Stage initialization complete',
        tenantId,
        stage,
        totalAssignments: finalCount,
        notesCreated: noteCount,
      });

      // Notify frontend that stage is ready
      this.wsHolder.emitToTenant(tenantId, 'maturity:stage-initialized', {
        stage,
        assignmentCount: finalCount,
        noteCount,
      });

      // Stage is prepared — execution must be triggered explicitly via the dashboard
      // (POST /api/v1/maturity/stage/:stage/execute)
      return { assignmentCount: finalCount };
    } finally {
      this.initializingTenants.delete(tenantId);
    }
  }

  private async classifyAndAssignForPersona(
    tenantId: string,
    stage: MaturityStage,
    personaType: PersonaType,
    userId: string
  ): Promise<number> {
    const department = PERSONA_TO_DEPARTMENT[personaType];
    const deptCategories = DEPARTMENT_CATEGORY_MAP[department] ?? [];
    const visibleCategories = [...new Set([...FOUNDATION_CATEGORIES, ...deptCategories])];

    // Load concepts in this persona's visible categories
    const concepts = await this.prisma.concept.findMany({
      where: {
        OR: visibleCategories.flatMap((cat) => [
          { category: cat },
          { category: { contains: cat } },
        ]),
      },
      select: { id: true, name: true, category: true, definition: true },
    });

    if (concepts.length === 0) return 0;

    // Use LLM classifier to select relevant concepts for this stage
    const classified = await this.classifier.classifyForStage({
      tenantId,
      userId,
      stage,
      personaType,
      availableConcepts: concepts,
    });

    // Create assignments, skipping duplicates (unique constraint handles cross-persona overlap)
    let created = 0;
    for (const item of classified) {
      try {
        await this.prisma.stageConceptAssignment.create({
          data: {
            tenantId,
            conceptId: item.conceptId,
            stage,
            personaType,
            priority: item.priority,
            status: StageConceptStatus.PENDING,
          },
        });
        created++;
      } catch (err) {
        // Unique constraint violation = another persona already assigned this concept
        if (
          err instanceof Error &&
          err.message.includes('Unique constraint')
        ) {
          this.logger.debug({
            message: 'Concept already assigned by another persona',
            conceptId: item.conceptId,
            personaType,
            stage,
          });
        } else {
          throw err;
        }
      }
    }

    this.logger.log({
      message: 'Persona classification complete',
      personaType,
      stage,
      available: concepts.length,
      classified: classified.length,
      created,
    });

    return created;
  }

  // ─── Stage Progress ───

  /**
   * Get progress summary for a stage.
   */
  async getStageProgress(
    tenantId: string,
    stage: MaturityStage
  ): Promise<StageProgressSummary> {
    const assignments = await this.prisma.stageConceptAssignment.findMany({
      where: { tenantId, stage },
    });

    // Single-pass aggregation for global + per-persona counts
    const byPersona: Record<string, PersonaStageProgress> = {};
    let completed = 0, inProgress = 0, pending = 0, stale = 0;

    for (const a of assignments) {
      // Global counts
      switch (a.status) {
        case StageConceptStatus.COMPLETED: completed++; break;
        case StageConceptStatus.IN_PROGRESS: inProgress++; break;
        case StageConceptStatus.PENDING: pending++; break;
        case StageConceptStatus.STALE: stale++; break;
      }

      // Per-persona counts
      const pt = a.personaType;
      if (!byPersona[pt]) {
        byPersona[pt] = { total: 0, completed: 0, pending: 0, inProgress: 0 };
      }
      byPersona[pt].total++;
      if (a.status === StageConceptStatus.COMPLETED) byPersona[pt].completed++;
      else if (a.status === StageConceptStatus.PENDING) byPersona[pt].pending++;
      else if (a.status === StageConceptStatus.IN_PROGRESS) byPersona[pt].inProgress++;
    }

    // Ensure all persona types are present (even with 0 counts)
    for (const pt of Object.values(PersonaType)) {
      if (!byPersona[pt]) {
        byPersona[pt] = { total: 0, completed: 0, pending: 0, inProgress: 0 };
      }
    }

    const total = assignments.length;

    return {
      stage,
      totalAssignments: total,
      completed,
      inProgress,
      pending,
      stale,
      completionPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
      byPersona,
      canTransition: total > 0 && completed === total,
    };
  }

  /**
   * Called when a concept task completes. Updates assignment status.
   * Checks if ALL agent jobs for the task are done before marking COMPLETED.
   */
  // ─── Graph Data ───

  /**
   * Returns graph visualization data: only concepts with active tasks,
   * edges between them, and currently active agents.
   */
  async getGraphData(tenantId: string, stage: MaturityStage): Promise<{
    nodes: Array<{
      id: string; name: string; category: string; status: string;
      personaType: string; aiScore: number | null; noteId: string;
    }>;
    edges: Array<{ source: string; target: string; type: string }>;
    activeAgents: Array<{
      agentType: string; conceptId: string; personaType: string; status: string;
    }>;
  }> {
    // Nodes: only concepts with assigned notes (active tasks)
    const assignments = await this.prisma.stageConceptAssignment.findMany({
      where: { tenantId, stage, noteId: { not: null } },
      select: {
        conceptId: true, status: true, personaType: true, noteId: true,
      },
    });

    if (assignments.length === 0) {
      return { nodes: [], edges: [], activeAgents: [] };
    }

    const conceptIds = assignments.map((a) => a.conceptId);

    // Batch load concept info
    const concepts = await this.prisma.concept.findMany({
      where: { id: { in: conceptIds } },
      select: { id: true, name: true, category: true },
    });
    const conceptMap = new Map(concepts.map((c) => [c.id, c]));

    // Batch load note scores
    const noteIds = assignments.filter((a) => a.noteId).map((a) => a.noteId!);
    const notes = noteIds.length > 0
      ? await this.prisma.note.findMany({
          where: { id: { in: noteIds } },
          select: { id: true, aiScore: true },
        })
      : [];
    const noteScoreMap = new Map(notes.map((n) => [n.id, n.aiScore]));

    // Build nodes
    const nodes = assignments.map((a) => {
      const concept = conceptMap.get(a.conceptId);
      return {
        id: a.conceptId,
        name: concept?.name ?? a.conceptId,
        category: concept?.category ?? '',
        status: a.status,
        personaType: a.personaType,
        aiScore: a.noteId ? (noteScoreMap.get(a.noteId) ?? null) : null,
        noteId: a.noteId!,
      };
    });

    // Edges: only between concepts where BOTH are in the active set
    const conceptIdSet = new Set(conceptIds);
    const relationships = await this.prisma.conceptRelationship.findMany({
      where: {
        sourceConceptId: { in: conceptIds },
        targetConceptId: { in: conceptIds },
      },
      select: { sourceConceptId: true, targetConceptId: true, relationshipType: true },
    });

    const edgeSet = new Set<string>();
    const edges: Array<{ source: string; target: string; type: string }> = [];
    for (const rel of relationships) {
      if (conceptIdSet.has(rel.sourceConceptId) && conceptIdSet.has(rel.targetConceptId)) {
        const key = `${rel.sourceConceptId}:${rel.targetConceptId}:${rel.relationshipType}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({
            source: rel.sourceConceptId,
            target: rel.targetConceptId,
            type: rel.relationshipType,
          });
        }
      }
    }

    // Active agents: running executions linked to concept assignments
    const activeExecs = await this.prisma.agentExecution.findMany({
      where: {
        tenantId,
        status: { in: ['PENDING', 'FORMATTING', 'EXECUTING'] },
      },
      select: { noteId: true, agentType: true, status: true },
    });

    // Map execution noteId → conceptId via assignments
    const noteToAssignment = new Map(
      assignments.map((a) => [a.noteId, a]),
    );

    const activeAgents = activeExecs
      .filter((e) => noteToAssignment.has(e.noteId))
      .map((e) => {
        const assignment = noteToAssignment.get(e.noteId)!;
        return {
          agentType: e.agentType,
          conceptId: assignment.conceptId,
          personaType: assignment.personaType,
          status: e.status,
        };
      });

    return { nodes, edges, activeAgents };
  }

  async onConceptCompleted(
    tenantId: string,
    conceptId: string,
    noteId: string,
    userId: string
  ): Promise<{ stageCompleted: boolean; nextStage?: MaturityStage }> {
    // Get tenant's current stage
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { maturityStage: true },
    });

    if (!tenant?.maturityStage) {
      return { stageCompleted: false };
    }

    const stage = tenant.maturityStage as MaturityStage;

    // Find matching assignment
    const assignment = await this.prisma.stageConceptAssignment.findUnique({
      where: {
        tenantId_conceptId_stage: { tenantId, conceptId, stage },
      },
    });

    if (!assignment) {
      // Retroactive: brain-seeded task completed before stage initialization
      try {
        await this.prisma.stageConceptAssignment.create({
          data: {
            tenantId,
            conceptId,
            stage,
            personaType: PersonaType.CFO, // Default for retroactive assignments
            priority: 999,
            status: StageConceptStatus.COMPLETED,
            completedAt: new Date(),
            noteId,
          },
        });
        this.logger.log({
          message: 'Retroactive stage assignment created for brain-seeded task',
          tenantId, conceptId, stage, noteId,
        });
      } catch {
        // Unique constraint = assignment already exists (race), safe to ignore
      }
      return { stageCompleted: false };
    }

    // Idempotency: skip if already completed
    if (assignment.status === StageConceptStatus.COMPLETED) {
      return { stageCompleted: false };
    }

    // Check if agent jobs are still actively running (block only on in-progress jobs)
    // PLANNED (never started) and FAILED (terminal) do NOT block completion —
    // they can be retried later without holding up the stage pipeline.
    const agentJobs = await this.prisma.agentJob.findMany({
      where: { noteId, tenantId },
      select: { status: true },
    });
    const activeJobs = agentJobs.filter((j) =>
      ['RUNNING', 'PENDING', 'EXECUTING', 'FORMATTING'].includes(j.status),
    );
    const allJobsDone = activeJobs.length === 0;

    if (!allJobsDone) {
      // Mark as IN_PROGRESS — jobs still running
      if (assignment.status === StageConceptStatus.PENDING) {
        await this.prisma.stageConceptAssignment.update({
          where: { id: assignment.id },
          data: { status: StageConceptStatus.IN_PROGRESS, noteId },
        });
      }
      return { stageCompleted: false };
    }

    // Mark assignment as COMPLETED
    await this.prisma.stageConceptAssignment.update({
      where: { id: assignment.id },
      data: {
        status: StageConceptStatus.COMPLETED,
        completedAt: new Date(),
        noteId,
      },
    });

    this.logger.log({
      message: 'Stage concept completed',
      tenantId,
      conceptId,
      stage,
      noteId,
    });

    // Check if entire stage is now complete
    const progress = await this.getStageProgress(tenantId, stage);
    if (progress.canTransition) {
      // Log stage completion
      await this.prisma.stageCompletionLog.create({
        data: {
          tenantId,
          stage,
          completedAt: new Date(),
          totalConcepts: progress.totalAssignments,
          triggeredBy: userId,
        },
      });

      const nextStage = this.getNextStage(stage);
      return { stageCompleted: true, nextStage: nextStage ?? undefined };
    }

    return { stageCompleted: false };
  }

  // ─── Cross-Concept Ordering (Soft Gate) ───

  /**
   * Check if a concept's PREREQUISITE concepts are completed within this stage.
   * Returns warnings (not blocking) + prerequisite outputs for context injection.
   */
  async checkPrerequisites(
    tenantId: string,
    conceptId: string,
    stage: MaturityStage
  ): Promise<PrerequisiteCheckResult> {
    // Find prerequisites for this concept
    const prerequisites = await this.prisma.conceptRelationship.findMany({
      where: {
        targetConceptId: conceptId,
        relationshipType: 'PREREQUISITE',
      },
      include: {
        sourceConcept: { select: { id: true, name: true } },
      },
    });

    if (prerequisites.length === 0) {
      return { canProceed: true, warnings: [], prerequisiteOutputs: [] };
    }

    const prereqConceptIds = prerequisites.map((p) => p.sourceConceptId);

    // Check assignment status of each prerequisite
    const prereqAssignments = await this.prisma.stageConceptAssignment.findMany({
      where: {
        tenantId,
        conceptId: { in: prereqConceptIds },
        stage,
      },
    });

    const assignmentMap = new Map(
      prereqAssignments.map((a) => [a.conceptId, a])
    );

    const warnings: PrerequisiteCheckResult['warnings'] = [];
    const prerequisiteOutputs: PrerequisiteCheckResult['prerequisiteOutputs'] = [];

    // Batch load all completed prerequisite notes in a single query
    const noteIdsToLoad = prereqAssignments
      .filter((a) => a.status === StageConceptStatus.COMPLETED && a.noteId)
      .map((a) => a.noteId!);

    const notes = noteIdsToLoad.length > 0
      ? await this.prisma.note.findMany({
          where: { id: { in: noteIdsToLoad } },
          select: { id: true, userReport: true, content: true },
        })
      : [];
    const noteMap = new Map(notes.map((n) => [n.id, n]));

    for (const prereq of prerequisites) {
      const assignment = assignmentMap.get(prereq.sourceConceptId);
      const conceptName = prereq.sourceConcept.name;

      if (!assignment || assignment.status !== StageConceptStatus.COMPLETED) {
        const status = assignment?.status ?? StageConceptStatus.PENDING;
        warnings.push({
          conceptName,
          status: status as StageConceptStatus,
          message: `Koncept "${conceptName}" još nije završen (status: ${status}). Rezultati mogu biti nepotpuni.`,
        });
      } else if (assignment.noteId) {
        const note = noteMap.get(assignment.noteId);
        if (note) {
          const output = note.userReport || note.content;
          prerequisiteOutputs.push({
            conceptName,
            outputSummary: output.substring(0, 2000),
          });
        }
      }
    }

    return {
      canProceed: warnings.length === 0,
      warnings,
      prerequisiteOutputs,
    };
  }

  // ─── Stage Transition ───

  /**
   * Transition tenant to next stage if current is complete.
   */
  async transitionToNextStage(
    tenantId: string,
    userId: string
  ): Promise<{ newStage: MaturityStage }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { maturityStage: true },
    });

    if (!tenant?.maturityStage) {
      throw new Error('Maturity engine not initialized');
    }

    const currentStage = tenant.maturityStage as MaturityStage;

    // Verify current stage is complete
    const progress = await this.getStageProgress(tenantId, currentStage);
    if (!progress.canTransition) {
      throw new Error(
        `Cannot transition: stage ${currentStage} is not complete (${progress.completed}/${progress.totalAssignments})`
      );
    }

    const nextStage = this.getNextStage(currentStage);
    if (!nextStage) {
      throw new Error('Already at maximum maturity stage (AUTONOMOUS)');
    }

    // Initialize next stage
    const result = await this.initializeStage(tenantId, nextStage, userId);

    this.logger.log({
      message: 'Stage transition complete',
      tenantId,
      from: currentStage,
      to: nextStage,
      newAssignments: result.assignmentCount,
    });

    return { newStage: nextStage };
  }

  // ─── Task Linking ───

  /**
   * Link newly discovered tasks to existing stage assignments.
   * Called from discoverAndCreatePendingTasks().
   */
  async linkDiscoveredTasksToStage(
    tenantId: string,
    tasks: Array<{ noteId: string; conceptId: string }>
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { maturityStage: true },
    });

    if (!tenant?.maturityStage) return;

    const stage = tenant.maturityStage as MaturityStage;

    for (const task of tasks) {
      // Update assignment if it exists and is PENDING
      await this.prisma.stageConceptAssignment.updateMany({
        where: {
          tenantId,
          conceptId: task.conceptId,
          stage,
          status: StageConceptStatus.PENDING,
          noteId: null,
        },
        data: {
          noteId: task.noteId,
          status: StageConceptStatus.IN_PROGRESS,
        },
      });
    }
  }

  // ─── Note Creation + Auto-Execution ───

  /**
   * Create Note TASK records for PENDING assignments that don't have one.
   * This bridges the gap: Brain tree + YOLO read from Notes, not assignments.
   */
  private async createNotesForPendingAssignments(
    tenantId: string,
    stage: MaturityStage,
    userId: string,
  ): Promise<number> {
    const pendingAssignments = await this.prisma.stageConceptAssignment.findMany({
      where: { tenantId, stage, status: StageConceptStatus.PENDING, noteId: null },
      select: { id: true, conceptId: true },
    });

    if (pendingAssignments.length === 0) return 0;

    // Batch load concept names
    const conceptIds = pendingAssignments.map((a) => a.conceptId);
    const concepts = await this.prisma.concept.findMany({
      where: { id: { in: conceptIds } },
      select: { id: true, name: true },
    });
    const conceptMap = new Map(concepts.map((c) => [c.id, c.name]));

    // Check for existing PENDING notes to avoid duplicates
    const existingNotes = await this.prisma.note.findMany({
      where: {
        tenantId,
        conceptId: { in: conceptIds },
        noteType: NoteType.TASK,
        status: NoteStatus.PENDING,
      },
      select: { id: true, conceptId: true },
    });
    const existingByConceptId = new Map(
      existingNotes.map((n) => [n.conceptId!, n.id]),
    );

    let created = 0;
    for (const assignment of pendingAssignments) {
      const existingNoteId = existingByConceptId.get(assignment.conceptId);
      if (existingNoteId) {
        // Link existing note to assignment
        await this.prisma.stageConceptAssignment.update({
          where: { id: assignment.id },
          data: { noteId: existingNoteId },
        });
        continue;
      }

      const conceptName = conceptMap.get(assignment.conceptId) ?? 'Unknown';
      const noteId = `note_${createId()}`;

      await this.prisma.note.create({
        data: {
          id: noteId,
          title: conceptName,
          content: `Istraži koncept: ${conceptName}`,
          source: NoteSource.ONBOARDING,
          noteType: NoteType.TASK,
          status: NoteStatus.PENDING,
          userId,
          tenantId,
          conceptId: assignment.conceptId,
        },
      });

      await this.prisma.stageConceptAssignment.update({
        where: { id: assignment.id },
        data: { noteId },
      });

      created++;
    }

    this.logger.log({
      message: 'Created Notes for PENDING assignments',
      tenantId,
      stage,
      created,
      linkedExisting: pendingAssignments.length - created,
    });

    return created;
  }

  /** Check if a stage execution is currently running for this tenant */
  isExecutionRunning(tenantId: string): boolean {
    return this.runningExecutions.has(tenantId);
  }

  /** Check if stage initialization is currently running for this tenant */
  isInitializing(tenantId: string): boolean {
    return this.initializingTenants.has(tenantId);
  }

  /** Get current execution progress for API polling (dashboard page load recovery) */
  getExecutionProgress(tenantId: string): { total: number; executed: number; failed: number; current: string | null } | null {
    return this.executionProgress.get(tenantId) ?? null;
  }

  /**
   * Auto-execute all PENDING tasks for a stage in dependency order.
   * Independent tasks (no unmet prerequisites) run in parallel.
   * Uses HeadlessExecutor for each task, emits progress via WebSocket.
   */
  async runStageExecution(
    tenantId: string,
    stage: MaturityStage,
    userId: string,
  ): Promise<void> {
    // Prevent concurrent executions for the same tenant
    if (this.runningExecutions.has(tenantId)) {
      this.logger.warn({ message: 'Stage execution already running, skipping', tenantId, stage });
      return;
    }
    this.runningExecutions.add(tenantId);

    const MAX_CONCURRENCY = this.stageConcurrency;
    this.logger.log({ message: 'Starting stage auto-execution', tenantId, stage, maxConcurrency: MAX_CONCURRENCY });

    try {
      this.wsHolder.emitToTenant(tenantId, 'maturity:execution-started', {
        stage,
        timestamp: new Date().toISOString(),
      });

      // Load all assignments with their notes and prerequisite info
      const assignments = await this.prisma.stageConceptAssignment.findMany({
        where: { tenantId, stage, noteId: { not: null } },
        select: { id: true, conceptId: true, noteId: true, status: true, personaType: true },
      });

      // Build dependency graph from concept relationships
      const conceptIds = assignments.map((a) => a.conceptId);

      // Batch load concept names (eliminates N+1)
      const concepts = await this.prisma.concept.findMany({
        where: { id: { in: conceptIds } },
        select: { id: true, name: true },
      });
      const conceptNameMap = new Map(concepts.map((c) => [c.id, c.name]));

      const prerequisites = await this.prisma.conceptRelationship.findMany({
        where: {
          targetConceptId: { in: conceptIds },
          sourceConceptId: { in: conceptIds },
          relationshipType: 'PREREQUISITE',
        },
        select: { sourceConceptId: true, targetConceptId: true },
      });

      // Map: conceptId → set of prerequisite conceptIds (within this stage)
      const depMap = new Map<string, Set<string>>();
      for (const rel of prerequisites) {
        if (!depMap.has(rel.targetConceptId)) {
          depMap.set(rel.targetConceptId, new Set());
        }
        depMap.get(rel.targetConceptId)!.add(rel.sourceConceptId);
      }

      // Track completion
      const completedConcepts = new Set<string>(
        assignments.filter((a) => a.status === StageConceptStatus.COMPLETED).map((a) => a.conceptId),
      );
      const pendingAssignments = assignments.filter(
        (a) => a.status !== StageConceptStatus.COMPLETED && a.noteId,
      );

      const total = pendingAssignments.length;
      let executed = 0;
      let failed = 0;

      // Initialize progress tracking for API polling (dashboard page load)
      this.executionProgress.set(tenantId, { total, executed: 0, failed: 0, current: null });

      this.wsHolder.emitToTenant(tenantId, 'maturity:execution-progress', {
        stage, total, executed: 0, failed: 0, current: null,
      });

      // Also track failed concepts so dependents can detect unresolvable deps
      const failedConcepts = new Set<string>();

      // Topological execution: process tasks whose prerequisites are all complete
      const remaining = new Map(pendingAssignments.map((a) => [a.conceptId, a]));

      while (remaining.size > 0) {
        const ready: typeof pendingAssignments = [];
        for (const [conceptId, assignment] of remaining) {
          const deps = depMap.get(conceptId);
          if (!deps || [...deps].every((d) => completedConcepts.has(d) || failedConcepts.has(d))) {
            ready.push(assignment);
          }
        }

        if (ready.length === 0) {
          // True stall: remaining tasks have circular or unresolvable dependencies
          this.logger.warn({
            message: 'Stage execution stalled — unresolvable dependencies, stopping',
            tenantId, stage, remaining: remaining.size,
          });
          failed += remaining.size;
          break;
        }

        for (const a of ready) remaining.delete(a.conceptId);

        this.logger.log({
          message: `Stage execution wave: ${ready.length} tasks ready`,
          tenantId, stage, readyCount: ready.length, remaining: remaining.size,
        });

        const executeOne = async (assignment: (typeof ready)[0]) => {
          const conceptName = conceptNameMap.get(assignment.conceptId) ?? assignment.conceptId;

          // Update progress for both WS and API polling
          this.executionProgress.set(tenantId, { total, executed, failed, current: conceptName });
          this.wsHolder.emitToTenant(tenantId, 'maturity:execution-progress', {
            stage, total, executed, failed,
            current: { conceptId: assignment.conceptId, conceptName, personaType: assignment.personaType },
          });

          try {
            const result = await this.headlessExecutor.executeTask({
              taskId: assignment.noteId!, tenantId, userId,
            });
            if (result.success) {
              // Verify assignment transitioned to COMPLETED. If not (e.g., onConceptCompleted
              // missed due to prior server restart), force-mark it now.
              const updated = await this.prisma.stageConceptAssignment.findUnique({
                where: { id: assignment.id },
                select: { status: true },
              });
              if (updated?.status === StageConceptStatus.COMPLETED) {
                completedConcepts.add(assignment.conceptId);
              } else if (updated?.status === StageConceptStatus.PENDING || updated?.status === StageConceptStatus.IN_PROGRESS) {
                // Safety net: note completed but assignment wasn't updated — fix it
                this.logger.warn({
                  message: 'Force-completing assignment (note completed but assignment lagged)',
                  tenantId, conceptId: assignment.conceptId, assignmentStatus: updated?.status,
                });
                await this.prisma.stageConceptAssignment.update({
                  where: { id: assignment.id },
                  data: { status: StageConceptStatus.COMPLETED, completedAt: new Date() },
                });
                completedConcepts.add(assignment.conceptId);
              }
              executed++;
            } else {
              failed++;
              failedConcepts.add(assignment.conceptId);
              this.logger.warn({ message: 'Stage task failed', tenantId, conceptId: assignment.conceptId, error: result.error });
            }
          } catch (err) {
            failed++;
            failedConcepts.add(assignment.conceptId);
            this.logger.error({ message: 'Stage task error', tenantId, conceptId: assignment.conceptId, error: err instanceof Error ? err.message : 'Unknown' });
          }

          // Clear cross-persona intelligence cache so next tasks in subsequent
          // chunks see freshly completed results from this task
          this.crossPersonaIntelligence.clearCache(tenantId);
        };

        for (let i = 0; i < ready.length; i += MAX_CONCURRENCY) {
          const chunk = ready.slice(i, i + MAX_CONCURRENCY);
          await Promise.all(chunk.map(executeOne));

          this.executionProgress.set(tenantId, { total, executed, failed, current: null });
          this.wsHolder.emitToTenant(tenantId, 'maturity:execution-progress', {
            stage, total, executed, failed, current: null,
          });
        }
      }

      this.wsHolder.emitToTenant(tenantId, 'maturity:execution-complete', {
        stage, total, executed, failed, timestamp: new Date().toISOString(),
      });

      this.logger.log({ message: 'Stage auto-execution complete', tenantId, stage, total, executed, failed });
    } finally {
      this.runningExecutions.delete(tenantId);
      this.executionProgress.delete(tenantId);
    }
  }

  // ─── Helpers ───

  /**
   * After initializeStage(), reconcile brain-seeded tasks that were already completed.
   * Marks PENDING assignments as COMPLETED if a finished Note exists for that concept.
   */
  private async reconcileBrainSeededCompletions(
    tenantId: string,
    stage: MaturityStage
  ): Promise<void> {
    const pendingAssignments = await this.prisma.stageConceptAssignment.findMany({
      where: { tenantId, stage, status: StageConceptStatus.PENDING },
      select: { id: true, conceptId: true },
    });

    if (pendingAssignments.length === 0) return;

    const conceptIds = pendingAssignments.map((a) => a.conceptId);

    // Find completed task notes for these concepts
    const completedNotes = await this.prisma.note.findMany({
      where: {
        tenantId,
        conceptId: { in: conceptIds },
        noteType: 'TASK',
        status: 'COMPLETED',
      },
      select: { id: true, conceptId: true },
      orderBy: { updatedAt: 'desc' },
    });

    const completedByConceptId = new Map<string, string>();
    for (const note of completedNotes) {
      if (note.conceptId && !completedByConceptId.has(note.conceptId)) {
        completedByConceptId.set(note.conceptId, note.id);
      }
    }

    if (completedByConceptId.size === 0) return;

    let reconciled = 0;
    for (const assignment of pendingAssignments) {
      const noteId = completedByConceptId.get(assignment.conceptId);
      if (noteId) {
        await this.prisma.stageConceptAssignment.update({
          where: { id: assignment.id },
          data: {
            status: StageConceptStatus.COMPLETED,
            completedAt: new Date(),
            noteId,
          },
        });
        reconciled++;
      }
    }

    if (reconciled > 0) {
      this.logger.log({
        message: 'Reconciled brain-seeded completions',
        tenantId,
        stage,
        reconciled,
      });
    }
  }

  private getNextStage(current: MaturityStage): MaturityStage | null {
    const idx = STAGE_ORDER.indexOf(current);
    return idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1]! : null;
  }
}
