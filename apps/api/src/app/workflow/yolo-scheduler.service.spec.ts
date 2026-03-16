import { Test } from '@nestjs/testing';
import { YoloSchedulerService } from './yolo-scheduler.service';
import { WorkflowService } from './workflow.service';
import { NotesService } from '../notes/notes.service';
import { ConceptService } from '../knowledge/services/concept.service';
import { ConceptMatchingService } from '../knowledge/services/concept-matching.service';
import { CurriculumService } from '../knowledge/services/curriculum.service';
import { ConceptExtractionService } from '../knowledge/services/concept-extraction.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { ConceptRelevanceService } from '../knowledge/services/concept-relevance.service';
import type { YoloConfig, YoloProgressPayload, YoloCompletePayload } from '@mentor-ai/shared/types';

// ─── Mocks ───────────────────────────────────────────────────

function createMockCallbacks() {
  const progressHistory: YoloProgressPayload[] = [];
  let completePayload: YoloCompletePayload | null = null;
  let errorMessage: string | null = null;
  return {
    onProgress: jest.fn((p: YoloProgressPayload) => {
      progressHistory.push(p);
    }),
    onComplete: jest.fn((p: YoloCompletePayload) => {
      completePayload = p;
    }),
    onError: jest.fn((e: string) => {
      errorMessage = e;
    }),
    saveMessage: jest.fn().mockResolvedValue('msg-id'),
    get progressHistory() {
      return progressHistory;
    },
    get completePayload() {
      return completePayload;
    },
    get errorMessage() {
      return errorMessage;
    },
  };
}

function makeFakeTaskNote(id: string, conceptId: string, title: string) {
  return {
    id,
    title,
    conceptId,
    tenantId: 'tenant-1',
    noteType: 'TASK',
    status: 'PENDING',
    content: `Apply ${title}`,
    source: 'CONVERSATION',
  };
}

/** Poll for onComplete instead of fixed setTimeout — prevents flaky tests */
async function waitForComplete(
  callbacks: ReturnType<typeof createMockCallbacks>,
  timeoutMs = 5000
): Promise<void> {
  const start = Date.now();
  while (!callbacks.completePayload && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 20));
  }
}

const defaultConfig: YoloConfig = {
  maxConcurrency: 3,
  maxConceptsHardStop: 1000,
  retryAttempts: 1,
  retryBaseDelayMs: 0,
  circuitBreakerCooldownMs: 0,
  maxExecutionBudget: 100,
};

describe('YoloSchedulerService', () => {
  let service: YoloSchedulerService;
  let mockPrisma: any;
  let mockWorkflowService: any;
  let mockNotesService: any;
  let mockConceptService: any;
  let mockConceptMatchingService: any;
  let mockCurriculumService: any;

  // Default PENDING task notes returned by prisma.note.findMany
  let pendingTaskNotes: ReturnType<typeof makeFakeTaskNote>[];

  beforeEach(async () => {
    pendingTaskNotes = [
      makeFakeTaskNote('task-A', 'concept-A', 'Concept A'),
      makeFakeTaskNote('task-B', 'concept-B', 'Concept B'),
      makeFakeTaskNote('task-C', 'concept-C', 'Concept C'),
    ];

    mockPrisma = {
      note: {
        findMany: jest.fn().mockImplementation(async (args: any) => {
          // PENDING tasks query (initial load)
          if (args?.where?.status === 'PENDING') {
            return pendingTaskNotes;
          }
          // COMPLETED tasks query (for relevance scoring — completedCategories)
          if (args?.where?.status === 'COMPLETED') {
            return [];
          }
          return [];
        }),
      },
      concept: {
        findMany: jest.fn().mockImplementation(async (args: any) => {
          if (args?.where?.id?.in) {
            const ids: string[] = args.where.id.in;
            return ids.map((id: string) => ({ id, category: 'Uvod u Poslovanje' }));
          }
          return [];
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ department: null, role: 'PLATFORM_OWNER' }),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ industry: 'digital' }),
      },
      conceptRelationship: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockWorkflowService = {
      getOrGenerateWorkflow: jest.fn().mockResolvedValue({
        steps: [
          {
            stepNumber: 1,
            title: 'Step 1',
            description: 'Execute task',
            estimatedMinutes: 1,
            departmentTag: 'general',
          },
        ],
      }),
      executeStepAutonomous: jest.fn().mockResolvedValue({ content: 'AI output' }),
    };

    let noteIdCounter = 0;
    mockNotesService = {
      createNote: jest.fn().mockImplementation(async () => {
        noteIdCounter++;
        return { id: `note-${noteIdCounter}` };
      }),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      findExistingSubTask: jest.fn().mockResolvedValue(null),
      findExistingTask: jest.fn().mockResolvedValue(null),
    };

    mockConceptService = {
      findById: jest.fn().mockImplementation(async (id: string) => ({
        id,
        name: id.replace('concept-', 'Concept ').replace(/^\w/, (c: string) => c.toUpperCase()),
        relatedConcepts: [],
      })),
      createDynamicRelationships: jest.fn().mockResolvedValue({
        conceptId: 'cpt_x',
        conceptName: 'Test',
        relationshipsCreated: 0,
        errors: [],
      }),
    };

    mockConceptMatchingService = {
      findRelevantConcepts: jest.fn().mockResolvedValue([]),
    };

    mockCurriculumService = {
      matchTopic: jest.fn().mockReturnValue(null),
      ensureConceptExists: jest.fn().mockResolvedValue('cpt_xxx'),
    };

    const module = await Test.createTestingModule({
      providers: [
        YoloSchedulerService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
        { provide: WorkflowService, useValue: mockWorkflowService },
        { provide: NotesService, useValue: mockNotesService },
        { provide: ConceptService, useValue: mockConceptService },
        { provide: ConceptMatchingService, useValue: mockConceptMatchingService },
        { provide: CurriculumService, useValue: mockCurriculumService },
        {
          provide: ConceptExtractionService,
          useValue: {
            extractAndCreateConcepts: jest
              .fn()
              .mockResolvedValue({ created: [], skippedDuplicates: [], errors: [] }),
          },
        },
        {
          provide: ConceptRelevanceService,
          useValue: {
            scoreRelevance: jest.fn().mockReturnValue(0.8),
            getThreshold: jest.fn().mockReturnValue(0.3),
          },
        },
      ],
    }).compile();

    service = module.get<YoloSchedulerService>(YoloSchedulerService);
  });

  // ─── Test 1: Pending tasks are loaded and workflows executed ───

  it('should load pending tasks and execute workflows for each', async () => {
    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([
      ['concept-A', 'conv-A'],
      ['concept-B', 'conv-B'],
      ['concept-C', 'conv-C'],
    ]);

    const planId = await service.startYoloExecution(
      'tenant-1',
      'user-1',
      'conv-main',
      defaultConfig,
      callbacks,
      conceptConvs
    );

    await waitForComplete(callbacks);

    expect(planId).toContain('yolo_');
    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);

    // 3 pending task notes → 3 workflow executions
    expect(mockWorkflowService.getOrGenerateWorkflow).toHaveBeenCalledTimes(3);
    expect(mockWorkflowService.executeStepAutonomous).toHaveBeenCalledTimes(3);
    const result = callbacks.completePayload!;
    expect(result.completed).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.status).toBe('completed');
  });

  // ─── Test 2: Same concept tasks don't run in parallel ─────────

  it('should not run two tasks with the same conceptId in parallel', async () => {
    // Two task notes for the same concept
    pendingTaskNotes = [
      makeFakeTaskNote('task-1', 'concept-X', 'Concept X Task 1'),
      makeFakeTaskNote('task-2', 'concept-X', 'Concept X Task 2'),
    ];

    let concurrentRunning = 0;
    let maxConcurrent = 0;
    mockWorkflowService.executeStepAutonomous.mockImplementation(async () => {
      concurrentRunning++;
      maxConcurrent = Math.max(maxConcurrent, concurrentRunning);
      await new Promise((r) => setTimeout(r, 50));
      concurrentRunning--;
      return { content: 'Done' };
    });

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([['concept-X', 'conv-X']]);

    await service.startYoloExecution(
      'tenant-1',
      'user-1',
      'conv-main',
      defaultConfig,
      callbacks,
      conceptConvs
    );

    await waitForComplete(callbacks);

    // Only one should have been running at a time since they share a concept lock
    expect(maxConcurrent).toBe(1);
    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
  });

  // ─── Test 3: Auto-Done Semantics ──────────────────────────

  it('should auto-mark completed tasks as COMPLETED without user interaction', async () => {
    pendingTaskNotes = [makeFakeTaskNote('task-A', 'concept-A', 'Auto Task')];

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([['concept-A', 'conv-A']]);

    await service.startYoloExecution(
      'tenant-1',
      'user-1',
      'conv-main',
      defaultConfig,
      callbacks,
      conceptConvs
    );

    await waitForComplete(callbacks);

    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    expect(callbacks.completePayload!.completed).toBe(1);
    // The note status should have been updated to COMPLETED
    expect(mockNotesService.updateStatus).toHaveBeenCalledWith('task-A', 'COMPLETED', 'tenant-1');
  });

  // ─── Test 4: Execution Budget Stop ─────────────────────────

  it('should stop execution when reaching maxExecutionBudget', async () => {
    // 5 task notes, but budget is 3
    pendingTaskNotes = Array.from({ length: 5 }, (_, i) =>
      makeFakeTaskNote(`task-${i}`, `concept-${i}`, `Concept ${i}`)
    );

    const budgetConfig: YoloConfig = {
      maxConcurrency: 1,
      maxConceptsHardStop: 1000,
      retryAttempts: 1,
      retryBaseDelayMs: 0,
      circuitBreakerCooldownMs: 0,
      maxExecutionBudget: 3,
    };

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map(
      pendingTaskNotes.map((n) => [n.conceptId, `conv-${n.conceptId}`] as [string, string])
    );

    await service.startYoloExecution(
      'tenant-1',
      'user-1',
      'conv-main',
      budgetConfig,
      callbacks,
      conceptConvs
    );

    await waitForComplete(callbacks);

    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    const result = callbacks.completePayload!;
    // Should have executed at most the budget (3) tasks
    expect(result.completed).toBeLessThanOrEqual(3);
    expect(result.completed).toBeGreaterThanOrEqual(1);
  });

  // ─── Test 5: Failed Workflow Doesn't Block Others ──────────

  it('should continue executing unrelated concepts when one workflow fails', async () => {
    pendingTaskNotes = [
      makeFakeTaskNote('task-A', 'concept-A', 'Failing Concept'),
      makeFakeTaskNote('task-C', 'concept-C', 'Independent Concept'),
    ];

    // Make concept-A's workflow fail
    mockWorkflowService.executeStepAutonomous.mockImplementation(async (step: any) => {
      if (step.conceptId === 'concept-A') {
        throw new Error('LLM failure');
      }
      return { content: 'Success' };
    });

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([
      ['concept-A', 'conv-A'],
      ['concept-C', 'conv-C'],
    ]);

    const noRetryConfig: YoloConfig = {
      ...defaultConfig,
      maxConcurrency: 3,
      retryAttempts: 0,
    };

    await service.startYoloExecution(
      'tenant-1',
      'user-1',
      'conv-main',
      noRetryConfig,
      callbacks,
      conceptConvs
    );

    await waitForComplete(callbacks);

    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    const result = callbacks.completePayload!;
    // concept-A failed, concept-C succeeded
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.completed).toBeGreaterThanOrEqual(1);
  });

  // ─── Test 6: Retry on Workflow Failure ─────────────────────

  it('should retry a failed workflow step before marking it as failed', async () => {
    pendingTaskNotes = [makeFakeTaskNote('task-A', 'concept-A', 'Retry Concept')];

    let attemptCount = 0;
    mockWorkflowService.executeStepAutonomous.mockImplementation(async () => {
      attemptCount++;
      if (attemptCount === 1) {
        throw new Error('Temporary failure');
      }
      return { content: 'Success on retry' };
    });

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([['concept-A', 'conv-A']]);

    await service.startYoloExecution(
      'tenant-1',
      'user-1',
      'conv-main',
      defaultConfig,
      callbacks,
      conceptConvs
    );

    await waitForComplete(callbacks);

    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    expect(callbacks.completePayload!.completed).toBe(1);
    expect(callbacks.completePayload!.failed).toBe(0);
  });

  // ─── Test 7: No pending tasks returns error ─────────────────

  it('should emit error when no pending tasks found', async () => {
    // No pending tasks
    pendingTaskNotes = [];

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map<string, string>();

    await service.startYoloExecution(
      'tenant-1',
      'user-1',
      'conv-main',
      defaultConfig,
      callbacks,
      conceptConvs
    );

    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.stringContaining('No pending tasks found')
    );
  });

  // ─── Test 8: Discovery Creates New Concept Entries ─────────

  it('should discover related concepts after task completion', async () => {
    pendingTaskNotes = [makeFakeTaskNote('task-A', 'concept-A', 'Task A')];

    // After concept-A completes, discovery finds concept-B via semantic search
    mockConceptMatchingService.findRelevantConcepts.mockResolvedValue([
      {
        conceptId: 'concept-B',
        conceptName: 'Pricing Strategy',
        category: 'Finance',
        definition: 'How to price',
        score: 0.85,
      },
    ]);

    const callbacks = createMockCallbacks();
    (callbacks as any).createConversationForConcept = jest.fn().mockResolvedValue('conv-B');
    (callbacks as any).onConceptDiscovered = jest.fn();

    const conceptConvs = new Map([['concept-A', 'conv-A']]);

    await service.startYoloExecution(
      'tenant-1',
      'user-1',
      'conv-main',
      defaultConfig,
      callbacks,
      conceptConvs
    );

    await waitForComplete(callbacks);

    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    expect(mockConceptMatchingService.findRelevantConcepts).toHaveBeenCalled();
  });

  // ─── Test 9: No Duplicate Discovery ───────────────────────

  it('should not create duplicate entries for already-known concepts', async () => {
    pendingTaskNotes = [
      makeFakeTaskNote('task-A', 'concept-A', 'Task A'),
      makeFakeTaskNote('task-B', 'concept-B', 'Task B'),
    ];

    // Discovery returns concept-B (already in initial set) — should be skipped
    mockConceptMatchingService.findRelevantConcepts.mockResolvedValue([
      { conceptId: 'concept-B', conceptName: 'Task B', category: 'F', definition: 'd', score: 0.9 },
    ]);

    const callbacks = createMockCallbacks();
    (callbacks as any).onConceptDiscovered = jest.fn();

    const conceptConvs = new Map([
      ['concept-A', 'conv-A'],
      ['concept-B', 'conv-B'],
    ]);

    await service.startYoloExecution(
      'tenant-1',
      'user-1',
      'conv-main',
      defaultConfig,
      callbacks,
      conceptConvs
    );

    await waitForComplete(callbacks);

    // Discovery should NOT have added concept-B as new (it's already in initial set)
    expect(callbacks.completePayload!.total).toBe(2);
    // onConceptDiscovered should not have been called for concept-B (duplicate)
    expect((callbacks as any).onConceptDiscovered).not.toHaveBeenCalledWith(
      expect.objectContaining({ conceptId: 'concept-B' })
    );
  });

  // ─── Story 2.16: Per-Step Progress Tests ───────────────────

  it('should include recentLogs in progress payloads (AC5)', async () => {
    pendingTaskNotes = [makeFakeTaskNote('task-A', 'concept-A', 'Task A')];

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([['concept-A', 'conv-A']]);

    await service.startYoloExecution(
      'tenant-1',
      'user-1',
      'conv-main',
      defaultConfig,
      callbacks,
      conceptConvs
    );

    await waitForComplete(callbacks);

    // At least one progress payload should contain recentLogs
    const hasRecentLogs = callbacks.progressHistory.some(
      (p) => Array.isArray(p.recentLogs) && p.recentLogs.length > 0
    );
    expect(hasRecentLogs).toBe(true);
  });

  it('should include step detail in currentTasks during execution (AC5)', async () => {
    pendingTaskNotes = [makeFakeTaskNote('task-A', 'concept-A', 'Task A')];

    mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
      steps: [
        {
          stepNumber: 1,
          title: 'Market Analysis',
          description: 'Analyze',
          estimatedMinutes: 1,
          departmentTag: 'gen',
        },
        {
          stepNumber: 2,
          title: 'Competitor Review',
          description: 'Review',
          estimatedMinutes: 1,
          departmentTag: 'gen',
        },
      ],
    });

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([['concept-A', 'conv-A']]);

    await service.startYoloExecution(
      'tenant-1',
      'user-1',
      'conv-main',
      defaultConfig,
      callbacks,
      conceptConvs
    );

    await waitForComplete(callbacks);

    // Find a progress payload with step detail
    const withStepDetail = callbacks.progressHistory.find((p) =>
      p.currentTasks.some((t) => t.currentStep !== undefined && t.totalSteps !== undefined)
    );
    expect(withStepDetail).toBeDefined();
    if (withStepDetail) {
      const task = withStepDetail.currentTasks.find((t) => t.currentStep !== undefined)!;
      expect(task.totalSteps).toBe(2);
      expect(task.currentStepIndex).toBeDefined();
    }
  });

  it('should include logs in YoloCompletePayload (AC5)', async () => {
    pendingTaskNotes = [makeFakeTaskNote('task-A', 'concept-A', 'Task A')];

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([['concept-A', 'conv-A']]);

    await service.startYoloExecution(
      'tenant-1',
      'user-1',
      'conv-main',
      defaultConfig,
      callbacks,
      conceptConvs
    );

    await waitForComplete(callbacks);

    const result = callbacks.completePayload!;
    expect(result.logs).toBeDefined();
    expect(Array.isArray(result.logs)).toBe(true);
    expect(result.logs!.length).toBeGreaterThan(0);
  });

  it('should maintain backward compatibility — new fields are optional (AC6)', async () => {
    pendingTaskNotes = [makeFakeTaskNote('task-A', 'concept-A', 'Task A')];

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([['concept-A', 'conv-A']]);

    await service.startYoloExecution(
      'tenant-1',
      'user-1',
      'conv-main',
      defaultConfig,
      callbacks,
      conceptConvs
    );

    await waitForComplete(callbacks);

    // All existing fields still present in progress
    for (const p of callbacks.progressHistory) {
      expect(p.planId).toBeDefined();
      expect(typeof p.running).toBe('number');
      expect(typeof p.completed).toBe('number');
      expect(typeof p.failed).toBe('number');
      expect(typeof p.total).toBe('number');
      expect(typeof p.discoveredCount).toBe('number');
      expect(p.conversationId).toBeDefined();
      expect(Array.isArray(p.currentTasks)).toBe(true);
    }

    // Complete payload still has all original fields
    const result = callbacks.completePayload!;
    expect(result.planId).toBeDefined();
    expect(result.status).toBeDefined();
    expect(typeof result.completed).toBe('number');
    expect(typeof result.failed).toBe('number');
    expect(typeof result.total).toBe('number');
    expect(typeof result.discoveredCount).toBe('number');
    expect(typeof result.durationMs).toBe('number');
    expect(result.conversationId).toBeDefined();
  });

  // ─── Workflow execution tests ──────────────────────────────

  it('should execute workflow steps sequentially for each task', async () => {
    pendingTaskNotes = [
      makeFakeTaskNote('task-A', 'concept-A', 'First Concept'),
      makeFakeTaskNote('task-B', 'concept-B', 'Second Concept'),
    ];

    const config: YoloConfig = {
      ...defaultConfig,
      maxConcurrency: 1, // sequential to guarantee order
    };

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([
      ['concept-A', 'conv-A'],
      ['concept-B', 'conv-B'],
    ]);

    await service.startYoloExecution(
      'tenant-1',
      'user-1',
      'conv-main',
      config,
      callbacks,
      conceptConvs
    );

    await waitForComplete(callbacks);

    // Both tasks should have been executed
    expect(mockWorkflowService.getOrGenerateWorkflow).toHaveBeenCalledTimes(2);
    expect(mockWorkflowService.executeStepAutonomous).toHaveBeenCalledTimes(2);
    expect(callbacks.completePayload!.completed).toBe(2);
  });

  it('should handle tasks with no linked concepts gracefully', async () => {
    // Task note with null conceptId — should be filtered out
    pendingTaskNotes = [
      { ...makeFakeTaskNote('task-A', 'concept-A', 'Valid Task'), conceptId: null as any },
    ];

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map<string, string>();

    await service.startYoloExecution(
      'tenant-1',
      'user-1',
      'conv-main',
      defaultConfig,
      callbacks,
      conceptConvs
    );

    // The note.findMany WHERE clause requires conceptId: { not: null },
    // but our mock returns a note with null conceptId anyway.
    // The service filters with notesWithConcepts = taskNotes.filter(n => n.conceptId)
    // and would reach "No tasks with linked concepts found" if all are null.
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.stringContaining('No tasks with linked concepts found')
    );
  });
});
