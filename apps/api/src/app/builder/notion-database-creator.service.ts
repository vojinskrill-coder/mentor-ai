import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { fetch as undiciFetch } from 'undici';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

interface NotionProperty {
  name: string;
  type: string;
  options?: string[];
  defaultOption?: string;
  numberFormat?: string;
  description?: string;
}

export interface NotionSchema {
  parentPageStrategy: 'root' | 'existing' | 'prompt_user';
  parentPageId?: string | null;
  databaseName: string;
  properties: NotionProperty[];
}

export interface CreatedNotionDatabase {
  id: string;
  url: string;
  title: string;
  parentPageId: string;
  createdAt: string;
}

/**
 * Creates a Notion database from the notionSchema in a builder design.
 * Reads the tenant's Notion apiToken from TenantCredential, then calls
 * POST https://api.notion.com/v1/databases with the properties mapped
 * to Notion's native property spec.
 */
@Injectable()
export class NotionDatabaseCreatorService {
  private readonly logger = new Logger(NotionDatabaseCreatorService.name);
  private readonly notionApiBase = 'https://api.notion.com/v1';
  private readonly notionVersion = '2022-06-28';

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Query a Notion database and return its rows as flat JS objects
   * matching the database's property schema. Used by the Processes
   * page Saved tab to show records that were previously approved
   * and persisted to Notion.
   */
  async queryDatabaseRecords(
    tenantId: string,
    databaseId: string,
    pageSize = 100,
  ): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const cred = await this.prisma.tenantCredential.findUnique({
      where: { tenantId_toolSlug: { tenantId, toolSlug: 'notion' } },
    });
    if (!cred) {
      throw new NotFoundException(
        'No Notion credential for this tenant. Connect Notion in Settings → Integrations first.',
      );
    }
    const apiToken = (cred.credentials as { apiToken?: string } | null)?.apiToken;
    if (!apiToken) {
      throw new BadRequestException('Notion credential missing apiToken');
    }

    const queryRes = await undiciFetch(
      `${this.notionApiBase}/databases/${databaseId}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Notion-Version': this.notionVersion,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          page_size: pageSize,
          sorts: [
            {
              timestamp: 'created_time',
              direction: 'descending',
            },
          ],
        }),
      },
    );

    if (!queryRes.ok) {
      const text = await queryRes.text();
      throw new BadRequestException(
        `Notion query failed (${queryRes.status}): ${text.substring(0, 300)}`,
      );
    }

    const data = (await queryRes.json()) as {
      results: Array<{
        id: string;
        url?: string;
        created_time: string;
        properties: Record<string, unknown>;
      }>;
    };

    const items = (data.results ?? []).map((page) => {
      const flat: Record<string, unknown> = {
        _notionPageId: page.id,
        _notionUrl: page.url,
        _createdAt: page.created_time,
      };
      for (const [propName, propValue] of Object.entries(page.properties)) {
        flat[propName] = this.flattenNotionProperty(propValue);
      }
      return flat;
    });

    return { items, total: items.length };
  }

  /**
   * Flatten a Notion property object into its plain JavaScript value.
   * Notion's API returns each property as { type: 'rich_text', rich_text: [{plain_text: '...'}] }
   * — this normalises that to just the readable string/number/etc.
   */
  private flattenNotionProperty(propValue: unknown): unknown {
    if (!propValue || typeof propValue !== 'object') return null;
    const p = propValue as { type?: string; [key: string]: unknown };
    const type = p.type;
    if (!type) return null;
    const inner = p[type];
    switch (type) {
      case 'title':
      case 'rich_text': {
        const arr = inner as Array<{ plain_text?: string }> | undefined;
        return arr?.map((t) => t.plain_text ?? '').join('') ?? '';
      }
      case 'number':
        return inner as number | null;
      case 'select':
        return (inner as { name?: string } | null)?.name ?? null;
      case 'multi_select': {
        const arr = inner as Array<{ name?: string }> | null;
        return arr?.map((s) => s.name ?? '').join(', ') ?? '';
      }
      case 'date': {
        const d = inner as { start?: string } | null;
        return d?.start ?? null;
      }
      case 'url':
      case 'email':
      case 'phone_number':
        return inner as string | null;
      case 'checkbox':
        return inner as boolean;
      case 'created_time':
      case 'last_edited_time':
        return inner as string;
      case 'people': {
        const arr = inner as Array<{ name?: string }> | null;
        return arr?.map((u) => u.name ?? '').join(', ') ?? '';
      }
      case 'files': {
        const arr = inner as Array<{ name?: string; external?: { url?: string } }> | null;
        return arr?.map((f) => f.external?.url ?? f.name ?? '').join(', ') ?? '';
      }
      default:
        return null;
    }
  }

  /**
   * Persist a list of items to the given Notion database. Each item
   * becomes one page, with properties inferred from the database's
   * existing schema (title + rich_text + url + number + select for
   * common field names).
   *
   * Returns the list of created page IDs.
   */
  async writeItemsToDatabase(
    tenantId: string,
    databaseId: string,
    items: Record<string, unknown>[],
  ): Promise<{ pageIds: string[]; skipped: number }> {
    if (!items || items.length === 0) {
      return { pageIds: [], skipped: 0 };
    }

    const cred = await this.prisma.tenantCredential.findUnique({
      where: { tenantId_toolSlug: { tenantId, toolSlug: 'notion' } },
    });
    if (!cred) {
      throw new NotFoundException(
        'No Notion credential for this tenant. Connect Notion in Settings → Integrations first.',
      );
    }
    const apiToken = (cred.credentials as { apiToken?: string } | null)?.apiToken;
    if (!apiToken) {
      throw new BadRequestException('Notion credential missing apiToken');
    }

    // Fetch the database schema so we know the property names + types
    const dbRes = await undiciFetch(
      `${this.notionApiBase}/databases/${databaseId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Notion-Version': this.notionVersion,
        },
      },
    );
    if (!dbRes.ok) {
      throw new BadRequestException(
        `Notion database ${databaseId} not accessible: ${await dbRes.text()}`,
      );
    }
    const db = (await dbRes.json()) as {
      properties: Record<string, { type: string }>;
    };
    const schema = db.properties;

    const pageIds: string[] = [];
    let skipped = 0;

    for (const item of items) {
      try {
        const properties = this.mapItemToProperties(item, schema);
        const createRes = await undiciFetch(
          `${this.notionApiBase}/pages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Notion-Version': this.notionVersion,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              parent: { database_id: databaseId },
              properties,
            }),
          },
        );
        if (!createRes.ok) {
          const errText = await createRes.text();
          this.logger.warn(
            `Failed to write item to Notion: ${createRes.status} ${errText.substring(0, 200)}`,
          );
          skipped++;
          continue;
        }
        const created = (await createRes.json()) as { id: string };
        pageIds.push(created.id);
      } catch (err) {
        this.logger.warn(
          `Item write failed: ${(err as Error).message}`,
        );
        skipped++;
      }
    }

    this.logger.log({
      message: 'Wrote items to Notion database',
      databaseId,
      written: pageIds.length,
      skipped,
    });

    return { pageIds, skipped };
  }

  /**
   * Synonym groups for fuzzy field matching. When a Notion property
   * has a name in one of these groups, ANY item key from the same
   * group is considered a match. This handles the common case where
   * the agent designed Notion columns ("Company", "Source URL") that
   * don't exactly match brain-call output keys ("siteName", "url").
   */
  private static readonly SYNONYMS: string[][] = [
    ['name', 'title', 'headline', 'topic', 'subject'],
    ['description', 'summary', 'snippet', 'content', 'body', 'excerpt', 'about'],
    ['url', 'link', 'sourceurl', 'source_url', 'source url', 'website', 'href', 'permalink'],
    ['company', 'organization', 'org', 'sitename', 'site_name', 'site name', 'publisher', 'source', 'sourcename', 'source name', 'employer'],
    ['email', 'emailaddress', 'email_address', 'mail'],
    ['phone', 'phonenumber', 'phone_number', 'tel', 'mobile'],
    ['location', 'city', 'region', 'country', 'place', 'address', 'where'],
    ['role', 'position', 'jobtitle', 'job_title', 'job title'],
    ['industry', 'sector', 'vertical', 'category', 'segment'],
    ['published', 'publishedat', 'published_at', 'publishdate', 'publish_date', 'publish date', 'date', 'createdat', 'created_at'],
    ['score', 'rating', 'fitscore', 'fit_score', 'fit score', 'rank'],
    ['notes', 'comment', 'reasoning', 'rationale', 'why', 'whyitworks', 'why_it_works', 'why it works'],
    ['type', 'kind', 'triggertype', 'trigger_type', 'trigger type', 'eventtype', 'event_type'],
    ['linkedin', 'linkedinurl', 'linkedin_url', 'linkedin url', 'profile'],
  ];

  /**
   * Find a value in the item for a given Notion property name. Tries:
   *   1. Exact (case-insensitive) match
   *   2. Match with whitespace stripped
   *   3. Match within a synonym group
   */
  private findItemValue(
    propName: string,
    item: Record<string, unknown>,
    itemLower: Map<string, string>,
  ): unknown {
    const propLower = propName.toLowerCase();
    const propStripped = propName.replace(/[\s_-]+/g, '').toLowerCase();

    // 1. Exact match
    let key = itemLower.get(propLower);
    if (key) return item[key];

    // 2. Stripped match
    key = itemLower.get(propStripped);
    if (key) return item[key];

    // 3. Synonym group lookup — find which group propName belongs to
    const propAliases = this.aliasesFor(propLower, propStripped);
    if (propAliases.length === 0) return undefined;
    for (const alias of propAliases) {
      key = itemLower.get(alias);
      if (key) return item[key];
      const stripped = alias.replace(/[\s_-]+/g, '');
      key = itemLower.get(stripped);
      if (key) return item[key];
    }

    return undefined;
  }

  private aliasesFor(propLower: string, propStripped: string): string[] {
    for (const group of NotionDatabaseCreatorService.SYNONYMS) {
      if (
        group.some((g) => {
          const gStripped = g.replace(/[\s_-]+/g, '');
          return g === propLower || gStripped === propStripped;
        })
      ) {
        return group;
      }
    }
    return [];
  }

  /**
   * Map an arbitrary item object to Notion property values based on
   * the database schema. Uses fuzzy/synonym matching so common name
   * variations (Company ↔ siteName, Source URL ↔ url) line up.
   * For the title property, falls back to name/title/topic/headline.
   */
  private mapItemToProperties(
    item: Record<string, unknown>,
    schema: Record<string, { type: string }>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    // Normalize: lowercase keys of the item for matching
    const itemKeys = Object.keys(item);
    const itemLower = new Map<string, string>();
    for (const k of itemKeys) {
      itemLower.set(k.toLowerCase(), k);
      // Also index stripped versions
      const stripped = k.replace(/[\s_-]+/g, '').toLowerCase();
      if (!itemLower.has(stripped)) itemLower.set(stripped, k);
    }

    // For each schema property, find a matching item key
    for (const [propName, propDef] of Object.entries(schema)) {
      const propType = propDef.type;
      const value = this.findItemValue(propName, item, itemLower);

      if (propType === 'title') {
        // Title is mandatory — use name/title/topic/headline fallback
        const titleText =
          (value as string) ??
          (item.name as string) ??
          (item.title as string) ??
          (item.topic as string) ??
          (item.headline as string) ??
          'Untitled';
        out[propName] = {
          title: [{ type: 'text', text: { content: String(titleText).slice(0, 2000) } }],
        };
        continue;
      }

      // ── Special: "All Details" / "Raw Data" / "Full Item" rich_text
      // columns get the entire item as a pretty JSON dump. This is
      // the safety net so NOTHING is ever lost — even fields the
      // schema doesn't anticipate are stored here.
      if (
        propType === 'rich_text' &&
        /^(all\s*details|raw\s*data|full\s*item|raw|details|all\s*fields|json)$/i.test(propName)
      ) {
        let dump: string;
        try {
          dump = JSON.stringify(item, null, 2);
        } catch {
          dump = String(item);
        }
        out[propName] = {
          rich_text: [
            { type: 'text', text: { content: dump.slice(0, 2000) } },
          ],
        };
        continue;
      }

      if (value === undefined || value === null) {
        // For select with defaultOption, fill the default
        if (propType === 'select') {
          // Default: 'Approved' for Status fields, otherwise skip
          const lower = propName.toLowerCase();
          if (lower === 'status' || lower.includes('status')) {
            out[propName] = { select: { name: 'Approved' } };
          }
        }
        continue;
      }

      switch (propType) {
        case 'rich_text':
          out[propName] = {
            rich_text: [
              {
                type: 'text',
                text: { content: String(value).slice(0, 2000) },
              },
            ],
          };
          break;
        case 'number':
          if (typeof value === 'number') {
            out[propName] = { number: value };
          } else if (!isNaN(Number(value))) {
            out[propName] = { number: Number(value) };
          }
          break;
        case 'url':
          out[propName] = { url: String(value).slice(0, 2000) };
          break;
        case 'email':
          out[propName] = { email: String(value) };
          break;
        case 'phone_number':
          out[propName] = { phone_number: String(value) };
          break;
        case 'checkbox':
          out[propName] = { checkbox: Boolean(value) };
          break;
        case 'select':
          out[propName] = { select: { name: String(value).slice(0, 100) } };
          break;
        case 'multi_select':
          if (Array.isArray(value)) {
            out[propName] = {
              multi_select: value.map((v) => ({ name: String(v).slice(0, 100) })),
            };
          } else {
            out[propName] = {
              multi_select: [{ name: String(value).slice(0, 100) }],
            };
          }
          break;
        case 'date':
          try {
            const d = new Date(String(value));
            if (!isNaN(d.getTime())) {
              out[propName] = { date: { start: d.toISOString() } };
            }
          } catch {
            /* skip invalid */
          }
          break;
        // created_time / last_edited_time are auto; skip
      }
    }

    // Log the diff: which item keys did NOT find a Notion column?
    // Useful for debugging schema design mismatches.
    const writtenLower = new Set(
      Object.keys(schema).map((k) => k.toLowerCase()),
    );
    const unmapped: string[] = [];
    for (const k of Object.keys(item)) {
      const matched = this.findItemValue(k, item, itemLower);
      // Check if any schema column matches this item key
      let found = false;
      for (const propName of Object.keys(schema)) {
        const v = this.findItemValue(propName, item, itemLower);
        if (v !== undefined && item[k] === v) {
          found = true;
          break;
        }
      }
      if (!found) unmapped.push(k);
    }
    if (unmapped.length > 0) {
      this.logger.debug({
        message: 'Unmapped item keys (saved in All Details if present)',
        unmapped,
      });
    }

    return out;
  }

  async createDatabase(
    tenantId: string,
    schema: NotionSchema,
  ): Promise<CreatedNotionDatabase> {
    if (!schema || !schema.databaseName) {
      throw new BadRequestException('notionSchema.databaseName is required');
    }
    if (!Array.isArray(schema.properties) || schema.properties.length === 0) {
      throw new BadRequestException('notionSchema.properties must be non-empty');
    }

    const hasTitle = schema.properties.some((p) => p.type === 'title');
    if (!hasTitle) {
      throw new BadRequestException(
        'notionSchema must include exactly one property with type="title"',
      );
    }

    // Always append an "All Details" rich_text column so the full
    // item JSON is preserved on every approve, regardless of whether
    // the agent's designed columns match the brain output keys. This
    // is the safety net — no field is ever lost.
    const hasAllDetails = schema.properties.some(
      (p) =>
        /^(all\s*details|raw\s*data|full\s*item|raw|details|all\s*fields|json)$/i.test(
          p.name,
        ),
    );
    if (!hasAllDetails) {
      schema = {
        ...schema,
        properties: [
          ...schema.properties,
          { name: 'All Details', type: 'rich_text' },
        ],
      };
    }

    // Load tenant credential
    const cred = await this.prisma.tenantCredential.findUnique({
      where: { tenantId_toolSlug: { tenantId, toolSlug: 'notion' } },
    });
    if (!cred) {
      throw new NotFoundException(
        'No Notion credential for this tenant. Connect Notion in Settings → Integrations first.',
      );
    }
    const apiToken = (cred.credentials as { apiToken?: string } | null)?.apiToken;
    if (!apiToken) {
      throw new BadRequestException(
        'Notion credential is missing "apiToken". Re-connect Notion in Settings.',
      );
    }

    // Resolve parent page
    const parentPageId = await this.resolveParentPage(apiToken, schema, cred.config as any);

    // Build Notion properties spec
    const notionProperties = this.mapProperties(schema.properties);

    const body = {
      parent: { type: 'page_id', page_id: parentPageId },
      title: [
        {
          type: 'text',
          text: { content: schema.databaseName },
        },
      ],
      properties: notionProperties,
    };

    this.logger.log({
      message: 'Creating Notion database',
      tenantId,
      databaseName: schema.databaseName,
      propertyCount: schema.properties.length,
    });

    const res = await undiciFetch(`${this.notionApiBase}/databases`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Notion-Version': this.notionVersion,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Notion API error ${res.status}: ${text}`);
      throw new BadRequestException(
        `Notion database creation failed (${res.status}): ${text}`,
      );
    }

    const data = (await res.json()) as {
      id: string;
      url: string;
      created_time: string;
      title: Array<{ plain_text?: string }>;
    };

    this.logger.log({
      message: 'Notion database created',
      databaseId: data.id,
      url: data.url,
    });

    return {
      id: data.id,
      url: data.url,
      title: data.title?.[0]?.plain_text ?? schema.databaseName,
      parentPageId,
      createdAt: data.created_time,
    };
  }

  // ─── Parent page resolution ──────────────────────────────────

  private async resolveParentPage(
    apiToken: string,
    schema: NotionSchema,
    config: { parentPageId?: string } | null,
  ): Promise<string> {
    // 1. Explicit parentPageId in schema takes precedence
    if (schema.parentPageStrategy === 'existing' && schema.parentPageId) {
      return schema.parentPageId;
    }
    // 2. Tenant-level default parent from credential config
    if (config?.parentPageId) {
      return config.parentPageId;
    }
    // 3. Search for any top-level page the integration has access to
    const res = await undiciFetch(`${this.notionApiBase}/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Notion-Version': this.notionVersion,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: { value: 'page', property: 'object' },
        page_size: 1,
      }),
    });
    if (!res.ok) {
      throw new BadRequestException(
        `Notion search failed (${res.status}): could not find a parent page. ` +
          'Either invite the integration to a page, or set parentPageId in the TenantCredential.config.',
      );
    }
    const data = (await res.json()) as { results: Array<{ id: string }> };
    const first = data.results?.[0];
    if (!first) {
      throw new BadRequestException(
        'No Notion pages visible to the integration. Invite the integration to a parent page first.',
      );
    }
    return first.id;
  }

  // ─── Property mapping ─────────────────────────────────────────

  private mapProperties(
    properties: NotionProperty[],
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const p of properties) {
      out[p.name] = this.mapProperty(p);
    }
    return out;
  }

  private mapProperty(p: NotionProperty): Record<string, unknown> {
    switch (p.type) {
      case 'title':
        return { title: {} };
      case 'rich_text':
        return { rich_text: {} };
      case 'number':
        return { number: { format: p.numberFormat || 'number' } };
      case 'select':
        return {
          select: {
            options: (p.options || []).map((name) => ({ name })),
          },
        };
      case 'multi_select':
        return {
          multi_select: {
            options: (p.options || []).map((name) => ({ name })),
          },
        };
      case 'date':
        return { date: {} };
      case 'people':
        return { people: {} };
      case 'files':
        return { files: {} };
      case 'checkbox':
        return { checkbox: {} };
      case 'url':
        return { url: {} };
      case 'email':
        return { email: {} };
      case 'phone_number':
        return { phone_number: {} };
      case 'created_time':
        return { created_time: {} };
      case 'last_edited_time':
        return { last_edited_time: {} };
      default:
        throw new BadRequestException(
          `Unsupported Notion property type: ${p.type}`,
        );
    }
  }
}
