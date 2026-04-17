/**
 * Full Journey Contract Test (Story 6.2)
 *
 * Proves the end-to-end enrichment pipeline works using:
 *   - Real LocalVaultStorage (temp dir per test suite)
 *   - Real ContentValidationService
 *   - Mock PrismaService for all DB operations
 *   - Mock relay calls (no external HTTP)
 *
 * Phases: Onboarding -> Agent Provisioning -> Enrichment -> Content Delivery -> Tenant Isolation -> Consistency
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Test, TestingModule } from '@nestjs/testing';

import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

import { LocalVaultStorage } from '../vault-storage/local-vault-storage';
import { VAULT_STORAGE } from '../vault-storage/vault-storage.interface';
import { VaultStorageError } from '../vault-storage/vault-storage.error';

import { ContentValidationService } from '../content-validation/content-validation.service';
import { EnrichmentQueueService, EnrichmentStatus } from '../enrichment-queue/enrichment-queue.service';
import { OnboardingVerificationService } from '../onboarding-verification/onboarding-verification.service';
import { OnboardingOrchestratorService } from '../onboarding-orchestrator/onboarding-orchestrator.service';
import { ContentDeliveryService } from '../content-delivery/content-delivery.service';
import { TenantIsolationService } from '../tenant-isolation/tenant-isolation.service';
import { ConsistencyCheckService } from './consistency-check.service';
import { GuardrailValidationService } from '../enrichment-engine/guardrail-validation.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';

// ── Constants ──────────────────────────────────────────────────────────────

const TENANT_A = 'tnt-contract-a';
const TENANT_B = 'tnt-contract-b';

// ── Helpers ────────────────────────────────────────────────────────────────

let vaultRoot: string;
let vault: LocalVaultStorage;

/**
 * Generate a valid English article that passes all content validation guardrails.
 * Needs >= 4500 words, >= 15000 chars, YAML frontmatter, Sources section, no Serbian.
 */
function generateValidArticle(conceptName: string): string {
  const frontmatter = `---
title: "${conceptName}"
slug: "${conceptName.toLowerCase().replace(/\s+/g, '-')}"
stage: semantic
---`;

  // Generate enough words to pass the 4500 word minimum
  const paragraphs: string[] = [];
  for (let i = 0; i < 50; i++) {
    paragraphs.push(
      `This is paragraph ${i + 1} of the comprehensive article about ${conceptName}. ` +
      `In today's competitive business landscape, understanding ${conceptName} is essential ` +
      `for any organization seeking to maintain its market position and drive sustainable growth. ` +
      `The strategic importance of this concept cannot be overstated, as it directly impacts ` +
      `revenue generation, customer satisfaction, and overall organizational effectiveness. ` +
      `Research has consistently shown that companies which invest in understanding and ` +
      `implementing best practices around ${conceptName} outperform their peers by significant ` +
      `margins. Industry leaders have noted that this area represents one of the most critical ` +
      `competitive advantages available to modern businesses. The implementation of these ` +
      `strategies requires careful planning, dedicated resources, and ongoing commitment ` +
      `from leadership teams across all levels of the organization. Furthermore, the integration ` +
      `of technology and data analytics has transformed how companies approach this domain, ` +
      `creating new opportunities for innovation and differentiation in the marketplace.`,
    );
  }

  return `${frontmatter}\n\n# ${conceptName}\n\n${paragraphs.join('\n\n')}\n\n## Sources\n\n- https://example.com/source-1\n- https://example.com/source-2\n`;
}

function generateSerbianArticle(): string {
  const frontmatter = `---
title: "Prodajni Plan"
slug: "prodajni-plan"
stage: semantic
---`;

  const paragraphs: string[] = [];
  for (let i = 0; i < 50; i++) {
    paragraphs.push(
      `Ovo je paragraf ${i + 1} koji govori o prodaji i prodajnom planu. ` +
      `Kompanija koja može da razvije dobar prodajni plan ima veće šanse za uspeh. ` +
      `Između ostalog, koji su ključni elementi? Nije lako definisati sve aspekte, ` +
      `ali već sada možemo da kažemo da je tržište složeno. Kupac je uvek u centru, ` +
      `a vrednost proizvoda mora biti jasna. Zato je važno razumeti šta kupci žele ` +
      `i kako im ponuditi rešenja koja zadovoljavaju njihove potrebe i očekivanja.`,
    );
  }

  return `${frontmatter}\n\n# Prodajni Plan\n\n${paragraphs.join('\n\n')}\n\n## Sources\n\n- https://example.com/source-1\n`;
}

function generateShortArticle(): string {
  return `---
title: "Test"
slug: "test"
---

# Short Article

This is too short to pass validation.

## Sources

- https://example.com/source-1
`;
}

// ── Mock Factories ─────────────────────────────────────────────────────────

function createMockPrisma() {
  return {
    concept: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    conversation: {
      count: jest.fn().mockResolvedValue(0),
    },
    note: {
      count: jest.fn().mockResolvedValue(0),
    },
    enrichmentQueue: {
      upsert: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

function createMockConfigService() {
  return {
    getRelayConfig: jest.fn().mockReturnValue({
      host: '127.0.0.1',
      port: 3100,
      authToken: 'test-token',
      timeoutSeconds: 120,
    }),
    getTimeouts: jest.fn().mockReturnValue({
      enrichmentTimeout: 300,
      sshTimeout: 30,
      relayTimeout: 120,
    }),
    getEnrichmentConfig: jest.fn().mockReturnValue({
      concurrency: 2,
      sessionStrategy: 'per-concept',
      compactionInterval: 10,
      maxRetries: 2,
      guardrails: {
        minWords: 4500,
        minChars: 15000,
        language: 'english',
        requireSources: true,
        requireFrontmatter: true,
      },
    }),
    getVaultConfig: jest.fn().mockReturnValue({
      storageBackend: 'local',
      sshHost: '',
      sshUser: '',
      sshKeyPath: '',
      basePath: '/tmp/test',
    }),
    getQdrantConfig: jest.fn().mockReturnValue({
      host: 'localhost',
      apiKey: 'test',
      collectionPrefix: 'test-',
      vectorDimension: 1536,
    }),
  };
}

// ── Setup / Teardown ───────────────────────────────────────────────────────

beforeAll(async () => {
  vaultRoot = path.join(os.tmpdir(), `contract-test-${Date.now()}`);
  await fs.mkdir(vaultRoot, { recursive: true });
  vault = new LocalVaultStorage(vaultRoot);
});

afterAll(async () => {
  try {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  } catch {
    // Cleanup is best-effort
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Full Journey Contract Test
// ═══════════════════════════════════════════════════════════════════════════

describe('Full Journey Contract Test', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Phase 1: Onboarding
  // ─────────────────────────────────────────────────────────────────────────

  describe('Phase 1: Onboarding', () => {
    it('verification service checks all systems — passes when setup is correct', async () => {
      const mockPrisma = createMockPrisma();
      // Setup: PG has enough concepts, conversations, notes
      mockPrisma.concept.count.mockResolvedValue(10);
      mockPrisma.conversation.count.mockResolvedValue(10);
      mockPrisma.note.count.mockResolvedValue(10);

      // Setup: vault has required files
      const requiredFiles = [
        'SCHEMA.md', 'TENANT-PROTOCOL.md', 'GUARDRAILS.md', 'FLOW.md',
        'index.md', 'log.md', 'wikilink-map.md',
        'instructions/bootstrap.md', 'instructions/tenant-config.md',
      ];
      for (const file of requiredFiles) {
        await vault.writeFile(TENANT_A, file, `# ${file}\nContent for ${file}`);
      }

      // Setup: SOUL.md with correct tenantId and ENGLISH
      await vault.writeFile(
        TENANT_A,
        'SOUL.md',
        `# SOUL.md for ${TENANT_A}\nAll output MUST be in ENGLISH.\nTenant: ${TENANT_A}\n`,
      );

      const service = new OnboardingVerificationService(
        mockPrisma as any,
        vault,
      );

      const result = await service.verifyTenantSetup(TENANT_A, 5);

      expect(result.verified).toBe(true);
      expect(result.failures).toHaveLength(0);
      expect(result.checks.length).toBeGreaterThanOrEqual(12); // 3 PG + 9 files + SOUL.md = 13
    });

    it('orchestrator populates enrichment queue on verification success', async () => {
      const mockPrisma = createMockPrisma();
      const concepts = [
        { id: 'cpt-1' }, { id: 'cpt-2' }, { id: 'cpt-3' },
      ];
      mockPrisma.concept.findMany.mockResolvedValue(concepts);

      const mockVerification = {
        verifyTenantSetup: jest.fn().mockResolvedValue({
          verified: true,
          checks: [],
          failures: [],
        }),
      };
      const mockQueue = {
        enqueueBatch: jest.fn().mockResolvedValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OnboardingOrchestratorService,
          { provide: OnboardingVerificationService, useValue: mockVerification },
          { provide: EnrichmentQueueService, useValue: mockQueue },
          { provide: PlatformPrismaService, useValue: mockPrisma },
        ],
      }).compile();

      const service = module.get(OnboardingOrchestratorService);
      const result = await service.finalizeOnboarding(TENANT_A, 3);

      expect(result.success).toBe(true);
      expect(result.queuedCount).toBe(3);
      expect(mockQueue.enqueueBatch).toHaveBeenCalledWith(
        TENANT_A,
        ['cpt-1', 'cpt-2', 'cpt-3'],
      );
    });

    it('orchestrator does NOT populate queue on verification failure', async () => {
      const mockPrisma = createMockPrisma();

      const mockVerification = {
        verifyTenantSetup: jest.fn().mockResolvedValue({
          verified: false,
          checks: [],
          failures: [
            { check: 'concept_count', passed: false, expected: 3, actual: 0, message: 'Only 0 concepts found' },
          ],
        }),
      };
      const mockQueue = {
        enqueueBatch: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OnboardingOrchestratorService,
          { provide: OnboardingVerificationService, useValue: mockVerification },
          { provide: EnrichmentQueueService, useValue: mockQueue },
          { provide: PlatformPrismaService, useValue: mockPrisma },
        ],
      }).compile();

      const service = module.get(OnboardingOrchestratorService);
      const result = await service.finalizeOnboarding(TENANT_A, 3);

      expect(result.success).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(mockQueue.enqueueBatch).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 2: Agent Provisioning
  //
  // NOTE: AgentProvisioningService + TemplateService read real filesystem
  // files (openclaw-config/). We test them only if those files exist.
  // Otherwise we skip with a descriptive message.
  // ─────────────────────────────────────────────────────────────────────────

  describe('Phase 2: Agent Provisioning', () => {
    // Check if openclaw-config/templates/vault/SOUL.template.md exists
    const templatePath = path.join(
      process.cwd(),
      'openclaw-config',
      'templates',
      'vault',
      'SOUL.template.md',
    );
    const registryPath = path.join(
      process.cwd(),
      'openclaw-config',
      'agent-registry.yaml',
    );

    let templateExists = false;
    let registryExists = false;

    beforeAll(async () => {
      try {
        await fs.access(templatePath);
        templateExists = true;
      } catch { /* missing */ }
      try {
        await fs.access(registryPath);
        registryExists = true;
      } catch { /* missing */ }
    });

    it('provisions all 8 agents with correct tenant data', async () => {
      if (!templateExists || !registryExists) {
        console.warn('Skipping agent provisioning test — openclaw-config files not found at cwd');
        return;
      }

      // Use real services that read from filesystem
      const { AgentRegistryService } = await import('../agent-registry/agent-registry.service');
      const { TemplateService } = await import('../template/template.service');
      const { AgentProvisioningService } = await import('../agent-provisioning/agent-provisioning.service');

      const agentRegistry = new AgentRegistryService();
      const templateService = new TemplateService();
      const provisioningService = new AgentProvisioningService(
        agentRegistry,
        templateService,
        vault,
      );

      const tenantConfig = {
        companyName: 'ContractTestCorp',
        industry: 'Technology',
        description: 'A test company for contract testing',
      };

      await provisioningService.provisionAgents(TENANT_A, tenantConfig);

      // Verify all 8 agents have SOUL.md files
      const agents = agentRegistry.getAllAgents();
      expect(agents.length).toBe(8);

      for (const agent of agents) {
        const soulPath = `agents/${agent.id}/SOUL.md`;
        const exists = await vault.fileExists(TENANT_A, soulPath);
        expect(exists).toBe(true);

        const content = await vault.readFile(TENANT_A, soulPath);

        // Must contain tenant name
        expect(content).toContain('ContractTestCorp');
        // Must contain ENGLISH
        expect(content).toContain('ENGLISH');
        // Must contain tenantId
        expect(content).toContain(TENANT_A);
        // No unresolved placeholders
        const unresolved = content.match(/\{\{[^}]+\}\}/g);
        expect(unresolved).toBeNull();
      }
    });

    it('provisioning is deterministic', async () => {
      if (!templateExists || !registryExists) {
        console.warn('Skipping determinism test — openclaw-config files not found at cwd');
        return;
      }

      const { AgentRegistryService } = await import('../agent-registry/agent-registry.service');
      const { TemplateService } = await import('../template/template.service');
      const { AgentProvisioningService } = await import('../agent-provisioning/agent-provisioning.service');

      const agentRegistry = new AgentRegistryService();
      const templateService = new TemplateService();

      // Create two separate vault roots for comparison
      const vaultRoot1 = path.join(os.tmpdir(), `determ-1-${Date.now()}`);
      const vaultRoot2 = path.join(os.tmpdir(), `determ-2-${Date.now()}`);
      await fs.mkdir(vaultRoot1, { recursive: true });
      await fs.mkdir(vaultRoot2, { recursive: true });

      const vault1 = new LocalVaultStorage(vaultRoot1);
      const vault2 = new LocalVaultStorage(vaultRoot2);

      const svc1 = new AgentProvisioningService(agentRegistry, templateService, vault1);
      const svc2 = new AgentProvisioningService(agentRegistry, templateService, vault2);

      const tenantConfig = {
        companyName: 'DetermTestCorp',
        industry: 'Finance',
        description: 'Testing determinism',
      };

      await svc1.provisionAgents('tnt-determ', tenantConfig);
      await svc2.provisionAgents('tnt-determ', tenantConfig);

      // Compare outputs for all agents
      const agents = agentRegistry.getAllAgents();
      for (const agent of agents) {
        const soulPath = `agents/${agent.id}/SOUL.md`;
        const content1 = await vault1.readFile('tnt-determ', soulPath);
        const content2 = await vault2.readFile('tnt-determ', soulPath);
        expect(content1).toBe(content2);
      }

      // Cleanup
      await fs.rm(vaultRoot1, { recursive: true, force: true }).catch(() => {});
      await fs.rm(vaultRoot2, { recursive: true, force: true }).catch(() => {});
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 3: Enrichment
  // ─────────────────────────────────────────────────────────────────────────

  describe('Phase 3: Enrichment', () => {
    it('queue state machine transitions correctly (mock Prisma)', async () => {
      // We simulate the state machine by tracking state in a local object
      const entryState: Record<string, any> = {};

      const mockPrisma = createMockPrisma();

      // upsert to create a QUEUED entry
      mockPrisma.enrichmentQueue.upsert.mockImplementation(async (args: any) => {
        const entry = {
          id: 'q-1',
          tenantId: args.create.tenantId,
          conceptId: args.create.conceptId,
          status: args.create.status,
          attempt: 0,
          maxAttempts: 3,
          sessionId: null,
          dispatchedAt: null,
          completedAt: null,
          failedAt: null,
          error: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        entryState['q-1'] = entry;
        return entry;
      });

      // findUnique returns the current state
      mockPrisma.enrichmentQueue.findUnique.mockImplementation(async () => {
        return entryState['q-1'] || null;
      });

      // update applies changes
      mockPrisma.enrichmentQueue.update.mockImplementation(async (args: any) => {
        const entry = entryState['q-1'];
        Object.assign(entry, args.data);
        return entry;
      });

      const queueService = new EnrichmentQueueService(mockPrisma as any);

      // Enqueue
      await queueService.enqueue(TENANT_A, 'concept-1');
      expect(entryState['q-1'].status).toBe(EnrichmentStatus.QUEUED);

      // Simulate dequeue by changing to DISPATCHED (dequeue uses raw query, so we simulate)
      entryState['q-1'].status = EnrichmentStatus.DISPATCHED;

      // DISPATCHED -> EXECUTING
      await queueService.markExecuting('q-1');
      expect(entryState['q-1'].status).toBe(EnrichmentStatus.EXECUTING);

      // EXECUTING -> VALIDATING
      await queueService.markValidating('q-1');
      expect(entryState['q-1'].status).toBe(EnrichmentStatus.VALIDATING);

      // VALIDATING -> COMPLETED
      await queueService.markCompleted('q-1');
      expect(entryState['q-1'].status).toBe(EnrichmentStatus.COMPLETED);
    });

    it('guardrail validation accepts valid English article', async () => {
      const mockPrisma = createMockPrisma();
      const mockConfigService = createMockConfigService();

      // Write a valid article to vault
      const validArticle = generateValidArticle('Marketing Strategy');
      await vault.writeFile(TENANT_A, 'wiki/concepts/marketing-strategy.md', validArticle);

      // Setup queue entry mock
      const entry = {
        id: 'entry-valid',
        tenantId: TENANT_A,
        conceptId: 'cpt-1',
        status: EnrichmentStatus.VALIDATING,
        attempt: 0,
        maxAttempts: 3,
        sessionId: null,
        dispatchedAt: new Date(),
        completedAt: null,
        failedAt: null,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockQueueService = {
        getEntry: jest.fn().mockResolvedValue(entry),
        markCompleted: jest.fn().mockResolvedValue(undefined),
        markFailed: jest.fn().mockResolvedValue(undefined),
        markCorrecting: jest.fn().mockResolvedValue(undefined),
      };

      const validationService = new ContentValidationService();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GuardrailValidationService,
          { provide: 'VAULT_STORAGE', useValue: vault },
          { provide: ContentValidationService, useValue: validationService },
          { provide: EnrichmentQueueService, useValue: mockQueueService },
          { provide: PlatformConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const guardrailService = module.get(GuardrailValidationService);
      const result = await guardrailService.validateAndComplete('entry-valid', 'marketing-strategy');

      expect(result.status).toBe('completed');
      expect(mockQueueService.markCompleted).toHaveBeenCalledWith('entry-valid');
    });

    it('guardrail validation rejects Serbian content and returns correction', async () => {
      const mockConfigService = createMockConfigService();

      // Write Serbian article to vault
      const serbianArticle = generateSerbianArticle();
      await vault.writeFile(TENANT_A, 'wiki/concepts/prodajni-plan.md', serbianArticle);

      const entry = {
        id: 'entry-serbian',
        tenantId: TENANT_A,
        conceptId: 'cpt-serb',
        status: EnrichmentStatus.VALIDATING,
        attempt: 0,
        maxAttempts: 3,
        sessionId: null,
        dispatchedAt: new Date(),
        completedAt: null,
        failedAt: null,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockQueueService = {
        getEntry: jest.fn().mockResolvedValue(entry),
        markCompleted: jest.fn().mockResolvedValue(undefined),
        markFailed: jest.fn().mockResolvedValue(undefined),
        markCorrecting: jest.fn().mockResolvedValue(undefined),
      };

      const validationService = new ContentValidationService();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GuardrailValidationService,
          { provide: 'VAULT_STORAGE', useValue: vault },
          { provide: ContentValidationService, useValue: validationService },
          { provide: EnrichmentQueueService, useValue: mockQueueService },
          { provide: PlatformConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const guardrailService = module.get(GuardrailValidationService);
      const result = await guardrailService.validateAndComplete('entry-serbian', 'prodajni-plan');

      expect(result.status).toBe('correcting');
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);

      // Should mention Serbian diacritics or Serbian words
      const errorText = result.errors!.join(' ');
      expect(
        errorText.includes('Serbian') || errorText.includes('diacritical'),
      ).toBe(true);

      expect(mockQueueService.markCorrecting).toHaveBeenCalledWith('entry-serbian');
    });

    it('guardrail validation rejects short content', async () => {
      const mockConfigService = createMockConfigService();

      const shortArticle = generateShortArticle();
      await vault.writeFile(TENANT_A, 'wiki/concepts/short-test.md', shortArticle);

      const entry = {
        id: 'entry-short',
        tenantId: TENANT_A,
        conceptId: 'cpt-short',
        status: EnrichmentStatus.VALIDATING,
        attempt: 0,
        maxAttempts: 3,
        sessionId: null,
        dispatchedAt: new Date(),
        completedAt: null,
        failedAt: null,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockQueueService = {
        getEntry: jest.fn().mockResolvedValue(entry),
        markCompleted: jest.fn().mockResolvedValue(undefined),
        markFailed: jest.fn().mockResolvedValue(undefined),
        markCorrecting: jest.fn().mockResolvedValue(undefined),
      };

      const validationService = new ContentValidationService();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GuardrailValidationService,
          { provide: 'VAULT_STORAGE', useValue: vault },
          { provide: ContentValidationService, useValue: validationService },
          { provide: EnrichmentQueueService, useValue: mockQueueService },
          { provide: PlatformConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const guardrailService = module.get(GuardrailValidationService);
      const result = await guardrailService.validateAndComplete('entry-short', 'short-test');

      expect(result.status).toBe('correcting');
      expect(result.errors).toBeDefined();

      const errorText = result.errors!.join(' ');
      // Should mention word count or character count
      expect(
        errorText.includes('Word count') || errorText.includes('too short'),
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 4: Content Delivery
  // ─────────────────────────────────────────────────────────────────────────

  describe('Phase 4: Content Delivery', () => {
    it('returns vault content for enriched concept', async () => {
      const articleContent = generateValidArticle('Content Delivery Test');
      await vault.writeFile(TENANT_A, 'wiki/concepts/content-delivery-test.md', articleContent);

      const mockPrisma = createMockPrisma();
      mockPrisma.concept.findUnique.mockResolvedValue({
        id: 'cpt-cd-1',
        name: 'Content Delivery Test',
        slug: 'content-delivery-test',
        category: 'Marketing',
        tier: 'core',
        confidence: 0.95,
        tenantId: TENANT_A,
      });

      const service = new ContentDeliveryService(mockPrisma as any, vault);
      const result = await service.getConceptContent(TENANT_A, 'cpt-cd-1');

      expect(result.enrichmentStatus).toBe('completed');
      expect(result.content).toBe(articleContent);
      expect(result.name).toBe('Content Delivery Test');
      expect(result.slug).toBe('content-delivery-test');
    });

    it('returns pending for non-enriched concept', async () => {
      const mockPrisma = createMockPrisma();
      mockPrisma.concept.findUnique.mockResolvedValue({
        id: 'cpt-cd-2',
        name: 'Not Enriched Yet',
        slug: 'not-enriched-yet',
        category: 'Sales',
        tier: null,
        confidence: null,
        tenantId: TENANT_A,
      });

      const service = new ContentDeliveryService(mockPrisma as any, vault);
      const result = await service.getConceptContent(TENANT_A, 'cpt-cd-2');

      expect(result.enrichmentStatus).toBe('pending');
      expect(result.content).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 5: Tenant Isolation
  // ─────────────────────────────────────────────────────────────────────────

  describe('Phase 5: Tenant Isolation', () => {
    it('tenant A cannot access tenant B vault files (different path)', async () => {
      // Write files for both tenants
      await vault.writeFile(TENANT_A, 'SCHEMA.md', '# Schema for tenant A');
      await vault.writeFile(TENANT_B, 'SCHEMA.md', '# Schema for tenant B');

      // Read tenant A file — should get tenant A's content
      const contentA = await vault.readFile(TENANT_A, 'SCHEMA.md');
      expect(contentA).toContain('tenant A');

      // Read tenant B file — should get tenant B's content
      const contentB = await vault.readFile(TENANT_B, 'SCHEMA.md');
      expect(contentB).toContain('tenant B');

      // Verify they are different (isolation by path)
      expect(contentA).not.toBe(contentB);
    });

    it('path traversal is blocked', async () => {
      await expect(
        vault.readFile(TENANT_A, `../../${TENANT_B}/vault/SCHEMA.md`),
      ).rejects.toThrow(VaultStorageError);

      await expect(
        vault.readFile(TENANT_A, '../../../etc/passwd'),
      ).rejects.toThrow(VaultStorageError);
    });

    it('cross-tenant concept access is rejected', async () => {
      const mockPrisma = createMockPrisma();
      // Concept belongs to TENANT_B
      mockPrisma.concept.findUnique.mockResolvedValue({
        id: 'cpt-cross',
        name: 'Cross Tenant Concept',
        slug: 'cross-tenant',
        category: 'Test',
        tier: null,
        confidence: null,
        tenantId: TENANT_B,
      });

      const service = new ContentDeliveryService(mockPrisma as any, vault);

      // Request with TENANT_A — should throw
      await expect(
        service.getConceptContent(TENANT_A, 'cpt-cross'),
      ).rejects.toThrow(/does not belong to tenant/);
    });

    it('TenantIsolationService.verifyConceptAccess rejects cross-tenant', async () => {
      const mockPrisma = createMockPrisma();
      mockPrisma.concept.findUnique.mockResolvedValue({
        id: 'cpt-iso',
        tenantId: TENANT_B,
      });

      const service = new TenantIsolationService(mockPrisma as any, vault);
      const allowed = await service.verifyConceptAccess(TENANT_A, 'cpt-iso');

      expect(allowed).toBe(false);
    });

    it('TenantIsolationService.verifyConceptAccess allows same tenant', async () => {
      const mockPrisma = createMockPrisma();
      mockPrisma.concept.findUnique.mockResolvedValue({
        id: 'cpt-own',
        tenantId: TENANT_A,
      });

      const service = new TenantIsolationService(mockPrisma as any, vault);
      const allowed = await service.verifyConceptAccess(TENANT_A, 'cpt-own');

      expect(allowed).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 6: Consistency
  // ─────────────────────────────────────────────────────────────────────────

  describe('Phase 6: Consistency', () => {
    it('detects missing vault files', async () => {
      const TENANT_CONSIST = 'tnt-consist';

      // Write vault files for 2 of 3 concepts
      await vault.writeFile(TENANT_CONSIST, 'wiki/concepts/alpha.md', '# Alpha content');
      await vault.writeFile(TENANT_CONSIST, 'wiki/concepts/gamma.md', '# Gamma content');
      // "beta" is intentionally missing

      const mockPrisma = createMockPrisma();
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'cpt-a', name: 'Alpha', slug: 'alpha' },
        { id: 'cpt-b', name: 'Beta', slug: 'beta' },
        { id: 'cpt-g', name: 'Gamma', slug: 'gamma' },
      ]);

      const mockQueue = {
        getQueueStats: jest.fn().mockResolvedValue({
          QUEUED: 0, DISPATCHED: 0, EXECUTING: 0, VALIDATING: 0,
          CORRECTING: 0, COMPLETED: 3, FAILED: 0, PERMANENTLY_FAILED: 0,
        }),
      };

      const service = new ConsistencyCheckService(
        mockPrisma as any,
        vault,
        mockQueue as any,
      );

      const result = await service.verifyConsistency(TENANT_CONSIST);

      expect(result.consistent).toBe(false);
      expect(result.checked).toBe(3);
      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0]!.conceptId).toBe('cpt-b');
      expect(result.drifts[0]!.issue).toBe('missing_vault_file');
    });

    it('reports all consistent when all vault files exist', async () => {
      const TENANT_OK = 'tnt-ok';

      await vault.writeFile(TENANT_OK, 'wiki/concepts/one.md', '# One');
      await vault.writeFile(TENANT_OK, 'wiki/concepts/two.md', '# Two');

      const mockPrisma = createMockPrisma();
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'cpt-1', name: 'One', slug: 'one' },
        { id: 'cpt-2', name: 'Two', slug: 'two' },
      ]);

      const mockQueue = {
        getQueueStats: jest.fn().mockResolvedValue({
          QUEUED: 0, DISPATCHED: 0, EXECUTING: 0, VALIDATING: 0,
          CORRECTING: 0, COMPLETED: 2, FAILED: 0, PERMANENTLY_FAILED: 0,
        }),
      };

      const service = new ConsistencyCheckService(
        mockPrisma as any,
        vault,
        mockQueue as any,
      );

      const result = await service.verifyConsistency(TENANT_OK);

      expect(result.consistent).toBe(true);
      expect(result.checked).toBe(2);
      expect(result.drifts).toHaveLength(0);
    });
  });
});
