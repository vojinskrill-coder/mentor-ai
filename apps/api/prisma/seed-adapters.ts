/**
 * Seed script for Process Tool Adapters (Neuron OS)
 * Seeds predefined adapters that define how processes communicate with MCP tools.
 *
 * Usage: npx ts-node prisma/seed-adapters.ts
 * Add --clear to delete all existing adapters and bindings first.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ADAPTERS = [
  {
    processSlug: 'lead-discovery',
    toolSlug: 'nocodb',
    adapterType: 'readwrite',
    n8nNodeType: 'n8n-nodes-base.nocodb',
    n8nNodeConfig: null,
    fieldMapping: {
      company: 'Company Name',
      name: 'Contact Name',
      email: 'Email',
      emailSource: 'Email Source',
      phone: 'Phone',
      website: 'Website',
      linkedin: 'LinkedIn',
      location: 'Location',
      industry: 'Industry',
      role: 'Role',
      companyDescription: 'Company Description',
      whyGoodFit: 'Why Good Fit',
      score: 'Score',
      reasoning: 'Reasoning',
      scoringRationale: 'Scoring Rationale',
      scoreBreakdown: 'Score Breakdown',
      recentProjects: 'Recent Projects',
      // Outreach — nested paths resolved by mapToNocoDB
      'outreach.email': 'Outreach Email',
      'outreach.linkedin': 'Outreach LinkedIn',
      // Alternative outreach format (message object from some n8n flows)
      message: 'Outreach Message',
    },
    readConfig: {
      endpoint: '/api/v2/tables/{{tableId}}/records',
      dedupFields: ['Company Name', 'Email'],
      filters: { where: '(Status,neq,Archived)' },
    },
    writeConfig: {
      endpoint: '/api/v2/tables/{{tableId}}/records',
      action: 'create',
      defaultValues: { Status: 'New', Source: 'neuron-os-lead-discovery' },
    },
    toolkitTemplate: `### MCP Tool: NocoDB (CRM)
- Type: readwrite
- Base URL: {{baseUrl}}
- Table ID: {{tableId}}
- Auth Header: xc-token {{apiToken}}

#### Before Process (Deduplication)
Read existing leads: GET {{baseUrl}}/api/v2/tables/{{tableId}}/records
- Filter: Status != Archived
- Dedup by: Company Name + Email
- Use these to build exclusion list for n8n search

#### After Approval (Write)
Write approved leads: POST {{baseUrl}}/api/v2/tables/{{tableId}}/records
- Status: New
- Source: neuron-os-lead-discovery
- Field Mapping:
{{fieldMappingFormatted}}

#### n8n Webhook
- Path: neuron-lead-discovery
- Include dedup context from NocoDB read in payload`,
  },

  // ── Content Creation → Notion ──
  {
    processSlug: 'instagram-content',
    toolSlug: 'notion',
    adapterType: 'write',
    n8nNodeType: null,
    n8nNodeConfig: null,
    fieldMapping: {
      topic: 'Topic',
      caption: 'Caption',
      hookLine: 'Hook Line',
      hashtags: 'Hashtags',
      imageType: 'Image Type',
      imageUrl: 'Image URL',
      imagePrompt: 'Image Prompt',
      imageReference: 'Image Reference',
      callToAction: 'Call To Action',
      score: 'Score',
      reasoning: 'Reasoning',
      whyItWorks: 'Why It Works',
      visualStyle: 'Visual Style',
      suggestedDay: 'Suggested Day',
      contentType: 'Content Type',
      status: 'Status',
    },
    readConfig: null,
    writeConfig: {
      endpoint: '/v1/pages',
      action: 'create',
      defaultValues: { Status: 'Approved', Source: 'neuron-os-content' },
    },
    toolkitTemplate: `### MCP Tool: Notion (Content)
- Type: write
- API: https://api.notion.com/v1
- Auth: Bearer {{apiToken}}
- Content Database ID: {{contentDatabaseId}}

#### After Approval (Write)
Write approved content to Notion database: POST https://api.notion.com/v1/pages
- Parent: database_id = {{contentDatabaseId}}
- Properties mapped from approved content
- Field Mapping:
{{fieldMappingFormatted}}

#### Notion Property Types
- Topic, Caption, Hook Line, Call To Action, Visual Style → title/rich_text
- Hashtags → multi_select or rich_text (comma-separated)
- Score → number
- Image URL → url
- Status → select (Approved, Posted, Scheduled)
- Content Type → select (single-image, carousel, reel-cover, story)`,
  },
];

async function main() {
  const clearFlag = process.argv.includes('--clear');

  if (clearFlag) {
    console.log('Clearing existing tool bindings and adapters...');
    await prisma.tenantToolBinding.deleteMany({});
    await prisma.processToolAdapter.deleteMany({});
    console.log('Cleared.');
  }

  console.log(`Seeding ${ADAPTERS.length} process tool adapter(s)...`);

  for (const adapter of ADAPTERS) {
    const result = await prisma.processToolAdapter.upsert({
      where: {
        processSlug_toolSlug: {
          processSlug: adapter.processSlug,
          toolSlug: adapter.toolSlug,
        },
      },
      update: {
        adapterType: adapter.adapterType,
        n8nNodeType: adapter.n8nNodeType,
        n8nNodeConfig: adapter.n8nNodeConfig ?? undefined,
        fieldMapping: adapter.fieldMapping,
        readConfig: adapter.readConfig ?? undefined,
        writeConfig: adapter.writeConfig ?? undefined,
        toolkitTemplate: adapter.toolkitTemplate,
      },
      create: {
        processSlug: adapter.processSlug,
        toolSlug: adapter.toolSlug,
        adapterType: adapter.adapterType,
        n8nNodeType: adapter.n8nNodeType,
        n8nNodeConfig: adapter.n8nNodeConfig ?? undefined,
        fieldMapping: adapter.fieldMapping,
        readConfig: adapter.readConfig ?? undefined,
        writeConfig: adapter.writeConfig ?? undefined,
        toolkitTemplate: adapter.toolkitTemplate,
      },
    });
    console.log(
      `  [${adapter.adapterType}] ${adapter.processSlug} + ${adapter.toolSlug} (${result.id})`
    );
  }

  console.log('Done! Process tool adapters seeded successfully.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
