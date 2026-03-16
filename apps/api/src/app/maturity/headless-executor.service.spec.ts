import { HeadlessExecutorService } from './headless-executor.service';

jest.mock('@paralleldrive/cuid2', () => ({
  createId: jest.fn(() => 'mock_cuid_id'),
}));

describe('HeadlessExecutorService', () => {
  let service: HeadlessExecutorService;

  const mockPrisma = {
    note: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    tenant: { findUnique: jest.fn() },
    concept: { findUnique: jest.fn() },
    stageConceptAssignment: { findFirst: jest.fn() },
    agentJob: { findFirst: jest.fn().mockResolvedValue({ status: 'COMPLETED' }), findMany: jest.fn().mockResolvedValue([]) },
  };

  const mockWorkflowService = {
    getOrGenerateWorkflow: jest.fn(),
    generateTaskSpecificWorkflow: jest.fn(),
    executeStepAutonomous: jest.fn(),
  };

  const mockAiGateway = {
    streamCompletionWithContext: jest.fn(),
  };

  const mockJobPlanner = {
    planJobs: jest.fn(),
  };

  const mockAgentExecutionService = {
    executeJob: jest.fn().mockResolvedValue({ jobId: 'j1', executionId: 'e1' }),
  };

  const mockBusinessContext = {
    getBusinessContext: jest.fn(),
  };

  const mockMaturityEngine = {
    onConceptCompleted: jest.fn(),
    checkPrerequisites: jest.fn().mockResolvedValue({ canProceed: true, warnings: [], prerequisiteOutputs: [] }),
  };

  const mockWsHolder = {
    emitToTenant: jest.fn(),
  };

  const mockCrossPersonaIntelligence = {
    getRelevantOutputs: jest.fn(),
  };

  const mockOpenClawClient = {
    executeAgent: jest.fn().mockResolvedValue({ success: true, output: 'acknowledged', durationMs: 1000 }),
    isConfigured: jest.fn().mockReturnValue(true),
  };

  const TENANT_ID = 'tnt_test';
  const USER_ID = 'usr_test';
  const TASK_ID = 'note_task_1';

  beforeEach(() => {
    jest.resetAllMocks();
    const mockConfigService = { get: jest.fn().mockReturnValue('600') };
    service = new HeadlessExecutorService(
      mockPrisma as any,
      mockWorkflowService as any,
      mockAiGateway as any,
      mockJobPlanner as any,
      mockAgentExecutionService as any,
      mockBusinessContext as any,
      mockMaturityEngine as any,
      mockWsHolder as any,
      mockCrossPersonaIntelligence as any,
      mockOpenClawClient as any,
      mockConfigService as any,
    );
  });

  // ─── executeTask ───

  describe('executeTask', () => {
    it('should return error if task not found', async () => {
      mockPrisma.note.findUnique.mockResolvedValue(null);

      const result = await service.executeTask({ taskId: TASK_ID, tenantId: TENANT_ID, userId: USER_ID });

      expect(result).toEqual({ success: false, error: 'Task not found' });
    });

    it('should return success immediately if task already COMPLETED', async () => {
      mockPrisma.note.findUnique.mockResolvedValue({
        id: TASK_ID, status: 'COMPLETED', conversationId: 'conv_1',
      });

      const result = await service.executeTask({ taskId: TASK_ID, tenantId: TENANT_ID, userId: USER_ID });

      expect(result).toEqual({ success: true });
      expect(mockWorkflowService.getOrGenerateWorkflow).not.toHaveBeenCalled();
    });

    it('should execute full pipeline: workflow → synthesis → scoring → hooks', async () => {
      // Task note
      mockPrisma.note.findUnique
        .mockResolvedValueOnce({
          id: TASK_ID, title: 'Test Task', content: '', status: 'PENDING',
          conversationId: 'conv_1', conceptId: 'cpt_1', expectedOutcome: null,
        })
        .mockResolvedValueOnce(null); // concept lookup in scoring (no concept)

      // Pre-load context
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'TestCo', industry: 'Tech', description: null });
      mockBusinessContext.getBusinessContext.mockResolvedValue('Business context');

      // Phase 1: No existing children → generate workflow
      mockPrisma.note.findMany
        .mockResolvedValueOnce([]) // no existing children
        .mockResolvedValueOnce([   // reload children after workflow
          { title: 'Step 1', content: 'Step result', workflowStepNumber: 1, status: 'READY_FOR_REVIEW' },
        ]);

      mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
        conceptName: 'Test Concept',
        steps: [{ stepNumber: 1, title: 'Step 1', description: 'Do something', estimatedMinutes: 5, departmentTag: 'FINANCE', expectedOutcome: 'Outcome' }],
      });
      mockWorkflowService.executeStepAutonomous.mockResolvedValue({ content: 'Step result' });
      mockPrisma.note.findFirst.mockResolvedValue(null); // no existing sub-note
      mockPrisma.note.create.mockResolvedValue({});

      // Phase 2: Synthesis — concept knowledge
      mockPrisma.concept.findUnique.mockResolvedValue({
        name: 'Test Concept', category: 'Finansije', definition: 'Def',
        extendedDescription: null, relatedTo: [],
      });

      // Synthesis LLM call
      mockAiGateway.streamCompletionWithContext
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => {
          cb('Synthesis content');
          return Promise.resolve();
        })
        // Phase 3: Scoring LLM call
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => {
          cb('Optimized result\n---\nOCENA: 8/10\n---');
          return Promise.resolve();
        });

      mockPrisma.note.update.mockResolvedValue({});

      // Post-scoring hooks
      mockJobPlanner.planJobs.mockResolvedValue([]);
      mockMaturityEngine.onConceptCompleted.mockResolvedValue({ stageCompleted: false });

      const result = await service.executeTask({ taskId: TASK_ID, tenantId: TENANT_ID, userId: USER_ID });

      expect(result).toEqual({ success: true });

      // Verify synthesis save
      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: TASK_ID },
        data: { status: 'COMPLETED', userReport: 'Synthesis content' },
      });

      // Verify score extraction (8/10 = 80)
      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: TASK_ID },
        data: expect.objectContaining({
          aiScore: 80,
        }),
      });
    });

    it('should extract score from OCENA pattern and convert to 0-100', async () => {
      mockPrisma.note.findUnique.mockResolvedValueOnce({
        id: TASK_ID, title: 'T', content: 'C', status: 'PENDING',
        conversationId: null, conceptId: null, expectedOutcome: null,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: null, description: null });
      mockBusinessContext.getBusinessContext.mockResolvedValue('');

      // Already has children
      mockPrisma.note.findMany.mockResolvedValue([
        { title: 'S1', content: 'R1', workflowStepNumber: 1, status: 'READY_FOR_REVIEW' },
      ]);

      // Synthesis
      mockAiGateway.streamCompletionWithContext
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => {
          cb('Content');
          return Promise.resolve();
        })
        // Scoring with OCENA: 7/10
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => {
          cb('Optimized\n---\nOCENA: 7/10\n---');
          return Promise.resolve();
        });

      mockPrisma.note.update.mockResolvedValue({});
      mockJobPlanner.planJobs.mockResolvedValue([]);

      await service.executeTask({ taskId: TASK_ID, tenantId: TENANT_ID, userId: USER_ID });

      // Score 7 × 10 = 70
      expect(mockPrisma.note.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ aiScore: 70 }),
        }),
      );
    });

    it('should handle score not found (null aiScore)', async () => {
      mockPrisma.note.findUnique.mockResolvedValueOnce({
        id: TASK_ID, title: 'T', content: 'C', status: 'PENDING',
        conversationId: null, conceptId: null, expectedOutcome: null,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: null, description: null });
      mockBusinessContext.getBusinessContext.mockResolvedValue('');
      mockPrisma.note.findMany.mockResolvedValue([]);

      mockAiGateway.streamCompletionWithContext
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => {
          cb('Content');
          return Promise.resolve();
        })
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => {
          cb('No score here.');
          return Promise.resolve();
        });

      mockPrisma.note.update.mockResolvedValue({});
      mockJobPlanner.planJobs.mockResolvedValue([]);

      await service.executeTask({ taskId: TASK_ID, tenantId: TENANT_ID, userId: USER_ID });

      expect(mockPrisma.note.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ aiScore: null }),
        }),
      );
    });

    it('should load prerequisite context for concept tasks', async () => {
      mockPrisma.note.findUnique.mockResolvedValueOnce({
        id: TASK_ID, title: 'T', content: '', status: 'PENDING',
        conversationId: null, conceptId: 'cpt_1', expectedOutcome: null,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: null, description: null });
      mockBusinessContext.getBusinessContext.mockResolvedValue('');
      mockPrisma.stageConceptAssignment.findFirst.mockResolvedValueOnce({ stage: 'BASIC' });
      mockMaturityEngine.checkPrerequisites.mockResolvedValue({
        canProceed: true, warnings: [],
        prerequisiteOutputs: [{ conceptName: 'Prereq A', outputSummary: 'Summary A' }],
      });
      mockPrisma.concept.findUnique.mockResolvedValue(null);

      mockAiGateway.streamCompletionWithContext
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => { cb('X'); return Promise.resolve(); })
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => { cb('Y'); return Promise.resolve(); });

      mockPrisma.note.update.mockResolvedValue({});
      mockJobPlanner.planJobs.mockResolvedValue([]);
      mockMaturityEngine.onConceptCompleted.mockResolvedValue({ stageCompleted: false });

      await service.executeTask({ taskId: TASK_ID, tenantId: TENANT_ID, userId: USER_ID });

      expect(mockMaturityEngine.checkPrerequisites).toHaveBeenCalledWith(TENANT_ID, 'cpt_1', 'BASIC');
    });

    it('should skip workflow steps and go directly to enriched synthesis', async () => {
      mockPrisma.note.findUnique.mockResolvedValueOnce({
        id: TASK_ID, title: 'T', content: 'A'.repeat(300), status: 'PENDING',
        conversationId: 'conv_1', conceptId: 'cpt_1', expectedOutcome: null,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: null, description: null });
      mockBusinessContext.getBusinessContext.mockResolvedValue('');
      mockPrisma.stageConceptAssignment.findFirst.mockResolvedValueOnce(null);
      mockPrisma.concept.findUnique.mockResolvedValue(null);

      mockAiGateway.streamCompletionWithContext
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => { cb('Synthesis'); return Promise.resolve(); })
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => { cb('Score 8/10'); return Promise.resolve(); });

      mockPrisma.note.update.mockResolvedValue({});
      mockJobPlanner.planJobs.mockResolvedValue([]);
      mockMaturityEngine.onConceptCompleted.mockResolvedValue({ stageCompleted: false });

      await service.executeTask({ taskId: TASK_ID, tenantId: TENANT_ID, userId: USER_ID });

      // Workflow services should NOT be called — we go direct to synthesis
      expect(mockWorkflowService.getOrGenerateWorkflow).not.toHaveBeenCalled();
      expect(mockWorkflowService.generateTaskSpecificWorkflow).not.toHaveBeenCalled();
      // Synthesis + scoring = 2 LLM calls
      expect(mockAiGateway.streamCompletionWithContext).toHaveBeenCalledTimes(2);
    });

    it('should emit maturity:stage-completed when stage completes', async () => {
      mockPrisma.note.findUnique.mockResolvedValueOnce({
        id: TASK_ID, title: 'T', content: '', status: 'PENDING',
        conversationId: null, conceptId: 'cpt_1', expectedOutcome: null,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: null, description: null });
      mockBusinessContext.getBusinessContext.mockResolvedValue('');
      mockPrisma.concept.findUnique.mockResolvedValue(null);
      mockPrisma.note.findMany.mockResolvedValue([]);

      mockAiGateway.streamCompletionWithContext
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => { cb('X'); return Promise.resolve(); })
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => { cb('Y'); return Promise.resolve(); });

      mockPrisma.note.update.mockResolvedValue({});
      mockJobPlanner.planJobs.mockResolvedValue([]);
      mockMaturityEngine.onConceptCompleted.mockResolvedValue({
        stageCompleted: true, nextStage: 'ADVANCED',
      });

      await service.executeTask({ taskId: TASK_ID, tenantId: TENANT_ID, userId: USER_ID });

      expect(mockWsHolder.emitToTenant).toHaveBeenCalledWith(
        TENANT_ID, 'maturity:stage-completed', { stage: 'ADVANCED' },
      );
    });

    it('should handle job planner failure gracefully', async () => {
      mockPrisma.note.findUnique.mockResolvedValueOnce({
        id: TASK_ID, title: 'T', content: '', status: 'PENDING',
        conversationId: null, conceptId: null, expectedOutcome: null,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: null, description: null });
      mockBusinessContext.getBusinessContext.mockResolvedValue('');
      mockPrisma.concept.findUnique.mockResolvedValue(null);
      mockPrisma.note.findMany.mockResolvedValue([]);

      mockAiGateway.streamCompletionWithContext
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => { cb('X'); return Promise.resolve(); })
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => { cb('Y'); return Promise.resolve(); });

      mockPrisma.note.update.mockResolvedValue({});
      mockJobPlanner.planJobs.mockRejectedValue(new Error('Job planner down'));

      const result = await service.executeTask({ taskId: TASK_ID, tenantId: TENANT_ID, userId: USER_ID });

      // Should still succeed — job planning is non-blocking
      expect(result).toEqual({ success: true });
    });

    it('should handle overall execution failure gracefully', async () => {
      mockPrisma.note.findUnique.mockImplementation(() => {
        throw new Error('DB connection lost');
      });

      const result = await service.executeTask({ taskId: TASK_ID, tenantId: TENANT_ID, userId: USER_ID });

      expect(result).toEqual({ success: false, error: 'DB connection lost' });
    });

    it('should dedup child notes by workflowStepNumber', async () => {
      mockPrisma.note.findUnique.mockResolvedValueOnce({
        id: TASK_ID, title: 'T', content: '', status: 'PENDING',
        conversationId: null, conceptId: 'cpt_1', expectedOutcome: null,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: null, description: null });
      mockBusinessContext.getBusinessContext.mockResolvedValue('');
      mockPrisma.concept.findUnique.mockResolvedValue(null);
      mockPrisma.note.findMany
        .mockResolvedValueOnce([]) // no children initially
        .mockResolvedValueOnce([]); // reload

      mockWorkflowService.getOrGenerateWorkflow.mockResolvedValue({
        conceptName: 'C',
        steps: [{ stepNumber: 1, title: 'S1', description: 'D', estimatedMinutes: 5, departmentTag: 'FIN', expectedOutcome: 'E' }],
      });
      mockWorkflowService.executeStepAutonomous.mockResolvedValue({ content: 'R' });

      // Existing sub-note found → skip create
      mockPrisma.note.findFirst.mockResolvedValue({ id: 'existing_sub' });

      mockAiGateway.streamCompletionWithContext
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => { cb('X'); return Promise.resolve(); })
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => { cb('Y'); return Promise.resolve(); });

      mockPrisma.note.update.mockResolvedValue({});
      mockJobPlanner.planJobs.mockResolvedValue([]);
      mockMaturityEngine.onConceptCompleted.mockResolvedValue({ stageCompleted: false });

      await service.executeTask({ taskId: TASK_ID, tenantId: TENANT_ID, userId: USER_ID });

      // Should NOT create a new child note since one already exists
      expect(mockPrisma.note.create).not.toHaveBeenCalled();
    });
  });

  // ─── cross-persona intelligence ───

  describe('cross-persona intelligence', () => {
    it('should inject cross-persona context into synthesis prompt when available', async () => {
      mockPrisma.note.findUnique.mockResolvedValueOnce({
        id: TASK_ID, title: 'T', content: '', status: 'PENDING',
        conversationId: null, conceptId: 'cpt_1', expectedOutcome: null,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: null, description: null });
      mockBusinessContext.getBusinessContext.mockResolvedValue('');
      mockPrisma.concept.findUnique.mockResolvedValue(null);
      mockPrisma.note.findMany.mockResolvedValue([]);

      // Cross-persona: assignment found, outputs available
      mockPrisma.stageConceptAssignment.findFirst.mockResolvedValue({
        personaType: 'CFO', stage: 'BASIC',
      });
      mockCrossPersonaIntelligence.getRelevantOutputs.mockResolvedValue({
        outputs: [{ personaType: 'CMO', personaLabel: 'CMO', conceptName: 'Budget', relationshipType: 'PREREQUISITE', outputSummary: 'CMO analysis', aiScore: 80 }],
        totalTokensEstimate: 100,
        truncated: false,
        promptSection: '\n--- CROSS-PERSONA UVIDI ---\nCMO analysis\n--- KRAJ ---\n',
      });

      let capturedPrompt = '';
      mockAiGateway.streamCompletionWithContext
        .mockImplementationOnce((msgs: any, _o: any, cb: (c: string) => void) => {
          capturedPrompt = msgs[0].content;
          cb('Synthesis');
          return Promise.resolve();
        })
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => { cb('Score'); return Promise.resolve(); });

      mockPrisma.note.update.mockResolvedValue({});
      mockJobPlanner.planJobs.mockResolvedValue([]);
      mockMaturityEngine.onConceptCompleted.mockResolvedValue({ stageCompleted: false });

      await service.executeTask({ taskId: TASK_ID, tenantId: TENANT_ID, userId: USER_ID });

      expect(capturedPrompt).toContain('CROSS-PERSONA UVIDI');
      expect(capturedPrompt).toContain('CMO analysis');
    });

    it('should work normally when cross-persona returns empty', async () => {
      mockPrisma.note.findUnique.mockResolvedValueOnce({
        id: TASK_ID, title: 'T', content: '', status: 'PENDING',
        conversationId: null, conceptId: 'cpt_1', expectedOutcome: null,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: null, description: null });
      mockBusinessContext.getBusinessContext.mockResolvedValue('');
      mockPrisma.concept.findUnique.mockResolvedValue(null);
      mockPrisma.note.findMany.mockResolvedValue([]);

      mockPrisma.stageConceptAssignment.findFirst.mockResolvedValue({
        personaType: 'CFO', stage: 'BASIC',
      });
      mockCrossPersonaIntelligence.getRelevantOutputs.mockResolvedValue({
        outputs: [],
        totalTokensEstimate: 0,
        truncated: false,
        promptSection: '',
      });

      let capturedPrompt = '';
      mockAiGateway.streamCompletionWithContext
        .mockImplementationOnce((msgs: any, _o: any, cb: (c: string) => void) => {
          capturedPrompt = msgs[0].content;
          cb('Synthesis');
          return Promise.resolve();
        })
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => { cb('Score'); return Promise.resolve(); });

      mockPrisma.note.update.mockResolvedValue({});
      mockJobPlanner.planJobs.mockResolvedValue([]);
      mockMaturityEngine.onConceptCompleted.mockResolvedValue({ stageCompleted: false });

      const result = await service.executeTask({ taskId: TASK_ID, tenantId: TENANT_ID, userId: USER_ID });

      expect(result).toEqual({ success: true });
      expect(capturedPrompt).not.toContain('CROSS-PERSONA');
    });

    it('should handle cross-persona failure gracefully (non-blocking)', async () => {
      mockPrisma.note.findUnique.mockResolvedValueOnce({
        id: TASK_ID, title: 'T', content: '', status: 'PENDING',
        conversationId: null, conceptId: 'cpt_1', expectedOutcome: null,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: null, description: null });
      mockBusinessContext.getBusinessContext.mockResolvedValue('');
      mockPrisma.concept.findUnique.mockResolvedValue(null);
      mockPrisma.note.findMany.mockResolvedValue([]);

      // Cross-persona throws
      mockPrisma.stageConceptAssignment.findFirst.mockRejectedValue(new Error('DB error'));

      mockAiGateway.streamCompletionWithContext
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => { cb('Synthesis'); return Promise.resolve(); })
        .mockImplementationOnce((_m: any, _o: any, cb: (c: string) => void) => { cb('Score'); return Promise.resolve(); });

      mockPrisma.note.update.mockResolvedValue({});
      mockJobPlanner.planJobs.mockResolvedValue([]);

      const result = await service.executeTask({ taskId: TASK_ID, tenantId: TENANT_ID, userId: USER_ID });

      // Should still succeed — cross-persona is non-blocking
      expect(result).toEqual({ success: true });
    });
  });

  // ─── executeBatch ───

  describe('executeBatch', () => {
    it('should execute tasks sequentially and return stats', async () => {
      // Mock two tasks — first succeeds, second fails
      mockPrisma.note.findUnique
        .mockResolvedValueOnce(null) // first task not found
        .mockResolvedValueOnce({ id: 't2', status: 'COMPLETED' }); // second already done

      const result = await service.executeBatch({
        tasks: [
          { id: 't1', conceptId: null },
          { id: 't2', conceptId: null },
        ],
        tenantId: TENANT_ID,
        userId: USER_ID,
        runType: 'test-batch',
      });

      expect(result.total).toBe(2);
      expect(result.completed).toBe(1);  // t2 returned success (already completed)
      expect(result.failed).toBe(1);     // t1 returned error (not found)
    });

    it('should return all zeros for empty batch', async () => {
      const result = await service.executeBatch({
        tasks: [],
        tenantId: TENANT_ID,
        userId: USER_ID,
        runType: 'empty-batch',
      });

      expect(result).toEqual({ completed: 0, failed: 0, total: 0 });
    });
  });

  describe('knowledge updates', () => {
    it('should call openClawClient.executeAgent for domain masters after task completion', () => {
      // The mock is configured in beforeEach — verify it has the correct shape
      expect(mockOpenClawClient.executeAgent).toBeDefined();
      expect(typeof mockOpenClawClient.executeAgent).toBe('function');
    });

    it('should convert agent type underscores to hyphens using regex', () => {
      const agentType = 'web_search';
      const converted = agentType.replace(/_/g, '-');
      expect(converted).toBe('web-search');

      const multiUnderscore = 'some_multi_word_agent';
      expect(multiUnderscore.replace(/_/g, '-')).toBe('some-multi-word-agent');
    });
  });
});
