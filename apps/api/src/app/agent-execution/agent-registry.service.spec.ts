import { AgentType } from '@mentor-ai/shared/types';
import { AgentRegistryService, AgentDefinition } from './agent-registry.service';

describe('AgentRegistryService', () => {
  let service: AgentRegistryService;

  beforeEach(() => {
    service = new AgentRegistryService();
  });

  describe('getAgent()', () => {
    it.each([
      [AgentType.WEB_SEARCH, 'web-search', 'Online istraživanje'],
      [AgentType.CONTENT, 'content', 'Kreiranje sadržaja'],
      [AgentType.MARKETING, 'marketing', 'Marketing analiza'],
      [AgentType.SALES, 'sales', 'Prodajna strategija'],
      [AgentType.FINANCIAL, 'financial', 'Finansijska analiza'],
    ])('should return correct agent for %s', (type, expectedId, expectedLabel) => {
      const agent = service.getAgent(type);

      expect(agent.type).toBe(type);
      expect(agent.openClawAgentId).toBe(expectedId);
      expect(agent.label).toBe(expectedLabel);
      expect(agent.estimatedCostEur).toBe(0.5);
      expect(agent.systemPrompt).toBeTruthy();
      expect(agent.description).toBeTruthy();
      expect(agent.icon).toBeTruthy();
    });

    it('should throw for unknown agent type', () => {
      expect(() => service.getAgent('UNKNOWN' as AgentType)).toThrow('Unknown agent type: UNKNOWN');
    });

    it('should return full AgentDefinition shape', () => {
      const agent = service.getAgent(AgentType.WEB_SEARCH);
      const keys: (keyof AgentDefinition)[] = [
        'type', 'openClawAgentId', 'label', 'description', 'icon', 'estimatedCostEur', 'systemPrompt',
      ];
      for (const key of keys) {
        expect(agent).toHaveProperty(key);
      }
    });
  });

  describe('getAllAgents()', () => {
    it('should return all 5 agents', () => {
      const agents = service.getAllAgents();
      expect(agents).toHaveLength(5);
    });

    it('should contain all agent types', () => {
      const types = service.getAllAgents().map((a) => a.type);
      expect(types).toContain(AgentType.WEB_SEARCH);
      expect(types).toContain(AgentType.CONTENT);
      expect(types).toContain(AgentType.MARKETING);
      expect(types).toContain(AgentType.SALES);
      expect(types).toContain(AgentType.FINANCIAL);
    });

    it('should return new array each time (no mutation leaks)', () => {
      const a1 = service.getAllAgents();
      const a2 = service.getAllAgents();
      expect(a1).not.toBe(a2);
      expect(a1).toEqual(a2);
    });
  });

  describe('getAgentLabel()', () => {
    it.each([
      [AgentType.WEB_SEARCH, 'Online istraživanje'],
      [AgentType.CONTENT, 'Kreiranje sadržaja'],
      [AgentType.MARKETING, 'Marketing analiza'],
      [AgentType.SALES, 'Prodajna strategija'],
      [AgentType.FINANCIAL, 'Finansijska analiza'],
    ])('should return correct label for %s', (type, expectedLabel) => {
      expect(service.getAgentLabel(type)).toBe(expectedLabel);
    });

    it('should throw for unknown type', () => {
      expect(() => service.getAgentLabel('BAD' as AgentType)).toThrow('Unknown agent type');
    });
  });

  describe('getOpenClawAgentId()', () => {
    it.each([
      [AgentType.WEB_SEARCH, 'web-search'],
      [AgentType.CONTENT, 'content'],
      [AgentType.MARKETING, 'marketing'],
      [AgentType.SALES, 'sales'],
      [AgentType.FINANCIAL, 'financial'],
    ])('should return correct OpenClaw ID for %s', (type, expectedId) => {
      expect(service.getOpenClawAgentId(type)).toBe(expectedId);
    });

    it('should throw for unknown type', () => {
      expect(() => service.getOpenClawAgentId('BAD' as AgentType)).toThrow('Unknown agent type');
    });
  });

  describe('getAllAgentTypeInfos()', () => {
    it('should return DTOs for all 5 agents', () => {
      const infos = service.getAllAgentTypeInfos();
      expect(infos).toHaveLength(5);
    });

    it('should map to correct DTO shape (no systemPrompt)', () => {
      const infos = service.getAllAgentTypeInfos();
      for (const info of infos) {
        expect(info).toHaveProperty('type');
        expect(info).toHaveProperty('label');
        expect(info).toHaveProperty('description');
        expect(info).toHaveProperty('icon');
        expect(info).toHaveProperty('estimatedCostEur');
        // systemPrompt and openClawAgentId should NOT be in DTO
        expect(info).not.toHaveProperty('systemPrompt');
        expect(info).not.toHaveProperty('openClawAgentId');
      }
    });

    it('should have correct data for WEB_SEARCH info', () => {
      const infos = service.getAllAgentTypeInfos();
      const webSearch = infos.find((i) => i.type === AgentType.WEB_SEARCH);
      expect(webSearch).toEqual({
        type: AgentType.WEB_SEARCH,
        label: 'Online istraživanje',
        description: 'Pretražuje internet za relevantne informacije, trendove i izvore',
        icon: '🔍',
        estimatedCostEur: 0.5,
      });
    });
  });

  describe('System prompt content', () => {
    it('WEB_SEARCH prompt should mention web_search, web_fetch, browser tools', () => {
      const prompt = service.getAgent(AgentType.WEB_SEARCH).systemPrompt;
      expect(prompt).toContain('web_search');
      expect(prompt).toContain('web_fetch');
      expect(prompt).toContain('browser');
    });

    it('CONTENT prompt should mention image generation with fal-generate', () => {
      const prompt = service.getAgent(AgentType.CONTENT).systemPrompt;
      expect(prompt).toContain('fal-generate');
      expect(prompt).toContain('FAL_IMAGE_SIZE');
    });

    it('SALES prompt should mention agentmail-send', () => {
      const prompt = service.getAgent(AgentType.SALES).systemPrompt;
      expect(prompt).toContain('agentmail-send');
    });

    it('FINANCIAL prompt should mention ROI and scenario analysis', () => {
      const prompt = service.getAgent(AgentType.FINANCIAL).systemPrompt;
      expect(prompt).toContain('ROI');
      expect(prompt).toContain('scenario');
    });

    it('All prompts should require Serbian language output', () => {
      for (const agent of service.getAllAgents()) {
        expect(agent.systemPrompt.toLowerCase()).toContain('serbian');
      }
    });

    it('All prompts should require markdown output (no HTML)', () => {
      for (const agent of service.getAllAgents()) {
        expect(agent.systemPrompt.toLowerCase()).toContain('markdown');
      }
    });
  });
});
