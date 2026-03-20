import { Injectable, Logger } from '@nestjs/common';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { AgentRegistryService } from './agent-registry.service';
import { AgentType, ChatMessage } from '@mentor-ai/shared/types';

@Injectable()
export class AgentPromptService {
  private readonly logger = new Logger(AgentPromptService.name);

  constructor(
    private readonly aiGateway: AiGatewayService,
    private readonly registry: AgentRegistryService
  ) {}

  /**
   * Generates a contextualized, high-quality prompt for an OpenClaw agent.
   * Uses LLM to read the report, understand context, and produce a SPECIFIC
   * instruction tailored to this concept, company, and agent type.
   *
   * Injects: pre-check context (what's already known), dependency context,
   * business context (auto-injected by AiGateway), and agent system prompt.
   */
  async formatPrompt(params: {
    agentType: AgentType;
    taskTitle: string;
    taskContent: string;
    userReport: string;
    expectedOutcome?: string | null;
    preCheckContext?: string | null;
    tenantId: string;
    userId: string;
    onChunk?: (chunk: string) => void;
  }): Promise<string> {
    const { agentType, taskTitle, taskContent, userReport, expectedOutcome, preCheckContext,
            tenantId, userId } = params;

    const agentDef = this.registry.getAgent(agentType);

    const userMessage = `Task: ${taskTitle}

Description: ${taskContent}

${expectedOutcome ? `Expected Outcome: ${expectedOutcome}\n` : ''}${preCheckContext ? `\n--- WHAT IS ALREADY KNOWN (from business brain) ---\n${preCheckContext}\n--- END OF KNOWN CONTEXT ---\nDo NOT research topics that are already known. Focus on what is NEW and MISSING.\n` : ''}
User's Completed Report:
${userReport.substring(0, 4000)}

Based on this task report, the business context from memories, and what is already known, generate a SPECIFIC, ACTIONABLE execution instruction for the ${agentDef.label} agent.

INSTRUCTION QUALITY REQUIREMENTS:
- Extract SPECIFIC data points from the report: company names, numbers, percentages, dates
- Tell the agent EXACTLY what to research/create/calculate — not generic instructions
- Reference what is ALREADY KNOWN and tell the agent to SKIP those topics
- Tell the agent what NEW information to discover or produce
- The instruction must be actionable — the agent should ACT immediately, not plan or analyze
- Include specific search queries, calculation formulas, or content topics as needed
- The instruction is for ${agentDef.label} — tailor it to that agent's specialty`;

    const messages: ChatMessage[] = [
      { role: 'system', content: agentDef.systemPrompt },
      { role: 'user', content: userMessage },
    ];

    let result = '';
    await this.aiGateway.streamCompletionWithContext(
      messages,
      {
        tenantId,
        userId,
        skipRateLimit: true,
        skipQuotaCheck: true,
      },
      (chunk) => {
        result += chunk;
        params.onChunk?.(chunk);
      }
    );

    // Append grounding block (always present, not left to LLM generation)
    const memoryBlock = `

---
KRITIČNO — UZEMLJENJE:
- Radi ISKLJUČIVO na zadatku opisanom iznad. NE širi se na druge teme.
- NIKADA ne izmišljaj podatke, izvore ili statistike. Ako ne možeš pronaći podatak, napiši "[POTREBNO ISTRAŽITI]".
- Svaki nalaz MORA imati izvor (URL). Bez izvora = ne uključuj u rezultat.
- NE ponavljaj generičke poslovne savete — samo SPECIFIČNE nalaze za ovu kompaniju i ovaj koncept.
- Ako imaš prethodno iskustvo i memoriju o ovoj kompaniji — iskoristi to znanje. Nadogradi na postojeće nalaze.
- Ako je ovo tvoj prvi zadatak — istraži temeljno od početka.

FORMAT IZLAZA: Profesionalan Markdown (## zaglavlja, tabele, **bold** za ključne vrednosti, > za izvore sa URL-ovima). SVE na srpskom jeziku. NE objašnjavaj šta ćeš raditi — odmah piši rezultat.
---`;

    const finalPrompt = result.trim() + memoryBlock;

    this.logger.log({
      message: 'Prompt formatted for agent (LLM contextualized)',
      agentType,
      taskTitle,
      hasPreCheck: !!preCheckContext,
      instructionLength: finalPrompt.length,
    });

    return finalPrompt;
  }
}
