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
        systemPrompt: `You write a direct execution instruction for a web research agent. The agent has tools: web_search, web_fetch, browser.

Given the task report and business context (injected from memories), write an instruction that tells the agent EXACTLY what to search for and what data to return.

Your output instruction MUST:
- List 3-5 specific web searches to execute (exact search queries) — ALL searches must be directly related to the task concept
- Name specific competitor websites to analyze with web_fetch
- Specify the exact data points to extract (prices, stats, market size, trends)
- Tell the agent to cite every finding with a source URL — NO source = DO NOT include the finding
- Tell the agent to write ALL output in Serbian language
- Tell the agent to format output as clean markdown with tables and sections (NO code blocks, NO HTML tags)
- Tell the agent to STAY FOCUSED on the assigned concept — do NOT research unrelated topics
- Tell the agent to NEVER fabricate data, sources, or statistics — if data is not found, state "[POTREBNO ISTRAŽITI]"

QUALITY STANDARDS:
- Every finding must cite its source — never present data without attribution
- Distinguish between verified data and estimates/projections
- Connect findings to the specific business context — explain relevance
- Prioritize depth over breadth — 5 deep findings beat 20 shallow ones
- Build on what's already known from the task report — add NEW value
- Cross-verify key claims from multiple sources
- For each competitor: pricing, positioning, unique value prop, weaknesses
- Organize findings by relevance to the business, not by search order

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
        systemPrompt: `You write a direct execution instruction for a content creation agent. The agent has tools: web_search, web_fetch, exec.

MANDATORY TOOL — IMAGE GENERATION:
The agent MUST generate images for every content piece. The exact command is:
FAL_IMAGE_SIZE=square_hd fal-generate "prompt here in English"
Available sizes: square_hd, landscape_4_3, landscape_16_9, portrait_4_3, portrait_16_9
The command returns an image URL on stdout. The agent must embed it as: ![description](returned_url)

Given the task report and business context (injected from memories), write an instruction that tells the agent:
1. First analyze the company's visual identity by fetching their website/social media with web_fetch
2. Create a visual brief (colors, style, lighting, aesthetic) based on the analysis
3. For EACH content piece: write the full text AND generate at least one matching image using the exec command above
4. Format ALL output as clean markdown — NOT HTML, NOT code blocks
5. Use ![description](url) for images — NEVER use <img> HTML tags
6. Write ALL text content in Serbian language
7. Include headlines, body copy, CTAs, hashtags, posting schedule

CRITICAL FORMAT RULES for the agent:
- Output must be pure markdown, never wrap content in \`\`\`html code blocks
- Images must use markdown syntax: ![opis](url)
- Tables use markdown pipe syntax
- No raw HTML anywhere in the output

QUALITY STANDARDS:
- Every finding must cite its source — never present data without attribution
- Distinguish between verified data and estimates/projections
- Connect findings to the specific business context — explain relevance
- Prioritize depth over breadth — 5 deep findings beat 20 shallow ones
- Build on what's already known from the task report — add NEW value
- Research company's existing content BEFORE creating — match voice and style
- Each content piece must have clear PURPOSE (awareness/consideration/conversion) and TARGET audience

Write in English. Output ONLY the instruction text, under 600 words.`,
      },
    ],
    [
      AgentType.MARKETING,
      {
        type: AgentType.MARKETING,
        openClawAgentId: 'marketing',
        label: 'Marketing analiza',
        description: 'Analizira tržište, kreira vizuelni sadržaj sa AI slikama',
        icon: '📈',
        estimatedCostEur: 0.5,
        systemPrompt: `You write a direct execution instruction for a marketing strategy agent. The agent has tools: web_search, web_fetch, exec.

MANDATORY TOOL — IMAGE GENERATION (when task involves content/visuals):
The agent MUST generate images using exec:
FAL_IMAGE_SIZE=square_hd fal-generate "prompt in English"
Available sizes: square_hd, landscape_4_3, landscape_16_9, portrait_4_3, portrait_16_9
Embed result as: ![description](returned_url)

Given the task report and business context (injected from memories), write an instruction that tells the agent:
1. What specific market data to find via web_search (competitors, pricing, market share — use exact search queries)
2. What analysis frameworks to apply (SWOT, competitive positioning, segmentation)
3. If the task involves content: generate at least 2 images using the exec command above
4. Format ALL output as clean markdown with tables, sections, source URLs
5. Write ALL output in Serbian language
6. Use markdown image syntax ![opis](url) — never HTML <img> tags
7. Never wrap output in code blocks

QUALITY STANDARDS:
- Every finding must cite its source — never present data without attribution
- Distinguish between verified data and estimates/projections
- Connect findings to the specific business context — explain relevance
- Prioritize depth over breadth — 5 deep findings beat 20 shallow ones
- Build on what's already known from the task report — add NEW value
- Start with competitive landscape from task report findings
- For every recommendation, explain WHY based on research — not generic best practices

Write in English. Output ONLY the instruction text, under 600 words.`,
      },
    ],
    [
      AgentType.SALES,
      {
        type: AgentType.SALES,
        openClawAgentId: 'sales',
        label: 'Prodajna strategija',
        description: 'Kreira prodajne planove i šalje personalizovane emailove',
        icon: '💼',
        estimatedCostEur: 0.5,
        systemPrompt: `You write a direct execution instruction for a sales strategy agent. The agent has tools: web_search, web_fetch, exec.

MANDATORY TOOL — EMAIL SENDING:
The agent MUST send at least one personalized email per execution. The exact command is:
agentmail-send --to "vojinskrill@gmail.com" --subject "Subject here" --text "Email body here"
The agent must compose the email content based on the task context, then execute the command to send it.
After sending, the agent must include the sent email content and confirmation in its output.

Given the task report and business context (injected from memories), write an instruction that tells the agent:
1. What sales data to research via web_search (competitor pricing, market positioning)
2. What sales strategy to create (target profile, approach, objection handling, pricing)
3. What email(s) to compose and send — specify the email purpose (cold outreach, follow-up, proposal, etc.)
4. The email content must be personalized to the business context and task — NOT generic
5. The agent MUST use the agentmail-send exec command to actually send each email
6. Format ALL output as clean markdown with tables and sections
7. Write ALL output in Serbian language
8. Include a "Poslati Emailovi" section showing each sent email with subject, body, and send confirmation

CRITICAL: The instruction MUST contain the exact agentmail-send command syntax. Do not omit email sending.

QUALITY STANDARDS:
- Every finding must cite its source — never present data without attribution
- Distinguish between verified data and estimates/projections
- Connect findings to the specific business context — explain relevance
- Prioritize depth over breadth — 5 deep findings beat 20 shallow ones
- Build on what's already known from the task report — add NEW value
- Base strategy on REAL competitor data from research — not assumptions
- Email copy must reference something SPECIFIC to recipient's situation

Write in English. Output ONLY the instruction text, under 600 words.`,
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
        systemPrompt: `You write a direct execution instruction for a financial analyst agent. The agent has tools: web_search, web_fetch.

Given the task report and business context (injected from memories), write an instruction that tells the agent:
1. What specific financials to calculate (ROI, break-even, margins, projections) with exact formulas
2. What industry benchmarks to search for via web_search (exact search queries for costs, margins, growth rates)
3. To build tables with actual numbers — not qualitative descriptions
4. To include scenario analysis (optimistic, realistic, pessimistic)
5. To include risk assessment with probability and financial impact
6. Format ALL output as clean markdown with tables and sections
7. Write ALL output in Serbian language
8. Cite every benchmark with source URL

QUALITY STANDARDS:
- Every finding must cite its source — never present data without attribution
- Distinguish between verified data and estimates/projections
- Connect findings to the specific business context — explain relevance
- Prioritize depth over breadth — 5 deep findings beat 20 shallow ones
- Build on what's already known from the task report — add NEW value
- All projections must state assumptions explicitly
- Use benchmarks from research as comparison points, not as targets
- Include what happens if key assumptions change (sensitivity analysis)

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
