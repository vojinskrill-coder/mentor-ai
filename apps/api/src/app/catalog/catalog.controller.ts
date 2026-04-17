import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { CatalogService } from './catalog.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

@Controller('v1/catalog')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly prisma: PlatformPrismaService,
  ) {}

  /** List all catalog items with enabled status for the current tenant */
  @Get()
  async listAll(@CurrentUser() user: CurrentUserPayload) {
    const items = await this.catalogService.listAll(user.tenantId);
    return { data: items };
  }

  /**
   * Configure a tool-type catalog item — save credentials and test connectivity.
   * This is the primary endpoint for tool setup from Settings UI.
   * On success: saves credentials, tests connection, enables tool, deploys to OpenClaw.
   */
  @Post(':id/configure')
  async configure(
    @Param('id') id: string,
    @Body() body: { credentials: Record<string, string> },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const item = await this.prisma.catalogItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException({ type: 'catalog_item_not_found', status: 404, detail: `Catalog item ${id} not found` });
    }

    const result = await this.catalogService.configure(
      user.tenantId,
      id,
      user.userId,
      body.credentials,
    );
    return { data: result };
  }

  /**
   * Test connection to an MCP tool without saving credentials.
   * Used for "Test Connection" button in Settings UI.
   */
  @Post(':id/test-connection')
  async testConnection(
    @Param('id') id: string,
    @Body() body: { credentials: Record<string, string> },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const item = await this.prisma.catalogItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException({ type: 'catalog_item_not_found', status: 404, detail: `Catalog item ${id} not found` });
    }

    // Merge with existing stored credentials (user may not resend unchanged secrets)
    const mergedCredentials = await this.catalogService.mergeWithExistingCredentials(
      user.tenantId, item.slug, body.credentials,
    );
    const result = await this.catalogService.testToolConnection(item.slug, mergedCredentials);
    return { data: result };
  }

  /** Enable a catalog item for the current tenant */
  @Post(':id/enable')
  async enable(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const item = await this.prisma.catalogItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException({ type: 'catalog_item_not_found', status: 404, detail: `Catalog item ${id} not found` });
    }

    const result = await this.catalogService.enable(user.tenantId, id, user.userId);
    return {
      data: {
        enabled: true,
        deployStatus: result.deployStatus,
        ...(result.deployError ? { error: result.deployError } : {}),
      },
    };
  }

  /** Disable a catalog item for the current tenant */
  @Post(':id/disable')
  async disable(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const item = await this.prisma.catalogItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException({ type: 'catalog_item_not_found', status: 404, detail: `Catalog item ${id} not found` });
    }

    const result = await this.catalogService.disable(user.tenantId, id);
    return {
      data: {
        enabled: false,
        deployStatus: result.deployStatus,
        ...(result.deployError ? { error: result.deployError } : {}),
      },
    };
  }

  /** Get enabled processes only for the current tenant */
  @Get('enabled/processes')
  async getEnabledProcesses(@CurrentUser() user: CurrentUserPayload) {
    const processes = await this.catalogService.getEnabledProcesses(user.tenantId);
    return { data: processes };
  }
}
