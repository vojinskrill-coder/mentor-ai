import { VaultProvisionerService } from './vault-provisioner.service';

describe('VaultProvisionerService', () => {
  let service: VaultProvisionerService;

  beforeEach(() => {
    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'HETZNER_HOST') return '91.98.231.87';
        if (key === 'HETZNER_SSH_KEY') return '';
        if (key === 'QDRANT_URL') return 'https://test.qdrant.io';
        if (key === 'QDRANT_API_KEY') return 'test-key';
        return undefined;
      }),
    };
    const mockQdrant = {
      isAvailable: jest.fn().mockReturnValue(false),
      ensureCollection: jest.fn(),
    };
    const mockVaultStorage = {
      writeFile: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockResolvedValue(''),
      fileExists: jest.fn().mockResolvedValue(false),
      listFiles: jest.fn().mockResolvedValue([]),
      writeFiles: jest.fn().mockResolvedValue(undefined),
      createDirectories: jest.fn().mockResolvedValue(undefined),
    };
    const mockTemplateService = {
      resolve: jest.fn().mockReturnValue('resolved-template'),
      resolveAll: jest.fn().mockReturnValue(new Map()),
    };
    service = new VaultProvisionerService(
      mockConfig as any,
      mockQdrant as any,
      mockVaultStorage as any,
      mockTemplateService as any,
    );
  });

  describe('generateSchema', () => {
    it('includes company name in section headers', () => {
      const schema = (service as any).generateSchema('Irish Law');
      expect(schema).toContain('Irish Law');
      expect(schema).toContain('## Frontmatter');
      expect(schema).toContain('5,000 words');
    });

    it('has all 9 required sections', () => {
      const schema = (service as any).generateSchema('Test Corp');
      expect(schema).toContain('### 1. Overview');
      expect(schema).toContain('### 2. Why This Matters');
      expect(schema).toContain('### 3. Detailed Analysis');
      expect(schema).toContain('### 4. Strategies');
      expect(schema).toContain('### 5. Industry Application');
      expect(schema).toContain('### 6. Implementation Roadmap');
      expect(schema).toContain('### 7. Key Metrics');
      expect(schema).toContain('### 8. Related Concepts');
      expect(schema).toContain('### 9. Sources');
    });
  });

  describe('generateTenantProtocol', () => {
    it('includes tenantId and vault path', () => {
      const protocol = (service as any).generateTenantProtocol('tnt_test', 'Test Corp', 'Tech');
      expect(protocol).toContain('tnt_test');
      expect(protocol).toContain('Test Corp');
      expect(protocol).toContain('ENGLISH');
      expect(protocol).toContain('workspace/tnt_test-vault');
    });

    it('has session protocol with persistent mode', () => {
      const protocol = (service as any).generateTenantProtocol('tnt_test', 'Test Corp', 'Tech');
      expect(protocol).toContain('PERSISTENT');
      expect(protocol).toContain('enrichment-tnt_test');
      expect(protocol).toContain('AFTER_EVERY_20_CONCEPTS');
    });

    it('has language protocol with strict enforcement', () => {
      const protocol = (service as any).generateTenantProtocol('tnt_test', 'Test Corp', 'Tech');
      expect(protocol).toContain('ALL_OUTPUT_ENGLISH');
      expect(protocol).toContain('STRICT');
      expect(protocol).toContain('čćšžđ');
    });

    it('has tenant isolation rules against LSA', () => {
      const protocol = (service as any).generateTenantProtocol('tnt_test', 'Test Corp', 'Tech');
      expect(protocol).toContain('Luxury Statues Adria');
      expect(protocol).toContain('tnt_rljn1gj4cgxoph0hxfohv6l4');
      expect(protocol).toContain('NEVER');
    });
  });

  describe('generateVaultSoulMd', () => {
    it('has ENGLISH as first rule', () => {
      const soul = (service as any).generateVaultSoulMd('tnt_test', 'Test Corp', 'Tech', '/root/.openclaw-tnt_test/vault');
      const lines = soul.split('\n');
      const firstContentLine = lines.find((l: string) => l.includes('ENGLISH') || l.includes('CRITICAL'));
      expect(firstContentLine).toBeTruthy();
      // ENGLISH rule should be within first 10 lines
      const englishLineIndex = lines.findIndex((l: string) => l.includes('ENGLISH'));
      expect(englishLineIndex).toBeLessThan(10);
    });

    it('references TENANT-PROTOCOL.md', () => {
      const soul = (service as any).generateVaultSoulMd('tnt_test', 'Test Corp', 'Tech', '/root/.openclaw-tnt_test/vault');
      expect(soul).toContain('TENANT-PROTOCOL.md');
    });
  });

  describe('generateIndex', () => {
    it('creates markdown table with concept entries', () => {
      const concepts = [
        { slug: 'marketing', name: 'Marketing', category: 'Marketing' },
        { slug: 'sales', name: 'Sales', category: 'Sales' },
      ];
      const index = (service as any).generateIndex(concepts);
      expect(index).toContain('| marketing |');
      expect(index).toContain('| sales |');
      expect(index).toContain('placeholder');
    });
  });
});
