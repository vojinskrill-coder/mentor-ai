import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { McpAuthGuard } from './mcp-auth.guard';
import { ContentValidationService } from '../content-validation/content-validation.service';
import { VAULT_STORAGE, VaultStorage } from '../vault-storage/vault-storage.interface';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

interface McpResponse {
  success: boolean;
  data?: any;
  error?: string;
  details?: any;
}

@Controller('mcp/v1')
@UseGuards(McpAuthGuard)
export class McpServerController {
  private readonly logger = new Logger(McpServerController.name);

  constructor(
    private readonly contentValidation: ContentValidationService,
    @Inject(VAULT_STORAGE) private readonly vaultStorage: VaultStorage,
    @Optional() private readonly prisma?: PlatformPrismaService,
  ) {}

  @Get('tools')
  getTools(): McpResponse {
    return {
      success: true,
      data: {
        tools: [
          'vault_write',
          'vault_read',
          'vault_log',
          'vault_index_update',
          'knowledge_search',
          'knowledge_get_config',
          'knowledge_get_schema',
          'task_complete',
          'task_get_next',
        ],
      },
    };
  }

  @Post('vault_write')
  async vaultWrite(
    @Body() body: { tenantId: string; path: string; content: string },
  ): Promise<McpResponse> {
    try {
      // Validate content before writing
      const validation = this.contentValidation.validateContent(body.content);
      if (!validation.valid) {
        return {
          success: false,
          error: 'Content validation failed',
          details: {
            errors: validation.errors,
            stats: validation.stats,
          },
        };
      }

      await this.vaultStorage.writeFile(body.tenantId, body.path, body.content);
      return { success: true, data: { path: body.path, stats: validation.stats } };
    } catch (err) {
      this.logger.error(`vault_write failed: ${(err as Error).message}`);
      return {
        success: false,
        error: (err as Error).message,
      };
    }
  }

  @Post('vault_read')
  async vaultRead(
    @Body() body: { tenantId: string; path: string },
  ): Promise<McpResponse> {
    try {
      const content = await this.vaultStorage.readFile(body.tenantId, body.path);
      return { success: true, data: { content } };
    } catch (err) {
      this.logger.error(`vault_read failed: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }

  @Post('vault_log')
  async vaultLog(
    @Body() body: { tenantId: string; message: string; level?: string },
  ): Promise<McpResponse> {
    const level = body.level || 'info';
    this.logger.log(`[${body.tenantId}] [${level}] ${body.message}`);
    return { success: true };
  }

  @Post('vault_index_update')
  async vaultIndexUpdate(
    @Body() body: { tenantId: string; slug: string; status: string },
  ): Promise<McpResponse> {
    try {
      this.logger.log(
        `Index update: tenant=${body.tenantId} slug=${body.slug} status=${body.status}`,
      );
      return { success: true, data: { slug: body.slug, status: body.status } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  @Post('knowledge_search')
  async knowledgeSearch(
    @Body() body: { tenantId: string; query: string; limit?: number },
  ): Promise<McpResponse> {
    try {
      // Placeholder — in production this queries Qdrant
      this.logger.log(
        `Knowledge search: tenant=${body.tenantId} query="${body.query}"`,
      );
      return { success: true, data: { results: [] } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  @Post('knowledge_get_config')
  async knowledgeGetConfig(
    @Body() body: { tenantId: string },
  ): Promise<McpResponse> {
    try {
      return {
        success: true,
        data: { tenantId: body.tenantId, configured: true },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  @Post('knowledge_get_schema')
  async knowledgeGetSchema(
    @Body() body: { tenantId: string },
  ): Promise<McpResponse> {
    try {
      return {
        success: true,
        data: {
          schema: {
            concepts: { fields: ['id', 'name', 'slug', 'category', 'description'] },
            relationships: { fields: ['sourceId', 'targetId', 'type'] },
          },
        },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  @Post('task_complete')
  async taskComplete(
    @Body() body: { tenantId: string; taskId: string; result?: any },
  ): Promise<McpResponse> {
    try {
      this.logger.log(
        `Task complete: tenant=${body.tenantId} task=${body.taskId}`,
      );
      return { success: true, data: { taskId: body.taskId, completed: true } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  @Post('task_get_next')
  async taskGetNext(
    @Body() body: { tenantId: string; agentId?: string },
  ): Promise<McpResponse> {
    try {
      this.logger.log(
        `Get next task: tenant=${body.tenantId} agent=${body.agentId || 'any'}`,
      );
      return { success: true, data: { task: null } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
