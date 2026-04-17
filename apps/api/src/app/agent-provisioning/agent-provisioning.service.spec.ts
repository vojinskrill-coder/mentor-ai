import { AgentProvisioningService, TenantConfig } from './agent-provisioning.service';
import { AgentRegistryService } from '../agent-registry/agent-registry.service';
import { TemplateService } from '../template/template.service';

describe('AgentProvisioningService', () => {
  let service: AgentProvisioningService;
  let mockRegistry: Partial<AgentRegistryService>;
  let mockTemplate: Partial<TemplateService>;
  let mockVault: any;

  const mockAgents = [
    {
      id: 'main',
      name: 'Main Agent',
      description: 'Primary',
      soulTemplate: 'SOUL.template.md',
      skills: ['mentor-ai-bridge'],
      guardrails: { maxTokensPerCall: 4096, maxRetriesPerStep: 5, requireValidation: true, requireSelfCorrection: true },
    },
    {
      id: 'research',
      name: 'Research Agent',
      description: 'Research',
      soulTemplate: 'SOUL.template.md',
      skills: ['mentor-ai-bridge'],
      guardrails: { maxTokensPerCall: 4096, maxRetriesPerStep: 3, requireValidation: true, requireSelfCorrection: true },
    },
  ];

  const tenantConfig: TenantConfig = {
    tenantName: 'Test Corp',
    backendUrl: 'https://example.com',
    bridgeAuthToken: 'token-123',
  };

  beforeEach(() => {
    mockRegistry = {
      getAllAgents: jest.fn().mockReturnValue(mockAgents),
    };
    mockTemplate = {
      resolve: jest.fn().mockReturnValue('# Resolved SOUL Content'),
    };
    mockVault = {
      writeFile: jest.fn().mockResolvedValue(undefined),
      createDirectories: jest.fn().mockResolvedValue(undefined),
    };
    service = new AgentProvisioningService(
      mockRegistry as AgentRegistryService,
      mockTemplate as TemplateService,
      mockVault,
    );
  });

  it('should provision all agents', async () => {
    const results = await service.provisionAgents('tenant-1', tenantConfig);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('should write SOUL.md for each agent', async () => {
    await service.provisionAgents('tenant-1', tenantConfig);
    expect(mockVault.writeFile).toHaveBeenCalledTimes(2);
    expect(mockVault.writeFile).toHaveBeenCalledWith(
      'tenant-1',
      'agents/main/SOUL.md',
      '# Resolved SOUL Content',
    );
  });

  it('should create tenant directories', async () => {
    await service.provisionAgents('tenant-1', tenantConfig);
    expect(mockVault.createDirectories).toHaveBeenCalledWith('tenant-1', [
      'agents',
      'concepts',
      'logs',
    ]);
  });

  it('should resolve templates with tenant variables', async () => {
    await service.provisionAgents('tenant-1', tenantConfig);
    expect(mockTemplate.resolve).toHaveBeenCalledWith(
      'vault/SOUL.template.md',
      expect.objectContaining({
        TENANT_ID: 'tenant-1',
        TENANT_NAME: 'Test Corp',
        BACKEND_URL: 'https://example.com',
        AGENT_NAME: 'Main Agent',
      }),
    );
  });

  it('should handle individual agent failures gracefully', async () => {
    (mockTemplate.resolve as jest.Mock)
      .mockReturnValueOnce('# OK')
      .mockImplementationOnce(() => {
        throw new Error('Template failed');
      });
    const results = await service.provisionAgents('tenant-1', tenantConfig);
    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(false);
    expect(results[1]!.error).toContain('Template failed');
  });

  it('should include agent id in results', async () => {
    const results = await service.provisionAgents('tenant-1', tenantConfig);
    expect(results.map((r) => r.agentId)).toEqual(['main', 'research']);
  });

  it('should handle vault write failures', async () => {
    mockVault.writeFile.mockRejectedValue(new Error('Vault unreachable'));
    const results = await service.provisionAgents('tenant-1', tenantConfig);
    expect(results.every((r) => !r.success)).toBe(true);
  });
});
