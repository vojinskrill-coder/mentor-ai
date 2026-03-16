import { AgentType } from '@mentor-ai/shared/types';
import { AgentPromptService } from './agent-prompt.service';
import { AgentRegistryService } from './agent-registry.service';

describe('AgentPromptService', () => {
  let service: AgentPromptService;
  let mockAiGateway: any;
  let registry: AgentRegistryService;

  beforeEach(() => {
    registry = new AgentRegistryService();

    mockAiGateway = {
      streamCompletionWithContext: jest.fn(),
    };

    service = new AgentPromptService(mockAiGateway, registry);
  });

  function setupStreamResponse(chunks: string[]) {
    mockAiGateway.streamCompletionWithContext.mockImplementation(
      async (_messages: any, _opts: any, onChunk: (c: string) => void) => {
        for (const chunk of chunks) {
          onChunk(chunk);
        }
      }
    );
  }

  describe('formatPrompt()', () => {
    it('should return accumulated stream chunks as trimmed result', async () => {
      setupStreamResponse(['  Research the market', ' for CRM tools  ']);

      const result = await service.formatPrompt({
        agentType: AgentType.WEB_SEARCH,
        taskTitle: 'Market Analysis',
        taskContent: 'Analyze CRM market in Serbia',
        userReport: 'I found some data...',
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      expect(result).toBe('Research the market for CRM tools');
    });

    it('should pass correct system prompt from registry', async () => {
      setupStreamResponse(['instruction']);

      await service.formatPrompt({
        agentType: AgentType.CONTENT,
        taskTitle: 'Create blog',
        taskContent: 'Write blog post',
        userReport: 'Company details',
        tenantId: 't1',
        userId: 'u1',
      });

      const messages = mockAiGateway.streamCompletionWithContext.mock.calls[0][0];
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe(registry.getAgent(AgentType.CONTENT).systemPrompt);
    });

    it('should construct user message with task title, content, and report', async () => {
      setupStreamResponse(['ok']);

      await service.formatPrompt({
        agentType: AgentType.WEB_SEARCH,
        taskTitle: 'My Task Title',
        taskContent: 'My Task Content',
        userReport: 'My Report Data',
        tenantId: 't1',
        userId: 'u1',
      });

      const messages = mockAiGateway.streamCompletionWithContext.mock.calls[0][0];
      const userMsg = messages[1].content;
      expect(userMsg).toContain('My Task Title');
      expect(userMsg).toContain('My Task Content');
      expect(userMsg).toContain('My Report Data');
    });

    it('should include expectedOutcome when provided', async () => {
      setupStreamResponse(['ok']);

      await service.formatPrompt({
        agentType: AgentType.WEB_SEARCH,
        taskTitle: 'Task',
        taskContent: 'Content',
        userReport: 'Report',
        expectedOutcome: 'Deliverable doc',
        tenantId: 't1',
        userId: 'u1',
      });

      const userMsg = mockAiGateway.streamCompletionWithContext.mock.calls[0][0][1].content;
      expect(userMsg).toContain('Expected Outcome: Deliverable doc');
    });

    it('should NOT include Expected Outcome when null', async () => {
      setupStreamResponse(['ok']);

      await service.formatPrompt({
        agentType: AgentType.WEB_SEARCH,
        taskTitle: 'Task',
        taskContent: 'Content',
        userReport: 'Report',
        expectedOutcome: null,
        tenantId: 't1',
        userId: 'u1',
      });

      const userMsg = mockAiGateway.streamCompletionWithContext.mock.calls[0][0][1].content;
      expect(userMsg).not.toContain('Expected Outcome');
    });

    it('should truncate userReport to 3000 chars', async () => {
      setupStreamResponse(['ok']);
      const longReport = 'A'.repeat(5000);

      await service.formatPrompt({
        agentType: AgentType.WEB_SEARCH,
        taskTitle: 'Task',
        taskContent: 'Content',
        userReport: longReport,
        tenantId: 't1',
        userId: 'u1',
      });

      const userMsg = mockAiGateway.streamCompletionWithContext.mock.calls[0][0][1].content;
      // The report in the message should be truncated
      const reportMatch = userMsg.match(/User's Completed Report:\n(A+)/);
      expect(reportMatch[1].length).toBe(3000);
    });

    it('should pass skipRateLimit and skipQuotaCheck options', async () => {
      setupStreamResponse(['ok']);

      await service.formatPrompt({
        agentType: AgentType.WEB_SEARCH,
        taskTitle: 'Task',
        taskContent: 'Content',
        userReport: 'Report',
        tenantId: 'tenant-abc',
        userId: 'user-xyz',
      });

      const opts = mockAiGateway.streamCompletionWithContext.mock.calls[0][1];
      expect(opts.tenantId).toBe('tenant-abc');
      expect(opts.userId).toBe('user-xyz');
      expect(opts.skipRateLimit).toBe(true);
      expect(opts.skipQuotaCheck).toBe(true);
    });

    it('should invoke onChunk callback for each chunk', async () => {
      setupStreamResponse(['chunk1', 'chunk2', 'chunk3']);
      const chunks: string[] = [];

      await service.formatPrompt({
        agentType: AgentType.WEB_SEARCH,
        taskTitle: 'Task',
        taskContent: 'Content',
        userReport: 'Report',
        tenantId: 't1',
        userId: 'u1',
        onChunk: (c) => chunks.push(c),
      });

      expect(chunks).toEqual(['chunk1', 'chunk2', 'chunk3']);
    });

    it('should work without onChunk callback (optional)', async () => {
      setupStreamResponse(['result text']);

      const result = await service.formatPrompt({
        agentType: AgentType.WEB_SEARCH,
        taskTitle: 'Task',
        taskContent: 'Content',
        userReport: 'Report',
        tenantId: 't1',
        userId: 'u1',
      });

      expect(result).toBe('result text');
    });

    it('should handle empty stream response', async () => {
      setupStreamResponse([]);

      const result = await service.formatPrompt({
        agentType: AgentType.WEB_SEARCH,
        taskTitle: 'Task',
        taskContent: 'Content',
        userReport: 'Report',
        tenantId: 't1',
        userId: 'u1',
      });

      expect(result).toBe('');
    });

    it('should include agent label in user message', async () => {
      setupStreamResponse(['ok']);

      await service.formatPrompt({
        agentType: AgentType.MARKETING,
        taskTitle: 'Task',
        taskContent: 'Content',
        userReport: 'Report',
        tenantId: 't1',
        userId: 'u1',
      });

      const userMsg = mockAiGateway.streamCompletionWithContext.mock.calls[0][0][1].content;
      expect(userMsg).toContain('Marketing analiza');
    });

    it('should use correct system prompt for each agent type', async () => {
      for (const type of Object.values(AgentType)) {
        mockAiGateway.streamCompletionWithContext.mockClear();
        setupStreamResponse(['ok']);

        await service.formatPrompt({
          agentType: type,
          taskTitle: 'T',
          taskContent: 'C',
          userReport: 'R',
          tenantId: 't',
          userId: 'u',
        });

        const systemMsg = mockAiGateway.streamCompletionWithContext.mock.calls[0][0][0];
        expect(systemMsg.content).toBe(registry.getAgent(type).systemPrompt);
      }
    });
  });
});
