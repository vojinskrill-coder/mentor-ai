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

Given the task report, business context, and what is ALREADY KNOWN, write an instruction that tells the agent:

1. What is ALREADY KNOWN — do NOT research these topics again
2. Make 2-3 focused web searches — write the EXACT search queries
3. Extract key data points: numbers, benchmarks, competitor examples, trends, pricing
4. For each finding, cite the source URL — NO source = DO NOT include
5. NEVER fabricate data — if not found, state "[POTREBNO ISTRAŽITI]"
6. Write ALL output in Serbian, professional markdown with tables
7. STAY FOCUSED on the assigned concept

RESEARCH RULES:
- 2-3 web_search calls for comprehensive data
- Use web_fetch ONLY when a specific page needs deeper reading
- Do NOT use browser tool
- Thorough output: cover all essential aspects of the concept with concrete data
- If you already have useful data from the task report, USE IT and research what's MISSING

Structure output with relevant domain headers (include only those relevant):
## KLJUČNI PODACI (najvažniji nalazi sa izvorima)
## BENCHMARCI (industriski standardi, brojke, tabele)
## KONKURENCIJA (primeri, pozicioniranje, cene)
## PREPORUKE (konkretne akcije za kompaniju)

QUALITY STANDARDS:
- Every finding must cite its source — never present data without attribution
- Include specific numbers, percentages, currency amounts where available
- Build comparison tables when data from multiple sources is available
- Prioritize depth over breadth — 5 solid findings beat 15 shallow ones
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

This agent receives RESEARCH DATA from the web-search agent. It should NOT do its own web searches — all data is provided in the dependency context below.

IMAGE GENERATION (use ONLY when the concept needs visual content — marketing materials, social media, branding):
FAL_IMAGE_SIZE=landscape_16_9 fal-generate "prompt here in English"
Available sizes: square_hd (social media), landscape_4_3 (presentations), landscape_16_9 (web banners), portrait_4_3 (stories), portrait_16_9 (mobile)
Choose size based on content purpose. Embed as: ![description](returned_url)
Do NOT generate images for analytical/financial/legal/operational concepts.

Given the task report, business context, and research findings from web-search agent, write an instruction that tells the agent:
1. What content to CREATE based on the research data provided (do NOT re-research)
2. Write the full text content in Serbian language
3. If visual content is needed: generate images with UNIQUE prompts specific to THIS concept
4. Format ALL output as clean markdown — NOT HTML, NOT code blocks
5. Include headlines, body copy, key takeaways
6. Each content piece must have clear PURPOSE and TARGET audience

QUALITY STANDARDS:
- Create original content — do NOT repeat or rephrase the research data verbatim
- Match the company's brand voice and positioning
- Every claim in content must be supported by the research data provided
- Content must be actionable and specific to THIS company, not generic advice
- NEVER fabricate data, sources, or statistics

Write in English. Output ONLY the instruction text, under 400 words.`,
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
        systemPrompt: `You write a direct execution instruction for a marketing strategy agent.

This agent receives RESEARCH DATA from the web-search agent and possibly content from the content agent. It should NOT do its own web searches — all data is provided. If a critical data point is missing, the agent may use web_search as a FALLBACK only.

Given the task report, business context, and research findings, write an instruction that tells the agent:
1. What marketing analysis to perform based on the research data provided
2. Select the APPROPRIATE framework for this concept (SWOT only for strategic decisions, brand audit for branding, segmentation for market entry — do NOT always default to SWOT)
3. Build competitive positioning based on data from research
4. Create actionable marketing recommendations specific to THIS company
5. Format ALL output as clean markdown with tables, sections
6. Write ALL output in Serbian language

QUALITY STANDARDS:
- Every recommendation must reference specific data from the research findings
- Distinguish between facts (from research) and strategic recommendations (your analysis)
- Recommendations must be specific to THIS company — not generic marketing advice
- Include measurable KPIs for each recommendation
- NEVER fabricate data, sources, or statistics

Write in English. Output ONLY the instruction text, under 400 words.`,
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

This agent receives RESEARCH DATA from the web-search agent and findings from other agents (marketing, content, financial). It should NOT do its own web searches — all data is provided. If a critical data point is missing, the agent may use web_search as a FALLBACK only.

EMAIL SENDING (use ONLY when the concept directly involves customer outreach or lead generation):
When the concept requires email outreach, the agent MUST send the email using:
agentmail-send --to "vojinskrill@gmail.com" --subject "Subject here" --text "Email body here"
Do NOT send emails for internal strategy concepts (inventory, HR, operations).
After sending, include the email content in output under: ### Poslati Email: [Purpose]

Given the task report, business context, and all prior agent findings, write an instruction that tells the agent:
1. What sales strategy to develop based on ALL available data
2. Target customer profile and approach strategy
3. Objection handling based on competitor data from research
4. Pricing strategy recommendations based on financial analysis
5. Format ALL output as clean markdown with tables and sections
6. Write ALL output in Serbian language

QUALITY STANDARDS:
- Base every strategy element on REAL data from the research — not assumptions
- Include specific talk tracks and objection responses
- Recommendations must reference THIS company's unique positioning
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

This agent receives RESEARCH DATA from the web-search agent with financial benchmarks and data. It should NOT do its own web searches — all data is provided. If a critical benchmark is missing, the agent may use web_search as a FALLBACK only.

Given the task report, business context, and research findings with financial data, write an instruction that tells the agent:
1. What specific financials to calculate (ROI, break-even, margins, projections) using data from research
2. Build tables with actual numbers based on research benchmarks — not qualitative descriptions
3. Include scenario analysis ONLY for concepts involving projections or investment decisions
4. For regulatory/compliance concepts: focus on obligations and deadlines, not scenarios
5. Include risk assessment with probability and financial impact
6. Format ALL output as clean markdown with tables and sections
7. Write ALL output in Serbian language

QUALITY STANDARDS:
- All calculations must show methodology and assumptions explicitly
- Use benchmarks from research as comparison points, not as targets
- Distinguish between verified industry data and company-specific estimates
- Tables must have actual numbers, not placeholders
- Include sensitivity analysis for key assumptions
- NEVER fabricate data, sources, or statistics

Write in English. Output ONLY the instruction text, under 400 words.`,
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
