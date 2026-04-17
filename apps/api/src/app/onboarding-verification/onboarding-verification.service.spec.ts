import { OnboardingVerificationService } from './onboarding-verification.service';

describe('OnboardingVerificationService', () => {
  let service: OnboardingVerificationService;
  let mockPrisma: any;
  let mockVault: any;

  beforeEach(() => {
    mockPrisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1', name: 'Test' }) },
      user: { count: jest.fn().mockResolvedValue(2) },
      concept: { count: jest.fn().mockResolvedValue(443) },
      conceptRelationship: { count: jest.fn().mockResolvedValue(3658) },
      llmProviderConfig: { count: jest.fn().mockResolvedValue(1) },
    };
    mockVault = {
      fileExists: jest.fn().mockResolvedValue(true),
      listFiles: jest.fn().mockResolvedValue(['main', 'research']),
      readFile: jest.fn().mockResolvedValue('## Identity\n## Mission\n## Self-Validation'),
    };
    service = new OnboardingVerificationService(mockPrisma, mockVault);
  });

  it('should pass all checks for valid tenant', async () => {
    const result = await service.verifyTenantSetup('tenant-1', 2);
    expect(result.passed).toBe(true);
    expect(result.checks.length).toBeGreaterThanOrEqual(13);
  });

  it('should fail when tenant not found', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);
    const result = await service.verifyTenantSetup('unknown', 2);
    expect(result.passed).toBe(false);
    expect(result.checks.find((c: any) => c.name === 'tenant_exists')!.passed).toBe(false);
  });

  it('should fail when no users exist', async () => {
    mockPrisma.user.count.mockResolvedValue(0);
    const result = await service.verifyTenantSetup('tenant-1', 2);
    expect(result.passed).toBe(false);
  });

  it('should fail when agent count is below expected', async () => {
    mockVault.listFiles.mockResolvedValue(['main']); // only 1 agent
    const result = await service.verifyTenantSetup('tenant-1', 3);
    const agentCheck = result.checks.find((c: any) => c.name === 'agent_soul_files');
    expect(agentCheck!.passed).toBe(false);
  });

  it('should handle vault errors gracefully', async () => {
    mockVault.fileExists.mockRejectedValue(new Error('Vault down'));
    mockVault.listFiles.mockRejectedValue(new Error('Vault down'));
    mockVault.readFile.mockRejectedValue(new Error('Vault down'));
    const result = await service.verifyTenantSetup('tenant-1', 2);
    // Should not throw, just mark checks as failed
    expect(result).toBeDefined();
    expect(result.checks.length).toBeGreaterThan(0);
  });

  it('should return summary with failed check names', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);
    const result = await service.verifyTenantSetup('unknown', 2);
    expect(result.summary).toContain('checks failed');
    expect(result.summary).toContain('tenant_exists');
  });

  it('should check SOUL.md content validity', async () => {
    mockVault.readFile.mockResolvedValue('# Empty SOUL');
    const result = await service.verifyTenantSetup('tenant-1', 2);
    const soulCheck = result.checks.find((c: any) => c.name === 'soul_content_valid');
    expect(soulCheck!.passed).toBe(false);
  });
});
