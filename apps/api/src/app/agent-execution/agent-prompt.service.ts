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
  }): Promise<string> {
    const { agentType, taskTitle, taskContent, userReport, expectedOutcome, tenantId, userId } =
      params;

    const agentDef = this.registry.getAgent(agentType);

    const userMessage = `Task: ${taskTitle}

Description: ${taskContent}

${expectedOutcome ? `Expected Outcome: ${expectedOutcome}\n` : ''}User's Completed Report:
${userReport.substring(0, 3000)}

Based on this task report and the business context from memories, generate a direct execution instruction for the ${agentDef.label} agent. The agent should ACT on this — execute its tools, produce deliverables, and return results. Not analyze or plan.`;

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
      }
    );

    this.logger.log({
      message: 'Prompt formatted for agent',
      agentType,
      taskTitle,
      instructionLength: result.length,
    });

    return result.trim();
  }
}
