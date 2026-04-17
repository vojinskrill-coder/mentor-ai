import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpServerController } from './mcp-server.controller';
import { VAULT_STORAGE } from '../vault-storage/vault-storage.interface';
import { ContentValidationService } from '../content-validation/content-validation.service';
import { EnrichmentQueueService } from '../enrichment-queue/enrichment-queue.service';

// ── Mock factories ─────────────────────────────────────────────

function createMockVault() {
  const store = new Map<string, string>();
  return {
    writeFile: jest.fn(async (_t: string, p: string, c: string) => {
      store.set(p, c);
    }),
    readFile: jest.fn(async (_t: string, p: string) => {
      const content = store.get(p);
      if (!content) throw new Error(`File not found: ${p}`);
      return content;
    }),
    fileExists: jest.fn(async (_t: string, p: string) => store.has(p)),
    listFiles: jest.fn(async () => []),
    writeFiles: jest.fn(async () => undefined),
    createDirectories: jest.fn(async () => undefined),
    _store: store,
  };
}

function createMockContext(headers: Record<string, string> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
      getResponse: () => ({}),
      getNext: () => jest.fn(),
    }),
    getClass: () => Object,
    getHandler: () => jest.fn(),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({} as any),
    switchToWs: () => ({} as any),
    getType: () => 'http' as const,
  } as unknown as ExecutionContext;
}

// ── Auth Guard Tests ───────────────────────────────────────────

describe('McpAuthGuard', () => {
  let guard: McpAuthGuard;
  const validToken = 'test-mcp-token-12345';

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'MCP_AUTH_TOKEN') return validToken;
        return undefined;
      }),
    } as unknown as ConfigService;
    guard = new McpAuthGuard(configService);
  });

  it('should return 401 for missing Authorization header', () => {
    const ctx = createMockContext({});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should return 403 for invalid token', () => {
    const ctx = createMockContext({ authorization: 'Bearer wrong-token' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should pass for valid token', () => {
    const ctx = createMockContext({ authorization: `Bearer ${validToken}` });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should return 401 for malformed Authorization header', () => {
    const ctx = createMockContext({ authorization: 'Basic abc123' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});

// ── Controller Tests ───────────────────────────────────────────

describe('McpServerController', () => {
  let controller: McpServerController;
  let mockVault: ReturnType<typeof createMockVault>;
  let mockEnrichmentQueue: { dequeue: jest.Mock };

  beforeEach(async () => {
    mockVault = createMockVault();
    mockEnrichmentQueue = {
      dequeue: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [McpServerController],
      providers: [
        { provide: VAULT_STORAGE, useValue: mockVault },
        ContentValidationService,
        { provide: EnrichmentQueueService, useValue: mockEnrichmentQueue },
        { provide: ConfigService, useValue: { get: () => 'test-token' } },
        McpAuthGuard,
      ],
    }).compile();

    controller = module.get(McpServerController);
  });

  // ── Tools endpoint ─────────────────────────────────────────

  it('tools endpoint should return list of all 9 tools', () => {
    const result = controller.getTools();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    const tools = result.data as Array<{ name: string }>;
    expect(tools.length).toBeGreaterThanOrEqual(9);

    const names = tools.map((t) => t.name);
    expect(names).toContain('vault_write');
    expect(names).toContain('vault_read');
    expect(names).toContain('vault_log');
    expect(names).toContain('vault_index_update');
    expect(names).toContain('knowledge_search');
    expect(names).toContain('knowledge_get_config');
    expect(names).toContain('knowledge_get_schema');
    expect(names).toContain('task_complete');
    expect(names).toContain('task_get_next');
  });

  // ── vault_write ────────────────────────────────────────────

  it('vault_write should reject content that fails validation', async () => {
    const result = await controller.vaultWrite({
      tenantId: 'test-tenant',
      path: 'wiki/concepts/test.md',
      content: 'Too short',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Content validation failed');
    expect(result.details).toBeDefined();
    expect(result.details!.length).toBeGreaterThan(0);
  });

  it('vault_write should accept valid content', async () => {
    // Generate content that passes all validation checks
    const longContent = [
      '---',
      'title: Test Article',
      '---',
      '',
      ...Array.from({ length: 500 }, (_, i) =>
        `This is paragraph number ${i + 1} with enough words to meet the minimum requirement for the content validation service checks.`,
      ),
      '',
      '## Sources',
      '- https://example.com/source1',
    ].join('\n');

    const result = await controller.vaultWrite({
      tenantId: 'test-tenant',
      path: 'wiki/concepts/valid-article.md',
      content: longContent,
    });
    expect(result.success).toBe(true);
    expect(mockVault.writeFile).toHaveBeenCalled();
  });

  // ── vault_read ─────────────────────────────────────────────

  it('vault_read should return content scoped to tenant', async () => {
    // Pre-populate vault
    await mockVault.writeFile('test-tenant', 'docs/readme.md', 'Hello tenant');

    const result = await controller.vaultRead({
      tenantId: 'test-tenant',
      path: 'docs/readme.md',
    });
    expect(result.success).toBe(true);
    expect((result.data as any).content).toBe('Hello tenant');
    // Verify vault was called with the correct tenantId
    expect(mockVault.readFile).toHaveBeenCalledWith('test-tenant', 'docs/readme.md');
  });

  it('vault_read should return error for missing file', async () => {
    const result = await controller.vaultRead({
      tenantId: 'test-tenant',
      path: 'nonexistent.md',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  // ── vault_log ──────────────────────────────────────────────

  it('vault_log should create log.md if it does not exist', async () => {
    const result = await controller.vaultLog({
      tenantId: 'test-tenant',
      entry: 'First log entry',
    });
    expect(result.success).toBe(true);
    expect(mockVault.writeFile).toHaveBeenCalled();
  });

  // ── vault_index_update ─────────────────────────────────────

  it('vault_index_update should reject invalid stage transition', async () => {
    const result = await controller.vaultIndexUpdate({
      tenantId: 'test-tenant',
      slug: 'test-concept',
      fromStage: 'queued',
      toStage: 'semantic', // can't jump from queued to semantic
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid stage transition');
  });

  it('vault_index_update should accept valid stage transition', async () => {
    const result = await controller.vaultIndexUpdate({
      tenantId: 'test-tenant',
      slug: 'test-concept',
      fromStage: 'queued',
      toStage: 'research',
    });
    expect(result.success).toBe(true);
  });

  // ── task_get_next ──────────────────────────────────────────

  it('task_get_next should return null on empty queue', async () => {
    const result = await controller.taskGetNext({ tenantId: 'test-tenant' });
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  it('task_get_next should return entry when queue has items', async () => {
    mockEnrichmentQueue.dequeue.mockResolvedValueOnce({
      id: 'entry-1',
      conceptId: 'concept-abc',
      status: 'DISPATCHED',
      attempt: 0,
    });

    const result = await controller.taskGetNext({ tenantId: 'test-tenant' });
    expect(result.success).toBe(true);
    expect((result.data as any).id).toBe('entry-1');
    expect((result.data as any).conceptId).toBe('concept-abc');
  });

  // ── knowledge_search (placeholder) ─────────────────────────

  it('knowledge_search should return empty results', async () => {
    const result = await controller.knowledgeSearch({
      tenantId: 'test-tenant',
      query: 'test query',
    });
    expect(result.success).toBe(true);
    expect((result.data as any).results).toEqual([]);
    expect((result.data as any).totalCount).toBe(0);
  });

  // ── task_complete ──────────────────────────────────────────

  it('task_complete should fail for non-existent article', async () => {
    const result = await controller.taskComplete({
      tenantId: 'test-tenant',
      slug: 'missing',
      articlePath: 'wiki/concepts/missing.md',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to read article');
  });
});
