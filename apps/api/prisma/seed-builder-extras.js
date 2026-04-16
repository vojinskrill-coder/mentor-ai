/**
 * Seeds three additional catalog tools for the neuron-process-builder
 * (Apollo.io, Brave Search, FAL.ai) and pre-configures their credentials
 * for the LSA tenant so the builder agent never has to ask for API keys
 * it can assume are already connected.
 *
 * Idempotent — safe to run multiple times.
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const TENANT_ID = 'tnt_rljn1gj4cgxoph0hxfohv6l4';

const TOOLS = [
  {
    slug: 'apollo-io',
    displayName: 'Apollo.io',
    category: 'crm',
    description:
      'B2B people + company search. Find contacts by title, company, industry, etc. Primary tool for lead discovery by person attributes.',
    capabilities: { read: true, search: true, write: false, subscribe: false },
    operations: [
      {
        id: 'search_people',
        kind: 'search',
        displayName: 'Search people',
        inputSchema: {
          type: 'object',
          properties: {
            titles: { type: 'array', items: { type: 'string' } },
            companies: { type: 'array', items: { type: 'string' } },
            locations: { type: 'array', items: { type: 'string' } },
            seniorities: { type: 'array', items: { type: 'string' } },
            limit: { type: 'number', default: 25, minimum: 1, maximum: 100 },
          },
        },
        outputSchema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              title: { type: 'string' },
              company: { type: 'string' },
              email: { type: 'string' },
              linkedin: { type: 'string' },
              location: { type: 'string' },
            },
          },
        },
        n8nNodeType: 'n8n-nodes-base.httpRequest',
        n8nOperation: 'POST /v1/mixed_people/search',
      },
      {
        id: 'enrich_person',
        kind: 'read',
        displayName: 'Enrich a person',
        inputSchema: {
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string' } },
        },
        outputSchema: { type: 'object' },
        n8nNodeType: 'n8n-nodes-base.httpRequest',
        n8nOperation: 'POST /v1/people/match',
      },
    ],
    credentialType: 'apiKey',
    n8nNodeType: 'n8n-nodes-base.httpRequest',
    n8nNodeDefaults: { authentication: 'headerAuth' },
    docsUrl: 'https://docs.apollo.io/reference',
    examplePrompts: [
      'find VPs of engineering at SaaS companies in Europe',
      'search contacts at luxury goods retailers',
      'enrich these leads with apollo',
    ],
  },
  {
    slug: 'brave-search',
    displayName: 'Brave Search',
    category: 'ai',
    description:
      'Web search API for research, trending topics, news discovery. Primary search tool for content and research processes.',
    capabilities: { read: false, search: true, write: false, subscribe: false },
    operations: [
      {
        id: 'web_search',
        kind: 'search',
        displayName: 'Web search',
        inputSchema: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string' },
            count: { type: 'number', default: 10, minimum: 1, maximum: 20 },
            freshness: {
              type: 'string',
              enum: ['pd', 'pw', 'pm', 'py'],
              description: 'pd=day, pw=week, pm=month, py=year',
            },
          },
        },
        outputSchema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              snippet: { type: 'string' },
              age: { type: 'string' },
            },
          },
        },
        n8nNodeType: 'n8n-nodes-base.httpRequest',
        n8nOperation: 'GET https://api.search.brave.com/res/v1/web/search',
      },
    ],
    credentialType: 'apiKey',
    n8nNodeType: 'n8n-nodes-base.httpRequest',
    n8nNodeDefaults: { authentication: 'headerAuth' },
    docsUrl: 'https://api.search.brave.com/app/documentation/web-search/get-started',
    examplePrompts: [
      'search the web for trending topics in sustainable design',
      'find news about statue installations this week',
    ],
  },
  {
    slug: 'fal-ai',
    displayName: 'FAL.ai (image generation)',
    category: 'ai',
    description:
      'Fast text-to-image and image-to-image generation. Primary image creation tool for content, marketing, and brochure processes.',
    capabilities: { read: false, search: false, write: true, subscribe: false },
    operations: [
      {
        id: 'generate_image',
        kind: 'write',
        displayName: 'Generate image from prompt',
        inputSchema: {
          type: 'object',
          required: ['prompt'],
          properties: {
            prompt: { type: 'string' },
            model: {
              type: 'string',
              default: 'flux/dev',
              enum: ['flux/dev', 'flux/schnell', 'flux-pro', 'kontext'],
            },
            width: { type: 'number', default: 1024 },
            height: { type: 'number', default: 1024 },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            imageUrl: { type: 'string' },
            seed: { type: 'number' },
          },
        },
        n8nNodeType: 'n8n-nodes-base.httpRequest',
        n8nOperation: 'POST https://fal.run/fal-ai/flux/dev',
      },
      {
        id: 'composite_with_reference',
        kind: 'write',
        displayName: 'Composite with reference image (Kontext)',
        inputSchema: {
          type: 'object',
          required: ['prompt', 'referenceImageUrl'],
          properties: {
            prompt: { type: 'string' },
            referenceImageUrl: { type: 'string' },
          },
        },
        outputSchema: { type: 'object' },
        n8nNodeType: 'n8n-nodes-base.httpRequest',
        n8nOperation: 'POST https://fal.run/fal-ai/kontext',
      },
    ],
    credentialType: 'apiKey',
    n8nNodeType: 'n8n-nodes-base.httpRequest',
    n8nNodeDefaults: { authentication: 'headerAuth' },
    docsUrl: 'https://fal.ai/docs',
    examplePrompts: [
      'generate hero images for a content process',
      'composite our sculpture onto a luxury background',
    ],
  },
];

const CREDENTIALS = [
  {
    toolSlug: 'apollo-io',
    apiToken: 'KusnLEKeTGaEN1cMNo-cIA',
    label: 'Apollo.io (LSA)',
  },
  {
    toolSlug: 'brave-search',
    apiToken: process.env.BRAVE_API_KEY || '',
    label: 'Brave Search (LSA)',
  },
  {
    toolSlug: 'fal-ai',
    apiToken: process.env.FAL_KEY || '',
    label: 'FAL.ai (LSA)',
  },
];

(async () => {
  console.log('Seeding builder extras (3 tools + credentials)...\n');

  // ── Tools ──────────────────────────────────────────────
  for (const t of TOOLS) {
    await p.mcpToolCatalog.upsert({
      where: { slug: t.slug },
      create: {
        slug: t.slug,
        displayName: t.displayName,
        category: t.category,
        description: t.description,
        capabilities: t.capabilities,
        operations: t.operations,
        credentialType: t.credentialType,
        n8nNodeType: t.n8nNodeType,
        n8nNodeDefaults: t.n8nNodeDefaults,
        docsUrl: t.docsUrl,
        examplePrompts: t.examplePrompts,
        isActive: true,
      },
      update: {
        displayName: t.displayName,
        category: t.category,
        description: t.description,
        capabilities: t.capabilities,
        operations: t.operations,
        credentialType: t.credentialType,
        n8nNodeType: t.n8nNodeType,
        n8nNodeDefaults: t.n8nNodeDefaults,
        docsUrl: t.docsUrl,
        examplePrompts: t.examplePrompts,
        isActive: true,
      },
    });
    console.log(`  tool upserted: ${t.slug}`);
  }

  // ── Credentials ────────────────────────────────────────
  for (const c of CREDENTIALS) {
    if (!c.apiToken) {
      console.log(`  skip credential ${c.toolSlug}: no apiToken (env var missing)`);
      continue;
    }
    await p.tenantCredential.upsert({
      where: {
        tenantId_toolSlug: { tenantId: TENANT_ID, toolSlug: c.toolSlug },
      },
      create: {
        tenantId: TENANT_ID,
        toolSlug: c.toolSlug,
        credentials: { apiToken: c.apiToken },
        verified: true,
        verifiedAt: new Date(),
        label: c.label,
      },
      update: {
        credentials: { apiToken: c.apiToken },
        verified: true,
        verifiedAt: new Date(),
        label: c.label,
      },
    });
    console.log(`  credential upserted: ${c.toolSlug}`);
  }

  // ── Sanity print ───────────────────────────────────────
  const catalog = await p.mcpToolCatalog.findMany({
    select: { slug: true, displayName: true, category: true, isActive: true },
    orderBy: { slug: 'asc' },
  });
  console.log(`\nMcpToolCatalog (${catalog.length} active):`);
  catalog.forEach((c) => console.log(`  - ${c.slug}: ${c.displayName} (${c.category})`));

  const creds = await p.tenantCredential.findMany({
    where: { tenantId: TENANT_ID },
    select: { toolSlug: true, verified: true, label: true },
  });
  console.log(`\nTenantCredential (${creds.length} for LSA):`);
  creds.forEach((c) => console.log(`  - ${c.toolSlug}: ${c.label} verified=${c.verified}`));

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
