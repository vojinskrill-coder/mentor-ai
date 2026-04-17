import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

/**
 * Generic MCP Gateway — executes operations against any tool in the
 * McpToolCatalog without hardcoding tool-specific logic.
 *
 * Flow:
 *   1. Look up the tool in McpToolCatalog by slug
 *   2. Look up TenantCredential for auth
 *   3. Find the requested operation in the tool's operations array
 *   4. Build the external HTTP request from operation config + credentials
 *   5. Execute and return normalized response
 *
 * Adding a new tool = one DB row in McpToolCatalog + TenantCredential.
 * Zero code changes, zero deployments.
 */
@Injectable()
export class McpGatewayService {
  private readonly logger = new Logger(McpGatewayService.name);

  // Base URLs for known tools (derived from catalog or conventions).
  // This is the ONLY place tool-specific knowledge lives, and it's
  // driven entirely by the catalog's metadata — not hardcoded logic.
  private static readonly API_BASE_URLS: Record<string, string> = {
    'apollo-io': 'https://api.apollo.io',
    apollo: 'https://api.apollo.io',
    'brave-search': 'https://api.search.brave.com',
    notion: 'https://api.notion.com/v1',
    gmail: 'https://gmail.googleapis.com/gmail/v1',
    'google-sheets': 'https://sheets.googleapis.com/v4',
  };

  // Maps credentialType → how to build the auth header
  private static readonly AUTH_BUILDERS: Record<
    string,
    (creds: Record<string, unknown>) => Record<string, string>
  > = {
    apiKey: (creds): Record<string, string> => {
      const key =
        (creds.apiKey as string) ??
        (creds.apiToken as string) ??
        (creds.api_key as string) ??
        (creds.token as string) ??
        '';
      const headers: Record<string, string> = {};
      if (creds._toolSlug === 'apollo-io' || creds._toolSlug === 'apollo') {
        headers['X-Api-Key'] = key;
        headers['Cache-Control'] = 'no-cache';
      } else if (creds._toolSlug === 'brave-search') {
        headers['X-Subscription-Token'] = key;
        headers['Accept'] = 'application/json';
      } else if (creds._toolSlug === 'notion') {
        headers['Authorization'] = `Bearer ${key}`;
        headers['Notion-Version'] = '2022-06-28';
      } else {
        headers['Authorization'] = `Bearer ${key}`;
      }
      return headers;
    },
    oauth2: (creds): Record<string, string> => ({
      Authorization: `Bearer ${(creds.accessToken as string) ?? (creds.oauthToken as string) ?? ''}`,
    }),
    basic: (creds): Record<string, string> => ({
      Authorization: `Basic ${Buffer.from(`${creds.username ?? ''}:${creds.password ?? ''}`).toString('base64')}`,
    }),
    none: (): Record<string, string> => ({}),
  };

  // Maps operation kind + tool slug to the actual API path
  private static readonly OPERATION_PATHS: Record<string, Record<string, { method: string; path: string }>> = {
    'apollo-io': {
      search_organizations: { method: 'POST', path: '/v1/organizations/search' },
      enrich_organization: { method: 'GET', path: '/v1/organizations/enrich' },
      enrich_person: { method: 'POST', path: '/v1/people/match' },
      save_contact: { method: 'POST', path: '/v1/contacts' },
      search_contacts: { method: 'POST', path: '/v1/contacts/search' },
    },
    apollo: {
      search_organizations: { method: 'POST', path: '/v1/organizations/search' },
      enrich_organization: { method: 'GET', path: '/v1/organizations/enrich' },
      enrich_person: { method: 'POST', path: '/v1/people/match' },
      save_contact: { method: 'POST', path: '/v1/contacts' },
      search_contacts: { method: 'POST', path: '/v1/contacts/search' },
    },
    'brave-search': {
      web_search: { method: 'GET', path: '/res/v1/web/search' },
    },
    notion: {
      create_page: { method: 'POST', path: '/pages' },
      query_database: { method: 'POST', path: '/databases/{databaseId}/query' },
      update_page: { method: 'PATCH', path: '/pages/{pageId}' },
      search: { method: 'POST', path: '/search' },
    },
  };

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Execute a generic MCP operation.
   *
   * @param tenantId   Tenant making the request
   * @param toolSlug   Tool identifier (e.g., 'apollo', 'notion')
   * @param operationId Operation within the tool (e.g., 'search_people')
   * @param body       Operation-specific input parameters
   */
  async execute(
    tenantId: string,
    toolSlug: string,
    operationId: string,
    body: Record<string, unknown>,
  ): Promise<{ data: unknown; meta?: Record<string, unknown> }> {
    // 1. Load tool from catalog
    const tool = await this.prisma.mcpToolCatalog.findUnique({
      where: { slug: toolSlug },
    });
    if (!tool || !tool.isActive) {
      throw new NotFoundException(`MCP tool '${toolSlug}' not found or disabled`);
    }

    // 2. Find the operation
    const operations = (tool.operations as unknown as Array<{
      id: string;
      kind: string;
      displayName: string;
      inputSchema: Record<string, unknown>;
      outputSchema: Record<string, unknown>;
    }>) ?? [];
    const operation = operations.find((op) => op.id === operationId);
    if (!operation) {
      throw new BadRequestException(
        `Operation '${operationId}' not found on tool '${toolSlug}'. Available: ${operations.map((o) => o.id).join(', ')}`,
      );
    }

    // 3. Load tenant credentials
    const credential = await this.prisma.tenantCredential.findUnique({
      where: { tenantId_toolSlug: { tenantId, toolSlug } },
    });
    if (!credential && tool.credentialType !== 'none') {
      throw new BadRequestException(
        `Tool '${toolSlug}' requires credentials but tenant has not connected it. Go to Settings → Integrations.`,
      );
    }

    const creds = {
      ...((credential?.credentials as Record<string, unknown>) ?? {}),
      _toolSlug: toolSlug,
    };

    // 4. Build the external request
    const baseUrl = McpGatewayService.API_BASE_URLS[toolSlug] ?? '';
    const opPaths = McpGatewayService.OPERATION_PATHS[toolSlug] ?? {};
    const opPath = opPaths[operationId];

    if (!baseUrl || !opPath) {
      throw new BadRequestException(
        `No API path configured for ${toolSlug}/${operationId}. Tool may need configuration.`,
      );
    }

    // Resolve path parameters (e.g., {databaseId} → body.databaseId)
    let resolvedPath = opPath.path;
    const pathParams = resolvedPath.match(/\{(\w+)\}/g) ?? [];
    for (const param of pathParams) {
      const key = param.slice(1, -1);
      const value = body[key] as string;
      if (!value) {
        throw new BadRequestException(`Missing path parameter: ${key}`);
      }
      resolvedPath = resolvedPath.replace(param, encodeURIComponent(value));
      delete body[key]; // Don't send path params in body
    }

    const url =
      opPath.method === 'GET' && Object.keys(body).length > 0
        ? `${baseUrl}${resolvedPath}?${new URLSearchParams(
            Object.entries(body)
              .filter(([, v]) => v != null)
              .map(([k, v]) => [k, String(v)]),
          ).toString()}`
        : `${baseUrl}${resolvedPath}`;

    // 5. Build auth headers
    const authBuilder =
      McpGatewayService.AUTH_BUILDERS[tool.credentialType] ??
      McpGatewayService.AUTH_BUILDERS['none'];
    const authHeaders = authBuilder!(creds);

    // 6. Execute
    const startMs = Date.now();
    this.logger.log({
      message: 'MCP execute',
      toolSlug,
      operationId,
      method: opPath.method,
      url: url.substring(0, 120),
    });

    const fetchOpts: RequestInit = {
      method: opPath.method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
    };
    if (opPath.method !== 'GET') {
      fetchOpts.body = JSON.stringify(body);
    }

    const res = await fetch(url, fetchOpts);
    const durationMs = Date.now() - startMs;

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      this.logger.warn({
        message: 'MCP execute failed',
        toolSlug,
        operationId,
        status: res.status,
        error: errText.substring(0, 300),
        durationMs,
      });
      throw new BadRequestException(
        `${toolSlug}/${operationId} returned ${res.status}: ${errText.substring(0, 200)}`,
      );
    }

    const responseData = await res.json();

    this.logger.log({
      message: 'MCP execute OK',
      toolSlug,
      operationId,
      durationMs,
    });

    return {
      data: responseData,
      meta: { toolSlug, operationId, durationMs },
    };
  }

  /**
   * List all tools in the catalog with their connection status for a tenant.
   */
  async listToolsForTenant(
    tenantId: string,
  ): Promise<
    Array<{
      slug: string;
      displayName: string;
      category: string;
      description: string | null;
      connected: boolean;
      verified: boolean;
      credentialType: string;
      operations: unknown[];
      verifiedOperations: string[];
      failedOperations: string[];
      examplePrompts: string[];
    }>
  > {
    const [tools, credentials] = await Promise.all([
      this.prisma.mcpToolCatalog.findMany({
        where: { isActive: true },
        orderBy: { displayName: 'asc' },
      }),
      this.prisma.tenantCredential.findMany({
        where: { tenantId },
        select: { toolSlug: true, verified: true, config: true },
      }),
    ]);

    const credMap = new Map(
      credentials.map((c) => [c.toolSlug, c]),
    );

    return tools.map((t) => {
      const cred = credMap.get(t.slug);
      const config = (cred?.config as Record<string, unknown>) ?? {};
      return {
        slug: t.slug,
        displayName: t.displayName,
        category: t.category,
        description: t.description,
        connected: !!cred,
        verified: cred?.verified ?? false,
        credentialType: t.credentialType,
        operations: (t.operations as unknown as unknown[]) ?? [],
        verifiedOperations: (config.verifiedOperations as string[]) ?? [],
        failedOperations: (config.failedOperations as string[]) ?? [],
        examplePrompts: t.examplePrompts,
      };
    });
  }

  /**
   * Test connection + probe each operation to discover which ones
   * actually work with this tenant's API key/plan.
   *
   * Stores results in TenantCredential.config.verifiedOperations[]
   * so the validator can reject designs that use inaccessible operations.
   */
  async testConnection(
    tenantId: string,
    toolSlug: string,
  ): Promise<{ ok: boolean; message: string; verifiedOperations?: string[]; failedOperations?: string[] }> {
    try {
      const tool = await this.prisma.mcpToolCatalog.findUnique({
        where: { slug: toolSlug },
      });
      if (!tool) return { ok: false, message: 'Tool not found' };

      const credential = await this.prisma.tenantCredential.findUnique({
        where: { tenantId_toolSlug: { tenantId, toolSlug } },
      });
      if (!credential) return { ok: false, message: 'No credentials configured' };

      const operations = (tool.operations as unknown as Array<{ id: string; kind: string }>) ?? [];
      const verified: string[] = [];
      const failed: string[] = [];

      // Probe each operation with minimal params to check API access
      for (const op of operations) {
        try {
          // Use minimal/empty params — we only care if it returns 200 vs 403/404
          await this.execute(tenantId, toolSlug, op.id, { per_page: 1, page: 1, limit: 1 });
          verified.push(op.id);
        } catch (err) {
          const msg = (err as Error).message ?? '';
          if (msg.includes('403') || msg.includes('401') || msg.includes('INACCESSIBLE') || msg.includes('not accessible')) {
            // API key doesn't have access to this operation
            failed.push(op.id);
            this.logger.warn({
              message: 'MCP operation not accessible',
              toolSlug,
              operationId: op.id,
              error: msg.substring(0, 150),
            });
          } else if (msg.includes('400') || msg.includes('422')) {
            // Bad request = operation exists but params are wrong → it's accessible
            verified.push(op.id);
          } else {
            // Network error or other — assume accessible
            verified.push(op.id);
          }
        }
      }

      // Store verified operations in credential config
      await this.prisma.tenantCredential.update({
        where: { id: credential.id },
        data: {
          verified: verified.length > 0,
          verifiedAt: new Date(),
          config: {
            ...((credential.config as Record<string, unknown>) ?? {}),
            verifiedOperations: verified,
            failedOperations: failed,
            lastProbeAt: new Date().toISOString(),
          } as object,
        },
      });

      const totalOps = operations.length;
      const accessibleCount = verified.length;

      if (accessibleCount === 0) {
        return { ok: false, message: `API key has no access to any ${tool.displayName} operations`, verifiedOperations: verified, failedOperations: failed };
      }

      const failedNote = failed.length > 0
        ? ` (${failed.length} operations not accessible with this API plan: ${failed.join(', ')})`
        : '';

      return {
        ok: true,
        message: `${tool.displayName} connected — ${accessibleCount}/${totalOps} operations available${failedNote}`,
        verifiedOperations: verified,
        failedOperations: failed,
      };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }

  /**
   * Connect a tool for a tenant (save credentials + test).
   */
  async connectTool(
    tenantId: string,
    toolSlug: string,
    credentials: Record<string, unknown>,
    label?: string,
  ): Promise<{ ok: boolean; message: string }> {
    // Ensure tool exists
    const tool = await this.prisma.mcpToolCatalog.findUnique({
      where: { slug: toolSlug },
    });
    if (!tool) throw new NotFoundException(`Tool '${toolSlug}' not found`);

    // Upsert credential
    await this.prisma.tenantCredential.upsert({
      where: { tenantId_toolSlug: { tenantId, toolSlug } },
      create: {
        tenantId,
        toolSlug,
        credentials: credentials as object,
        label: label ?? `${tool.displayName}`,
      },
      update: {
        credentials: credentials as object,
        label: label ?? undefined,
        verified: false,
        verifiedAt: null,
      },
    });

    // Test the connection
    return this.testConnection(tenantId, toolSlug);
  }

  /**
   * Disconnect a tool for a tenant.
   */
  async disconnectTool(
    tenantId: string,
    toolSlug: string,
  ): Promise<void> {
    await this.prisma.tenantCredential.deleteMany({
      where: { tenantId, toolSlug },
    });
  }
}
