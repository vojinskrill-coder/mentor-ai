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
   * Generates a per-agent-type prompt for the OpenClaw agent.
   * Uses AiGatewayService which automatically injects tenant memories
   * (company name, industry, brand, goals, style, target audience).
   */
  async formatPrompt(params: {
    agentType: AgentType;
    taskTitle: string;
    taskContent: string;
    userReport: string;
    expectedOutcome?: string | null;
    tenantId: string;
    userId: string;
    onChunk?: (chunk: string) => void;
  }): Promise<string> {
    const { agentType, taskTitle, taskContent, userReport, expectedOutcome, tenantId, userId } =
      params;

    const agentDef = this.registry.getAgent(agentType);

    const userMessage = `Task: ${taskTitle}

Description: ${taskContent}

${expectedOutcome ? `Expected Outcome: ${expectedOutcome}\n` : ''}User's Completed Report:
${userReport.substring(0, 3000)}

Based on this task report and the business context from memories, generate a direct execution instruction for the ${agentDef.label} agent.

INSTRUCTION QUALITY REQUIREMENTS:
- Identify the KEY FINDINGS from the report that this agent should build upon — don't repeat analysis, ADD NEW VALUE
- Reference specific companies, products, numbers from the report
- Tell the agent what is ALREADY KNOWN (from the report) and what NEW information to discover or produce
- The instruction must be actionable — the agent should ACT on this, execute its tools, produce deliverables, and return results. Not analyze or plan.`;

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

    // Programmatically append memory instruction + format requirements
    // (not left to LLM generation — guarantees it's always present)
    const memoryBlock = `

---
NAPOMENA O KONTEKSTU:
Ako imaš prethodno iskustvo i memoriju o ovoj kompaniji iz ranijih istraživanja — iskoristi to znanje. Nadogradi na postojeće nalaze, ne ponavljaj već istraženo.
Ako je ovo tvoj prvi zadatak za ovu kompaniju — istraži temeljno od početka koristeći web_search i web_fetch.

FORMAT IZLAZA: Profesionalan Markdown (## zaglavlja, tabele, **bold** za ključne vrednosti, > za izvore sa URL-ovima). SVE na srpskom jeziku. NE objašnjavaj šta ćeš raditi — odmah piši rezultat.
---`;

    const finalPrompt = result.trim() + memoryBlock;

    this.logger.log({
      message: 'Prompt formatted for agent',
      agentType,
      taskTitle,
      instructionLength: finalPrompt.length,
    });

    return finalPrompt;
  }
}
