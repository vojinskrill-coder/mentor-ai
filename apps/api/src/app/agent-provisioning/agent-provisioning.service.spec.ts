import { AgentProvisioningService, TenantConfig } from './agent-provisioning.service';
import { AgentRegistryService } from '../agent-registry/agent-registry.service';
import { TemplateService } from '../template/template.service';
import { VaultStorage } from '../vault-storage/vault-storage.interface';

describe('AgentProvisioningService', () => {
  let service: AgentProvisioningService;
  let registry: AgentRegistryService;
  let templateService: TemplateService;
  let mockVault: VaultStorage;
  let writtenFiles: Map<string, string>;

  const tenantId = 'test-tenant-001';
  const tenantConfig: TenantConfig = {
    companyName: 'Acme Corp',
    industry: 'Technology',
    description: 'A technology company specializing in widgets',
  };

  beforeAll(() => {
    registry = new AgentRegistryService();
    templateService = new TemplateService();

    writtenFiles = new Map();
    mockVault = {
      writeFile: jest.fn(async (_t: string, p: string, c: string) => { writtenFiles.set(p, c); }),
      readFile: jest.fn(async (_t: string, p: string) => writtenFiles.get(p) ?? ''),
      fileExists: jest.fn(async (_t: string, _p: string) => false),
      listFiles: jest.fn(async (_t: string, _d: string): Promise<string[]> => []),
      writeFiles: jest.fn(async (_t: string, files: Map<string, string>) => {
        for (const [p, c] of files.entries()) {
          writtenFiles.set(p, c);
        }
      }),
      createDirectories: jest.fn(async (_t: string, _d: string[]) => { /* noop */ }),
    };

    service = new AgentProvisioningService(registry, templateService, mockVault);
  });

  beforeEach(() => {
    writtenFiles.clear();
    jest.clearAllMocks();
  });

  it('should provision all 8 agents', async () => {
    await service.provisionAgents(tenantId, tenantConfig);

    // writeFiles should have been called with a Map of 8 entries
    const writeFilesFn = mockVault.writeFiles as jest.Mock;
    expect(writeFilesFn).toHaveBeenCalledTimes(1);
    const filesArg = writeFilesFn.mock.calls[0]![1] as Map<string, string>;
    expect(filesArg.size).toBe(8);
  });

  it('SOUL.md should contain tenant name', async () => {
    await service.provisionAgents(tenantId, tenantConfig);

    const mainSoul = writtenFiles.get('agents/main/SOUL.md');
    expect(mainSoul).toBeDefined();
    expect(mainSoul).toContain('Acme Corp');
  });

  it('SOUL.md should contain ENGLISH language rule', async () => {
    await service.provisionAgents(tenantId, tenantConfig);

    const mainSoul = writtenFiles.get('agents/main/SOUL.md');
    expect(mainSoul).toBeDefined();
    expect(mainSoul).toContain('ENGLISH');
  });

  it('SOUL.md should have no unresolved {{placeholders}}', async () => {
    await service.provisionAgents(tenantId, tenantConfig);

    for (const [filePath, content] of writtenFiles.entries()) {
      const unresolved = content.match(/\{\{([^}]+)\}\}/g);
      expect(unresolved).toBeNull();
    }
  });

  it('should be deterministic — same inputs produce identical output', async () => {
    await service.provisionAgents(tenantId, tenantConfig);
    const firstRun = new Map(writtenFiles);

    writtenFiles.clear();
    jest.clearAllMocks();

    await service.provisionAgents(tenantId, tenantConfig);
    const secondRun = new Map(writtenFiles);

    expect(firstRun.size).toBe(secondRun.size);
    for (const [path, content] of firstRun.entries()) {
      expect(secondRun.get(path)).toBe(content);
    }
  });

  it('should create agent directories before writing files', async () => {
    await service.provisionAgents(tenantId, tenantConfig);

    const createDirsFn = mockVault.createDirectories as jest.Mock;
    expect(createDirsFn).toHaveBeenCalledTimes(1);
    const dirsArg = createDirsFn.mock.calls[0]![1] as string[];
    expect(dirsArg.length).toBe(8);
    expect(dirsArg).toContain('agents/main');
    expect(dirsArg).toContain('agents/research');
  });

  it('SOUL.md should contain tenantId and vault path', async () => {
    await service.provisionAgents(tenantId, tenantConfig);

    const mainSoul = writtenFiles.get('agents/main/SOUL.md');
    expect(mainSoul).toContain(tenantId);
    expect(mainSoul).toContain(`/root/${tenantId}/vault`);
  });
});
