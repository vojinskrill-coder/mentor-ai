import { NotFoundException } from '@nestjs/common';
import { AgentRegistryService } from './agent-registry.service';

describe('AgentRegistryService', () => {
  let service: AgentRegistryService;

  beforeAll(() => {
    service = new AgentRegistryService();
  });

  it('should load all 8 agents', () => {
    const agents = service.getAllAgents();
    expect(agents.length).toBe(8);
  });

  it('each agent should have required fields (id, role, model, capabilities, guardrails)', () => {
    for (const agent of service.getAllAgents()) {
      expect(agent.id).toBeTruthy();
      expect(agent.role).toBeTruthy();
      expect(agent.model).toBeTruthy();
      expect(Array.isArray(agent.capabilities)).toBe(true);
      expect(typeof agent.guardrails).toBe('object');
    }
  });

  it('main agent should have language guardrail set to english_only', () => {
    const guardrails = service.getAgentGuardrails('main');
    expect(guardrails['language']).toBe('english_only');
  });

  it('main agent should have all expected capabilities', () => {
    const main = service.getAgent('main');
    expect(main.capabilities).toEqual(
      expect.arrayContaining(['web_search', 'read', 'write', 'edit', 'exec', 'image_synthesize']),
    );
  });

  it('financial agent should have noFabricatedNumbers guardrail', () => {
    const guardrails = service.getAgentGuardrails('financial');
    expect(guardrails['noFabricatedNumbers']).toBe(true);
  });

  it('should throw NotFoundException for unknown agent', () => {
    expect(() => service.getAgent('nonexistent')).toThrow(NotFoundException);
  });

  it('getAgent should return correct agent by id', () => {
    const research = service.getAgent('research');
    expect(research.role).toBe('Market Research Analyst');
    expect(research.model).toBe('deepseek/MiniMax-M2.7');
  });

  it('designer agent should have brandCompliance guardrail', () => {
    const guardrails = service.getAgentGuardrails('designer');
    expect(guardrails['brandCompliance']).toBe(true);
  });
});
