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
  private static readonly IMAGE_GENERATION_INSTRUCTIONS = `
IMAGE GENERATION — CRITICAL RULES:
1. ALWAYS generate NEW images — NEVER reference, reuse, or describe images from memory
2. Generate as many images as the task REQUIRES
3. For EACH image, write it as markdown image syntax with a detailed English description as alt text:
   ![Detailed English description of the image: scene, lighting, composition, style, mood, branded elements](https://placeholder.img/generate)
4. The alt text MUST be:
   - In ENGLISH (used as generation prompt)
   - UNIQUE and SPECIFIC to THIS content
   - CONTEXTUAL: include purpose (hero banner, social post, brochure page, infographic)
   - BRANDED: include company visual identity
   - DETAILED: 30+ words describing the exact visual
5. NEVER write "[Generate image]" or "[FAL.ai]" — ALWAYS use ![description](url) markdown format
6. Images will be automatically generated from your alt text descriptions — just write the markdown`;

  private static readonly RESEARCH_USAGE_INSTRUCTIONS = `
YOU WILL RECEIVE pre-researched web data in a "WEB RESEARCH RESULTS" section.
CRITICAL RULES FOR USING RESEARCH DATA:
1. You MUST use the provided research data as your PRIMARY source of facts
2. CITE every fact with its source: ([Title](URL)) — inline, right after the sentence
3. Build your analysis ON TOP of the research data — do NOT ignore it
4. Do NOT claim "no data available" — the research section ALWAYS contains relevant information
5. Do NOT fabricate data — use ONLY what is provided in research + your analytical reasoning
6. NEVER write "[NEEDS RESEARCH]" or "[NEEDS ADDITIONAL RESEARCH]" — all research is ALREADY PROVIDED. If a specific data point is missing, make a reasonable analytical inference based on available data and state your assumption
7. Write ALL output in English, professional markdown with tables`;

  private readonly agents = new Map<AgentType, AgentDefinition>([
    [
      AgentType.WEB_SEARCH,
      {
        type: AgentType.WEB_SEARCH,
        openClawAgentId: 'web-search',
        label: 'Online research',
        description: 'Searches the internet for relevant information, trends, and sources',
        icon: '🔍',
        estimatedCostEur: 0.5,
        systemPrompt: `You write a direct execution instruction for a web research agent. The agent has tools: web_search, web_fetch.
${AgentRegistryService.RESEARCH_USAGE_INSTRUCTIONS}
Write in English. Output ONLY the instruction text.`,
      },
    ],
    [
      AgentType.CONTENT,
      {
        type: AgentType.CONTENT,
        openClawAgentId: 'content',
        label: 'Content creation',
        description: 'Creates finished content with text and images',
        icon: '✏️',
        estimatedCostEur: 0.5,
        systemPrompt: `You write a direct execution instruction for a content creation agent. Images are generated automatically from markdown ![description](url) syntax — the agent just writes the markdown.

The agent receives pre-researched web data — DO NOT do own web searches. Use provided data as primary source.
${AgentRegistryService.RESEARCH_USAGE_INSTRUCTIONS}
${AgentRegistryService.IMAGE_GENERATION_INSTRUCTIONS}

Given the task report, business context, and previous agents' outputs, write an instruction that tells the agent:
1. USE the provided web research data as your primary source of facts and data
2. Create content based on research (headlines, body, CTAs, key takeaways)
3. Write RICH text content in English — 4000-5000 words. CRITICAL: you MUST complete the entire document — finish every section, every table, every sentence. NEVER stop mid-sentence or mid-table. End with a clear conclusion
4. Generate AS MANY images as the task requires — match the number of visuals to the content needs:
   - If task asks for specific visuals (brochure pages, social posts, portfolio) — create EACH ONE
   - If task is analytical — 1-2 supporting visuals are enough
   - Each image MUST depict exactly what is described — NOT generic stock imagery
5. SPECIFY in your instruction what EACH image should show based on the ACTUAL task content, and what SIZE to use (blog=landscape_16_9, social=square_hd, brochure=landscape_4_3, story=portrait_4_3)
6. Format as clean markdown with ## headings, tables, **bold**, bullet points
7. Include "Next Steps" section with actionable recommendations

CROSS-COLLABORATION:
- If previous agents provided data, USE it — do NOT repeat, ADD content perspective

QUALITY STANDARDS:
- Create ORIGINAL content, support claims with research data
- Specific to THIS company — not generic advice
- NEVER fabricate data, sources, or statistics
- ALL images must be freshly generated — NEVER reuse from memory

Write in English. Output ONLY the instruction text, under 600 words.`,
      },
    ],
    [
      AgentType.MARKETING,
      {
        type: AgentType.MARKETING,
        openClawAgentId: 'marketing',
        label: 'Marketing analysis',
        description: 'Analyzes the market and creates marketing strategy',
        icon: '📈',
        estimatedCostEur: 0.5,
        systemPrompt: `You write a direct execution instruction for a marketing strategy agent. The agent has tools: exec (for image generation).

The agent receives pre-researched web data — DO NOT do own web searches. Use provided data as primary source.
${AgentRegistryService.RESEARCH_USAGE_INSTRUCTIONS}
${AgentRegistryService.IMAGE_GENERATION_INSTRUCTIONS}

Given the task report, business context, and previous agents' outputs, write an instruction that tells the agent:
1. USE the provided web research data for market data, competitors, trends
2. Perform marketing analysis using research + previous agent findings
3. Select APPROPRIATE framework (SWOT, brand audit, segmentation)
4. Build competitive positioning with specific competitor comparisons
5. Create actionable recommendations with measurable KPIs
6. If visual content is relevant: generate marketing visual
7. Write RICH output in English — 4000-5000 words. CRITICAL: you MUST complete the entire document — finish every section, every table, every sentence. NEVER stop mid-sentence or mid-table. End with a clear conclusion, markdown with tables

CROSS-COLLABORATION:
- Reference and BUILD ON findings from previous agents
- Do NOT repeat what previous agents covered — ADD marketing perspective
- Connect marketing strategy to financial data when available

QUALITY STANDARDS:
- Every recommendation must reference specific data from research
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
        label: 'Sales strategy',
        description: 'Creates sales plans and strategies',
        icon: '💼',
        estimatedCostEur: 0.5,
        systemPrompt: `You write a direct execution instruction for a sales strategy agent. The agent receives pre-researched web data — DO NOT do own web searches. Use provided data as primary source.
${AgentRegistryService.RESEARCH_USAGE_INSTRUCTIONS}

IMPORTANT: Do NOT send emails. Do NOT use agentmail-send. Only produce text output.

Given the task report, business context, and ALL previous agent outputs, write an instruction that tells the agent:
1. USE the provided web research data for sales data, trust building, B2B strategies
2. Develop sales strategy using research + previous agents' data
3. Target customer profile with specific segments
4. Objection handling based on competitor data
5. Pricing strategy referencing financial analysis from previous agents
6. Write RICH output in English — 4000-5000 words. CRITICAL: you MUST complete the entire document — finish every section, every table, every sentence. NEVER stop mid-sentence or mid-table. End with a clear conclusion, markdown with tables
7. Include "Prodajni Plan" with concrete steps and timelines

CROSS-COLLABORATION:
- USE financial data, marketing positioning, content from previous agents
- Do NOT repeat — ADD sales perspective

QUALITY STANDARDS:
- Include specific talk tracks and objection responses
- Reference THIS company's unique positioning
- NEVER fabricate data, sources, or statistics

Write in English. Output ONLY the instruction text, under 400 words.`,
      },
    ],
    [
      AgentType.FINANCIAL,
      {
        type: AgentType.FINANCIAL,
        openClawAgentId: 'financial',
        label: 'Financial analysis',
        description: 'ROI calculation, budget analysis and financial planning',
        icon: '💰',
        estimatedCostEur: 0.5,
        systemPrompt: `You write a direct execution instruction for a financial analyst agent. The agent receives pre-researched web data — DO NOT do own web searches. Use provided data as primary source.
${AgentRegistryService.RESEARCH_USAGE_INSTRUCTIONS}

Given the task report, business context, and previous agents' outputs, write an instruction that tells the agent:
1. USE the provided web research data for financial benchmarks, costs, margins, industry data
2. Calculate SPECIFIC financials: ROI, break-even, margins, projections with EXACT formulas
3. Build DETAILED tables with actual numbers — revenue models, cost breakdowns, P&L
4. Include scenario analysis (optimistic/realistic/pessimistic)
5. Risk assessment with probability, financial impact, mitigation
6. Cash flow analysis when relevant (CCC, working capital, payment terms)
7. Write RICH output in English — 4000-5000 words. CRITICAL: you MUST complete the entire document — finish every section, every table, every sentence. NEVER stop mid-sentence or mid-table. End with a clear conclusion, multiple tables
8. Include "Finansijski Plan" with quarterly/annual projections

CROSS-COLLABORATION:
- If previous agents provided data, USE it for financial modeling
- Provide cost/benefit analysis for recommendations from other agents

QUALITY STANDARDS:
- All calculations MUST show methodology and assumptions
- Tables must have ACTUAL numbers with currency (EUR), not placeholders
- Include sensitivity analysis: +-20% on key assumptions
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
