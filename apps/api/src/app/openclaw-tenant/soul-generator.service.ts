import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import type { ChatMessage } from '@mentor-ai/shared/types';
import type { BusinessProfile } from './business-profile.service';

export interface GeneratedSouls {
  main: string;
  financial: string;
  marketing: string;
  content: string;
  sales: string;
  research: string;
  designer: string;
  dev: string;
}

const AGENT_ROLES: Record<keyof GeneratedSouls, { title: string; focus: string }> = {
  main: {
    title: 'Chief Business Advisor (CEO perspective)',
    focus: 'Knows the entire business, makes strategic decisions, coordinates all aspects. Understands market, clients, products, and finances.',
  },
  financial: {
    title: 'Chief Financial Officer',
    focus: 'Specialized in financial analysis, ROI calculations, budgeting, cash flow, break-even analysis, and financial projections.',
  },
  marketing: {
    title: 'Chief Marketing Officer',
    focus: 'Specialized in brand strategy, digital marketing, content planning, SEO, social media, positioning, and visual identity.',
  },
  content: {
    title: 'Creative Director',
    focus: 'Specialized in creating visual content, copywriting, brochures, presentations, social media content. Uses MiniMax for image generation.',
  },
  sales: {
    title: 'Sales Director',
    focus: 'Specialized in sales strategies, CRM, lead generation, objection handling, pricing strategies, and relationship building.',
  },
  research: {
    title: 'Research Analyst',
    focus: 'Specialized in market research, competitive analysis, industry trends, data gathering, and insights synthesis using web search.',
  },
  designer: {
    title: 'Design Director',
    focus: 'Specialized in visual design, brand identity, UI/UX, presentation design, and visual communication. Uses MiniMax for image generation.',
  },
  dev: {
    title: 'Technology Advisor',
    focus: 'Specialized in technology strategy, system architecture, tool selection, automation, and digital transformation.',
  },
};

@Injectable()
export class SoulGeneratorService {
  private readonly logger = new Logger(SoulGeneratorService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly aiGateway: AiGatewayService,
  ) {}

  /**
   * Generate SOUL.MD content for all 8 domain agents based on the business profile.
   * Each SOUL.MD is in English and customized to the specific business.
   */
  async generateAllSouls(profile: BusinessProfile): Promise<GeneratedSouls> {
    this.logger.log({ message: 'Generating SOUL.MD files for all agents', company: profile.companyName });

    const agentTypes = Object.keys(AGENT_ROLES) as Array<keyof GeneratedSouls>;
    const results = await Promise.all(
      agentTypes.map(agentType => this.generateSoul(agentType, profile))
    );

    const souls = {} as GeneratedSouls;
    for (let i = 0; i < agentTypes.length; i++) {
      souls[agentTypes[i]!] = results[i]!;
    }

    this.logger.log({
      message: 'All SOUL.MD files generated',
      company: profile.companyName,
      sizes: Object.fromEntries(agentTypes.map((t, i) => [t, results[i]!.length])),
    });

    return souls;
  }

  private async generateSoul(agentType: keyof GeneratedSouls, profile: BusinessProfile): Promise<string> {
    const role = AGENT_ROLES[agentType]!;

    const prompt = `Generate a SOUL.MD file for an AI agent in ENGLISH.

AGENT ROLE: ${role.title}
AGENT FOCUS: ${role.focus}

BUSINESS PROFILE:
- Company: ${profile.companyName}
- Industry: ${profile.industry}
- Description: ${profile.description}
- Products: ${Array.isArray(profile.products) ? profile.products.join(', ') : String(profile.products || 'N/A')}
- Services: ${Array.isArray(profile.services) ? profile.services.join(', ') : String(profile.services || 'N/A')}
- Target Clients: ${Array.isArray(profile.targetClients) ? profile.targetClients.join(', ') : String(profile.targetClients || 'N/A')}
- Geography: ${profile.geography}
- Brand Voice: ${profile.brandVoice}
- Competitors: ${Array.isArray(profile.competitors) ? profile.competitors.join(', ') : String(profile.competitors || 'N/A')}
- Unique Value: ${profile.uniqueValue}
- Price Range: ${profile.priceRange}
- Team: ${profile.teamDescription}
- Visual Style: ${profile.visualStyle}

CONTEXT:
${profile.rawSummary}

CRITICAL: This SOUL.MD is for ${profile.companyName} ONLY. Do NOT reference any other company's branding, colors, or products.

Write the SOUL.MD with these sections:
1. # Identity — agent's identity and role within ${profile.companyName}
2. ## Expertise — specific domain knowledge for this business and industry
3. ## Methodology — working approach, tools, research methods
4. ## About ${profile.companyName} — detailed business context, products, market position
5. ## Target Audience — customer understanding for this specific business
6. ## Brand Guidelines — visual identity, tone, style (ONLY for ${profile.companyName}, no other company)
7. ## Rules:
   - ALL web searches must be in ENGLISH
   - ALL output must be in ENGLISH
   - Use markdown formatting with tables where appropriate
   - NEVER fabricate data — use only verified sources with citations
   - NEVER reference other companies' branding or visual identity
   - Every claim must be cited with a source when available
   - Use MiniMax for image generation when needed (NOT FAL.ai)

Return ONLY the SOUL.MD content. Make it specific to ${profile.companyName} — between 500-1000 words.`;

    try {
      let responseText = '';
      await this.aiGateway.streamCompletionWithContext(
        [{ role: 'user', content: prompt } as ChatMessage],
        {
          tenantId: 'system',
          userId: 'system',
          conversationId: `soul-gen-${agentType}`,
          skipRateLimit: true,
          skipQuotaCheck: true,
          useFallback: true,
        },
        (chunk: string) => { responseText += chunk; },
      );

      this.logger.log({
        message: `SOUL.MD generated for ${agentType}`,
        chars: responseText.length,
        company: profile.companyName,
      });

      return responseText || this.getFallbackSoul(agentType, profile);
    } catch (error) {
      this.logger.error({
        message: `SOUL.MD generation failed for ${agentType}`,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return this.getFallbackSoul(agentType, profile);
    }
  }

  private getFallbackSoul(agentType: keyof GeneratedSouls, profile: BusinessProfile): string {
    const role = AGENT_ROLES[agentType]!;
    return `# ${role.title} — ${profile.companyName}

I am the ${role.title} for ${profile.companyName}.

## Expertise
${role.focus}

## About ${profile.companyName}
${profile.description}
- Industry: ${profile.industry}
- Products: ${Array.isArray(profile.products) ? profile.products.join(', ') : String(profile.products || 'N/A')}
- Services: ${Array.isArray(profile.services) ? profile.services.join(', ') : String(profile.services || 'N/A')}
- Target Clients: ${Array.isArray(profile.targetClients) ? profile.targetClients.join(', ') : String(profile.targetClients || 'N/A')}

## Rules
- ALL searches in ENGLISH
- ALL output in ENGLISH
- Use markdown formatting with tables
- NEVER fabricate data — use only verified sources
- NEVER reference other companies' branding or products
- This agent works ONLY for ${profile.companyName}
`;
  }
}
