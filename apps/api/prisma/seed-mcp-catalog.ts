/**
 * Seed the McpToolCatalog with 5 starter tools for the Neuron Process
 * Builder v1.
 *
 * Run:
 *   cd apps/api && npx ts-node prisma/seed-mcp-catalog.ts
 *
 * This script is idempotent — it upserts by slug so it's safe to run
 * multiple times (e.g. to update operation lists as we extend a tool).
 *
 * ─────────────────────────────────────────────────────────────────────
 * Selection rationale for v1:
 *
 *   1. notion                — DEFAULT STORAGE for any process output.
 *                              Every confirmed process gets its own
 *                              Notion "space" (database/page), same
 *                              pattern as the existing ApprovedContent
 *                              flow. Generic, hand-off free.
 *   2. gmail                 — Most common comms tool; outbound email
 *                              for lead processes.
 *   3. google-sheets         — Spreadsheet fallback for any process
 *                              that needs tabular export.
 *   4. http-generic          — Catch-all for any REST API the user
 *                              wants to integrate that isn't yet in
 *                              the catalog. No credentials by default.
 *   5. linkedin-sales-nav    — Lead discovery, sales-focused processes.
 *
 * More tools can be added via additional rows without any code change.
 * ─────────────────────────────────────────────────────────────────────
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ToolSeed = {
  slug: string;
  displayName: string;
  category: string;
  description: string;
  capabilities: {
    read: boolean;
    write: boolean;
    search: boolean;
    subscribe: boolean;
  };
  operations: Array<{
    id: string;
    kind: 'read' | 'write' | 'search' | 'subscribe';
    displayName: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    n8nNodeType: string;
    n8nOperation: string;
  }>;
  credentialType: 'oauth2' | 'apiKey' | 'basic' | 'none';
  n8nNodeType: string | null;
  n8nNodeDefaults: Record<string, unknown> | null;
  docsUrl: string | null;
  examplePrompts: string[];
};

const TOOLS: ToolSeed[] = [
  // 1. NOTION — default storage for every process output
  {
    slug: 'notion',
    displayName: 'Notion',
    category: 'db',
    description:
      'Notion workspace for storing process results. Each published process gets its own Notion database/page where approved outputs are written. Primary storage tool — use when the user says "save", "store", "archive", "record" without specifying another tool.',
    capabilities: { read: true, write: true, search: true, subscribe: false },
    operations: [
      {
        id: 'create_page',
        kind: 'write',
        displayName: 'Create a page in a database',
        inputSchema: {
          type: 'object',
          required: ['databaseId', 'properties'],
          properties: {
            databaseId: { type: 'string' },
            properties: { type: 'object' },
            children: { type: 'array', items: { type: 'object' } },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['id', 'url'],
          properties: { id: { type: 'string' }, url: { type: 'string' } },
        },
        n8nNodeType: 'n8n-nodes-base.notion',
        n8nOperation: 'databasePage:create',
      },
      {
        id: 'query_database',
        kind: 'read',
        displayName: 'Query a database with filters',
        inputSchema: {
          type: 'object',
          required: ['databaseId'],
          properties: {
            databaseId: { type: 'string' },
            filter: { type: 'object' },
            sorts: { type: 'array' },
            pageSize: { type: 'number' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: { results: { type: 'array', items: { type: 'object' } } },
        },
        n8nNodeType: 'n8n-nodes-base.notion',
        n8nOperation: 'databasePage:getAll',
      },
      {
        id: 'update_page',
        kind: 'write',
        displayName: 'Update an existing page',
        inputSchema: {
          type: 'object',
          required: ['pageId', 'properties'],
          properties: {
            pageId: { type: 'string' },
            properties: { type: 'object' },
          },
        },
        outputSchema: { type: 'object', properties: { id: { type: 'string' } } },
        n8nNodeType: 'n8n-nodes-base.notion',
        n8nOperation: 'databasePage:update',
      },
      {
        id: 'search',
        kind: 'search',
        displayName: 'Full-text search across workspace',
        inputSchema: {
          type: 'object',
          required: ['query'],
          properties: { query: { type: 'string' }, filter: { type: 'object' } },
        },
        outputSchema: { type: 'object', properties: { results: { type: 'array' } } },
        n8nNodeType: 'n8n-nodes-base.notion',
        n8nOperation: 'search',
      },
    ],
    credentialType: 'apiKey',
    n8nNodeType: 'n8n-nodes-base.notion',
    n8nNodeDefaults: {
      authentication: 'apiKey',
      notionVersion: '2022-06-28',
    },
    docsUrl: 'https://developers.notion.com/reference/intro',
    examplePrompts: [
      'store the approved leads in notion',
      'save the content calendar to notion',
      'archive the weekly report to notion',
      "pull last week's ICP notes from notion",
    ],
  },

  // 2. GMAIL — outbound comms for lead/sales processes
  {
    slug: 'gmail',
    displayName: 'Gmail',
    category: 'comms',
    description:
      'Send, draft, or read emails via Gmail. Use for outbound outreach, approval notifications, and email-based lead workflows. Requires OAuth2 connection per tenant.',
    capabilities: { read: true, write: true, search: true, subscribe: false },
    operations: [
      {
        id: 'send_message',
        kind: 'write',
        displayName: 'Send an email',
        inputSchema: {
          type: 'object',
          required: ['to', 'subject', 'body'],
          properties: {
            to: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
            cc: { type: 'string' },
            bcc: { type: 'string' },
            attachments: { type: 'array' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: { messageId: { type: 'string' }, threadId: { type: 'string' } },
        },
        n8nNodeType: 'n8n-nodes-base.gmail',
        n8nOperation: 'message:send',
      },
      {
        id: 'create_draft',
        kind: 'write',
        displayName: 'Create a draft (unsent)',
        inputSchema: {
          type: 'object',
          required: ['to', 'subject', 'body'],
          properties: {
            to: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
          },
        },
        outputSchema: { type: 'object', properties: { draftId: { type: 'string' } } },
        n8nNodeType: 'n8n-nodes-base.gmail',
        n8nOperation: 'draft:create',
      },
      {
        id: 'search_messages',
        kind: 'search',
        displayName: 'Search inbox with Gmail query syntax',
        inputSchema: {
          type: 'object',
          required: ['query'],
          properties: { query: { type: 'string' }, limit: { type: 'number' } },
        },
        outputSchema: { type: 'object', properties: { messages: { type: 'array' } } },
        n8nNodeType: 'n8n-nodes-base.gmail',
        n8nOperation: 'message:getAll',
      },
    ],
    credentialType: 'oauth2',
    n8nNodeType: 'n8n-nodes-base.gmail',
    n8nNodeDefaults: { authentication: 'oAuth2' },
    docsUrl: 'https://developers.google.com/gmail/api',
    examplePrompts: [
      'send personalized outreach emails',
      'draft follow-ups for each approved lead',
      "check for replies to last week's campaign",
    ],
  },

  // 3. GOOGLE SHEETS — tabular export / spreadsheet fallback
  {
    slug: 'google-sheets',
    displayName: 'Google Sheets',
    category: 'db',
    description:
      'Read from, write to, or create Google Sheets. Use for any process that needs tabular export, CSV-like sharing, or a spreadsheet view the client can edit. Requires OAuth2.',
    capabilities: { read: true, write: true, search: false, subscribe: false },
    operations: [
      {
        id: 'append_row',
        kind: 'write',
        displayName: 'Append a row to a sheet',
        inputSchema: {
          type: 'object',
          required: ['spreadsheetId', 'range', 'values'],
          properties: {
            spreadsheetId: { type: 'string' },
            range: { type: 'string' },
            values: { type: 'array' },
          },
        },
        outputSchema: { type: 'object', properties: { updatedRange: { type: 'string' } } },
        n8nNodeType: 'n8n-nodes-base.googleSheets',
        n8nOperation: 'sheet:append',
      },
      {
        id: 'read_range',
        kind: 'read',
        displayName: 'Read a range from a sheet',
        inputSchema: {
          type: 'object',
          required: ['spreadsheetId', 'range'],
          properties: {
            spreadsheetId: { type: 'string' },
            range: { type: 'string' },
          },
        },
        outputSchema: { type: 'object', properties: { values: { type: 'array' } } },
        n8nNodeType: 'n8n-nodes-base.googleSheets',
        n8nOperation: 'sheet:read',
      },
    ],
    credentialType: 'oauth2',
    n8nNodeType: 'n8n-nodes-base.googleSheets',
    n8nNodeDefaults: { authentication: 'oAuth2' },
    docsUrl: 'https://developers.google.com/sheets/api',
    examplePrompts: ['export leads to a google sheet', 'update the client tracker spreadsheet'],
  },

  // 4. HTTP GENERIC — catch-all for any REST API
  {
    slug: 'http-generic',
    displayName: 'HTTP Request',
    category: 'http',
    description:
      "Generic REST API caller. Use when the user wants to integrate a service that isn't in the catalog yet, or for webhooks, or one-off integrations. Credentials are optional and managed per-process.",
    capabilities: { read: true, write: true, search: false, subscribe: false },
    operations: [
      {
        id: 'request',
        kind: 'write',
        displayName: 'HTTP request (any method)',
        inputSchema: {
          type: 'object',
          required: ['url', 'method'],
          properties: {
            url: { type: 'string' },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
            headers: { type: 'object' },
            body: { type: 'object' },
            query: { type: 'object' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            status: { type: 'number' },
            headers: { type: 'object' },
            body: {},
          },
        },
        n8nNodeType: 'n8n-nodes-base.httpRequest',
        n8nOperation: 'request',
      },
    ],
    credentialType: 'none',
    n8nNodeType: 'n8n-nodes-base.httpRequest',
    n8nNodeDefaults: {
      options: {
        response: { response: { fullResponse: false } },
        retryOnFail: true,
        maxTries: 3,
      },
    },
    docsUrl: 'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/',
    examplePrompts: ['call a webhook', 'hit a custom api endpoint', 'trigger an external service'],
  },

  // 5. APOLLO.IO — lead discovery + contact enrichment + CRM
  {
    slug: 'apollo',
    displayName: 'Apollo.io',
    category: 'crm',
    description:
      'Apollo.io has 200M+ verified contacts and 60M+ companies with full firmographic data: revenue, employees, phones, emails, LinkedIn URLs, technologies, decision makers. Use for lead discovery, contact enrichment, company research, and saving approved leads. Primary tool for any people/company research process.',
    capabilities: { read: true, write: true, search: true, subscribe: false },
    operations: [
      {
        id: 'search_people',
        kind: 'search' as const,
        displayName: 'Search for people by title, company, location',
        inputSchema: {
          type: 'object',
          properties: {
            person_titles: {
              type: 'array',
              items: { type: 'string' },
              description: 'Job titles to search for',
            },
            q_organization_keyword_tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Company keywords',
            },
            organization_locations: {
              type: 'array',
              items: { type: 'string' },
              description: 'Countries/regions',
            },
            organization_num_employees_ranges: {
              type: 'array',
              items: { type: 'string' },
              description: 'Employee ranges like "11,50"',
            },
            per_page: { type: 'number', default: 25 },
            page: { type: 'number', default: 1 },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            people: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  first_name: { type: 'string' },
                  last_name: { type: 'string' },
                  title: { type: 'string' },
                  email: { type: 'string' },
                  linkedin_url: { type: 'string' },
                  organization_name: { type: 'string' },
                  city: { type: 'string' },
                  country: { type: 'string' },
                },
              },
            },
          },
        },
        n8nNodeType: 'n8n-nodes-base.httpRequest',
        n8nOperation: 'request',
      },
      {
        id: 'search_organizations',
        kind: 'search' as const,
        displayName: 'Search for companies by keywords, location, size',
        inputSchema: {
          type: 'object',
          properties: {
            q_organization_keyword_tags: { type: 'array', items: { type: 'string' } },
            organization_locations: { type: 'array', items: { type: 'string' } },
            organization_num_employees_ranges: { type: 'array', items: { type: 'string' } },
            per_page: { type: 'number', default: 25 },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            organizations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  website_url: { type: 'string' },
                  industry: { type: 'string' },
                  estimated_num_employees: { type: 'number' },
                  organization_revenue: { type: 'number' },
                  city: { type: 'string' },
                  country: { type: 'string' },
                  linkedin_url: { type: 'string' },
                },
              },
            },
          },
        },
        n8nNodeType: 'n8n-nodes-base.httpRequest',
        n8nOperation: 'request',
      },
      {
        id: 'enrich_person',
        kind: 'read' as const,
        displayName: 'Enrich a person (get verified email, phone, LinkedIn)',
        inputSchema: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            organization_domain: { type: 'string' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            person: {
              type: 'object',
              properties: {
                email: { type: 'string' },
                email_status: { type: 'string' },
                phone_numbers: { type: 'array' },
                linkedin_url: { type: 'string' },
                title: { type: 'string' },
                seniority: { type: 'string' },
              },
            },
          },
        },
        n8nNodeType: 'n8n-nodes-base.httpRequest',
        n8nOperation: 'request',
      },
      {
        id: 'enrich_organization',
        kind: 'read' as const,
        displayName: 'Enrich a company (revenue, employees, tech stack)',
        inputSchema: {
          type: 'object',
          required: ['domain'],
          properties: { domain: { type: 'string' } },
        },
        outputSchema: {
          type: 'object',
          properties: {
            organization: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                estimated_num_employees: { type: 'number' },
                organization_revenue: { type: 'number' },
                industry: { type: 'string' },
                keywords: { type: 'array' },
                technologies: { type: 'array' },
              },
            },
          },
        },
        n8nNodeType: 'n8n-nodes-base.httpRequest',
        n8nOperation: 'request',
      },
      {
        id: 'save_contact',
        kind: 'write' as const,
        displayName: 'Save a lead as a contact in your Apollo account',
        inputSchema: {
          type: 'object',
          required: ['first_name', 'last_name'],
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            email: { type: 'string' },
            title: { type: 'string' },
            organization_name: { type: 'string' },
            linkedin_url: { type: 'string' },
            label_names: { type: 'array', items: { type: 'string' } },
          },
        },
        outputSchema: { type: 'object', properties: { id: { type: 'string' } } },
        n8nNodeType: 'n8n-nodes-base.httpRequest',
        n8nOperation: 'request',
      },
    ],
    credentialType: 'apiKey',
    n8nNodeType: 'n8n-nodes-base.httpRequest',
    n8nNodeDefaults: {
      options: { retryOnFail: true, maxTries: 3 },
    },
    docsUrl: 'https://apolloio.github.io/apollo-api-docs/',
    examplePrompts: [
      'find luxury interior architects with contact details',
      'search for decision makers at luxury hotels',
      'enrich leads with verified emails from apollo',
      'save approved leads to apollo crm',
      'find companies in the luxury real estate industry',
    ],
  },

  // 6. LINKEDIN SALES NAVIGATOR — lead discovery + outreach
  {
    slug: 'linkedin-sales-nav',
    displayName: 'LinkedIn Sales Navigator',
    category: 'social',
    description:
      'Search and extract leads from LinkedIn Sales Navigator. Use for lead discovery processes that need to find new contacts matching an ICP by industry, seniority, company size, and location. Requires a LinkedIn Sales Navigator subscription + credentials.',
    capabilities: { read: true, write: false, search: true, subscribe: false },
    operations: [
      {
        id: 'search_people',
        kind: 'search',
        displayName: 'Search for people matching criteria',
        inputSchema: {
          type: 'object',
          required: ['criteria'],
          properties: {
            criteria: {
              type: 'object',
              properties: {
                keywords: { type: 'string' },
                industries: { type: 'array', items: { type: 'string' } },
                seniority: { type: 'array', items: { type: 'string' } },
                locations: { type: 'array', items: { type: 'string' } },
                companySize: { type: 'string' },
              },
            },
            limit: { type: 'number', default: 10 },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            people: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  title: { type: 'string' },
                  company: { type: 'string' },
                  location: { type: 'string' },
                  profileUrl: { type: 'string' },
                },
              },
            },
          },
        },
        // NOTE: no official n8n node exists for Sales Navigator — we'll
        // use http-generic under the hood + a custom wrapper OR delegate
        // to our own scraping service. For v1 seed we reference the
        // httpRequest node and document the limitation.
        n8nNodeType: 'n8n-nodes-base.httpRequest',
        n8nOperation: 'request',
      },
    ],
    credentialType: 'apiKey',
    n8nNodeType: 'n8n-nodes-base.httpRequest',
    n8nNodeDefaults: {
      options: { retryOnFail: true, maxTries: 3 },
    },
    docsUrl: 'https://business.linkedin.com/sales-solutions/sales-navigator',
    examplePrompts: [
      'find new leads matching our ICP',
      'search linkedin for luxury architecture decision makers',
      'get 10 new prospects this week',
    ],
  },
];

async function main() {
  console.log(`Seeding ${TOOLS.length} MCP tools into catalog…`);
  for (const tool of TOOLS) {
    // Prisma's InputJsonValue typing is strict — cast via `as any` so
    // we can pass plain JS objects/arrays as Json columns. The data is
    // structurally JSON-serializable; TS just can't prove it statically.
    const payload = {
      slug: tool.slug,
      displayName: tool.displayName,
      category: tool.category,
      description: tool.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capabilities: tool.capabilities as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      operations: tool.operations as any,
      credentialType: tool.credentialType,
      n8nNodeType: tool.n8nNodeType,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      n8nNodeDefaults: (tool.n8nNodeDefaults ?? undefined) as any,
      docsUrl: tool.docsUrl,
      examplePrompts: tool.examplePrompts,
      isActive: true,
    };
    await prisma.mcpToolCatalog.upsert({
      where: { slug: tool.slug },
      create: payload,
      update: payload,
    });
    console.log(`  ✔ ${tool.slug} (${tool.operations.length} operations)`);
  }
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
