import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentRegistryService } from './agent-registry.service';

describe('AgentRegistryService', () => {
  let service: AgentRegistryService;
  let tmpDir: string;
  let registryFile: string;

  const registryYaml = `
agents:
  - id: main
    name: Main Agent
    description: Primary agent
    soulTemplate: SOUL.template.md
    skills:
      - mentor-ai-bridge
    guardrails:
      maxTokensPerCall: 4096
      maxRetriesPerStep: 5
      requireValidation: true
      requireSelfCorrection: true
  - id: research
    name: Research Agent
    description: Research specialist
    soulTemplate: SOUL.template.md
    skills:
      - mentor-ai-bridge
    guardrails:
      maxTokensPerCall: 4096
      maxRetriesPerStep: 3
      requireValidation: true
      requireSelfCorrection: true
`;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-registry-test-'));
    registryFile = path.join(tmpDir, 'agent-registry.yaml');
    fs.writeFileSync(registryFile, registryYaml);
    service = new AgentRegistryService();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should load agents from registry file', () => {
    service.loadRegistry(registryFile);
    const agents = service.getAllAgents();
    expect(agents).toHaveLength(2);
  });

  it('should get agent by id', () => {
    service.loadRegistry(registryFile);
    const agent = service.getAgent('main');
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('Main Agent');
  });

  it('should return undefined for unknown agent', () => {
    service.loadRegistry(registryFile);
    expect(service.getAgent('nonexistent')).toBeUndefined();
  });

  it('should return all agents', () => {
    service.loadRegistry(registryFile);
    const agents = service.getAllAgents();
    expect(agents.map((a) => a.id)).toEqual(['main', 'research']);
  });

  it('should get agent guardrails', () => {
    service.loadRegistry(registryFile);
    const guardrails = service.getAgentGuardrails('main');
    expect(guardrails).toBeDefined();
    expect(guardrails!.maxTokensPerCall).toBe(4096);
    expect(guardrails!.requireValidation).toBe(true);
  });

  it('should return undefined guardrails for unknown agent', () => {
    service.loadRegistry(registryFile);
    expect(service.getAgentGuardrails('unknown')).toBeUndefined();
  });

  it('should throw on missing registry file', () => {
    expect(() => service.loadRegistry('/nonexistent/path.yaml')).toThrow();
  });

  it('should have skills array on agents', () => {
    service.loadRegistry(registryFile);
    const agent = service.getAgent('main');
    expect(agent!.skills).toContain('mentor-ai-bridge');
  });
});
