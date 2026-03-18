import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AgentType, AgentExecutionStatus } from '@mentor-ai/shared/types';
import { AgentExecutionService } from './agent-execution.service';
import { AgentRegistryService } from './agent-registry.service';

// Mock createId
jest.mock('@paralleldrive/cuid2', () => ({
  createId: () => 'test-cuid-001',
}));

describe('AgentExecutionService', () => {
  let service: AgentExecutionService;
  let mockPrisma: any;
  let mockOpenClaw: any;
  let mockAgentPrompt: any;
  let registry: AgentRegistryService;
  let mockBudget: any;
  let mockEventBus: any;
  let mockNotesService: any;

  const TENANT_ID = 'tenant-1';
  const USER_ID = 'user-1';
  const NOTE_ID = 'note-1';

  const mockNote = {
    id: NOTE_ID,
    title: 'Market Research',
    content: 'Research the CRM market',
    userReport: 'Completed report content...',
    expectedOutcome: 'Full analysis document',
    tenantId: TENANT_ID,
  };

  beforeEach(() => {
    registry = new AgentRegistryService();

    mockPrisma = {
      note: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      agentExecution: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      agentJob: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    mockOpenClaw = {
      isConfigured: jest.fn().mockReturnValue(true),
      executeAgent: jest.fn().mockResolvedValue({
        success: true,
        output: 'Agent completed output',
        durationMs: 5000,
        usage: { input: 1000, output: 500, total: 1500 },
      }),
    };

    mockAgentPrompt = {
      formatPrompt: jest.fn().mockReturnValue('Formatted instruction for agent'),
    };

    mockBudget = {
      canSpend: jest.fn().mockResolvedValue(true),
      recordSpend: jest.fn().mockResolvedValue(undefined),
      getEstimatedCost: jest.fn().mockReturnValue(0.5),
    };

    mockEventBus = {
      emit: jest.fn(),
    };

    mockNotesService = {
      createNote: jest.fn().mockResolvedValue({ id: 'child-note-001' }),
    };

    service = new AgentExecutionService(
      mockPrisma,
      mockOpenClaw,
      mockAgentPrompt,
      registry,
      mockBudget,
      mockEventBus,
      mockNotesService
    );
  });

  describe('triggerAgent()', () => {
    beforeEach(() => {
      mockPrisma.note.findFirst.mockResolvedValue(mockNote);
      mockPrisma.agentExecution.findFirst.mockResolvedValue(null); // no active
      mockPrisma.agentExecution.count.mockResolvedValue(0); // no concurrent
    });

    it('should create execution and return executionId', async () => {
      const result = await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);

      expect(result.executionId).toBe('agx_test-cuid-001');
      expect(mockPrisma.agentExecution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'agx_test-cuid-001',
          noteId: NOTE_ID,
          tenantId: TENANT_ID,
          userId: USER_ID,
          status: 'PENDING',
          agentType: AgentType.WEB_SEARCH,
        }),
      });
    });

    it('should reserve budget on trigger', async () => {
      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);

      expect(mockBudget.recordSpend).toHaveBeenCalledWith(TENANT_ID, 0.5);
    });

    it('should throw NotFoundException when note not found', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await expect(
        service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when note has no userReport', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({ ...mockNote, userReport: null });

      await expect(
        service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when OpenClaw not configured', async () => {
      mockOpenClaw.isConfigured.mockReturnValue(false);

      await expect(
        service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when active execution exists', async () => {
      mockPrisma.agentExecution.findFirst.mockResolvedValue({ id: 'existing-exec' });

      await expect(
        service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when budget exceeded', async () => {
      mockBudget.canSpend.mockResolvedValue(false);

      await expect(
        service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when max concurrent reached', async () => {
      mockPrisma.agentExecution.count.mockResolvedValue(3);

      await expect(
        service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw for unknown agent type', async () => {
      expect(() =>
        service.triggerAgent(NOTE_ID, 'UNKNOWN' as AgentType, USER_ID, TENANT_ID)
      ).rejects.toThrow();
    });

    it('should allow concurrent below limit', async () => {
      mockPrisma.agentExecution.count.mockResolvedValue(2);

      const result = await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);

      expect(result.executionId).toBeTruthy();
    });
  });

  describe('executeAgentPipeline (via triggerAgent)', () => {
    beforeEach(() => {
      mockPrisma.note.findFirst.mockResolvedValue(mockNote);
      mockPrisma.agentExecution.findFirst.mockResolvedValue(null);
      mockPrisma.agentExecution.count.mockResolvedValue(0);
    });

    it('should call formatPrompt with correct params', async () => {
      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);

      // Wait for fire-and-forget pipeline
      await new Promise((r) => setTimeout(r, 50));

      expect(mockAgentPrompt.formatPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: AgentType.WEB_SEARCH,
          taskTitle: 'Market Research',
          taskContent: 'Research the CRM market',
          userReport: 'Completed report content...',
          expectedOutcome: 'Full analysis document',
          tenantId: TENANT_ID,
          userId: USER_ID,
        })
      );
    });

    it('should call openClawClient.executeAgent with formatted prompt', async () => {
      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockOpenClaw.executeAgent).toHaveBeenCalledWith(
        'Formatted instruction for agent',
        expect.objectContaining({
          agentId: 'web-search',
        })
      );
    });

    it('should emit status-change events through pipeline', async () => {
      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      const statusEvents = mockEventBus.emit.mock.calls.filter(
        (c: any) => c[0].eventName === 'agent:status-change'
      );

      expect(statusEvents.length).toBeGreaterThanOrEqual(2); // FORMATTING + EXECUTING + COMPLETED
    });

    it('should emit agent:result on success', async () => {
      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      const resultEvents = mockEventBus.emit.mock.calls.filter(
        (c: any) => c[0].eventName === 'agent:result'
      );

      expect(resultEvents).toHaveLength(1);
      expect(resultEvents[0][0].payload.output).toBe('Agent completed output');
    });

    it('should emit formatting-complete after prompt formatting', async () => {
      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      const fmtComplete = mockEventBus.emit.mock.calls.filter(
        (c: any) => c[0].eventName === 'agent:formatting-complete'
      );

      expect(fmtComplete).toHaveLength(1);
    });

    it('should store formatted prompt in execution record', async () => {
      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      const updateCalls = mockPrisma.agentExecution.update.mock.calls;
      const promptUpdate = updateCalls.find(
        (c: any) => c[0].data.formattedPrompt !== undefined
      );

      expect(promptUpdate).toBeTruthy();
      expect(promptUpdate[0].data.formattedPrompt).toBe('Formatted instruction for agent');
    });

    it('should merge enrichment to note on success', async () => {
      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('should handle failed OpenClaw result', async () => {
      mockOpenClaw.executeAgent.mockResolvedValue({
        success: false,
        error: 'Agent timeout',
        durationMs: 60000,
      });

      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      const errorEvents = mockEventBus.emit.mock.calls.filter(
        (c: any) => c[0].eventName === 'agent:error'
      );

      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0][0].payload.error).toBe('Agent timeout');
    });

    it('should handle pipeline exception (e.g., formatPrompt throws)', async () => {
      mockAgentPrompt.formatPrompt.mockImplementation(() => { throw new Error('LLM unavailable'); });

      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      const errorEvents = mockEventBus.emit.mock.calls.filter(
        (c: any) => c[0].eventName === 'agent:error'
      );

      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0][0].payload.error).toBe('LLM unavailable');
    });

    it('should invoke onChunk callback during formatting', async () => {
      mockAgentPrompt.formatPrompt.mockImplementation(async (params: any) => {
        params.onChunk?.('chunk1');
        params.onChunk?.('chunk2');
        return 'Full prompt';
      });

      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      const chunkEvents = mockEventBus.emit.mock.calls.filter(
        (c: any) => c[0].eventName === 'agent:formatting-chunk'
      );

      expect(chunkEvents).toHaveLength(2);
    });
  });

  describe('child note creation (Sprint 2 Epic 2.3)', () => {
    beforeEach(() => {
      mockPrisma.note.findFirst.mockResolvedValue(mockNote);
      mockPrisma.agentExecution.findFirst.mockResolvedValue(null);
      mockPrisma.agentExecution.count.mockResolvedValue(0);
    });

    it('should create child note on successful agent execution', async () => {
      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockNotesService.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Market Research'),
          content: 'Agent completed output',
          source: 'CONVERSATION',
          noteType: 'AGENT_RESEARCH',
          status: 'READY_FOR_REVIEW',
          parentNoteId: NOTE_ID,
          userId: USER_ID,
          tenantId: TENANT_ID,
        })
      );
    });

    it('should populate resultNoteId on execution record', async () => {
      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      const completionUpdate = mockPrisma.agentExecution.update.mock.calls.find(
        (c: any) => c[0].data.status === 'COMPLETED'
      );

      expect(completionUpdate[0].data.resultNoteId).toBe('child-note-001');
    });

    it('should count existing child notes for workflowStepNumber', async () => {
      mockPrisma.note.count.mockResolvedValue(2);

      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockPrisma.note.count).toHaveBeenCalledWith({
        where: { parentNoteId: NOTE_ID, tenantId: TENANT_ID },
      });

      expect(mockNotesService.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowStepNumber: 3,
        })
      );
    });

    it('should not create child note when output is empty', async () => {
      mockOpenClaw.executeAgent.mockResolvedValue({
        success: true,
        output: '',
        durationMs: 1000,
      });

      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockNotesService.createNote).not.toHaveBeenCalled();
    });

    it('should handle child note creation failure gracefully', async () => {
      mockNotesService.createNote.mockRejectedValue(new Error('DB constraint violation'));

      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      // Pipeline should still complete (resultNoteId = null)
      const completionUpdate = mockPrisma.agentExecution.update.mock.calls.find(
        (c: any) => c[0].data.status === 'COMPLETED'
      );

      expect(completionUpdate).toBeTruthy();
      expect(completionUpdate[0].data.resultNoteId).toBeNull();
    });

    it('should include agent label in child note title', async () => {
      await service.triggerAgent(NOTE_ID, AgentType.CONTENT, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockNotesService.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Kreiranje sadržaja: Market Research',
        })
      );
    });

    it('should not create child note on failed execution', async () => {
      mockOpenClaw.executeAgent.mockResolvedValue({
        success: false,
        error: 'Agent timeout',
        durationMs: 60000,
      });

      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      expect(mockNotesService.createNote).not.toHaveBeenCalled();
    });
  });

  describe('estimateActualCost (private, tested via pipeline)', () => {
    it('should calculate cost based on token usage', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(mockNote);
      mockPrisma.agentExecution.findFirst.mockResolvedValue(null);
      mockPrisma.agentExecution.count.mockResolvedValue(0);

      mockOpenClaw.executeAgent.mockResolvedValue({
        success: true,
        output: 'Result',
        durationMs: 1000,
        usage: { input: 100000, output: 50000, total: 150000 },
      });

      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      // input: 100000/1M * 0.27 = 0.027
      // output: 50000/1M * 1.1 = 0.055
      // fetch: 0.03
      // total: 0.112 → rounded to 0.112
      const completionUpdate = mockPrisma.agentExecution.update.mock.calls.find(
        (c: any) => c[0].data.status === 'COMPLETED'
      );

      expect(completionUpdate).toBeTruthy();
      expect(completionUpdate[0].data.actualCostEur).toBeCloseTo(0.112, 3);
    });

    it('should use estimated cost when no token usage provided', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(mockNote);
      mockPrisma.agentExecution.findFirst.mockResolvedValue(null);
      mockPrisma.agentExecution.count.mockResolvedValue(0);

      mockOpenClaw.executeAgent.mockResolvedValue({
        success: true,
        output: 'Result',
        durationMs: 1000,
        // No usage field
      });

      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      const completionUpdate = mockPrisma.agentExecution.update.mock.calls.find(
        (c: any) => c[0].data.status === 'COMPLETED'
      );

      expect(completionUpdate[0].data.actualCostEur).toBe(0.5);
    });

    it('should adjust budget when cost differs from estimate', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(mockNote);
      mockPrisma.agentExecution.findFirst.mockResolvedValue(null);
      mockPrisma.agentExecution.count.mockResolvedValue(0);

      mockOpenClaw.executeAgent.mockResolvedValue({
        success: true,
        output: 'Result',
        durationMs: 1000,
        usage: { input: 1000000, output: 500000, total: 1500000 },
      });

      await service.triggerAgent(NOTE_ID, AgentType.WEB_SEARCH, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      // recordSpend called: once for reserve (0.5), once for difference
      expect(mockBudget.recordSpend.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('executeJob()', () => {
    const JOB_ID = 'job-1';
    const mockJob = {
      id: JOB_ID,
      noteId: NOTE_ID,
      tenantId: TENANT_ID,
      agentType: 'web_search',
      order: 1,
      dependsOn: [],
      instruction: 'Research the market for CRM tools',
      status: 'PLANNED',
    };

    beforeEach(() => {
      mockPrisma.agentJob.findFirst.mockResolvedValue(mockJob);
      mockPrisma.note.findFirst.mockResolvedValue(mockNote);
      mockPrisma.agentExecution.count.mockResolvedValue(0);
    });

    it('should create execution and return jobId + executionId', async () => {
      const result = await service.executeJob(JOB_ID, USER_ID, TENANT_ID);

      expect(result.jobId).toBe(JOB_ID);
      expect(result.executionId).toBe('agx_test-cuid-001');
    });

    it('should update job status to RUNNING', async () => {
      await service.executeJob(JOB_ID, USER_ID, TENANT_ID);

      expect(mockPrisma.agentJob.update).toHaveBeenCalledWith({
        where: { id: JOB_ID },
        data: { status: 'RUNNING', executionId: 'agx_test-cuid-001' },
      });
    });

    it('should throw NotFoundException when job not found', async () => {
      mockPrisma.agentJob.findFirst.mockResolvedValue(null);

      await expect(
        service.executeJob(JOB_ID, USER_ID, TENANT_ID)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when job not in PLANNED status', async () => {
      mockPrisma.agentJob.findFirst.mockResolvedValue({
        ...mockJob,
        status: 'COMPLETED',
      });

      await expect(
        service.executeJob(JOB_ID, USER_ID, TENANT_ID)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when dependencies not completed', async () => {
      mockPrisma.agentJob.findFirst.mockResolvedValue({
        ...mockJob,
        dependsOn: ['dep-1', 'dep-2'],
      });
      mockPrisma.agentJob.findMany.mockResolvedValue([
        { id: 'dep-1', status: 'COMPLETED' },
        { id: 'dep-2', status: 'RUNNING' },
      ]);

      await expect(
        service.executeJob(JOB_ID, USER_ID, TENANT_ID)
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow execution when all dependencies completed', async () => {
      mockPrisma.agentJob.findFirst.mockResolvedValue({
        ...mockJob,
        dependsOn: ['dep-1'],
      });
      // First findMany for dependency check, second for gathering dependency context
      mockPrisma.agentJob.findMany
        .mockResolvedValueOnce([{ id: 'dep-1', status: 'COMPLETED' }])
        .mockResolvedValueOnce([
          { id: 'dep-1', status: 'COMPLETED', agentOutput: 'Previous result', agentType: 'web_search', order: 1 },
        ]);

      const result = await service.executeJob(JOB_ID, USER_ID, TENANT_ID);

      expect(result.executionId).toBeTruthy();
    });

    it('should throw when note not found for job', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await expect(
        service.executeJob(JOB_ID, USER_ID, TENANT_ID)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when OpenClaw not configured', async () => {
      mockOpenClaw.isConfigured.mockReturnValue(false);

      await expect(
        service.executeJob(JOB_ID, USER_ID, TENANT_ID)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when budget exceeded', async () => {
      mockBudget.canSpend.mockResolvedValue(false);

      await expect(
        service.executeJob(JOB_ID, USER_ID, TENANT_ID)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw when max concurrent reached', async () => {
      mockPrisma.agentExecution.count.mockResolvedValue(3);

      await expect(
        service.executeJob(JOB_ID, USER_ID, TENANT_ID)
      ).rejects.toThrow(BadRequestException);
    });

    it('should gather dependency context from completed jobs', async () => {
      mockPrisma.agentJob.findFirst.mockResolvedValue({
        ...mockJob,
        dependsOn: ['dep-1'],
      });
      mockPrisma.agentJob.findMany
        .mockResolvedValueOnce([{ id: 'dep-1', status: 'COMPLETED' }]) // dep check
        .mockResolvedValueOnce([ // dep context
          {
            id: 'dep-1', status: 'COMPLETED', agentOutput: 'Research results here',
            agentType: 'web_search', order: 1,
          },
        ]);

      await service.executeJob(JOB_ID, USER_ID, TENANT_ID);
      await new Promise((r) => setTimeout(r, 50));

      // formatPrompt should receive enriched instruction with dependency context
      const promptCall = mockAgentPrompt.formatPrompt.mock.calls[0][0];
      expect(promptCall.taskContent).toContain('Research results here');
    });
  });

  describe('getExecution()', () => {
    it('should return mapped execution response', async () => {
      const now = new Date();
      mockPrisma.agentExecution.findFirst.mockResolvedValue({
        id: 'exec-1',
        noteId: NOTE_ID,
        resultNoteId: null,
        status: 'COMPLETED',
        agentType: 'web_search',
        estimatedCostEur: 0.5,
        actualCostEur: 0.3,
        error: null,
        durationMs: 5000,
        createdAt: now,
        completedAt: now,
      });

      const result = await service.getExecution('exec-1', TENANT_ID);

      expect(result).toEqual({
        id: 'exec-1',
        noteId: NOTE_ID,
        resultNoteId: null,
        status: AgentExecutionStatus.COMPLETED,
        agentType: 'web_search',
        estimatedCostEur: 0.5,
        actualCostEur: 0.3,
        error: null,
        durationMs: 5000,
        createdAt: now.toISOString(),
        completedAt: now.toISOString(),
      });
    });

    it('should return null when execution not found', async () => {
      mockPrisma.agentExecution.findFirst.mockResolvedValue(null);

      const result = await service.getExecution('missing', TENANT_ID);

      expect(result).toBeNull();
    });

    it('should sanitize unknown status to FAILED', async () => {
      mockPrisma.agentExecution.findFirst.mockResolvedValue({
        id: 'exec-1',
        noteId: NOTE_ID,
        resultNoteId: null,
        status: 'INVALID_STATUS',
        agentType: 'web_search',
        estimatedCostEur: null,
        actualCostEur: null,
        error: null,
        durationMs: null,
        createdAt: new Date(),
        completedAt: null,
      });

      const result = await service.getExecution('exec-1', TENANT_ID);

      expect(result?.status).toBe(AgentExecutionStatus.FAILED);
    });

    it('should handle null cost fields', async () => {
      mockPrisma.agentExecution.findFirst.mockResolvedValue({
        id: 'exec-1',
        noteId: NOTE_ID,
        resultNoteId: null,
        status: 'PENDING',
        agentType: 'web_search',
        estimatedCostEur: null,
        actualCostEur: null,
        error: null,
        durationMs: null,
        createdAt: new Date(),
        completedAt: null,
      });

      const result = await service.getExecution('exec-1', TENANT_ID);

      expect(result?.estimatedCostEur).toBeNull();
      expect(result?.actualCostEur).toBeNull();
    });
  });

  describe('getExecutionsByNote()', () => {
    it('should return all executions for a note', async () => {
      const now = new Date();
      mockPrisma.agentExecution.findMany.mockResolvedValue([
        {
          id: 'e1', noteId: NOTE_ID, resultNoteId: null,
          status: 'COMPLETED', agentType: 'web_search',
          estimatedCostEur: 0.5, actualCostEur: 0.3,
          error: null, durationMs: 3000,
          createdAt: now, completedAt: now,
        },
        {
          id: 'e2', noteId: NOTE_ID, resultNoteId: null,
          status: 'FAILED', agentType: 'content',
          estimatedCostEur: 0.5, actualCostEur: null,
          error: 'Timeout', durationMs: 60000,
          createdAt: now, completedAt: now,
        },
      ]);

      const result = await service.getExecutionsByNote(NOTE_ID, TENANT_ID);

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('e1');
      expect(result[1]!.error).toBe('Timeout');
    });

    it('should return empty array when no executions exist', async () => {
      mockPrisma.agentExecution.findMany.mockResolvedValue([]);

      const result = await service.getExecutionsByNote(NOTE_ID, TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should query with correct filters and ordering', async () => {
      mockPrisma.agentExecution.findMany.mockResolvedValue([]);

      await service.getExecutionsByNote('note-xyz', 'tenant-abc');

      expect(mockPrisma.agentExecution.findMany).toHaveBeenCalledWith({
        where: { noteId: 'note-xyz', tenantId: 'tenant-abc' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
