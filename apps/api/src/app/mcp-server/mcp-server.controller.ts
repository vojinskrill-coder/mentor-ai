import {
  Controller,
  Get,
  Post,
  Body,
  Inject,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { McpAuthGuard } from './mcp-auth.guard';
import { VaultStorage, VAULT_STORAGE } from '../vault-storage/vault-storage.interface';
import { ContentValidationService } from '../content-validation/content-validation.service';
import { EnrichmentQueueService } from '../enrichment-queue/enrichment-queue.service';

// ── Standard MCP Response ──────────────────────────────────────

interface McpResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  details?: string[];
}

// ── Tool descriptors ───────────────────────────────────────────

const MCP_TOOLS = [
  { name: 'vault_write', description: 'Write content to a vault file (with validation)' },
  { name: 'vault_read', description: 'Read a file from the vault' },
  { name: 'vault_log', description: 'Append an entry to log.md in the vault' },
  { name: 'vault_index_update', description: 'Update index.md stage for a concept' },
  { name: 'knowledge_search', description: 'Search knowledge base by query' },
  { name: 'knowledge_get_config', description: 'Get tenant knowledge configuration' },
  { name: 'knowledge_get_schema', description: 'Read SCHEMA.md from the vault' },
  { name: 'task_complete', description: 'Mark a task as complete after validation' },
  { name: 'task_get_next', description: 'Dequeue the next enrichment task' },
];

// ── Controller ─────────────────────────────────────────────────

@Controller('mcp/v1')
@UseGuards(McpAuthGuard)
export class McpServerController {
  private readonly logger = new Logger(McpServerController.name);

  constructor(
    @Inject(VAULT_STORAGE) private readonly vault: VaultStorage,
    private readonly contentValidation: ContentValidationService,
    private readonly enrichmentQueue: EnrichmentQueueService,
  ) {}

  // ── Tools listing ────────────────────────────────────────────

  @Get('tools')
  getTools(): McpResponse {
    return { success: true, data: MCP_TOOLS };
  }

  // ── Vault operations ────────────────────────────────────────

  @Post('vault_write')
  async vaultWrite(
    @Body() body: { tenantId: string; path: string; content: string },
  ): Promise<McpResponse> {
    const { tenantId, path, content } = body;

    // Validate content before writing
    const validation = this.contentValidation.validateContent(content);
    if (!validation.valid) {
      return {
        success: false,
        error: 'Content validation failed',
        details: validation.errors,
      };
    }

    await this.vault.writeFile(tenantId, path, content);
    return { success: true, data: { path, bytesWritten: content.length } };
  }

  @Post('vault_read')
  async vaultRead(
    @Body() body: { tenantId: string; path: string },
  ): Promise<McpResponse> {
    try {
      const content = await this.vault.readFile(body.tenantId, body.path);
      return { success: true, data: { path: body.path, content } };
    } catch (err) {
      return {
        success: false,
        error: `File not found: ${body.path}`,
        details: [String(err)],
      };
    }
  }

  @Post('vault_log')
  async vaultLog(
    @Body() body: { tenantId: string; entry: string },
  ): Promise<McpResponse> {
    const logPath = 'log.md';
    const timestamp = new Date().toISOString();
    const logLine = `\n- [${timestamp}] ${body.entry}`;

    let existing = '';
    try {
      existing = await this.vault.readFile(body.tenantId, logPath);
    } catch {
      // log.md doesn't exist yet — start fresh
      existing = '# Vault Log\n';
    }

    await this.vault.writeFile(body.tenantId, logPath, existing + logLine);
    return { success: true, data: { appended: logLine.trim() } };
  }

  @Post('vault_index_update')
  async vaultIndexUpdate(
    @Body()
    body: {
      tenantId: string;
      slug: string;
      fromStage: string;
      toStage: string;
    },
  ): Promise<McpResponse> {
    // Valid stage transitions
    const validTransitions: Record<string, string[]> = {
      queued: ['research'],
      research: ['draft'],
      draft: ['review'],
      review: ['semantic', 'draft'], // can go back to draft for corrections
      semantic: [], // terminal
    };

    const allowed = validTransitions[body.fromStage];
    if (!allowed || !allowed.includes(body.toStage)) {
      return {
        success: false,
        error: `Invalid stage transition: ${body.fromStage} -> ${body.toStage}`,
        details: [
          `Allowed transitions from "${body.fromStage}": ${allowed?.join(', ') ?? 'none'}`,
        ],
      };
    }

    return {
      success: true,
      data: {
        slug: body.slug,
        previousStage: body.fromStage,
        newStage: body.toStage,
      },
    };
  }

  // ── Knowledge operations (placeholders) ─────────────────────

  @Post('knowledge_search')
  async knowledgeSearch(
    @Body() body: { tenantId: string; query: string; limit?: number },
  ): Promise<McpResponse> {
    // Placeholder — returns empty results with correct structure
    return {
      success: true,
      data: {
        query: body.query,
        results: [],
        totalCount: 0,
      },
    };
  }

  @Post('knowledge_get_config')
  async knowledgeGetConfig(
    @Body() body: { tenantId: string },
  ): Promise<McpResponse> {
    // Placeholder — returns empty config
    return {
      success: true,
      data: {
        tenantId: body.tenantId,
        config: {},
      },
    };
  }

  @Post('knowledge_get_schema')
  async knowledgeGetSchema(
    @Body() body: { tenantId: string },
  ): Promise<McpResponse> {
    try {
      const content = await this.vault.readFile(body.tenantId, 'SCHEMA.md');
      return { success: true, data: { content } };
    } catch (err) {
      return {
        success: false,
        error: 'SCHEMA.md not found in vault',
        details: [String(err)],
      };
    }
  }

  // ── Task operations ─────────────────────────────────────────

  @Post('task_complete')
  async taskComplete(
    @Body()
    body: { tenantId: string; slug: string; articlePath: string },
  ): Promise<McpResponse> {
    try {
      const content = await this.vault.readFile(body.tenantId, body.articlePath);
      const validation = this.contentValidation.validateContent(content);

      if (!validation.valid) {
        return {
          success: false,
          error: 'Article validation failed',
          details: validation.errors,
        };
      }

      return {
        success: true,
        data: {
          slug: body.slug,
          articlePath: body.articlePath,
          wordCount: content.split(/\s+/).filter((w) => w.length > 0).length,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to read article: ${body.articlePath}`,
        details: [String(err)],
      };
    }
  }

  @Post('task_get_next')
  async taskGetNext(
    @Body() body: { tenantId: string },
  ): Promise<McpResponse> {
    const entry = await this.enrichmentQueue.dequeue(body.tenantId);

    if (!entry) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        id: entry.id,
        conceptId: entry.conceptId,
        status: entry.status,
        attempt: entry.attempt,
      },
    };
  }
}
