import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { ToolkitDeployService } from '../toolkit/toolkit-deploy.service';
import { fetch as undiciFetch } from 'undici';

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly config: ConfigService,
    private readonly toolkitDeploy: ToolkitDeployService,
  ) {}

  /**
   * List all catalog items with tenant's enabled status merged in.
   * For tool-type items, includes configSchema and current credentials (secrets masked).
   */
  async listAll(tenantId: string) {
    const [items, tenantItems, bindings] = await Promise.all([
      this.prisma.catalogItem.findMany({
        where: { isActive: true },
        orderBy: [{ type: 'asc' }, { category: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.tenantCatalogItem.findMany({
        where: { tenantId },
      }),
      this.prisma.tenantToolBinding.findMany({
        where: { tenantId, enabled: true },
        include: { adapter: true },
      }),
    ]);

    const enabledMap = new Map(
      tenantItems.map((ti) => [ti.catalogItemId, ti]),
    );

    // Build a map of toolSlug → credentials from bindings
    const credentialsByToolSlug = new Map<string, Record<string, string>>();
    for (const binding of bindings) {
      credentialsByToolSlug.set(
        binding.adapter.toolSlug,
        binding.toolCredentials as Record<string, string>,
      );
    }

    return items.map((item) => {
      const tenantItem = enabledMap.get(item.id);
      const configSchema = item.configSchema as any;

      // Mask credentials for tool items
      let currentConfig: Record<string, string> | null = null;
      if (item.type === 'tool' && configSchema?.fields) {
        const creds = credentialsByToolSlug.get(item.slug);
        if (creds) {
          currentConfig = {};
          for (const field of configSchema.fields as any[]) {
            const value = creds[field.key];
            if (value) {
              currentConfig[field.key] =
                field.type === 'secret' ? this.maskSecret(value) : value;
            }
          }
        }
      }

      return {
        ...item,
        enabled: tenantItem?.enabled ?? false,
        customConfig: tenantItem?.customConfig ?? null,
        enabledAt: tenantItem?.enabledAt ?? null,
        enabledBy: tenantItem?.enabledBy ?? null,
        configured: currentConfig !== null,
        currentConfig,
      };
    });
  }

  /**
   * Mask a secret value, showing only first 4 and last 2 chars.
   */
  private maskSecret(value: string): string {
    if (value.length <= 8) return '••••••';
    return value.slice(0, 4) + '••••••' + value.slice(-2);
  }

  /**
   * Merge incoming credentials with existing stored ones.
   * Used for test-connection and configure — user may only send changed fields.
   */
  async mergeWithExistingCredentials(
    tenantId: string,
    toolSlug: string,
    incoming: Record<string, string>,
  ): Promise<Record<string, string>> {
    const existingBinding = await this.prisma.tenantToolBinding.findFirst({
      where: { tenantId, adapter: { toolSlug } },
    });
    const existingCreds = (existingBinding?.toolCredentials as Record<string, string>) ?? {};

    // Also check env var defaults
    const envDefaults = this.getDefaultCredentials(toolSlug) ?? {};

    // Priority: incoming (if non-empty) > existing binding > env defaults
    const merged: Record<string, string> = { ...envDefaults, ...existingCreds };
    for (const [key, val] of Object.entries(incoming)) {
      if (val?.trim()) {
        merged[key] = val;
      }
    }
    return merged;
  }

  /**
   * Configure (save credentials) for a tool-type catalog item.
   * Validates required fields from configSchema, saves to TenantToolBinding,
   * then tests connectivity. If test fails, credentials are saved but tool not enabled.
   */
  async configure(
    tenantId: string,
    catalogItemId: string,
    userId: string,
    credentials: Record<string, string>,
  ): Promise<{ configured: boolean; connected: boolean; error?: string }> {
    const item = await this.prisma.catalogItem.findUnique({
      where: { id: catalogItemId },
    });
    if (!item) throw new BadRequestException('Catalog item not found');
    if (item.type !== 'tool') throw new BadRequestException('Only tool items can be configured');

    const configSchema = item.configSchema as any;

    // Find or create adapter bindings for this tool
    const adapters = await this.prisma.processToolAdapter.findMany({
      where: { toolSlug: item.slug, isActive: true },
    });

    // Merge new credentials with existing ones (partial update support)
    let mergedCredentials = { ...credentials };
    if (adapters.length > 0) {
      const existingBinding = await this.prisma.tenantToolBinding.findFirst({
        where: { tenantId, adapter: { toolSlug: item.slug } },
      });
      if (existingBinding) {
        const existingCreds = existingBinding.toolCredentials as Record<string, string>;
        // Keep existing values for fields not provided in this update
        mergedCredentials = { ...existingCreds, ...credentials };
      }
    }

    // Re-validate required fields after merge
    if (configSchema?.fields) {
      for (const field of configSchema.fields as any[]) {
        if (field.required && !mergedCredentials[field.key]?.trim()) {
          throw new BadRequestException(`Field "${field.label}" is required`);
        }
      }
    }

    // Save merged credentials to all relevant TenantToolBindings
    for (const adapter of adapters) {
      await this.prisma.tenantToolBinding.upsert({
        where: { tenantId_adapterId: { tenantId, adapterId: adapter.id } },
        update: { toolCredentials: mergedCredentials, enabled: true },
        create: { tenantId, adapterId: adapter.id, toolCredentials: mergedCredentials, enabled: true },
      });
    }

    // If no adapters exist yet, store credentials in TenantCatalogItem.customConfig
    if (adapters.length === 0) {
      await this.prisma.tenantCatalogItem.upsert({
        where: { tenantId_catalogItemId: { tenantId, catalogItemId } },
        update: { customConfig: mergedCredentials },
        create: { tenantId, catalogItemId, customConfig: mergedCredentials, enabled: false },
      });
    }

    // Test connectivity with merged credentials
    const testResult = await this.testToolConnection(item.slug, mergedCredentials);

    if (testResult.connected) {
      // Enable the catalog item
      await this.prisma.tenantCatalogItem.upsert({
        where: { tenantId_catalogItemId: { tenantId, catalogItemId } },
        update: { enabled: true, enabledAt: new Date(), enabledBy: userId },
        create: { tenantId, catalogItemId, enabled: true, enabledAt: new Date(), enabledBy: userId },
      });

      // Deploy toolkit to OpenClaw
      const deployResult = await this.toolkitDeploy.deployToolkit(tenantId);
      if (!deployResult.success) {
        this.logger.warn({ message: 'Toolkit deploy failed after configure', error: deployResult.error });
      }
    }

    this.logger.log({
      message: 'Tool configured',
      tenantId,
      slug: item.slug,
      connected: testResult.connected,
    });

    return {
      configured: true,
      connected: testResult.connected,
      ...(testResult.error ? { error: testResult.error } : {}),
    };
  }

  /**
   * Test connection to an MCP tool using provided credentials.
   */
  async testToolConnection(
    toolSlug: string,
    credentials: Record<string, string>,
  ): Promise<{ connected: boolean; error?: string }> {
    try {
      switch (toolSlug) {
        case 'nocodb': {
          const { baseUrl, apiToken, tableId } = credentials;
          if (!baseUrl || !apiToken) {
            return { connected: false, error: 'Missing baseUrl or apiToken' };
          }
          // Try to list records (limit 1) to verify connection
          const testUrl = tableId
            ? `${baseUrl}/api/v2/tables/${tableId}/records?limit=1`
            : `${baseUrl}/api/v1/health`;
          const res = await undiciFetch(testUrl, {
            method: 'GET',
            headers: { 'xc-token': apiToken, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => '');
            return { connected: false, error: `NocoDB returned ${res.status}: ${body.slice(0, 200)}` };
          }
          return { connected: true };
        }

        case 'brave-search': {
          const { apiKey } = credentials;
          if (!apiKey) return { connected: false, error: 'Missing API Key' };
          const res = await undiciFetch(
            'https://api.search.brave.com/res/v1/web/search?q=test&count=1',
            {
              headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
              signal: AbortSignal.timeout(10_000),
            },
          );
          if (!res.ok) {
            return { connected: false, error: `Brave Search returned ${res.status}` };
          }
          return { connected: true };
        }

        case 'notion': {
          const { apiToken, contentDatabaseId } = credentials;
          if (!apiToken) return { connected: false, error: 'Missing Notion Integration Token' };
          // Test by querying the database
          const endpoint = contentDatabaseId
            ? `https://api.notion.com/v1/databases/${contentDatabaseId}`
            : 'https://api.notion.com/v1/users/me';
          const res = await undiciFetch(endpoint, {
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Notion-Version': '2022-06-28',
            },
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => '');
            if (res.status === 404) {
              return { connected: false, error: 'Database not found. Check the Database ID and ensure it is shared with the integration.' };
            }
            return { connected: false, error: `Notion returned ${res.status}: ${body.slice(0, 200)}` };
          }
          return { connected: true };
        }

        case 'slack': {
          const { botToken } = credentials;
          if (!botToken) return { connected: false, error: 'Missing Bot Token' };
          const res = await undiciFetch('https://slack.com/api/auth.test', {
            method: 'POST',
            headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(10_000),
          });
          const data = (await res.json()) as any;
          if (!data.ok) {
            return { connected: false, error: `Slack error: ${data.error}` };
          }
          return { connected: true };
        }

        default:
          // For tools without specific test logic, assume connected if credentials provided
          return { connected: true };
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      this.logger.warn({ message: 'Tool connection test failed', toolSlug, error: msg });
      return { connected: false, error: `Connection failed: ${msg.slice(0, 200)}` };
    }
  }

  /**
   * Enable a catalog item for a tenant.
   * For process-type: enables immediately.
   * For tool-type: requires prior configuration via configure() — toggle on UI calls configure first.
   */
  async enable(tenantId: string, catalogItemId: string, userId: string) {
    const catalogItem = await this.prisma.catalogItem.findUnique({
      where: { id: catalogItemId },
    });

    // For tool-type items, check that credentials exist
    if (catalogItem?.type === 'tool') {
      const hasCredentials = await this.hasToolCredentials(tenantId, catalogItem.slug);
      if (!hasCredentials) {
        throw new BadRequestException(
          'Tool must be configured before activation. Enter the required connection details.',
        );
      }
    }

    const result = await this.prisma.tenantCatalogItem.upsert({
      where: {
        tenantId_catalogItemId: { tenantId, catalogItemId },
      },
      update: {
        enabled: true,
        enabledAt: new Date(),
        enabledBy: userId,
      },
      create: {
        tenantId,
        catalogItemId,
        enabled: true,
        enabledAt: new Date(),
        enabledBy: userId,
      },
    });

    // Auto-create TenantToolBindings for tool-type catalog items (uses env defaults)
    await this.autoCreateToolBindings(tenantId, catalogItemId);

    let deployStatus: 'success' | 'failed' | 'skipped' = 'skipped';
    let deployError: string | undefined;

    if (catalogItem?.type === 'tool') {
      const deployResult = await this.toolkitDeploy.deployToolkit(tenantId);
      deployStatus = deployResult.success ? 'success' : 'failed';
      deployError = deployResult.error;
    }

    return { ...result, deployStatus, ...(deployError ? { deployError } : {}) };
  }

  /**
   * Check if a tenant has configured credentials for a tool.
   */
  private async hasToolCredentials(tenantId: string, toolSlug: string): Promise<boolean> {
    const binding = await this.prisma.tenantToolBinding.findFirst({
      where: {
        tenantId,
        enabled: true,
        adapter: { toolSlug },
      },
    });
    if (binding) {
      const creds = binding.toolCredentials as Record<string, string>;
      return Object.values(creds).some((v) => v?.trim());
    }
    // Also check env var defaults
    return this.getDefaultCredentials(toolSlug) !== null;
  }

  /**
   * When a catalog item is enabled, check if there are ProcessToolAdapters
   * that match it (by slug) and auto-create TenantToolBindings with
   * default credentials from environment variables.
   */
  private async autoCreateToolBindings(
    tenantId: string,
    catalogItemId: string,
  ): Promise<void> {
    try {
      const catalogItem = await this.prisma.catalogItem.findUnique({
        where: { id: catalogItemId },
      });
      if (!catalogItem?.slug) return;

      // Find all adapters that reference this catalog item's slug
      // (either as processSlug or toolSlug)
      const adapters = await this.prisma.processToolAdapter.findMany({
        where: {
          isActive: true,
          OR: [
            { processSlug: catalogItem.slug },
            { toolSlug: catalogItem.slug },
          ],
        },
      });

      if (adapters.length === 0) return;

      for (const adapter of adapters) {
        // Check if binding already exists
        const existing = await this.prisma.tenantToolBinding.findUnique({
          where: {
            tenantId_adapterId: { tenantId, adapterId: adapter.id },
          },
        });

        if (existing) {
          // Re-enable if disabled
          if (!existing.enabled) {
            await this.prisma.tenantToolBinding.update({
              where: { id: existing.id },
              data: { enabled: true },
            });
            this.logger.log(
              `Re-enabled TenantToolBinding ${existing.id} for adapter ${adapter.processSlug}/${adapter.toolSlug}`,
            );
          }
          continue;
        }

        // Build default credentials from env vars based on toolSlug
        const credentials = this.getDefaultCredentials(adapter.toolSlug);
        if (!credentials) continue;

        await this.prisma.tenantToolBinding.create({
          data: {
            tenantId,
            adapterId: adapter.id,
            toolCredentials: credentials,
            enabled: true,
          },
        });

        this.logger.log(
          `Auto-created TenantToolBinding for tenant ${tenantId}, adapter ${adapter.processSlug}/${adapter.toolSlug}`,
        );
      }
    } catch (err: any) {
      // Non-fatal — log and continue
      this.logger.warn(
        `Failed to auto-create tool bindings for catalog item ${catalogItemId}: ${err.message}`,
      );
    }
  }

  /**
   * Get default credentials for a tool from environment variables.
   */
  private getDefaultCredentials(
    toolSlug: string,
  ): Record<string, string> | null {
    switch (toolSlug) {
      case 'nocodb': {
        const baseUrl = this.config.get<string>('NOCODB_URL');
        const apiToken = this.config.get<string>('NOCODB_API_TOKEN');
        const tableId = this.config.get<string>('NOCODB_LEADS_TABLE_ID');
        if (!baseUrl || !apiToken) return null;
        return { baseUrl, apiToken, ...(tableId ? { tableId } : {}) };
      }
      case 'notion': {
        const apiToken = this.config.get<string>('NOTION_API_TOKEN');
        const contentDatabaseId = this.config.get<string>('NOTION_CONTENT_DATABASE_ID');
        if (!apiToken) return null;
        return { apiToken, ...(contentDatabaseId ? { contentDatabaseId } : {}) };
      }
      default:
        return null;
    }
  }

  /**
   * Disable a catalog item for a tenant.
   * Also disables related TenantToolBindings and redeploys toolkit.
   */
  async disable(tenantId: string, catalogItemId: string) {
    const result = await this.prisma.tenantCatalogItem.upsert({
      where: {
        tenantId_catalogItemId: { tenantId, catalogItemId },
      },
      update: {
        enabled: false,
      },
      create: {
        tenantId,
        catalogItemId,
        enabled: false,
      },
    });

    // Disable related TenantToolBindings
    const catalogItem = await this.prisma.catalogItem.findUnique({
      where: { id: catalogItemId },
    });

    let deployStatus: 'success' | 'failed' | 'skipped' = 'skipped';
    let deployError: string | undefined;

    if (catalogItem?.type === 'tool' && catalogItem.slug) {
      // Disable all bindings for adapters matching this tool
      const adapters = await this.prisma.processToolAdapter.findMany({
        where: {
          OR: [
            { processSlug: catalogItem.slug },
            { toolSlug: catalogItem.slug },
          ],
        },
      });

      for (const adapter of adapters) {
        await this.prisma.tenantToolBinding.updateMany({
          where: { tenantId, adapterId: adapter.id },
          data: { enabled: false },
        });
      }

      // Redeploy toolkit without the disabled tool
      const deployResult = await this.toolkitDeploy.deployToolkit(tenantId);
      deployStatus = deployResult.success ? 'success' : 'failed';
      deployError = deployResult.error;
    }

    return { ...result, deployStatus, ...(deployError ? { deployError } : {}) };
  }

  /**
   * Get only enabled process items for a tenant.
   */
  async getEnabledProcesses(tenantId: string) {
    const tenantItems = await this.prisma.tenantCatalogItem.findMany({
      where: {
        tenantId,
        enabled: true,
        catalogItem: { type: 'process', isActive: true },
      },
      include: { catalogItem: true },
    });

    return tenantItems.map((ti) => ({
      ...ti.catalogItem,
      customConfig: ti.customConfig,
    }));
  }
}
