import { Injectable } from '@nestjs/common';
import { AgentType, AgentTypeInfo } from '@mentor-ai/shared/types';

export interface AgentDefinition {
  type: AgentType;
  openClawAgentId: string;
  label: string;
  description: string;
  icon: string;
  estimatedCostEur: number;
  systemPrompt: string;
}

@Injectable()
export class AgentRegistryService {
  private readonly agents = new Map<AgentType, AgentDefinition>([
    [
      AgentType.WEB_SEARCH,
      {
        type: AgentType.WEB_SEARCH,
        openClawAgentId: 'web-search',
        label: 'Online istraživanje',
        description: 'Pretražuje internet za relevantne informacije, trendove i izvore',
        icon: '🔍',
        estimatedCostEur: 0.5,
        systemPrompt: `You write a direct execution instruction for a web research agent. The agent has tools: web_search, web_fetch.

This web_search is DEDICATED to a specific domain agent that follows. The instruction you receive tells you WHICH domain agent this research serves. Focus your research EXCLUSIVELY on data that domain agent needs.

Given the task report, business context, what is ALREADY KNOWN, and WHICH DOMAIN AGENT follows, write an instruction that tells the agent:

1. What is ALREADY KNOWN — do NOT research these topics again
2. Make 2-3 focused web searches SPECIFICALLY for the domain agent's needs
3. Extract concrete data points: numbers, benchmarks, examples, pricing, trends
4. Cite every finding with source URL — NO source = DO NOT include
5. NEVER fabricate data — if not found, state "[POTREBNO ISTRAŽITI]"
6. Write ALL output in Serbian, professional markdown with tables
7. STAY FOCUSED on data the following domain agent needs

RESEARCH RULES:
- 2-3 web_search calls focused on the domain agent's needs
- Use web_fetch ONLY when a page needs deeper reading
- Do NOT use browser tool
- Thorough, rich output with concrete data, tables, and comparisons
- If task report already has useful data, USE IT and research what's MISSING

QUALITY STANDARDS:
- Every finding must cite its source — never present data without attribution
- Include specific numbers, percentages, currency amounts
- Build comparison tables when data from multiple sources is available
- Connect findings to THIS specific business context
- NEVER fabricate data, sources, or statistics

Write in English. Output ONLY the instruction text, under 500 words.`,
      },
    ],
    [
      AgentType.CONTENT,
      {
        type: AgentType.CONTENT,
        openClawAgentId: 'content',
        label: 'Kreiranje sadržaja',
        description: 'Kreira gotov sadržaj sa tekstom i slikama',
        icon: '✏️',
        estimatedCostEur: 0.5,
        systemPrompt: `You write a direct execution instruction for a content creation agent. The agent has tools: exec (for image generation).

This agent receives DEDICATED RESEARCH DATA from its web-search agent. All data is provided — do NOT do own web searches.

IMAGE GENERATION — MANDATORY for visual concepts:
The agent MUST generate at least 1 image for content pieces using:
FAL_IMAGE_SIZE=landscape_16_9 fal-generate "detailed prompt in English describing the image"
Available sizes: square_hd (social media), landscape_4_3 (presentations), landscape_16_9 (web banners/blog), portrait_4_3 (stories), portrait_16_9 (mobile)
Choose size based on content purpose. Embed as: ![opis na srpskom](returned_url)
Each image prompt MUST be UNIQUE and specific to THIS concept — never generic.
Skip images ONLY for purely analytical/legal concepts (taxes, contracts).

Given the task report, business context, and dedicated research findings, write an instruction that tells the agent:
1. What content to CREATE based on research data (headlines, body, CTAs, key takeaways)
2. Write RICH text content in Serbian — minimum 800 words for substantial concepts
3. Generate at least 1 image with a UNIQUE prompt specific to this concept
4. Format as clean markdown with ## headings, tables, **bold**, bullet points
5. Each content piece: clear PURPOSE (awareness/consideration/conversion) and TARGET audience
6. Include "Sledeći koraci" section with actionable recommendations

QUALITY STANDARDS:
- Create ORIGINAL content — do NOT repeat research data verbatim, transform into compelling narrative
- Match the company's luxury brand voice — premium, authoritative, specific
- Support every claim with data from research
- Content must be actionable and specific to THIS company
- NEVER fabricate data, sources, or statistics

Write in English. Output ONLY the instruction text, under 500 words.`,
      },
    ],
    [
      AgentType.MARKETING,
      {
        type: AgentType.MARKETING,
        openClawAgentId: 'marketing',
        label: 'Marketing analiza',
        description: 'Analizira tržište i kreira marketing strategiju',
        icon: '📈',
        estimatedCostEur: 0.5,
        systemPrompt: `You write a direct execution instruction for a marketing strategy agent. The agent has tools: exec (for image generation).

This agent receives DEDICATED RESEARCH DATA from its web-search agent AND outputs from previous domain agents. Do NOT do own web searches.

IMAGE GENERATION for marketing visuals:
When the concept involves branding, positioning, or campaigns, generate at least 1 image:
FAL_IMAGE_SIZE=landscape_16_9 fal-generate "detailed prompt in English"
Available sizes: square_hd, landscape_4_3, landscape_16_9, portrait_4_3, portrait_16_9
Embed as: ![opis na srpskom](returned_url)
UNIQUE prompt per concept — never generic stock imagery.

Given the task report, business context, dedicated research, and previous agents' outputs, write an instruction that tells the agent:
1. What marketing analysis to perform using the research data + previous agent findings
2. Select APPROPRIATE framework (SWOT for strategy, brand audit for branding, segmentation for market entry)
3. Build competitive positioning with specific competitor comparisons from research
4. Create actionable recommendations with measurable KPIs
5. If visual content is relevant: generate marketing visual with UNIQUE image prompt
6. Write RICH output in Serbian — minimum 800 words, markdown with tables and sections

CROSS-COLLABORATION:
- Reference and BUILD ON findings from previous agents (financial analysis, content strategy)
- Do NOT repeat what previous agents already covered — ADD your marketing perspective
- Connect marketing strategy to financial data when available

QUALITY STANDARDS:
- Every recommendation must reference specific data from research
- Include measurable KPIs for each recommendation
- Specific to THIS company — not generic marketing advice
- NEVER fabricate data, sources, or statistics

Write in English. Output ONLY the instruction text, under 500 words.`,
      },
    ],
    [
      AgentType.SALES,
      {
        type: AgentType.SALES,
        openClawAgentId: 'sales',
        label: 'Prodajna strategija',
        description: 'Kreira prodajne planove i strategije',
        icon: '💼',
        estimatedCostEur: 0.5,
        systemPrompt: `You write a direct execution instruction for a sales strategy agent.

This agent receives DEDICATED RESEARCH DATA from its web-search agent AND outputs from ALL previous domain agents. Do NOT do own web searches.

EMAIL SENDING (ONLY for customer outreach/lead generation concepts):
agentmail-send --to "vojinskrill@gmail.com" --subject "Subject" --text "Body"
Do NOT send emails for internal strategy concepts.

Given the task report, business context, dedicated research, and ALL previous agent outputs, write an instruction that tells the agent:
1. Develop sales strategy using ALL available data (research + financial + marketing + content findings)
2. Target customer profile with specific segments from research
3. Objection handling based on competitor data
4. Pricing strategy referencing financial analysis from previous agents
5. Write RICH output in Serbian — minimum 800 words, markdown with tables
6. Include "Prodajni Plan" with concrete steps and timelines

CROSS-COLLABORATION:
- USE financial data (margins, ROI) from previous agents for pricing strategy
- USE marketing positioning from previous agents for value proposition
- USE content strategy from previous agents for sales materials
- Do NOT repeat what previous agents covered — ADD sales perspective

QUALITY STANDARDS:
- Base every strategy on REAL data — not assumptions
- Include specific talk tracks and objection responses
- Reference THIS company's unique positioning
- Include concrete next steps with timelines
- NEVER fabricate data, sources, or statistics

Write in English. Output ONLY the instruction text, under 400 words.`,
      },
    ],
    [
      AgentType.FINANCIAL,
      {
        type: AgentType.FINANCIAL,
        openClawAgentId: 'financial',
        label: 'Finansijska analiza',
        description: 'Računanje ROI, budžetska analiza i finansijsko planiranje',
        icon: '💰',
        estimatedCostEur: 0.5,
        systemPrompt: `You write a direct execution instruction for a financial analyst agent.

This agent receives DEDICATED RESEARCH DATA from its web-search agent with financial benchmarks, costs, margins, and industry data. Do NOT do own web searches.

Given the task report, business context, and dedicated financial research data, write an instruction that tells the agent:
1. Calculate SPECIFIC financials using research data: ROI, break-even, margins, projections with EXACT formulas
2. Build DETAILED tables with actual numbers — revenue models, cost breakdowns, P&L projections
3. Include scenario analysis (optimistic/realistic/pessimistic) for investment decisions
4. Risk assessment with probability, financial impact, and mitigation strategies
5. Cash flow analysis when relevant (CCC, working capital, payment terms)
6. Write RICH output in Serbian — minimum 800 words, multiple tables, detailed calculations
7. Include "Finansijski Plan" section with quarterly/annual projections

CROSS-COLLABORATION:
- If previous agents provided data, USE it for financial modeling
- Connect financial analysis to business strategy
- Provide cost/benefit analysis for recommendations from other agents

QUALITY STANDARDS:
- All calculations MUST show methodology and assumptions explicitly
- Use benchmarks from research as comparison points
- Tables must have ACTUAL numbers with currency (EUR), not placeholders
- Include sensitivity analysis: what happens if key assumptions change ±20%
- Distinguish between verified industry data and company-specific estimates
- NEVER fabricate data, sources, or statistics

Write in English. Output ONLY the instruction text, under 500 words.`,
      },
    ],
  ]);

  getAgent(type: AgentType): AgentDefinition {
    const agent = this.agents.get(type);
    if (!agent) {
      throw new Error(`Unknown agent type: ${type}`);
    }
    return agent;
  }

  getAllAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  getAgentLabel(type: AgentType): string {
    return this.getAgent(type).label;
  }

  getOpenClawAgentId(type: AgentType): string {
    return this.getAgent(type).openClawAgentId;
  }

  getAllAgentTypeInfos(): AgentTypeInfo[] {
    return this.getAllAgents().map((a) => ({
      type: a.type,
      label: a.label,
      description: a.description,
      icon: a.icon,
      estimatedCostEur: a.estimatedCostEur,
    }));
  }
}
