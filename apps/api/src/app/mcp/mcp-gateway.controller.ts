import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { McpGatewayService } from './mcp-gateway.service';

/**
 * Generic MCP Gateway Controller.
 *
 * Provides a uniform REST interface for ALL MCP tools:
 *   - GET  /mcp/tools              → list catalog with connection status
 *   - POST /mcp/tools/:slug/connect    → connect a tool (save credentials)
 *   - POST /mcp/tools/:slug/test       → test connection
 *   - DELETE /mcp/tools/:slug          → disconnect
 *   - POST /mcp/:toolSlug/:operationId → execute any operation
 *
 * The Process Builder and n8n workflows call the execute endpoint.
 * The Settings → Integrations UI calls the tools endpoints.
 */
@Controller('v1/mcp')
@UseGuards(JwtAuthGuard)
export class McpGatewayController {
  private readonly logger = new Logger(McpGatewayController.name);

  constructor(private readonly gateway: McpGatewayService) {}

  // ─── Tool Catalog & Connection Management ──────────────────────

  /**
   * GET /api/v1/mcp/tools
   * List all MCP tools with connection status for current tenant.
   * Used by Settings → Integrations page and by Process Builder
   * to know which tools are available.
   */
  @Get('tools')
  async listTools(@CurrentUser() user: CurrentUserPayload) {
    const tools = await this.gateway.listToolsForTenant(user.tenantId);
    return { data: tools };
  }

  /**
   * POST /api/v1/mcp/tools/:slug/connect
   * Connect a tool by saving credentials + testing.
   * Called when user clicks "Connect" on the Integrations page.
   */
  @Post('tools/:slug/connect')
  async connectTool(
    @Param('slug') slug: string,
    @Body() body: { credentials: Record<string, unknown>; label?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const result = await this.gateway.connectTool(
      user.tenantId,
      slug,
      body.credentials,
      body.label,
    );
    return { data: result };
  }

  /**
   * POST /api/v1/mcp/tools/:slug/test
   * Test an existing connection.
   */
  @Post('tools/:slug/test')
  async testConnection(
    @Param('slug') slug: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const result = await this.gateway.testConnection(user.tenantId, slug);
    return { data: result };
  }

  /**
   * DELETE /api/v1/mcp/tools/:slug
   * Disconnect a tool (remove credentials).
   */
  @Delete('tools/:slug')
  async disconnectTool(
    @Param('slug') slug: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.gateway.disconnectTool(user.tenantId, slug);
    return { data: { disconnected: true } };
  }

  // ─── Generic Operation Execution ──────────────────────────────

  /**
   * POST /api/v1/mcp/:toolSlug/:operationId
   * Execute ANY operation on ANY connected tool.
   *
   * This is the core endpoint that:
   * - n8n workflows call for MCP_SEARCH / MCP_WRITE steps
   * - Process Builder test runs call to validate tools work
   * - The leads/approve flow calls for saving to the active CRM
   *
   * Body is operation-specific — matches the inputSchema defined
   * in the McpToolCatalog.operations array for this operation.
   */
  @Post(':toolSlug/:operationId')
  async execute(
    @Param('toolSlug') toolSlug: string,
    @Param('operationId') operationId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.logger.log({
      message: 'MCP execute request',
      tenantId: user.tenantId,
      toolSlug,
      operationId,
    });

    const result = await this.gateway.execute(
      user.tenantId,
      toolSlug,
      operationId,
      body,
    );

    return result;
  }
}
