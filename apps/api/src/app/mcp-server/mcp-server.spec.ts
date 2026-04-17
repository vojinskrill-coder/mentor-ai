import { McpServerController } from './mcp-server.controller';
import { McpAuthGuard } from './mcp-auth.guard';
import { ContentValidationService } from '../content-validation/content-validation.service';

describe('McpServerController', () => {
  let controller: McpServerController;
  let mockVaultStorage: any;
  let contentValidation: ContentValidationService;

  beforeEach(() => {
    contentValidation = new ContentValidationService();
    mockVaultStorage = {
      writeFile: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockResolvedValue('# Content'),
      fileExists: jest.fn().mockResolvedValue(true),
      listFiles: jest.fn().mockResolvedValue(['a.md', 'b.md']),
      writeFiles: jest.fn().mockResolvedValue(undefined),
      createDirectories: jest.fn().mockResolvedValue(undefined),
    };
    controller = new McpServerController(
      contentValidation,
      mockVaultStorage,
    );
  });

  it('should return list of tools', () => {
    const result = controller.getTools();
    expect(result.success).toBe(true);
    expect(result.data.tools).toContain('vault_write');
    expect(result.data.tools).toContain('vault_read');
    expect(result.data.tools).toContain('task_complete');
    expect(result.data.tools.length).toBe(9);
  });

  it('should write file to vault with valid content', async () => {
    const validContent = `---
title: Test
---

${'Word '.repeat(60)}

## Sources
- Source 1`;
    // Override validation to pass
    jest.spyOn(contentValidation, 'validateContent').mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
      stats: { wordCount: 60, charCount: 400, hasDiacritics: true, hasFrontmatter: true, hasSources: true, serbianWordCount: 0 },
    });

    const result = await controller.vaultWrite({
      tenantId: 'tenant-1',
      path: 'concepts/test.md',
      content: validContent,
    });
    expect(result.success).toBe(true);
    expect(mockVaultStorage.writeFile).toHaveBeenCalledWith(
      'tenant-1',
      'concepts/test.md',
      validContent,
    );
  });

  it('should reject invalid content on vault_write', async () => {
    jest.spyOn(contentValidation, 'validateContent').mockReturnValue({
      valid: false,
      errors: ['Too short'],
      warnings: [],
      stats: { wordCount: 1, charCount: 5, hasDiacritics: false, hasFrontmatter: false, hasSources: false, serbianWordCount: 0 },
    });
    const result = await controller.vaultWrite({
      tenantId: 'tenant-1',
      path: 'test.md',
      content: 'Short',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('validation failed');
  });

  it('should read file from vault', async () => {
    const result = await controller.vaultRead({
      tenantId: 'tenant-1',
      path: 'test.md',
    });
    expect(result.success).toBe(true);
    expect(result.data.content).toBe('# Content');
  });

  it('should handle vault_read errors', async () => {
    mockVaultStorage.readFile.mockRejectedValue(new Error('File not found'));
    const result = await controller.vaultRead({
      tenantId: 'tenant-1',
      path: 'missing.md',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found');
  });

  it('should log vault messages', async () => {
    const result = await controller.vaultLog({
      tenantId: 'tenant-1',
      message: 'Test log',
      level: 'info',
    });
    expect(result.success).toBe(true);
  });

  it('should handle vault_index_update', async () => {
    const result = await controller.vaultIndexUpdate({
      tenantId: 'tenant-1',
      slug: 'test-concept',
      status: 'COMPLETED',
    });
    expect(result.success).toBe(true);
    expect(result.data.slug).toBe('test-concept');
  });

  it('should handle knowledge_search', async () => {
    const result = await controller.knowledgeSearch({
      tenantId: 'tenant-1',
      query: 'sales strategy',
    });
    expect(result.success).toBe(true);
    expect(result.data.results).toBeDefined();
  });

  it('should handle knowledge_get_config', async () => {
    const result = await controller.knowledgeGetConfig({
      tenantId: 'tenant-1',
    });
    expect(result.success).toBe(true);
    expect(result.data.tenantId).toBe('tenant-1');
  });

  it('should handle knowledge_get_schema', async () => {
    const result = await controller.knowledgeGetSchema({
      tenantId: 'tenant-1',
    });
    expect(result.success).toBe(true);
    expect(result.data.schema.concepts).toBeDefined();
  });

  it('should handle task_complete', async () => {
    const result = await controller.taskComplete({
      tenantId: 'tenant-1',
      taskId: 'task-123',
      result: { score: 100 },
    });
    expect(result.success).toBe(true);
    expect(result.data.completed).toBe(true);
  });

  it('should handle task_get_next', async () => {
    const result = await controller.taskGetNext({
      tenantId: 'tenant-1',
      agentId: 'main',
    });
    expect(result.success).toBe(true);
  });

  it('should handle vault_write storage error', async () => {
    jest.spyOn(contentValidation, 'validateContent').mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
      stats: { wordCount: 60, charCount: 400, hasDiacritics: true, hasFrontmatter: true, hasSources: true, serbianWordCount: 0 },
    });
    mockVaultStorage.writeFile.mockRejectedValue(new Error('Disk full'));
    const result = await controller.vaultWrite({
      tenantId: 'tenant-1',
      path: 'test.md',
      content: 'content',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Disk full');
  });
});

describe('McpAuthGuard', () => {
  let guard: McpAuthGuard;

  beforeEach(() => {
    guard = new McpAuthGuard();
  });

  const mockContext = (authHeader?: string) => ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authHeader ? { authorization: authHeader } : {},
      }),
    }),
  });

  it('should reject missing authorization header', () => {
    expect(() =>
      guard.canActivate(mockContext() as any),
    ).toThrow();
  });

  it('should reject invalid token', () => {
    process.env.MCP_AUTH_TOKEN = 'valid-token';
    expect(() =>
      guard.canActivate(mockContext('Bearer wrong-token') as any),
    ).toThrow();
    delete process.env.MCP_AUTH_TOKEN;
  });

  it('should accept valid token', () => {
    process.env.MCP_AUTH_TOKEN = 'valid-token';
    const result = guard.canActivate(
      mockContext('Bearer valid-token') as any,
    );
    expect(result).toBe(true);
    delete process.env.MCP_AUTH_TOKEN;
  });

  it('should reject when MCP_AUTH_TOKEN not configured', () => {
    delete process.env.MCP_AUTH_TOKEN;
    expect(() =>
      guard.canActivate(mockContext('Bearer some-token') as any),
    ).toThrow();
  });
});
