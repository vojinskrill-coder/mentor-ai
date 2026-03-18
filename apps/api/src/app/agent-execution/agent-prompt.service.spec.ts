import { AgentType } from '@mentor-ai/shared/types';
import { AgentPromptService } from './agent-prompt.service';
import { AgentRegistryService } from './agent-registry.service';

describe('AgentPromptService', () => {
  let service: AgentPromptService;
  let registry: AgentRegistryService;

  beforeEach(() => {
    registry = new AgentRegistryService();
    service = new AgentPromptService(registry);
  });

  describe('formatPrompt()', () => {
    const baseParams = {
      agentType: AgentType.WEB_SEARCH,
      taskTitle: 'Test Task',
      taskContent: 'Test content',
      userReport: 'Test report with details',
      expectedOutcome: null as string | null,
      tenantId: 'tnt_test',
      userId: 'usr_test',
    };

    it('should return a string (sync, no async)', () => {
      const result = service.formatPrompt(baseParams);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(100);
    });

    it('should include task title and content', () => {
      const result = service.formatPrompt(baseParams);
      expect(result).toContain('ZADATAK: Test Task');
      expect(result).toContain('OPIS: Test content');
    });

    it('should include grounding block with anti-hallucination rules', () => {
      const result = service.formatPrompt(baseParams);
      expect(result).toContain('NIKADA ne izmišljaj podatke');
      expect(result).toContain('UZEMLJENJE');
      expect(result).toContain('srpskom jeziku');
    });

    it('should include user report as context', () => {
      const longReport = 'Detailed report about business performance with enough content to exceed the 100 character minimum threshold for inclusion in the prompt context section.';
      const result = service.formatPrompt({
        ...baseParams,
        userReport: longReport,
      });
      expect(result).toContain('TRENUTNI IZVEŠTAJ');
      expect(result).toContain('Detailed report about business performance');
    });

    it('should include expected outcome when provided', () => {
      const result = service.formatPrompt({
        ...baseParams,
        expectedOutcome: 'Increase revenue by 20%',
      });
      expect(result).toContain('OČEKIVANI REZULTAT: Increase revenue by 20%');
    });

    it('should NOT include expected outcome when null', () => {
      const result = service.formatPrompt(baseParams);
      expect(result).not.toContain('OČEKIVANI REZULTAT');
    });

    it('should include pre-check context when provided', () => {
      const result = service.formatPrompt({
        ...baseParams,
        preCheckContext: 'Main agent knows about CCC 180-240 days and material variance 28.5%',
      });
      expect(result).toContain('VEĆ POZNATO');
      expect(result).toContain('CCC 180-240');
      expect(result).toContain('ne istraži ponovo');
    });

    it('should NOT include pre-check block when context is empty', () => {
      const result = service.formatPrompt({
        ...baseParams,
        preCheckContext: null,
      });
      expect(result).not.toContain('VEĆ POZNATO');
    });

    it('should truncate user report to 4000 chars', () => {
      const longReport = 'A'.repeat(5000);
      const result = service.formatPrompt({
        ...baseParams,
        userReport: longReport,
      });
      // Should contain truncated report, not full 5000
      const reportSection = result.split('TRENUTNI IZVEŠTAJ')[1]?.split('KRAJ IZVEŠTAJA')[0] ?? '';
      expect(reportSection.length).toBeLessThan(4500);
    });

    it('should call onChunk callback with full prompt', () => {
      const onChunk = jest.fn();
      const result = service.formatPrompt({ ...baseParams, onChunk });
      expect(onChunk).toHaveBeenCalledWith(result);
    });

    it('should work for all agent types', () => {
      const types = [AgentType.WEB_SEARCH, AgentType.CONTENT, AgentType.MARKETING, AgentType.SALES, AgentType.FINANCIAL];
      for (const agentType of types) {
        const result = service.formatPrompt({ ...baseParams, agentType });
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(50);
      }
    });

    it('should skip report section when report is too short', () => {
      const result = service.formatPrompt({
        ...baseParams,
        userReport: 'Short',
      });
      expect(result).not.toContain('TRENUTNI IZVEŠTAJ');
    });
  });
});
