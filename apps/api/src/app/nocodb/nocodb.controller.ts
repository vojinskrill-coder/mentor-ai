import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createId } from '@paralleldrive/cuid2';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { NocoDbService } from './nocodb.service';
import { ApolloLeadService } from '../apollo/apollo-lead.service';
import { fetch as undiciFetch } from 'undici';

/**
 * Default field mapping for leads: our field → NocoDB Title field.
 * Used when no ProcessToolAdapter / TenantToolBinding is configured.
 */
const DEFAULT_LEAD_FIELD_MAPPING: Record<string, string> = {
  name: 'Contact Name',
  company: 'Company Name',
  role: 'Role',
  email: 'Email',
  emailSource: 'Email Source',
  linkedin: 'LinkedIn',
  phone: 'Phone',
  website: 'Website',
  location: 'Location',
  industry: 'Industry',
  companyDescription: 'Company Description',
  whyGoodFit: 'Why Good Fit',
  score: 'Score',
  reasoning: 'Reasoning',
  scoringRationale: 'Scoring Rationale',
  scoreBreakdown: 'Score Breakdown',
  recentProjects: 'Recent Projects',
  'outreach.email': 'Outreach Email',
  'outreach.linkedin': 'Outreach LinkedIn',
  'message': 'Outreach Message',
};

/**
 * Generic MCP (Model Context Protocol) controller for leads.
 * Routes to the ACTIVE MCP tool for the tenant based on TenantToolBinding.
 * Currently supports: nocodb. Future: hubspot, salesforce, etc.
 */
@Controller('v1/mcp')
@UseGuards(JwtAuthGuard)
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly nocoDb: NocoDbService,
    private readonly apollo: ApolloLeadService,
    private readonly prisma: PlatformPrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /api/v1/mcp/leads
   * Reads leads from the ACTIVE MCP tool for this tenant.
   * Checks TenantToolBinding to determine which tool to use.
   * Falls back to local ApprovedLead table if no tool is active or on error.
   */
  @Get('leads')
  async listLeads(@CurrentUser() user: CurrentUserPayload) {
    const binding = await this.findActiveLeadBinding(user.tenantId);
    const activeTool = binding?.adapter?.toolSlug ?? null;

    this.logger.debug(`MCP listLeads: tenant=${user.tenantId}, activeTool=${activeTool ?? 'local-db'}`);

    // Reading saved leads always comes from the local ApprovedLead
    // table. This is the ground-truth store that's populated on every
    // approve (regardless of which external tool — Apollo or NocoDB —
    // is active). Apollo is used for DISCOVERY + ENRICHMENT + SAVING
    // new contacts, but reading approved leads back is always local.
    return this.listLeadsFromLocalDb(user.tenantId);
  }

  /**
   * POST /api/v1/mcp/leads/approve
   * Writes approved leads to the ACTIVE MCP tool + local DB backup.
   */
  @Post('leads/approve')
  async approveLeads(
    @Body() body: { leads: any[]; processRunId: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { leads, processRunId } = body;

    if (!leads?.length) {
      throw new BadRequestException({
        type: 'no_leads',
        title: 'No Leads Provided',
        status: 400,
        detail: 'At least one lead is required',
      });
    }

    const binding = await this.findActiveLeadBinding(user.tenantId);
    const activeTool = binding?.adapter?.toolSlug ?? null;

    this.logger.debug(`MCP approveLeads: tenant=${user.tenantId}, activeTool=${activeTool ?? 'local-db'}, count=${leads.length}`);

    // 1. Write to active MCP tool
    let mcpToolSuccess = false;
    let mcpToolName = activeTool ?? 'none';

    // Apollo is the primary lead tool for writes too.
    if (this.config.get<string>('APOLLO_API_KEY')) {
      const result = await this.apollo.saveContacts(leads);
      mcpToolSuccess = result.saved > 0;
      mcpToolName = 'apollo';
    } else if (activeTool === 'nocodb') {
      mcpToolSuccess = await this.writeLeadsToNocoDB(leads, user.tenantId, binding);
    }

    // 2. Write to local ApprovedLead table as backup (always)
    const created = await Promise.all(
      leads.map((lead) =>
        this.prisma.approvedLead.create({
          data: {
            id: `al_${createId()}`,
            tenantId: user.tenantId,
            runId: processRunId,
            name: lead.name ?? '',
            company: lead.company ?? '',
            role: lead.role,
            email: lead.email,
            emailSource: lead.emailSource,
            linkedin: lead.linkedin,
            phone: lead.phone,
            website: lead.website,
            location: lead.location,
            companyDescription: lead.companyDescription,
            whyGoodFit: lead.whyGoodFit,
            score: lead.score != null ? Number(lead.score) : null,
            scoreBreakdown: lead.scoreBreakdown ?? undefined,
            reasoning: lead.reasoning,
            message: lead.message ?? undefined,
            recentProjects: lead.recentProjects ?? [],
          },
        }),
      ),
    );

    return {
      data: {
        mcpTool: mcpToolName,
        mcpToolSuccess,
        localCount: created.length,
        total: leads.length,
      },
    };
  }

  // ─── NocoDB Implementation ───────────────────────────────────────────

  private async listLeadsFromNocoDB(tenantId: string, binding: any) {
    const tableId = this.resolveTableId(binding);
    const fieldMapping = this.resolveFieldMapping(binding);

    try {
      const records = await this.nocoDb.listRecords(tableId, { limit: 200 });

      const leads = records.map((record: Record<string, any>) => {
        const mapped = this.nocoDb.mapFromNocoDB(record, fieldMapping);
        mapped['id'] = mapped['nocoDbId'] ?? record['Id'] ?? createId();
        return mapped;
      });

      return { data: leads };
    } catch (err: any) {
      this.logger.error(`Failed to read leads from NocoDB: ${err.message}`);
      this.logger.warn('Falling back to local ApprovedLead table');
      return this.listLeadsFromLocalDb(tenantId);
    }
  }

  // ─── Apollo Implementation ────────────────────────────────────────────

  private async listLeadsFromApollo(tenantId: string) {
    try {
      const leads = await this.apollo.listSavedContacts({ limit: 200 });
      return { data: leads };
    } catch (err: any) {
      this.logger.error(`Failed to read leads from Apollo: ${err.message}`);
      this.logger.warn('Falling back to local ApprovedLead table');
      return this.listLeadsFromLocalDb(tenantId);
    }
  }

  private async writeLeadsToNocoDB(leads: any[], tenantId: string, binding: any): Promise<boolean> {
    const tableId = this.resolveTableId(binding);
    const fieldMapping = this.resolveFieldMapping(binding);

    try {
      const nocoRecords = leads.map((lead) =>
        this.nocoDb.mapToNocoDB(lead, fieldMapping),
      );
      await this.nocoDb.createRecords(tableId, nocoRecords);
      this.logger.log(`Wrote ${leads.length} leads to NocoDB table ${tableId}`);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to write leads to NocoDB: ${err.message}`);
      return false;
    }
  }

  // ─── Content Endpoints ──────────────────────────────────────────────

  /**
   * GET /api/v1/mcp/content
   * Reads approved content from the ACTIVE MCP tool for this tenant.
   */
  @Get('content')
  async listContent(@CurrentUser() user: CurrentUserPayload) {
    const binding = await this.findActiveContentBinding(user.tenantId);
    const activeTool = binding?.adapter?.toolSlug ?? null;

    if (activeTool === 'notion') {
      return this.listContentFromNotion(user.tenantId, binding);
    }

    // Fallback to local DB
    return this.listContentFromLocalDb(user.tenantId);
  }

  /**
   * POST /api/v1/mcp/content/approve
   * Writes approved content to the ACTIVE MCP tool + local DB backup.
   */
  @Post('content/approve')
  async approveContent(
    @Body() body: { posts: any[]; processRunId: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { posts, processRunId } = body;

    if (!posts?.length) {
      throw new BadRequestException({ type: 'no_posts', status: 400, detail: 'At least one post is required' });
    }

    const binding = await this.findActiveContentBinding(user.tenantId);
    const activeTool = binding?.adapter?.toolSlug ?? null;

    let mcpToolSuccess = false;
    if (activeTool === 'notion') {
      mcpToolSuccess = await this.writeContentToNotion(posts, user.tenantId, binding);
    }

    // Local backup — always
    const created = await Promise.all(
      posts.map((p) =>
        this.prisma.approvedContent.create({
          data: {
            id: `acont_${createId()}`,
            tenantId: user.tenantId,
            runId: processRunId,
            topic: p.topic ?? p.title ?? '',
            caption: p.caption ?? p.body ?? '',
            hookLine: p.hookLine ?? null,
            hashtags: Array.isArray(p.hashtags) ? p.hashtags : [],
            imageType: p.imageType ?? null,
            imageUrl: p.imageUrl ?? null,
            imagePrompt: p.imagePrompt ?? null,
            imageReference: p.imageReference ?? null,
            callToAction: p.callToAction ?? null,
            score: typeof p.score === 'number' ? p.score : null,
            reasoning: p.reasoning ?? null,
            whyItWorks: p.whyItWorks ?? null,
          },
        }),
      ),
    );

    return {
      data: {
        mcpTool: activeTool ?? 'none',
        mcpToolSuccess,
        localCount: created.length,
        total: posts.length,
      },
    };
  }

  // ─── Notion Implementation ─────────────────────────────────────────

  private async listContentFromNotion(tenantId: string, binding: any) {
    const creds = binding.toolCredentials as Record<string, string>;
    const fieldMapping = this.resolveFieldMapping(binding);

    try {
      const res = await undiciFetch(
        `https://api.notion.com/v1/databases/${creds.contentDatabaseId}/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.apiToken}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sorts: [{ timestamp: 'created_time', direction: 'descending' }],
            page_size: 50,
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error(`Notion query failed: ${res.status} ${body.slice(0, 200)}`);
        return this.listContentFromLocalDb(tenantId);
      }

      const data = (await res.json()) as any;
      const content = (data.results ?? []).map((page: any) => this.notionPageToContent(page, fieldMapping));
      return { data: content };
    } catch (err: any) {
      this.logger.error(`Failed to read content from Notion: ${err.message}`);
      return this.listContentFromLocalDb(tenantId);
    }
  }

  private async writeContentToNotion(posts: any[], tenantId: string, binding: any): Promise<boolean> {
    const creds = binding.toolCredentials as Record<string, string>;
    const fieldMapping = this.resolveFieldMapping(binding);

    try {
      for (const post of posts) {
        const properties = this.contentToNotionProperties(post, fieldMapping);
        await undiciFetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.apiToken}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            parent: { database_id: creds.contentDatabaseId },
            properties,
          }),
          signal: AbortSignal.timeout(15_000),
        });
      }
      this.logger.log(`Wrote ${posts.length} content items to Notion`);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to write content to Notion: ${err.message}`);
      return false;
    }
  }

  /**
   * Convert a post object to Notion page properties using field mapping.
   */
  private contentToNotionProperties(post: any, fieldMapping: Record<string, string>): Record<string, any> {
    const props: Record<string, any> = {};

    for (const [ourField, notionField] of Object.entries(fieldMapping)) {
      const value = post[ourField];
      if (value === undefined || value === null) continue;

      // First property in mapping = title, rest = rich_text (Notion convention)
      if (ourField === 'topic') {
        props[notionField] = { title: [{ text: { content: String(value).slice(0, 2000) } }] };
      } else if (ourField === 'score') {
        props[notionField] = { number: typeof value === 'number' ? value : parseInt(value, 10) || 0 };
      } else if (ourField === 'imageUrl' && typeof value === 'string' && value.startsWith('http')) {
        props[notionField] = { url: value };
      } else if (ourField === 'status' || ourField === 'contentType' || ourField === 'imageType') {
        props[notionField] = { select: { name: String(value) } };
      } else if (ourField === 'hashtags' && Array.isArray(value)) {
        props[notionField] = { rich_text: [{ text: { content: value.join(', ').slice(0, 2000) } }] };
      } else {
        const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
        props[notionField] = { rich_text: [{ text: { content: text.slice(0, 2000) } }] };
      }
    }

    // Always set Status to Approved if not provided
    if (!props['Status']) {
      props['Status'] = { select: { name: 'Approved' } };
    }

    return props;
  }

  /**
   * Convert a Notion page to our internal content format.
   */
  private notionPageToContent(page: any, fieldMapping: Record<string, string>): Record<string, any> {
    const content: Record<string, any> = { id: page.id };
    const reverseMapping = Object.fromEntries(
      Object.entries(fieldMapping).map(([k, v]) => [v, k]),
    );

    for (const [propName, propValue] of Object.entries(page.properties ?? {})) {
      const ourField = reverseMapping[propName];
      if (!ourField) continue;

      const prop = propValue as any;
      if (prop.title?.length) {
        content[ourField] = prop.title.map((t: any) => t.plain_text).join('');
      } else if (prop.rich_text?.length) {
        content[ourField] = prop.rich_text.map((t: any) => t.plain_text).join('');
      } else if (prop.number !== undefined && prop.number !== null) {
        content[ourField] = prop.number;
      } else if (prop.url) {
        content[ourField] = prop.url;
      } else if (prop.select?.name) {
        content[ourField] = prop.select.name;
      }
    }

    return content;
  }

  // ─── Local DB Fallback ───────────────────────────────────────────────

  private async listLeadsFromLocalDb(tenantId: string) {
    const leads = await this.prisma.approvedLead.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: leads };
  }

  private async listContentFromLocalDb(tenantId: string) {
    const content = await this.prisma.approvedContent.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: content };
  }

  // ─── Binding Resolution ──────────────────────────────────────────────

  /**
   * Find the active TenantToolBinding for lead-discovery (any tool slug).
   */
  private async findActiveLeadBinding(tenantId: string) {
    return this.prisma.tenantToolBinding.findFirst({
      where: {
        tenantId,
        enabled: true,
        adapter: {
          processSlug: 'lead-discovery',
          isActive: true,
        },
      },
      include: { adapter: true },
    });
  }

  /**
   * Find the active TenantToolBinding for content (instagram-content).
   */
  private async findActiveContentBinding(tenantId: string) {
    return this.prisma.tenantToolBinding.findFirst({
      where: {
        tenantId,
        enabled: true,
        adapter: {
          processSlug: 'instagram-content',
          isActive: true,
        },
      },
      include: { adapter: true },
    });
  }

  private resolveTableId(binding: any): string {
    if (binding?.toolCredentials) {
      const creds = binding.toolCredentials as Record<string, string>;
      if (creds.tableId) return creds.tableId;
    }
    return this.config.get<string>('NOCODB_LEADS_TABLE_ID', 'mj4gtkwg19pejul');
  }

  private resolveFieldMapping(binding: any): Record<string, string> {
    if (binding?.customFieldMapping) {
      return binding.customFieldMapping as Record<string, string>;
    }
    if (binding?.adapter?.fieldMapping) {
      return binding.adapter.fieldMapping as Record<string, string>;
    }
    return DEFAULT_LEAD_FIELD_MAPPING;
  }
}
