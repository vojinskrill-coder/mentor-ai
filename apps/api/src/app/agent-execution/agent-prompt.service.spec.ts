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
      streamCompletionWithContext: jest.fn().mockImplementation(
        async (_messages: any, _opts: any, onChunk: (c: string) => void) => {
          onChunk('Contextualized instruction for the agent based on specific report data.');
        }
      ),
    };

    service = new AgentPromptService(mockAiGateway, registry);
  });

  describe('formatPrompt()', () => {
    const baseParams = {
      agentType: AgentType.WEB_SEARCH,
      taskTitle: 'Test Task',
      taskContent: 'Test content',
      userReport: 'Detailed report about business performance with enough content to exceed the minimum threshold for inclusion in the prompt context section and provide meaningful data.',
      expectedOutcome: null as string | null,
      tenantId: 'tnt_test',
      userId: 'usr_test',
    };

    it('should return a string from LLM call', async () => {
      const result = await service.formatPrompt(baseParams);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(50);
    });

    it('should call LLM with system prompt from registry', async () => {
      await service.formatPrompt(baseParams);
      expect(mockAiGateway.streamCompletionWithContext).toHaveBeenCalledTimes(1);
      const messages = mockAiGateway.streamCompletionWithContext.mock.calls[0][0];
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('web research agent');
    });

    it('should include task title in user message', async () => {
      await service.formatPrompt(baseParams);
      const messages = mockAiGateway.streamCompletionWithContext.mock.calls[0][0];
      expect(messages[1].content).toContain('Test Task');
    });

    it('should include pre-check context when provided', async () => {
      await service.formatPrompt({
        ...baseParams,
        preCheckContext: 'Main agent knows about CCC 180-240 days and material variance 28.5%',
      });
      const messages = mockAiGateway.streamCompletionWithContext.mock.calls[0][0];
      expect(messages[1].content).toContain('ALREADY KNOWN');
      expect(messages[1].content).toContain('CCC 180-240');
    });

    it('should NOT include pre-check context when null', async () => {
      await service.formatPrompt({ ...baseParams, preCheckContext: null });
      const messages = mockAiGateway.streamCompletionWithContext.mock.calls[0][0];
      expect(messages[1].content).not.toContain('ALREADY KNOWN');
    });

    it('should append grounding block to LLM output', async () => {
      const result = await service.formatPrompt(baseParams);
      expect(result).toContain('UZEMLJENJE');
      expect(result).toContain('NEVER');
      expect(result).toContain('in English');
    });

    it('should call onChunk callback', async () => {
      const onChunk = jest.fn();
      await service.formatPrompt({ ...baseParams, onChunk });
      expect(onChunk).toHaveBeenCalled();
    });

    it('should work for all agent types', async () => {
      const types = [AgentType.WEB_SEARCH, AgentType.CONTENT, AgentType.MARKETING, AgentType.SALES, AgentType.FINANCIAL];
      for (const agentType of types) {
        const result = await service.formatPrompt({ ...baseParams, agentType });
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(50);
      }
    });

    it('should include expected outcome when provided', async () => {
      await service.formatPrompt({ ...baseParams, expectedOutcome: 'Increase revenue by 20%' });
      const messages = mockAiGateway.streamCompletionWithContext.mock.calls[0][0];
      expect(messages[1].content).toContain('Increase revenue by 20%');
    });
  });
});
