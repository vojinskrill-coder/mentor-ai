/**
 * Seed script for Process Workflow Engine
 * Seeds Lead Discovery (6 steps) and Content Pipeline (7 steps) workflows
 *
 * Usage: npx ts-node prisma/seed-processes.ts
 * Requires: DEV_MODE=true in .env (uses dev-tenant-001)
 */

import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';

const prisma = new PrismaClient();

async function resolveTenantId(): Promise<string> {
  // 1. Explicit env var
  if (process.env.SEED_TENANT_ID) return process.env.SEED_TENANT_ID;

  // 2. Auto-detect: use the first (or only) tenant in the DB
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true }, take: 2 });
  if (tenants.length === 0) {
    throw new Error('No tenants found in DB. Register a tenant first.');
  }
  const first = tenants[0]!;
  if (tenants.length === 1) {
    console.log(`Auto-detected tenant: ${first.name} (${first.id})`);
    return first.id;
  }
  // Multiple tenants — require explicit choice
  console.log('Multiple tenants found:');
  tenants.forEach(t => console.log(`  ${t.id} — ${t.name}`));
  throw new Error('Set SEED_TENANT_ID env var to specify which tenant to seed.');
}

async function seedLeadDiscovery(TENANT_ID: string) {
  const workflowId = `proc_${createId()}`;

  const workflow = await prisma.processWorkflow.upsert({
    where: { tenantId_slug: { tenantId: TENANT_ID, slug: 'lead-discovery' } },
    update: {},
    create: {
      id: workflowId,
      tenantId: TENANT_ID,
      name: 'Lead Discovery',
      slug: 'lead-discovery',
      description: 'Automated lead research, enrichment, scoring, and personalized outreach for LSA luxury architecture services.',
      isActive: true,
      cronSchedule: '0 9 * * 1', // Every Monday at 9:00
    },
  });

  console.log(`Lead Discovery workflow: ${workflow.id}`);

  // Delete ALL existing steps for this workflow (clean slate for step definitions)
  // First delete step results that reference these steps
  const existingStepIds = (await prisma.processStep.findMany({ where: { workflowId: workflow.id }, select: { id: true } })).map(s => s.id);
  if (existingStepIds.length > 0) {
    await prisma.processStepResult.deleteMany({ where: { stepId: { in: existingStepIds } } });
    await prisma.processStep.deleteMany({ where: { workflowId: workflow.id } });
  }

  const steps = [
    {
      order: 1,
      name: 'Market Research',
      description: 'Search for luxury architecture firms and premium developers in Balkans + DACH region',
      stepType: 'AUTOMATIC' as const,
      agentType: 'main',
      toolSkill: 'brave-search',
      skillMdSection: `Use your web_search and web_fetch tools to search for luxury architecture firms, high-end interior designers, and premium real estate developers in the Balkans and DACH region.

Focus on:
- Companies that recently completed luxury projects
- Firms expanding into new markets
- Companies with outdated web presence (opportunity for LSA services)
- Search queries should cover: "luxury architecture firm Belgrade", "high-end interior design Vienna", "premium real estate developer Zagreb", "architect studio luxury Munich", and similar variations

Return exactly 5 NEW leads. NEVER return leads we already have (check the "Previously Discovered Contacts" section above if present). Each run must find DIFFERENT people than all previous runs. Quality over quantity — only the best 5 new leads.`,
      inputSchema: {},
      outputSchema: {
        type: 'object',
        required: ['leads', 'searchQueries'],
        properties: {
          leads: {
            type: 'array',
            minItems: 5, maxItems: 5,
            items: {
              type: 'object',
              required: ['name', 'company', 'website', 'location', 'source'],
              properties: {
                name: { type: 'string' },
                company: { type: 'string' },
                website: { type: 'string', format: 'uri' },
                location: { type: 'string' },
                source: { type: 'string' },
                notes: { type: 'string' },
              },
            },
          },
          searchQueries: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      order: 2,
      name: 'Lead Enrichment',
      description: 'Find decision makers, emails (DNS-verified), LinkedIn profiles, recent projects',
      stepType: 'AUTOMATIC' as const,
      agentType: 'main',
      toolSkill: 'brave-search',
      skillMdSection: `Use your web_search and web_fetch tools extensively. For EACH lead from the previous step:

1. VISIT THEIR WEBSITE (web_fetch the URL). Look at:
   - /contact, /about, /team, /people, /impressum pages for email addresses
   - Footer for email, phone, social links
   - Team page for decision maker names and roles

2. SEARCH FOR EMAILS specifically:
   - Search: "site:companywebsite.com email" or "companyname email contact"
   - Search: "person name company email"
   - Check LinkedIn profiles for contact info
   - Look for patterns like info@, office@, firstname@domain

3. FIND LINKEDIN profiles:
   - Search: "linkedin.com person name company"
   - Search: "site:linkedin.com/in/ person name"

4. RESEARCH THE COMPANY:
   - What do they do? What kind of projects?
   - Recent news, awards, new projects
   - Why would they be a good client for LSA luxury sculptures?

5. Write a SHORT company description (2-3 sentences) explaining what they do and why they would be a good fit for LSA.

CRITICAL: Try HARD to find real emails and websites. Use web_fetch to actually visit pages.
NEVER invent emails. If you truly cannot find one after searching, set to null.`,
      inputSchema: {},
      outputSchema: {
        type: 'object',
        required: ['enrichedLeads'],
        properties: {
          enrichedLeads: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'company', 'website', 'location', 'role', 'companyDescription', 'whyGoodFit'],
              properties: {
                name: { type: 'string' },
                company: { type: 'string' },
                website: { type: 'string' },
                location: { type: 'string' },
                role: { type: 'string', description: 'CEO, Creative Director, Partner, etc.' },
                email: { type: ['string', 'null'], description: 'Real email found on web. null if not found.' },
                emailSource: { type: ['string', 'null'], description: 'URL where email was found' },
                linkedin: { type: ['string', 'null'] },
                phone: { type: ['string', 'null'] },
                companyDescription: { type: 'string', description: '2-3 sentences about what the company does' },
                whyGoodFit: { type: 'string', description: 'Why this company/person is a good client for LSA luxury sculptures' },
                recentProjects: { type: 'array', items: { type: 'string' } },
                companySize: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
      verifyRules: [
        { field: 'enrichedLeads.*.email', type: 'dns' },
        { field: 'enrichedLeads.*.website', type: 'url' },
      ],
    },
    {
      order: 3,
      name: 'Lead Scoring',
      description: 'Score leads 1-10 based on fit, accessibility, timing, and size',
      stepType: 'AUTOMATIC' as const,
      agentType: 'main',
      toolSkill: 'analysis',
      skillMdSection: `Score each enriched lead from 1 to 10. PRESERVE all enriched data from previous step.

Scoring criteria:
- Fit (0-3): Does their work align with luxury architecture/sculpture? Same market?
- Accessibility (0-3): Do we have email? LinkedIn? Decision maker identified?
- Timing (0-2): Recent activity? New projects, hiring, expansion?
- Size (0-2): Appropriate for LSA? Not freelancer, not huge corporate.

Total = Fit + Accessibility + Timing + Size (max 10).
Include reasoning explaining WHY each score was assigned.
IMPORTANT: Copy ALL fields from input (company, website, email, linkedin, companyDescription, whyGoodFit, etc.)
Sort by score descending.`,
      inputSchema: {},
      outputSchema: {
        type: 'object',
        required: ['scoredLeads'],
        properties: {
          scoredLeads: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'company', 'score', 'scoreBreakdown', 'companyDescription', 'whyGoodFit'],
              properties: {
                name: { type: 'string' },
                company: { type: 'string' },
                website: { type: 'string' },
                location: { type: 'string' },
                role: { type: 'string' },
                email: { type: ['string', 'null'] },
                emailSource: { type: ['string', 'null'] },
                linkedin: { type: ['string', 'null'] },
                phone: { type: ['string', 'null'] },
                companyDescription: { type: 'string' },
                whyGoodFit: { type: 'string' },
                recentProjects: { type: 'array', items: { type: 'string' } },
                score: { type: 'integer', minimum: 1, maximum: 10 },
                scoreBreakdown: {
                  type: 'object',
                  required: ['fit', 'accessibility', 'timing', 'size'],
                  properties: {
                    fit: { type: 'integer', minimum: 0, maximum: 3 },
                    accessibility: { type: 'integer', minimum: 0, maximum: 3 },
                    timing: { type: 'integer', minimum: 0, maximum: 2 },
                    size: { type: 'integer', minimum: 0, maximum: 2 },
                  },
                },
                reasoning: { type: 'string' },
              },
            },
          },
        },
      },
    },
    {
      order: 4,
      name: 'Personalized Outreach',
      description: 'Draft personalized messages for leads scoring 6+',
      stepType: 'AUTOMATIC' as const,
      agentType: 'main',
      toolSkill: 'content-writing',
      skillMdSection: `DO NOT delegate to other agents. YOU write this yourself directly.

For each lead with score >= 6, draft a personalized outreach message.
IMPORTANT: COPY ALL existing fields from input (company, website, email, linkedin, location, role, companyDescription, whyGoodFit, scoreBreakdown, recentProjects). Add the message on top.

LSA BRAND VOICE:
- Professional, elegant, gallery-curator tone
- "We at Luxury Statues Adria..." — first person plural
- Reference their specific projects or company work from the data
- Not salesy — curator inviting to gallery
- Use their language (Serbian for Balkans, German for DACH)

EMAIL: Subject <100 chars. Body 150-250 words. Open with their work, bridge to LSA, close with soft CTA.
LINKEDIN NOTE (if linkedin exists): Max 300 chars, personal, reference their profile.`,
      inputSchema: {},
      outputSchema: {
        type: 'object',
        required: ['outreachLeads'],
        properties: {
          outreachLeads: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'company', 'score', 'message', 'companyDescription', 'whyGoodFit'],
              properties: {
                name: { type: 'string' },
                company: { type: 'string' },
                website: { type: 'string' },
                location: { type: 'string' },
                role: { type: 'string' },
                email: { type: ['string', 'null'] },
                emailSource: { type: ['string', 'null'] },
                linkedin: { type: ['string', 'null'] },
                phone: { type: ['string', 'null'] },
                companyDescription: { type: 'string' },
                whyGoodFit: { type: 'string' },
                recentProjects: { type: 'array', items: { type: 'string' } },
                score: { type: 'integer' },
                scoreBreakdown: { type: 'object' },
                reasoning: { type: 'string' },
                message: {
                  type: 'object',
                  required: ['subject', 'body'],
                  properties: {
                    subject: { type: 'string', maxLength: 100 },
                    body: { type: 'string' },
                    linkedinNote: { type: 'string', maxLength: 300 },
                  },
                },
                personalizationPoints: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
    {
      order: 5,
      name: 'Human Review',
      description: 'Owner reviews scored leads and personalized messages. Approve, edit, or skip.',
      stepType: 'APPROVAL' as const,
      agentType: 'none',
      toolSkill: 'none',
      skillMdSection: 'Owner reviews all scored leads and personalized messages. Can approve individual leads, edit messages, or skip leads entirely. Only approved leads proceed to the final step.',
      inputSchema: {},
      outputSchema: {},
    },
    {
      order: 6,
      name: 'Export & Delivery',
      description: 'Compile approved leads into final deliverable with summary statistics',
      stepType: 'AUTOMATIC' as const,
      agentType: 'main',
      toolSkill: 'compilation',
      skillMdSection: `Compile all approved leads from the review step into a final deliverable.

Generate summary statistics:
- Total leads researched vs enriched vs scored vs approved
- Average score of approved leads
- Top companies by score
- Contact coverage (how many have verified email, LinkedIn, both, neither)

For each approved lead, set status:
- "ready" — has verified email AND personalized message
- "needs_email" — no verified email, has LinkedIn
- "linkedin_only" — only LinkedIn contact available

Sort approved leads by score descending.`,
      inputSchema: {},
      outputSchema: {
        type: 'object',
        required: ['summary', 'approvedLeads'],
        properties: {
          summary: {
            type: 'object',
            properties: {
              totalResearched: { type: 'integer' },
              totalEnriched: { type: 'integer' },
              totalScored: { type: 'integer' },
              totalApproved: { type: 'integer' },
              averageScore: { type: 'number' },
              topCompanies: { type: 'array', items: { type: 'string' } },
            },
          },
          approvedLeads: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                company: { type: 'string' },
                email: { type: ['string', 'null'] },
                linkedin: { type: ['string', 'null'] },
                score: { type: 'integer' },
                message: { type: 'object' },
                status: { type: 'string', enum: ['ready', 'needs_email', 'linkedin_only'] },
              },
            },
          },
        },
      },
    },
  ];

  for (const step of steps) {
    await prisma.processStep.create({
      data: {
        id: `pstep_${createId()}`,
        workflowId: workflow.id,
        order: step.order,
        name: step.name,
        description: step.description,
        stepType: step.stepType,
        agentType: step.agentType,
        toolSkill: step.toolSkill,
        inputSchema: step.inputSchema,
        outputSchema: step.outputSchema,
        skillMdSection: (step as any).skillMdSection ?? null,
        retryPolicy: {},
        verifyRules: (step as any).verifyRules ?? null,
      },
    });
    console.log(`  Step ${step.order}: ${step.name}`);
  }
}

async function seedContentPipeline(TENANT_ID: string) {
  const workflowId = `proc_${createId()}`;

  // Upsert workflow — preserve existing runs
  const workflow = await prisma.processWorkflow.upsert({
    where: { tenantId_slug: { tenantId: TENANT_ID, slug: 'instagram-content' } },
    update: {
      name: 'Instagram Content',
      description: 'Istrazi top ideje za Instagram, kreiraj kompletne postove sa tekstom, tagovima i slikom (FAL.ai). Rucno postovanje.',
      cronSchedule: '0 9 * * 2',
    },
    create: {
      id: workflowId,
      tenantId: TENANT_ID,
      name: 'Instagram Content',
      slug: 'instagram-content',
      description: 'Istrazi top ideje za Instagram, kreiraj kompletne postove sa tekstom, tagovima i slikom (FAL.ai). Rucno postovanje.',
      isActive: true,
      cronSchedule: '0 9 * * 2',
    },
  });

  // Delete old content-pipeline if exists (separate slug)
  const oldCp = await prisma.processWorkflow.findFirst({ where: { tenantId: TENANT_ID, slug: 'content-pipeline' } });
  if (oldCp) {
    const runCount = await prisma.processRun.count({ where: { workflowId: oldCp.id } });
    if (runCount === 0) {
      await prisma.processStep.deleteMany({ where: { workflowId: oldCp.id } });
      await prisma.processWorkflow.delete({ where: { id: oldCp.id } });
      console.log('  Deleted old content-pipeline (no runs)');
    }
  }

  console.log(`Instagram Content workflow: ${workflow.id}`);

  const steps = [
    {
      order: 1,
      name: 'Istrazivanje sadrzaja',
      description: 'Istrazi 3 ideje za Instagram postove koji nam fale',
      stepType: 'AUTOMATIC' as const,
      agentType: 'main',
      toolSkill: 'web_search',
      skillMdSection: `Use your web_search tool to research Instagram content ideas for Luxury Statues Adria.

TASK:
1. Search for what luxury architecture/sculpture/art Instagram accounts post
2. Analyze what content performs well in this niche (engagement, saves, shares)
3. Look at competitors: luxury art galleries, high-end sculpture studios, premium architecture firms
4. Identify exactly 3 content ideas that we are MISSING and should create

For each idea provide:
- The content theme/topic
- Why it would work for our audience (luxury architecture clients, interior designers, art collectors)
- Reference examples (Instagram accounts or post URLs that did this well)
- Suggested visual style for the image
- Best posting time/day recommendation

SCORING (mandatory for each idea):
Score each idea 1-10 based on 5 criteria (each 0-2):
- Relevance (0-2): How relevant to our target audience?
- Engagement (0-2): Expected saves, shares, comments potential?
- Uniqueness (0-2): How different from what competitors post?
- Brand Fit (0-2): How well does it fit our luxury gallery-curator brand?
- Timeliness (0-2): Is this trending or seasonal right now?

Include detailed REASONING for each score — why this content should be created NOW and why it would perform better than alternatives.

Sort ideas by score descending (best ideas first).

Focus on: luxury sculptures in architectural spaces, behind-the-scenes creation, client transformations, design inspiration, brand storytelling.

DO NOT delegate. Do this research yourself using web_search.`,
      outputSchema: {
        type: 'object',
        required: ['contentIdeas'],
        properties: {
          contentIdeas: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: {
              type: 'object',
              required: ['topic', 'whyItWorks', 'score'],
              properties: {
                topic: { type: 'string', description: 'Content idea title' },
                whyItWorks: { type: 'string', description: 'Why this resonates with our audience' },
                visualStyle: { type: 'string', description: 'Description of the visual aesthetic for the image' },
                reference: { type: 'string', description: 'Example account or post URL that did this well' },
                suggestedDay: { type: 'string', description: 'Best day/time to post' },
                contentType: { type: 'string', enum: ['single-image', 'carousel', 'reel-cover', 'story'] },
                score: { type: 'integer', minimum: 1, maximum: 10, description: 'Priority score' },
                scoreBreakdown: {
                  type: 'object',
                  required: ['relevance', 'engagement', 'uniqueness', 'brandFit', 'timeliness'],
                  properties: {
                    relevance: { type: 'integer', minimum: 0, maximum: 2, description: 'How relevant to our target audience (luxury architects, designers, collectors)' },
                    engagement: { type: 'integer', minimum: 0, maximum: 2, description: 'Expected engagement potential (saves, shares, comments)' },
                    uniqueness: { type: 'integer', minimum: 0, maximum: 2, description: 'How different from what competitors post' },
                    brandFit: { type: 'integer', minimum: 0, maximum: 2, description: 'How well it fits LSA luxury gallery-curator brand' },
                    timeliness: { type: 'integer', minimum: 0, maximum: 2, description: 'Is this trending or seasonal right now?' },
                  },
                },
                reasoning: { type: 'string', description: 'Detailed explanation of why this content idea scored high/low and why it should be created now' },
              },
            },
          },
        },
      },
    },
    {
      order: 2,
      name: 'Kreiranje postova',
      description: 'Kreiraj kompletne Instagram postove za svaku ideju',
      stepType: 'AUTOMATIC' as const,
      agentType: 'main',
      toolSkill: 'content-writing',
      skillMdSection: `DO NOT delegate. YOU write this yourself.

For each of the 3 content ideas from the previous step, create a COMPLETE Instagram post:

1. CAPTION (srpski jezik, 150-300 words):
   - LSA brand voice: elevated, gallery-curator tone
   - Start with a hook (first line is crucial — it shows before "more")
   - Tell a story or share an insight, don't just describe
   - Include a call-to-action (DM us, link in bio, save for later, etc.)
   - End with relevant emojis (subtle, not excessive)

2. HASHTAGS (20-30 per post):
   - Mix of: branded (#LuxuryStatuesAdria #LSAatelier), niche (#luxurysculpture #architecturalart), broad (#luxuryinteriors #designinspiration)
   - Include Serbian tags: #luksuz #enterijer #skulpture #umetnost
   - Research which hashtags competitors use

3. IMAGE — choose ONE of two approaches for each post:

   OPTION A — "real" — USE ACTUAL PHOTO (product shots, detail close-ups):
   Set imageType: "real" and imageReference: sculpture name.
   Available sculptures: "Eterna Harmonia" (dark bronze infinity), "Nebeski Uzlazak" (silver chrome rising flame), "Golden Flux" (gold S-shape).
   Available brand assets: "Sertifikat" (our official certificate of authenticity — use for posts about certification, authenticity, limited editions).

   OPTION B — "composite" — SCULPTURE IN CONTEXT:
   Set imageType: "composite", imageReference: sculpture name, and imagePrompt.
   Our system takes the REAL sculpture photo and uses AI (Kontext) to place it in the scene you describe.

   Write a SHORT but VIVID imagePrompt (2-3 sentences max) describing what the image should show.
   Our Prompt Optimizer engine will expand it into a full production-ready prompt using your topic, reasoning, and whyItWorks fields.

   Focus on: what is HAPPENING in the image, what ENVIRONMENT, what MOOD.
   Examples:
   - "Artisan's hands in cotton gloves polishing the raw bronze surface in a dimly lit workshop, grinding tools visible"
   - "Two professionals in black uniforms carefully positioning the sculpture in a luxury hotel lobby with marble floors"
   - "The sculpture commanding a vast double-height penthouse at golden hour, city skyline glowing through windows behind"

   Keep it short — our optimizer reads your full post context (topic, reasoning, whyItWorks) to build the complete prompt.

IMPORTANT:
- Create posts for all 3 ideas.
- Carry forward: topic, score, scoreBreakdown, reasoning from input.
- Keep captions concise (100-200 words max, not more).
- Keep hashtags to 15-20 (not 30).`,
      outputSchema: {
        type: 'object',
        required: ['posts'],
        properties: {
          posts: {
            type: 'array',
            items: {
              type: 'object',
              required: ['topic', 'caption', 'hashtags'],
              properties: {
                topic: { type: 'string' },
                whyItWorks: { type: 'string' },
                visualStyle: { type: 'string' },
                reference: { type: 'string' },
                suggestedDay: { type: 'string' },
                contentType: { type: 'string' },
                score: { type: 'integer', description: 'Priority score from research step' },
                scoreBreakdown: { type: 'object', description: 'Score breakdown from research' },
                reasoning: { type: 'string', description: 'Why this content should be created' },
                caption: { type: 'string', description: 'Full Instagram caption in Serbian' },
                hookLine: { type: 'string', description: 'First line of caption (the hook)' },
                hashtags: { type: 'array', items: { type: 'string' }, description: '20-30 hashtags without #' },
                imageType: { type: 'string', enum: ['real', 'composite'], description: 'real = actual photo as-is, composite = real sculpture placed in described scene' },
                imageReference: { type: 'string', description: 'Which sculpture photo to use (for imageType=real): Eterna Harmonia, Nebeski Uzlazak, or Golden Flux' },
                imagePrompt: { type: 'string', description: 'Scene description for AI generation (for imageType=generated)' },
                callToAction: { type: 'string' },
              },
            },
          },
        },
      },
    },
    {
      order: 3,
      name: 'Pregled i odobrenje',
      description: 'Pregledaj postove, tekst i generisane slike. Odobri ili odbij.',
      stepType: 'APPROVAL' as const,
      agentType: 'none',
      toolSkill: 'none',
      skillMdSection: 'Vlasnik pregleda 3 Instagram posta: tekst, tagove i generisane slike. Moze da odobri pojedinacne postove ili sve odjednom. Odobreni postovi su spremni za rucno postovanje.',
      outputSchema: {},
    },
  ];

  for (const step of steps) {
    await prisma.processStep.create({
      data: {
        id: `pstep_${createId()}`,
        workflowId: workflow.id,
        order: step.order,
        name: step.name,
        description: step.description,
        stepType: step.stepType,
        agentType: step.agentType,
        toolSkill: step.toolSkill,
        inputSchema: {},
        outputSchema: step.outputSchema,
        skillMdSection: (step as any).skillMdSection ?? null,
        retryPolicy: {},
      },
    });
    console.log(`  Step ${step.order}: ${step.name}`);
  }
}

async function seedBrochureGeneration(TENANT_ID: string) {
  const workflowId = `proc_${createId()}`;

  const workflow = await prisma.processWorkflow.upsert({
    where: { tenantId_slug: { tenantId: TENANT_ID, slug: 'brochure-generation' } },
    update: {
      name: 'Generisanje brosure',
      description: 'AI kreira brosuru u stilu postojeceg Figma dizajna. 6 koraka: ideja, layout, tekst, slike, preview, export.',
    },
    create: {
      id: workflowId,
      tenantId: TENANT_ID,
      name: 'Generisanje brosure',
      slug: 'brochure-generation',
      description: 'AI kreira brosuru u stilu postojeceg Figma dizajna. 6 koraka: ideja, layout, tekst, slike, preview, export.',
      isActive: true,
    },
  });

  console.log(`Brochure Generation workflow: ${workflow.id}`);

  // Clean existing steps
  const existingStepIds = (await prisma.processStep.findMany({ where: { workflowId: workflow.id }, select: { id: true } })).map(s => s.id);
  if (existingStepIds.length > 0) {
    await prisma.processStepResult.deleteMany({ where: { stepId: { in: existingStepIds } } });
    await prisma.processRun.deleteMany({ where: { workflowId: workflow.id } });
    await prisma.processStep.deleteMany({ where: { workflowId: workflow.id } });
  }

  const steps = [
    {
      order: 1,
      name: 'Istrazivanje ideja',
      description: 'OpenClaw istrazuje i predlaze 3-5 ideja za brosuru sa scoring-om',
      stepType: 'AUTOMATIC' as const,
      agentType: 'main',
      toolSkill: 'web_search',
      skillMdSection: `Use web_search to research what kind of brochure would be most valuable for Luxury Statues Adria right now.

TASK: Propose 3-5 brochure ideas. For each idea provide:
- Title (e.g., "B2B Katalog za Arhitekte")
- Target audience — who receives this brochure
- Purpose — what we achieve with it (lead gen, brand awareness, client education)
- Format — page count, orientation, size (e.g., "8 pages, A4, portrait")
- Content outline — what goes on each page (brief)
- Score 1-10 based on: business impact, audience reach, production feasibility
- Reasoning — why this brochure should be created NOW

Research competitors' brochures, luxury brand catalogs, architecture firm lookbooks for inspiration.
Sort by score descending.`,
      outputSchema: {
        type: 'object',
        required: ['ideas'],
        properties: {
          ideas: {
            type: 'array',
            minItems: 3,
            maxItems: 5,
            items: {
              type: 'object',
              required: ['title', 'audience', 'purpose', 'format', 'contentOutline', 'score', 'reasoning'],
              properties: {
                title: { type: 'string' },
                audience: { type: 'string' },
                purpose: { type: 'string' },
                format: { type: 'string' },
                contentOutline: { type: 'array', items: { type: 'object', properties: { pageNum: { type: 'integer' }, description: { type: 'string' } } } },
                score: { type: 'integer', minimum: 1, maximum: 10 },
                reasoning: { type: 'string' },
              },
            },
          },
        },
      },
    },
    {
      order: 2,
      name: 'Odobrenje ideje',
      description: 'Vlasnik pregleda ideje, modifikuje ih i bira koje da se implementiraju',
      stepType: 'APPROVAL' as const,
      agentType: 'none',
      toolSkill: 'none',
      skillMdSection: 'Vlasnik pregleda 3-5 ideja za brosuru. Moze da: odobri ideju, modifikuje je (da feedback pa se regenerise), ili odbaci. Bar jedna ideja mora biti odobrena da bi se islo dalje.',
      outputSchema: {},
    },
    {
      order: 3,
      name: 'Kreiranje layout-a',
      description: 'Design Director AI kreira wireframe layout za svaku stranicu na osnovu Brand Design Profila',
      stepType: 'AUTOMATIC' as const,
      agentType: 'main',
      toolSkill: 'design-planning',
      skillMdSection: `You are a Design Director AI. Your job is to plan the LAYOUT of each brochure page.

INPUT: You receive an approved brochure idea with content outline and a Brand Design Profile (extracted from Figma).

TASK: For each page of the brochure, create a detailed layout specification:

1. Analyze the Brand Design Profile — understand the spacing patterns, font hierarchy, color usage, and how elements are positioned on each page of the reference design.

2. For each page, define:
   - layoutType: cover, split-60-40, split-40-60, grid-2x2, editorial, product-showcase, cta, back-cover
   - components: array of content slots, each with:
     - slotName: unique identifier (e.g., "main-heading", "hero-image", "body-text-1")
     - type: "text" or "image"
     - x, y, w, h: position and size as percentage of page (0-100)
     - For text slots: fontRole (h1/h2/body/caption), maxChars (based on dimensions)
     - For image slots: aspectRatio, description of what image should show

3. RULES from the Brand Design Profile:
   - Follow the same margin/padding patterns
   - Use the same font size hierarchy
   - Maintain similar text-to-image ratios
   - Position logo in the same relative position as in the reference
   - Keep the same overall "feel" — spacious luxury, not cramped

Return JSON with page layouts.`,
      outputSchema: {
        type: 'object',
        required: ['pages'],
        properties: {
          pages: {
            type: 'array',
            items: {
              type: 'object',
              required: ['pageNumber', 'layoutType', 'components'],
              properties: {
                pageNumber: { type: 'integer' },
                pageTitle: { type: 'string' },
                layoutType: { type: 'string' },
                components: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['slotName', 'type', 'x', 'y', 'w', 'h'],
                    properties: {
                      slotName: { type: 'string' },
                      type: { type: 'string', enum: ['text', 'image'] },
                      x: { type: 'number' },
                      y: { type: 'number' },
                      w: { type: 'number' },
                      h: { type: 'number' },
                      fontRole: { type: 'string' },
                      maxChars: { type: 'integer' },
                      aspectRatio: { type: 'string' },
                      imageDescription: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      order: 4,
      name: 'Odobrenje layout-a',
      description: 'Vlasnik pregleda wireframe layout svake stranice — vidi pozicije slotova bez sadrzaja',
      stepType: 'APPROVAL' as const,
      agentType: 'none',
      toolSkill: 'none',
      skillMdSection: 'Vlasnik pregleda wireframe layout svake stranice. Vidi prazne slotove sa dimenzijama. Moze da odobri, pomeri elemente (feedback), doda/ukloni stranice. Sve stranice moraju biti odobrene.',
      outputSchema: {},
    },
    {
      order: 5,
      name: 'Generisanje sadrzaja',
      description: 'AI popunjava SVE tekst slotove i generise SVE slike za odobreni layout',
      stepType: 'AUTOMATIC' as const,
      agentType: 'main',
      toolSkill: 'content-writing',
      skillMdSection: `You receive the approved brochure layout with all pages and slots defined.

TASK 1 — TEKST: For each text slot on each page:
- Write text that FITS within maxChars limit
- Follow the brand voice: refined, understated, authoritative (LSA style)
- fontRole h1 = headline (3-6 words), h2 = subheading (8-15 words), body = paragraph, caption = short label
- Write in Serbian language

TASK 2 — SLIKE: For each image slot, write an imagePrompt describing the scene.
- Use our Prompt Optimizer format: describe composition, environment, lighting, mood
- Reference our sculptures: Eterna Harmonia, Nebeski Uzlazak, Golden Flux
- Our system will use FAL.ai Kontext to place real sculpture photos in the described scenes

Return JSON with ALL slots filled — both text content and image prompts.`,
      outputSchema: {
        type: 'object',
        required: ['pages'],
        properties: {
          pages: {
            type: 'array',
            items: {
              type: 'object',
              required: ['pageNumber', 'components'],
              properties: {
                pageNumber: { type: 'integer' },
                components: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['slotName', 'type'],
                    properties: {
                      slotName: { type: 'string' },
                      type: { type: 'string' },
                      content: { type: 'string', description: 'Text content or image prompt' },
                      imagePrompt: { type: 'string' },
                      imageReference: { type: 'string', description: 'Which sculpture to use' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      order: 6,
      name: 'Pregled i odobrenje sadrzaja',
      description: 'Vlasnik pregleda svaku komponentu — tekst i slike. Moze da odobri, edituje, ili regenerise svaku posebno.',
      stepType: 'APPROVAL' as const,
      agentType: 'none',
      toolSkill: 'none',
      skillMdSection: `Vlasnik pregleda popunjeni layout stranica-po-stranica:
- Svaki tekst slot: odobri, edituj rucno, ili daj feedback za AI regenerisanje
- Svaki image slot: odobri, uploaduj svoju sliku, ili daj feedback za AI regenerisanje
- Svaka komponenta ima nezavisan status (pending/approved/rejected)
- Sve komponente moraju biti odobrene pre exporta
- Korisnik moze da se vrati na prethodni korak za promenu layout-a`,
      outputSchema: {},
    },
  ];

  for (const step of steps) {
    await prisma.processStep.create({
      data: {
        id: `pstep_${createId()}`,
        workflowId: workflow.id,
        order: step.order,
        name: step.name,
        description: step.description,
        stepType: step.stepType,
        agentType: step.agentType,
        toolSkill: step.toolSkill,
        inputSchema: {},
        outputSchema: step.outputSchema,
        skillMdSection: step.skillMdSection ?? null,
        retryPolicy: {},
      },
    });
    console.log(`  Step ${step.order}: ${step.name}`);
  }
}

async function main() {
  console.log('Seeding Process Workflows...\n');

  const tenantId = await resolveTenantId();
  await seedLeadDiscovery(tenantId);
  await seedContentPipeline(tenantId);
  await seedBrochureGeneration(tenantId);

  console.log('\nDone!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
