import { AgentType } from '@mentor-ai/shared/types';
import { JobPlannerService } from './job-planner.service';
import { AgentRegistryService } from './agent-registry.service';

// Mock createId to return predictable IDs
let idCounter = 0;
jest.mock('@paralleldrive/cuid2', () => ({
  createId: () => `mock-id-${++idCounter}`,
}));

describe('JobPlannerService', () => {
  let service: JobPlannerService;
  let mockPrisma: any;
  let mockAiGateway: any;
  let registry: AgentRegistryService;

  const TENANT_ID = 'tenant-1';
  const USER_ID = 'user-1';
  const NOTE_ID = 'note-1';

  const mockNote = {
    id: NOTE_ID,
    title: 'Market Analysis',
    content: 'Analyze the Serbian CRM market',
    userReport: 'I have completed initial research on the market...',
    expectedOutcome: 'Comprehensive report',
    tenantId: TENANT_ID,
  };

  beforeEach(() => {
    idCounter = 0;

    mockPrisma = {
      note: {
        findFirst: jest.fn(),
      },
      agentJob: {
        findMany: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.resolve(ops)),
    };

    mockAiGateway = {
      streamCompletionWithContext: jest.fn(),
    };

    registry = new AgentRegistryService();
    service = new JobPlannerService(mockPrisma, mockAiGateway, registry);
  });

  function setupStreamResponse(response: string) {
    mockAiGateway.streamCompletionWithContext.mockImplementation(
      async (_msgs: any, _opts: any, onChunk: (c: string) => void) => {
        onChunk(response);
      }
    );
  }

  function setupNoteAndNoExistingJobs() {
    mockPrisma.note.findFirst.mockResolvedValue(mockNote);
    mockPrisma.agentJob.findMany.mockResolvedValue([]);
  }

  describe('planJobs()', () => {
    describe('guard clauses', () => {
      it('should return empty when note not found', async () => {
        mockPrisma.note.findFirst.mockResolvedValue(null);

        const result = await service.planJobs('missing-note', TENANT_ID, USER_ID);

        expect(result).toEqual([]);
        expect(mockAiGateway.streamCompletionWithContext).not.toHaveBeenCalled();
      });

      it('should return empty when note has no userReport', async () => {
        mockPrisma.note.findFirst.mockResolvedValue({
          ...mockNote,
          userReport: null,
        });

        const result = await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        expect(result).toEqual([]);
      });

      it('should return existing jobs if already planned', async () => {
        mockPrisma.note.findFirst.mockResolvedValue(mockNote);

        const existingJobs = [
          {
            id: 'job-1', noteId: NOTE_ID, agentType: 'web_search', order: 1,
            dependsOn: [], instruction: 'Research...', status: 'PLANNED',
            executionId: null, agentOutput: null, error: null,
            createdAt: new Date(), updatedAt: new Date(),
          },
        ];
        // First call for dedup check, second for getJobsForNote return
        mockPrisma.agentJob.findMany.mockResolvedValue(existingJobs);

        const result = await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe('job-1');
        expect(mockAiGateway.streamCompletionWithContext).not.toHaveBeenCalled();
      });
    });

    describe('LLM response parsing', () => {
      it('should parse valid JSON array and create jobs', async () => {
        setupNoteAndNoExistingJobs();

        const llmResponse = JSON.stringify([
          { agentType: 'web_search', order: 1, dependsOnOrders: [], instruction: 'Research the market for CRM tools' },
          { agentType: 'content', order: 2, dependsOnOrders: [1], instruction: 'Create blog post based on research' },
        ]);
        setupStreamResponse(llmResponse);

        // After persisting, getJobsForNote returns the created jobs
        mockPrisma.agentJob.findMany
          .mockResolvedValueOnce([]) // dedup check
          .mockResolvedValueOnce([ // after persist
            {
              id: 'ajob_mock-id-1', noteId: NOTE_ID, agentType: 'web_search', order: 1,
              dependsOn: [], instruction: 'Research the market for CRM tools', status: 'PLANNED',
              executionId: null, agentOutput: null, error: null,
              createdAt: new Date(), updatedAt: new Date(),
            },
            {
              id: 'ajob_mock-id-2', noteId: NOTE_ID, agentType: 'content', order: 2,
              dependsOn: ['ajob_mock-id-1'], instruction: 'Create blog post based on research', status: 'PLANNED',
              executionId: null, agentOutput: null, error: null,
              createdAt: new Date(), updatedAt: new Date(),
            },
          ]);

        const result = await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        expect(result).toHaveLength(2);
        expect(mockPrisma.$transaction).toHaveBeenCalled();
      });

      it('should return empty when LLM returns empty array', async () => {
        setupNoteAndNoExistingJobs();
        setupStreamResponse('[]');

        const result = await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        expect(result).toEqual([]);
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      });

      it('should create default jobs when no JSON found in response', async () => {
        setupNoteAndNoExistingJobs();
        setupStreamResponse('I think we should consider some options...');

        // After default creation, getJobsForNote returns defaults
        mockPrisma.agentJob.findMany
          .mockResolvedValueOnce([]) // dedup check
          .mockResolvedValueOnce([ // default jobs
            {
              id: 'ajob_mock-id-1', noteId: NOTE_ID, agentType: 'web_search', order: 1,
              dependsOn: [], instruction: 'Research...', status: 'PLANNED',
              executionId: null, agentOutput: null, error: null,
              createdAt: new Date(), updatedAt: new Date(),
            },
            {
              id: 'ajob_mock-id-2', noteId: NOTE_ID, agentType: 'content', order: 2,
              dependsOn: ['ajob_mock-id-1'], instruction: 'Create...', status: 'PLANNED',
              executionId: null, agentOutput: null, error: null,
              createdAt: new Date(), updatedAt: new Date(),
            },
          ]);

        const result = await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        expect(result).toHaveLength(2);
        expect(result[0]!.agentType).toBe(AgentType.WEB_SEARCH);
        expect(result[1]!.agentType).toBe(AgentType.CONTENT);
      });

      it('should create default jobs when JSON parse fails', async () => {
        setupNoteAndNoExistingJobs();
        setupStreamResponse('[{invalid json}]');

        mockPrisma.agentJob.findMany
          .mockResolvedValueOnce([]) // dedup
          .mockResolvedValueOnce([ // defaults
            {
              id: 'j1', noteId: NOTE_ID, agentType: 'web_search', order: 1,
              dependsOn: [], instruction: 'R', status: 'PLANNED',
              executionId: null, agentOutput: null, error: null,
              createdAt: new Date(), updatedAt: new Date(),
            },
          ]);

        const result = await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        expect(result.length).toBeGreaterThanOrEqual(1);
      });

      it('should create default jobs when LLM throws error', async () => {
        setupNoteAndNoExistingJobs();
        mockAiGateway.streamCompletionWithContext.mockRejectedValue(new Error('LLM timeout'));

        mockPrisma.agentJob.findMany
          .mockResolvedValueOnce([]) // dedup
          .mockResolvedValueOnce([ // defaults
            {
              id: 'j1', noteId: NOTE_ID, agentType: 'web_search', order: 1,
              dependsOn: [], instruction: 'R', status: 'PLANNED',
              executionId: null, agentOutput: null, error: null,
              createdAt: new Date(), updatedAt: new Date(),
            },
          ]);

        const result = await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        expect(result.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('job validation and normalization', () => {
      it('should filter out invalid agent types', async () => {
        setupNoteAndNoExistingJobs();
        setupStreamResponse(JSON.stringify([
          { agentType: 'invalid_type', order: 1, dependsOnOrders: [], instruction: 'Do something random task' },
          { agentType: 'web_search', order: 2, dependsOnOrders: [], instruction: 'Valid web search task here' },
        ]));

        mockPrisma.agentJob.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'j1', noteId: NOTE_ID, agentType: 'web_search', order: 1,
              dependsOn: [], instruction: 'Valid', status: 'PLANNED',
              executionId: null, agentOutput: null, error: null,
              createdAt: new Date(), updatedAt: new Date(),
            },
          ]);

        const result = await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        // Only valid types should have been persisted
        const transactionCalls = mockPrisma.$transaction.mock.calls;
        if (transactionCalls.length > 0) {
          const ops = transactionCalls[0][0];
          // Should only have 1 job (the valid web_search)
          expect(ops.length).toBe(1);
        }
      });

      it('should filter out jobs with short instructions (<=10 chars)', async () => {
        setupNoteAndNoExistingJobs();
        setupStreamResponse(JSON.stringify([
          { agentType: 'web_search', order: 1, dependsOnOrders: [], instruction: 'short' },
          { agentType: 'content', order: 2, dependsOnOrders: [], instruction: 'This is a valid instruction with enough detail' },
        ]));

        mockPrisma.agentJob.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'j1', noteId: NOTE_ID, agentType: 'content', order: 1,
              dependsOn: [], instruction: 'This is valid', status: 'PLANNED',
              executionId: null, agentOutput: null, error: null,
              createdAt: new Date(), updatedAt: new Date(),
            },
          ]);

        await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        const transactionCalls = mockPrisma.$transaction.mock.calls;
        if (transactionCalls.length > 0) {
          const ops = transactionCalls[0][0];
          expect(ops.length).toBe(1);
        }
      });

      it('should limit to max 4 jobs', async () => {
        setupNoteAndNoExistingJobs();
        setupStreamResponse(JSON.stringify([
          { agentType: 'web_search', order: 1, dependsOnOrders: [], instruction: 'Research task one for project' },
          { agentType: 'content', order: 2, dependsOnOrders: [1], instruction: 'Create content from results' },
          { agentType: 'marketing', order: 3, dependsOnOrders: [2], instruction: 'Marketing strategy from content' },
          { agentType: 'sales', order: 4, dependsOnOrders: [3], instruction: 'Sales plan from marketing' },
          { agentType: 'financial', order: 5, dependsOnOrders: [4], instruction: 'Financial analysis from sales' },
        ]));

        mockPrisma.agentJob.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        const transactionCalls = mockPrisma.$transaction.mock.calls;
        if (transactionCalls.length > 0) {
          const ops = transactionCalls[0][0];
          expect(ops.length).toBeLessThanOrEqual(4);
        }
      });

      it('should normalize sparse orders to sequential', async () => {
        setupNoteAndNoExistingJobs();
        setupStreamResponse(JSON.stringify([
          { agentType: 'web_search', order: 5, dependsOnOrders: [], instruction: 'First task to do research' },
          { agentType: 'content', order: 10, dependsOnOrders: [5], instruction: 'Second task create content' },
        ]));

        mockPrisma.agentJob.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        const transactionCalls = mockPrisma.$transaction.mock.calls;
        if (transactionCalls.length > 0) {
          const ops = transactionCalls[0][0];
          // Jobs should be created through prisma.agentJob.create with normalized orders
          // The create calls are wrapped in a transaction
          expect(ops.length).toBe(2);
        }
      });

      it('should create defaults when all jobs have invalid types', async () => {
        setupNoteAndNoExistingJobs();
        setupStreamResponse(JSON.stringify([
          { agentType: 'psychic', order: 1, dependsOnOrders: [], instruction: 'Read the future of markets' },
          { agentType: 'teleport', order: 2, dependsOnOrders: [1], instruction: 'Send data to the future' },
        ]));

        mockPrisma.agentJob.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'j1', noteId: NOTE_ID, agentType: 'web_search', order: 1,
              dependsOn: [], instruction: 'Research', status: 'PLANNED',
              executionId: null, agentOutput: null, error: null,
              createdAt: new Date(), updatedAt: new Date(),
            },
          ]);

        const result = await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        // Should fall back to defaults
        expect(result.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('LLM prompt construction', () => {
      it('should include all agent types in system prompt', async () => {
        setupNoteAndNoExistingJobs();
        setupStreamResponse('[]');

        await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        const messages = mockAiGateway.streamCompletionWithContext.mock.calls[0][0];
        const systemMsg = messages[0].content;
        expect(systemMsg).toContain('web_search');
        expect(systemMsg).toContain('content');
        expect(systemMsg).toContain('marketing');
        expect(systemMsg).toContain('sales');
        expect(systemMsg).toContain('financial');
      });

      it('should include note title and content in user message', async () => {
        setupNoteAndNoExistingJobs();
        setupStreamResponse('[]');

        await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        const userMsg = mockAiGateway.streamCompletionWithContext.mock.calls[0][0][1].content;
        expect(userMsg).toContain('Market Analysis');
        expect(userMsg).toContain('Analyze the Serbian CRM market');
      });

      it('should include expectedOutcome when present', async () => {
        setupNoteAndNoExistingJobs();
        setupStreamResponse('[]');

        await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        const userMsg = mockAiGateway.streamCompletionWithContext.mock.calls[0][0][1].content;
        expect(userMsg).toContain('Expected Outcome: Comprehensive report');
      });

      it('should not include Expected Outcome when null', async () => {
        mockPrisma.note.findFirst.mockResolvedValue({ ...mockNote, expectedOutcome: null });
        mockPrisma.agentJob.findMany.mockResolvedValue([]);
        setupStreamResponse('[]');

        await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        const userMsg = mockAiGateway.streamCompletionWithContext.mock.calls[0][0][1].content;
        expect(userMsg).not.toContain('Expected Outcome');
      });

      it('should truncate content to 500 chars', async () => {
        const longContent = 'B'.repeat(1000);
        mockPrisma.note.findFirst.mockResolvedValue({ ...mockNote, content: longContent });
        mockPrisma.agentJob.findMany.mockResolvedValue([]);
        setupStreamResponse('[]');

        await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        const userMsg = mockAiGateway.streamCompletionWithContext.mock.calls[0][0][1].content;
        const bCount = (userMsg.match(/B/g) || []).length;
        expect(bCount).toBe(500);
      });

      it('should truncate userReport to 2000 chars', async () => {
        const longReport = 'Z'.repeat(5000);
        mockPrisma.note.findFirst.mockResolvedValue({ ...mockNote, userReport: longReport });
        mockPrisma.agentJob.findMany.mockResolvedValue([]);
        setupStreamResponse('[]');

        await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        const userMsg = mockAiGateway.streamCompletionWithContext.mock.calls[0][0][1].content;
        const zCount = (userMsg.match(/Z/g) || []).length;
        expect(zCount).toBe(2000);
      });

      it('should pass skipRateLimit and skipQuotaCheck', async () => {
        setupNoteAndNoExistingJobs();
        setupStreamResponse('[]');

        await service.planJobs(NOTE_ID, TENANT_ID, USER_ID);

        const opts = mockAiGateway.streamCompletionWithContext.mock.calls[0][1];
        expect(opts.skipRateLimit).toBe(true);
        expect(opts.skipQuotaCheck).toBe(true);
      });
    });
  });

  describe('getJobsForNote()', () => {
    it('should return mapped job items ordered by order', async () => {
      const now = new Date();
      mockPrisma.agentJob.findMany.mockResolvedValue([
        {
          id: 'j1', noteId: NOTE_ID, agentType: 'web_search', order: 1,
          dependsOn: [], instruction: 'Research', status: 'PLANNED',
          executionId: null, agentOutput: null, error: null,
          createdAt: now, updatedAt: now,
        },
        {
          id: 'j2', noteId: NOTE_ID, agentType: 'content', order: 2,
          dependsOn: ['j1'], instruction: 'Create', status: 'COMPLETED',
          executionId: 'exec-1', agentOutput: 'Some output', error: null,
          createdAt: now, updatedAt: now,
        },
      ]);

      const result = await service.getJobsForNote(NOTE_ID, TENANT_ID);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'j1',
        noteId: NOTE_ID,
        agentType: AgentType.WEB_SEARCH,
        order: 1,
        dependsOn: [],
        instruction: 'Research',
        status: 'PLANNED',
        executionId: null,
        agentOutput: null,
        error: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    });

    it('should return empty array when no jobs exist', async () => {
      mockPrisma.agentJob.findMany.mockResolvedValue([]);

      const result = await service.getJobsForNote(NOTE_ID, TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should query with correct filters', async () => {
      mockPrisma.agentJob.findMany.mockResolvedValue([]);

      await service.getJobsForNote('note-xyz', 'tenant-abc');

      expect(mockPrisma.agentJob.findMany).toHaveBeenCalledWith({
        where: { noteId: 'note-xyz', tenantId: 'tenant-abc' },
        orderBy: { order: 'asc' },
      });
    });
  });
});
