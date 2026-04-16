/**
 * Seed script for Catalog Items (Processes + MCP Tools)
 * Seeds the platform-wide catalog of available processes and tools.
 *
 * Usage: npx ts-node prisma/seed-catalog.ts
 * Add --clear to delete all existing catalog items first.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATALOG_ITEMS = [
  // ── Processes ──
  {
    type: 'process',
    name: 'Lead Discovery',
    slug: 'lead-discovery',
    description:
      'Automatically finds potential clients using web search, LinkedIn, and business databases. Analyzes profiles, scores relevance, and generates personalized outreach messages.',
    icon: '🎯',
    category: 'lead-gen',
    requiredTier: 'starter',
    creditCost: 10,
  },
  {
    type: 'process',
    name: 'Instagram Content',
    slug: 'instagram-content',
    description:
      'Creates content for social media, blog posts, and email campaigns tailored to your brand and target audience. Includes planning, writing, and optimization.',
    icon: '✍️',
    category: 'content',
    requiredTier: 'starter',
    creditCost: 5,
    configSchema: {
      toolDescription:
        'The content creation process uses AI to generate Instagram posts, blog articles, and campaigns. You can configure which service generates images and upload product references.',
      fields: [
        {
          key: 'imageProvider',
          label: 'Image Provider',
          type: 'string',
          required: true,
          placeholder: 'fal-ai',
          helpText:
            'Choose the image generation service: "fal-ai" (FAL.ai Kontext compositing) or "nano-banana" (Google Nano Banana). FAL.ai is the default.',
        },
        {
          key: 'falApiKey',
          label: 'FAL.ai API Key',
          type: 'secret',
          required: false,
          placeholder: 'fal_...',
          helpText:
            'fal.ai → Dashboard → API Keys → Create. Required only if you use FAL.ai as the image provider.',
        },
      ],
      docUrl: 'https://fal.ai/docs',
    },
  },
  {
    type: 'process',
    name: 'Competitor Monitoring',
    slug: 'competitor-monitoring',
    description:
      'Tracks competitor activities on the web and social media. Analyzes prices, products, marketing strategies, and generates reports with recommendations.',
    icon: '📊',
    category: 'analytics',
    requiredTier: 'pro',
    creditCost: 8,
  },
  {
    type: 'process',
    name: 'Client Onboarding',
    slug: 'client-onboarding',
    description:
      'Automates the new client onboarding process: creating accounts, sending welcome messages, setting initial tasks, and tracking progress through the first 30 days.',
    icon: '🤝',
    category: 'automation',
    requiredTier: 'starter',
    creditCost: 3,
  },
  {
    type: 'process',
    name: 'Report Generation',
    slug: 'report-generation',
    description:
      'Generates business reports based on your data: sales results, marketing metrics, financial overviews. Exports to PDF with charts.',
    icon: '📋',
    category: 'analytics',
    requiredTier: 'starter',
    creditCost: 5,
  },
  {
    type: 'process',
    name: 'Brochure Generation',
    slug: 'brochure-generation',
    description:
      'Designs and generates professional brochures with your branding. Includes layout, text, images, and export to PDF or Figma format.',
    icon: '📰',
    category: 'content',
    requiredTier: 'pro',
    creditCost: 15,
  },

  // ── Tools (MCP) ──
  {
    type: 'tool',
    name: 'NocoDB CRM',
    slug: 'nocodb',
    description:
      'Open-source CRM for lead management. Stores and displays contacts, automatically syncs with lead discovery processes.',
    icon: '🗄️',
    category: 'crm',
    requiredTier: 'starter',
    creditCost: 0,
    mcpEndpoint: 'http://91.98.231.87:8080',
    configSchema: {
      toolDescription:
        'NocoDB is an open-source database with a spreadsheet interface. Used as a CRM for storing leads discovered through processes. All approved leads are automatically written to a NocoDB table.',
      fields: [
        {
          key: 'baseUrl',
          label: 'NocoDB URL',
          type: 'url',
          required: true,
          placeholder: 'https://your-nocodb.example.com',
          helpText:
            'URL of your NocoDB server. If you are using our hosted NocoDB, leave the default value.',
        },
        {
          key: 'apiToken',
          label: 'API Token',
          type: 'secret',
          required: true,
          placeholder: 'xc-...',
          helpText:
            'Open NocoDB → click your avatar (bottom left) → API Tokens → Create token. Copy the token and paste it here.',
        },
        {
          key: 'tableId',
          label: 'Leads Table ID',
          type: 'string',
          required: true,
          placeholder: 'tblXXXXXXXXXXXXXX',
          helpText:
            'Open the table in NocoDB → check the URL in your browser. The Table ID is the part starting with "tbl". Example: tblAbc123def456.',
        },
      ],
      docUrl: 'https://docs.nocodb.com/developer-resources/rest-APIs',
    },
  },
  {
    type: 'tool',
    name: 'Notion',
    slug: 'notion',
    description:
      'Content management and planning through Notion. Approved posts, blogs, and content are automatically written to your Notion database.',
    icon: '📝',
    category: 'content',
    requiredTier: 'starter',
    creditCost: 0,
    configSchema: {
      toolDescription:
        'Notion serves as a content hub — everything Neuron OS creates (Instagram posts, blog articles, campaigns) is automatically written to your Notion database after approval. Use Notion for content calendar, review, and post planning.',
      fields: [
        {
          key: 'apiToken',
          label: 'Notion Integration Token',
          type: 'secret',
          required: true,
          placeholder: 'ntn_...',
          helpText:
            'notion.so/my-integrations → New integration → Internal → copy the token. Starts with ntn_ or secret_.',
        },
        {
          key: 'contentDatabaseId',
          label: 'Content Database ID',
          type: 'string',
          required: true,
          placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          helpText:
            'Open the database in Notion → copy the ID from the URL (32 characters after the workspace name, before ?v=). The database must be shared with the integration.',
        },
      ],
      docUrl: 'https://developers.notion.com/docs/getting-started',
    },
  },
  {
    type: 'tool',
    name: 'Brave Search',
    slug: 'brave-search',
    description:
      'Web search using the Brave Search API. Enables the AI agent to search the internet in real time for the latest information.',
    icon: '🔍',
    category: 'search',
    requiredTier: 'starter',
    creditCost: 0,
    configSchema: {
      toolDescription:
        'Brave Search enables real-time internet searching. The AI agent uses this tool to find the latest information about companies, people, and trends.',
      fields: [
        {
          key: 'apiKey',
          label: 'Brave Search API Key',
          type: 'secret',
          required: true,
          placeholder: 'BSA...',
          helpText: 'Register at brave.com/search/api → Dashboard → API Keys → copy the key.',
        },
      ],
      docUrl: 'https://brave.com/search/api/',
    },
  },
  {
    type: 'tool',
    name: 'Gmail',
    slug: 'gmail',
    description:
      'Sending and reading email messages through Gmail. Enables automatic sending of outreach messages, follow-up emails, and tracking responses.',
    icon: '📧',
    category: 'email',
    requiredTier: 'pro',
    creditCost: 1,
    configSchema: {
      toolDescription:
        'Gmail integration enables sending and receiving emails directly from processes. Used for automatic outreach, follow-up, and tracking communication with leads.',
      fields: [
        {
          key: 'clientId',
          label: 'Google OAuth Client ID',
          type: 'string',
          required: true,
          placeholder: '123456789-abc.apps.googleusercontent.com',
          helpText:
            'Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID. Gmail API must be enabled.',
        },
        {
          key: 'clientSecret',
          label: 'Google OAuth Client Secret',
          type: 'secret',
          required: true,
          placeholder: 'GOCSPX-...',
          helpText: 'Found next to the Client ID in Google Cloud Console → Credentials.',
        },
        {
          key: 'refreshToken',
          label: 'Refresh Token',
          type: 'secret',
          required: true,
          placeholder: '1//0...',
          helpText:
            'Generated through the OAuth flow. Click "Authorize" to automatically obtain the token.',
        },
      ],
      docUrl: 'https://developers.google.com/gmail/api/quickstart',
    },
  },
  {
    type: 'tool',
    name: 'Google Sheets',
    slug: 'google-sheets',
    description:
      'Reading and writing data to Google Sheets. Ideal for exporting results, tracking leads, and managing lists.',
    icon: '📊',
    category: 'data',
    requiredTier: 'pro',
    creditCost: 1,
    configSchema: {
      toolDescription:
        'Google Sheets integration enables reading and writing data directly to a spreadsheet. Ideal for exporting leads, reports, and tracking.',
      fields: [
        {
          key: 'clientId',
          label: 'Google OAuth Client ID',
          type: 'string',
          required: true,
          placeholder: '123456789-abc.apps.googleusercontent.com',
          helpText:
            'Google Cloud Console → APIs & Services → Credentials. Enable the Google Sheets API.',
        },
        {
          key: 'clientSecret',
          label: 'Google OAuth Client Secret',
          type: 'secret',
          required: true,
          placeholder: 'GOCSPX-...',
          helpText: 'Found next to the Client ID in Google Cloud Console.',
        },
        {
          key: 'spreadsheetId',
          label: 'Spreadsheet ID',
          type: 'string',
          required: false,
          placeholder: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms',
          helpText:
            'ID of your Google Sheets document. Found in the URL between /d/ and /edit. Optional — can be configured later.',
        },
      ],
      docUrl: 'https://developers.google.com/sheets/api/quickstart',
    },
  },
  {
    type: 'tool',
    name: 'Slack',
    slug: 'slack',
    description:
      'Sending messages and notifications to Slack channels. Automatically notifies the team about new leads, completed processes, or urgent actions.',
    icon: '💬',
    category: 'communication',
    requiredTier: 'pro',
    creditCost: 0,
    configSchema: {
      toolDescription:
        'Slack integration sends notifications to your workspace. Automatically notify the team about new leads, completed processes, or urgent actions.',
      fields: [
        {
          key: 'botToken',
          label: 'Bot Token',
          type: 'secret',
          required: true,
          placeholder: 'xoxb-...',
          helpText: 'Slack API → Your Apps → Install App → Bot User OAuth Token. Pocinje sa xoxb-.',
        },
        {
          key: 'defaultChannel',
          label: 'Default Channel',
          type: 'string',
          required: true,
          placeholder: '#general',
          helpText:
            'Name of the Slack channel where notifications will be sent. Example: #leads or #notifications.',
        },
      ],
      docUrl: 'https://api.slack.com/tutorials/tracks/getting-a-token',
    },
  },
  {
    type: 'tool',
    name: 'HubSpot CRM',
    slug: 'hubspot-crm',
    description:
      'Integration with HubSpot CRM. Automatically creates contacts, deals, and tasks from process results. Syncs data in both directions.',
    icon: '🔗',
    category: 'crm',
    requiredTier: 'enterprise',
    creditCost: 2,
    configSchema: {
      toolDescription:
        'HubSpot CRM integration enables automatic creation of contacts, deals, and tasks. All process results are synced with your HubSpot account.',
      fields: [
        {
          key: 'accessToken',
          label: 'Private App Access Token',
          type: 'secret',
          required: true,
          placeholder: 'pat-...',
          helpText:
            'HubSpot → Settings → Integrations → Private Apps → Create. Assign scopes: contacts, deals, tasks. Copy the Access Token.',
        },
        {
          key: 'portalId',
          label: 'Portal ID',
          type: 'string',
          required: true,
          placeholder: '12345678',
          helpText:
            'Found in the HubSpot URL: app.hubspot.com/contacts/PORTAL_ID. Also in Settings → Account Defaults.',
        },
      ],
      docUrl: 'https://developers.hubspot.com/docs/api/private-apps',
    },
  },
];

async function main() {
  const clearFlag = process.argv.includes('--clear');

  if (clearFlag) {
    console.log('Clearing existing catalog items...');
    await prisma.tenantCatalogItem.deleteMany({});
    await prisma.catalogItem.deleteMany({});
    console.log('Cleared.');
  }

  console.log(`Seeding ${CATALOG_ITEMS.length} catalog items...`);

  for (const item of CATALOG_ITEMS) {
    const { slug, ...data } = item;
    await prisma.catalogItem.upsert({
      where: { slug },
      update: {
        name: data.name,
        type: data.type,
        description: data.description,
        icon: data.icon,
        category: data.category,
        requiredTier: data.requiredTier,
        creditCost: data.creditCost,
        configSchema: (data as any).configSchema ?? undefined,
        mcpEndpoint: (data as any).mcpEndpoint ?? undefined,
      },
      create: { slug, ...data } as any,
    });
    console.log(`  ${data.icon} ${data.name} (${data.type})`);
  }

  console.log('Done! Catalog seeded successfully.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
