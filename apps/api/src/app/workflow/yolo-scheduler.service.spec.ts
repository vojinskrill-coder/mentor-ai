import { Test } from '@nestjs/testing';
import { YoloSchedulerService } from './yolo-scheduler.service';
import { WorkflowService } from './workflow.service';
import { NotesService } from '../notes/notes.service';
import { ConceptService } from '../knowledge/services/concept.service';
import { ConceptMatchingService } from '../knowledge/services/concept-matching.service';
import { CurriculumService } from '../knowledge/services/curriculum.service';
import { ConceptExtractionService } from '../knowledge/services/concept-extraction.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import type { YoloConfig, YoloProgressPayload, YoloCompletePayload } from '@mentor-ai/shared/types';

// ─── Mocks ───────────────────────────────────────────────────

function createMockCallbacks() {
  const progressHistory: YoloProgressPayload[] = [];
  let completePayload: YoloCompletePayload | null = null;
  let errorMessage: string | null = null;
  return {
    onProgress: jest.fn((p: YoloProgressPayload) => { progressHistory.push(p); }),
    onComplete: jest.fn((p: YoloCompletePayload) => { completePayload = p; }),
    onError: jest.fn((e: string) => { errorMessage = e; }),
    saveMessage: jest.fn().mockResolvedValue('msg-id'),
    get progressHistory() { return progressHistory; },
    get completePayload() { return completePayload; },
    get errorMessage() { return errorMessage; },
  };
}

function makeFakeNote(id: string, conceptId: string, conceptName: string) {
  return {
    id,
    conceptId,
    title: conceptName,
    noteType: 'TASK',
    status: 'PENDING',
    tenantId: 'tenant-1',
  };
}

/** Poll for onComplete instead of fixed setTimeout — prevents flaky tests */
async function waitForComplete(
  callbacks: ReturnType<typeof createMockCallbacks>,
  timeoutMs = 5000,
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
};

describe('YoloSchedulerService', () => {
  let service: YoloSchedulerService;
  let mockPrisma: any;
  let mockWorkflowService: any;
  let mockNotesService: any;
  let mockConceptService: any;
  let mockConceptMatchingService: any;
  let mockCurriculumService: any;

  beforeEach(async () => {
    mockPrisma = {
      note: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockWorkflowService = {
      getOrGenerateWorkflow: jest.fn().mockResolvedValue({ steps: [] }),
      executeStepAutonomous: jest.fn().mockResolvedValue({ content: 'AI output' }),
    };

    let noteIdCounter = 0;
    mockNotesService = {
      createNote: jest.fn().mockImplementation(async () => {
        noteIdCounter++;
        return { id: `note-${noteIdCounter}` };
      }),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };

    mockConceptService = {
      findById: jest.fn().mockResolvedValue({
        relatedConcepts: [],
      }),
      createDynamicRelationships: jest.fn().mockResolvedValue({
        conceptId: 'cpt_x', conceptName: 'Test', relationshipsCreated: 0, errors: [],
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
        { provide: ConceptExtractionService, useValue: { extractAndCreateConcepts: jest.fn().mockResolvedValue({ created: [], skippedDuplicates: [], errors: [] }) } },
      ],
    }).compile();

    service = module.get<YoloSchedulerService>(YoloSchedulerService);
  });

  // ─── Test 1: Dependency Gating ──────────────────────────────

  it('should dispatch tasks with no dependencies first, then unblocked tasks', async () => {
    // A (no deps), B (depends on concept-A), C (no deps)
    const notes = [
      makeFakeNote('task-A', 'concept-A', 'Task A'),
      makeFakeNote('task-B', 'concept-B', 'Task B'),
      makeFakeNote('task-C', 'concept-C', 'Task C'),
    ];
    mockPrisma.note.findMany.mockResolvedValue(notes);

    // B depends on concept-A (PREREQUISITE)
    mockConceptService.findById.mockImplementation(async (id: string) => {
      if (id === 'concept-B') {
        return {
          relatedConcepts: [{
            relationshipType: 'PREREQUISITE',
            direction: 'outgoing',
            concept: { id: 'concept-A' },
          }],
        };
      }
      return { relatedConcepts: [] };
    });

    // Each task has 1 workflow step
    mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
      steps: [{ stepNumber: 1, title: 'Step 1', description: 'Do something', estimatedMinutes: 1, departmentTag: 'general' }],
    });

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map<string, string>([
      ['concept-A', 'conv-A'],
      ['concept-B', 'conv-B'],
      ['concept-C', 'conv-C'],
    ]);

    const planId = await service.startYoloExecution(
      'tenant-1', 'user-1', 'conv-main', defaultConfig, callbacks, conceptConvs,
    );

    // Wait for the dispatch loop to complete
    await waitForComplete(callbacks);

    expect(planId).toContain('yolo_');
    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);

    const result = callbacks.completePayload!;
    expect(result.completed).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.status).toBe('completed');
  });

  // ─── Test 2: No Parallel on Same Lock ──────────────────────

  it('should not run two tasks with the same conceptId in parallel', async () => {
    // Two tasks linked to the same concept
    const notes = [
      makeFakeNote('task-1', 'concept-X', 'Task 1'),
      makeFakeNote('task-2', 'concept-X', 'Task 2'),
    ];
    mockPrisma.note.findMany.mockResolvedValue(notes);

    let concurrentRunning = 0;
    let maxConcurrent = 0;
    mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
      steps: [{ stepNumber: 1, title: 'Step', description: 'Do', estimatedMinutes: 1, departmentTag: 'gen' }],
    });
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
      'tenant-1', 'user-1', 'conv-main', defaultConfig, callbacks, conceptConvs,
    );

    await waitForComplete(callbacks);

    // Only one should have been running at a time since they share a concept lock
    expect(maxConcurrent).toBe(1);
    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
  });

  // ─── Test 3: Auto-Done Semantics ──────────────────────────

  it('should auto-mark completed tasks as COMPLETED without user interaction', async () => {
    const notes = [makeFakeNote('task-A', 'concept-A', 'Auto Task')];
    mockPrisma.note.findMany.mockResolvedValue(notes);

    mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
      steps: [{ stepNumber: 1, title: 'Step 1', description: 'Auto', estimatedMinutes: 1, departmentTag: 'gen' }],
    });

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([['concept-A', 'conv-A']]);

    await service.startYoloExecution(
      'tenant-1', 'user-1', 'conv-main', defaultConfig, callbacks, conceptConvs,
    );

    await waitForComplete(callbacks);

    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    expect(callbacks.completePayload!.completed).toBe(1);
    // The note status should have been updated to COMPLETED
    expect(mockNotesService.updateStatus).toHaveBeenCalledWith('task-A', 'COMPLETED', 'tenant-1');
  });

  // ─── Test 4: Hard Stop at maxConceptsHardStop ─────────────

  it('should stop execution when reaching maxConceptsHardStop', async () => {
    // Create 5 tasks but set hard stop at 3
    const notes = Array.from({ length: 5 }, (_, i) =>
      makeFakeNote(`task-${i}`, `concept-${i}`, `Task ${i}`),
    );
    mockPrisma.note.findMany.mockResolvedValue(notes);

    mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
      steps: [{ stepNumber: 1, title: 'Step', description: 'Do', estimatedMinutes: 1, departmentTag: 'gen' }],
    });

    const hardStopConfig: YoloConfig = { maxConcurrency: 1, maxConceptsHardStop: 3, retryAttempts: 1 };
    const callbacks = createMockCallbacks();
    const conceptConvs = new Map(notes.map((n) => [n.conceptId, `conv-${n.conceptId}`] as [string, string]));

    await service.startYoloExecution(
      'tenant-1', 'user-1', 'conv-main', hardStopConfig, callbacks, conceptConvs,
    );

    await waitForComplete(callbacks);

    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    const result = callbacks.completePayload!;
    expect(result.completed).toBe(3);
    expect(result.status).toBe('hard-stopped');
  });

  // ─── Test 5: Failed Task Doesn't Block Unrelated ──────────

  it('should continue executing unrelated tasks when one fails', async () => {
    // A (fails), B (depends on A — blocked), C (no deps — should succeed)
    const notes = [
      makeFakeNote('task-A', 'concept-A', 'Failing Task'),
      makeFakeNote('task-B', 'concept-B', 'Blocked Task'),
      makeFakeNote('task-C', 'concept-C', 'Independent Task'),
    ];
    mockPrisma.note.findMany.mockResolvedValue(notes);

    // B depends on concept-A
    mockConceptService.findById.mockImplementation(async (id: string) => {
      if (id === 'concept-B') {
        return {
          relatedConcepts: [{
            relationshipType: 'PREREQUISITE',
            direction: 'outgoing',
            concept: { id: 'concept-A' },
          }],
        };
      }
      return { relatedConcepts: [] };
    });

    // Make task-A's workflow fail
    let callCount = 0;
    mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
      steps: [{ stepNumber: 1, title: 'Step', description: 'Do', estimatedMinutes: 1, departmentTag: 'gen' }],
    });
    mockWorkflowService.executeStepAutonomous.mockImplementation(async (step: any) => {
      if (step.conceptId === 'concept-A') {
        throw new Error('LLM failure');
      }
      return { content: 'Success' };
    });

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([
      ['concept-A', 'conv-A'],
      ['concept-B', 'conv-B'],
      ['concept-C', 'conv-C'],
    ]);

    // Use retryAttempts: 0 to fail immediately
    const noRetryConfig: YoloConfig = { maxConcurrency: 3, maxConceptsHardStop: 1000, retryAttempts: 0 };

    await service.startYoloExecution(
      'tenant-1', 'user-1', 'conv-main', noRetryConfig, callbacks, conceptConvs,
    );

    await waitForComplete(callbacks);

    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    const result = callbacks.completePayload!;
    // A fails immediately (retryAttempts: 0), C succeeds, B stays blocked (depends on A)
    expect(result.failed).toBe(1);
    expect(result.completed).toBe(1); // C should have completed
  });

  // ─── Test 6: Retry on Failure ─────────────────────────────

  it('should retry a failed task once before marking it as failed', async () => {
    const notes = [makeFakeNote('task-A', 'concept-A', 'Retry Task')];
    mockPrisma.note.findMany.mockResolvedValue(notes);

    let attemptCount = 0;
    mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
      steps: [{ stepNumber: 1, title: 'Step', description: 'Do', estimatedMinutes: 1, departmentTag: 'gen' }],
    });
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
      'tenant-1', 'user-1', 'conv-main', defaultConfig, callbacks, conceptConvs,
    );

    await waitForComplete(callbacks);

    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    expect(callbacks.completePayload!.completed).toBe(1);
    expect(callbacks.completePayload!.failed).toBe(0);
    expect(attemptCount).toBe(2); // First attempt failed, retry succeeded
  });

  // ─── Test: No tasks returns error ─────────────────────────

  it('should emit error when no pending tasks found', async () => {
    mockPrisma.note.findMany.mockResolvedValue([]);

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map<string, string>();

    await service.startYoloExecution(
      'tenant-1', 'user-1', 'conv-main', defaultConfig, callbacks, conceptConvs,
    );

    expect(callbacks.onError).toHaveBeenCalledWith('No pending tasks found');
  });

  // ─── Test 8: Recursive Discovery Creates New Tasks ─────────

  it('should discover related concepts and create new tasks after worker completion', async () => {
    const notes = [makeFakeNote('task-A', 'concept-A', 'Task A')];
    mockPrisma.note.findMany.mockResolvedValue(notes);

    mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
      steps: [{ stepNumber: 1, title: 'Step 1', description: 'Analyze', estimatedMinutes: 1, departmentTag: 'gen' }],
    });
    mockWorkflowService.executeStepAutonomous.mockResolvedValue({ content: 'AI output about pricing strategy' });

    // After concept-A completes, discovery finds concept-B
    mockConceptMatchingService.findRelevantConcepts.mockResolvedValue([
      { conceptId: 'concept-B', conceptName: 'Pricing Strategy', category: 'Finance', definition: 'How to price', score: 0.85 },
    ]);

    const callbacks = createMockCallbacks();
    (callbacks as any).createConversationForConcept = jest.fn().mockResolvedValue('conv-B');
    (callbacks as any).onConceptDiscovered = jest.fn();

    const conceptConvs = new Map([['concept-A', 'conv-A']]);

    await service.startYoloExecution(
      'tenant-1', 'user-1', 'conv-main', defaultConfig, callbacks, conceptConvs,
    );

    await waitForComplete(callbacks);

    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    const result = callbacks.completePayload!;
    // concept-A + discovered concept-B = 2 total
    expect(result.completed).toBe(2);
    expect(result.total).toBe(2);
    expect(mockConceptMatchingService.findRelevantConcepts).toHaveBeenCalled();
    expect((callbacks as any).createConversationForConcept).toHaveBeenCalledWith('concept-B', 'Pricing Strategy');

    // Story 2.13: Verify dynamic relationship creation is triggered for discovered concepts
    expect(mockConceptService.createDynamicRelationships).toHaveBeenCalledWith('concept-B', 'Pricing Strategy');
  });

  // ─── Test 9: Discovery Respects Hard Stop ──────────────────

  it('should stop discovering concepts when hard stop is reached', async () => {
    const notes = [makeFakeNote('task-A', 'concept-A', 'Task A')];
    mockPrisma.note.findMany.mockResolvedValue(notes);

    mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
      steps: [{ stepNumber: 1, title: 'Step', description: 'Do', estimatedMinutes: 1, departmentTag: 'gen' }],
    });
    mockWorkflowService.executeStepAutonomous.mockResolvedValue({ content: 'output' });

    // Discovery returns 5 new concepts, but hard stop is 3 (1 initial + 2 max discovered)
    mockConceptMatchingService.findRelevantConcepts.mockResolvedValue([
      { conceptId: 'c-1', conceptName: 'C1', category: 'F', definition: 'd', score: 0.9 },
      { conceptId: 'c-2', conceptName: 'C2', category: 'F', definition: 'd', score: 0.85 },
      { conceptId: 'c-3', conceptName: 'C3', category: 'F', definition: 'd', score: 0.8 },
      { conceptId: 'c-4', conceptName: 'C4', category: 'F', definition: 'd', score: 0.75 },
      { conceptId: 'c-5', conceptName: 'C5', category: 'F', definition: 'd', score: 0.7 },
    ]);
    const hardStopConfig: YoloConfig = { maxConcurrency: 1, maxConceptsHardStop: 3, retryAttempts: 1 };
    const callbacks = createMockCallbacks();
    (callbacks as any).createConversationForConcept = jest.fn().mockResolvedValue('conv-new');
    (callbacks as any).onConceptDiscovered = jest.fn();

    const conceptConvs = new Map([['concept-A', 'conv-A']]);

    await service.startYoloExecution(
      'tenant-1', 'user-1', 'conv-main', hardStopConfig, callbacks, conceptConvs,
    );

    await waitForComplete(callbacks);

    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    // 1 initial + at most 2 discovered = 3 total (hard stop)
    expect(callbacks.completePayload!.total).toBeLessThanOrEqual(3);
    expect(callbacks.completePayload!.status).toBe('hard-stopped');
  });

  // ─── Test 10: No Duplicate Discovery ───────────────────────

  it('should not create duplicate tasks for already-known concepts', async () => {
    const notes = [
      makeFakeNote('task-A', 'concept-A', 'Task A'),
      makeFakeNote('task-B', 'concept-B', 'Task B'),
    ];
    mockPrisma.note.findMany.mockResolvedValue(notes);

    mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
      steps: [{ stepNumber: 1, title: 'Step', description: 'Do', estimatedMinutes: 1, departmentTag: 'gen' }],
    });
    mockWorkflowService.executeStepAutonomous.mockResolvedValue({ content: 'output' });

    // Both tasks discover concept-B (already in initial set) — should be skipped
    mockConceptMatchingService.findRelevantConcepts.mockResolvedValue([
      { conceptId: 'concept-B', conceptName: 'Task B', category: 'F', definition: 'd', score: 0.9 },
    ]);

    const callbacks = createMockCallbacks();
    (callbacks as any).createConversationForConcept = jest.fn();
    (callbacks as any).onConceptDiscovered = jest.fn();

    const conceptConvs = new Map([['concept-A', 'conv-A'], ['concept-B', 'conv-B']]);

    await service.startYoloExecution(
      'tenant-1', 'user-1', 'conv-main', defaultConfig, callbacks, conceptConvs,
    );

    await waitForComplete(callbacks);

    // No new tasks should have been created — concept-B already in initial set
    expect((callbacks as any).createConversationForConcept).not.toHaveBeenCalled();
    expect(callbacks.completePayload!.total).toBe(2);
  });

  // ─── Story 2.16: Per-Step Progress Tests ───────────────────

  it('should include recentLogs in progress payloads (AC5)', async () => {
    const notes = [makeFakeNote('task-A', 'concept-A', 'Task A')];
    mockPrisma.note.findMany.mockResolvedValue(notes);

    mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
      steps: [{ stepNumber: 1, title: 'Step 1', description: 'Do', estimatedMinutes: 1, departmentTag: 'gen' }],
    });
    mockWorkflowService.executeStepAutonomous.mockResolvedValue({ content: 'AI output' });

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([['concept-A', 'conv-A']]);

    await service.startYoloExecution(
      'tenant-1', 'user-1', 'conv-main', defaultConfig, callbacks, conceptConvs,
    );

    await waitForComplete(callbacks);

    // At least one progress payload should contain recentLogs
    const hasRecentLogs = callbacks.progressHistory.some((p) => Array.isArray(p.recentLogs) && p.recentLogs.length > 0);
    expect(hasRecentLogs).toBe(true);
  });

  it('should include step detail in currentTasks during execution (AC5)', async () => {
    const notes = [makeFakeNote('task-A', 'concept-A', 'Task A')];
    mockPrisma.note.findMany.mockResolvedValue(notes);

    mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
      steps: [
        { stepNumber: 1, title: 'Market Analysis', description: 'Analyze', estimatedMinutes: 1, departmentTag: 'gen' },
        { stepNumber: 2, title: 'Competitor Review', description: 'Review', estimatedMinutes: 1, departmentTag: 'gen' },
      ],
    });
    mockWorkflowService.executeStepAutonomous.mockResolvedValue({ content: 'Done' });

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([['concept-A', 'conv-A']]);

    await service.startYoloExecution(
      'tenant-1', 'user-1', 'conv-main', defaultConfig, callbacks, conceptConvs,
    );

    await waitForComplete(callbacks);

    // Find a progress payload with step detail
    const withStepDetail = callbacks.progressHistory.find((p) =>
      p.currentTasks.some((t) => t.currentStep !== undefined && t.totalSteps !== undefined),
    );
    expect(withStepDetail).toBeDefined();
    const task = withStepDetail!.currentTasks.find((t) => t.currentStep !== undefined)!;
    expect(task.totalSteps).toBe(2);
    expect(task.currentStepIndex).toBeDefined();
  });

  it('should emit more progress events with per-step tracking than without (AC5)', async () => {
    const notes = [makeFakeNote('task-A', 'concept-A', 'Task A')];
    mockPrisma.note.findMany.mockResolvedValue(notes);

    mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
      steps: [
        { stepNumber: 1, title: 'S1', description: 'D1', estimatedMinutes: 1, departmentTag: 'gen' },
        { stepNumber: 2, title: 'S2', description: 'D2', estimatedMinutes: 1, departmentTag: 'gen' },
        { stepNumber: 3, title: 'S3', description: 'D3', estimatedMinutes: 1, departmentTag: 'gen' },
      ],
    });
    mockWorkflowService.executeStepAutonomous.mockResolvedValue({ content: 'Done' });

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([['concept-A', 'conv-A']]);

    await service.startYoloExecution(
      'tenant-1', 'user-1', 'conv-main', defaultConfig, callbacks, conceptConvs,
    );

    await waitForComplete(callbacks);

    // With 3 steps: initial + step-start*3 + step-complete*3 + task-complete = 8 calls minimum
    // Previously without step tracking: initial + task-complete = 2
    expect(callbacks.progressHistory.length).toBeGreaterThanOrEqual(7);
  });

  it('should include logs in YoloCompletePayload (AC5)', async () => {
    const notes = [makeFakeNote('task-A', 'concept-A', 'Task A')];
    mockPrisma.note.findMany.mockResolvedValue(notes);

    mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
      steps: [{ stepNumber: 1, title: 'Step', description: 'Do', estimatedMinutes: 1, departmentTag: 'gen' }],
    });
    mockWorkflowService.executeStepAutonomous.mockResolvedValue({ content: 'Done' });

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([['concept-A', 'conv-A']]);

    await service.startYoloExecution(
      'tenant-1', 'user-1', 'conv-main', defaultConfig, callbacks, conceptConvs,
    );

    await waitForComplete(callbacks);

    const result = callbacks.completePayload!;
    expect(result.logs).toBeDefined();
    expect(Array.isArray(result.logs)).toBe(true);
    expect(result.logs!.length).toBeGreaterThan(0);
  });

  it('should maintain backward compatibility — new fields are optional (AC6)', async () => {
    const notes = [makeFakeNote('task-A', 'concept-A', 'Task A')];
    mockPrisma.note.findMany.mockResolvedValue(notes);

    mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
      steps: [{ stepNumber: 1, title: 'Step', description: 'Do', estimatedMinutes: 1, departmentTag: 'gen' }],
    });
    mockWorkflowService.executeStepAutonomous.mockResolvedValue({ content: 'Done' });

    const callbacks = createMockCallbacks();
    const conceptConvs = new Map([['concept-A', 'conv-A']]);

    await service.startYoloExecution(
      'tenant-1', 'user-1', 'conv-main', defaultConfig, callbacks, conceptConvs,
    );

    await waitForComplete(callbacks);

    // All existing fields still present
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
});
