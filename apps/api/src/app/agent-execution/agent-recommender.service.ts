import { Injectable, Logger } from '@nestjs/common';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { AgentRegistryService } from './agent-registry.service';
import { AgentRecommendation, AgentType, ChatMessage } from '@mentor-ai/shared/types';

@Injectable()
export class AgentRecommenderService {
  private readonly logger = new Logger(AgentRecommenderService.name);

  constructor(
    private readonly aiGateway: AiGatewayService,
    private readonly registry: AgentRegistryService
  ) {}

  async getRecommendations(params: {
    taskTitle: string;
    taskContent: string;
    userReport: string;
    expectedOutcome?: string | null;
    tenantId: string;
    userId: string;
  }): Promise<AgentRecommendation[]> {
    const { taskTitle, taskContent, userReport, expectedOutcome, tenantId, userId } = params;

    const agentDescriptions = this.registry
      .getAllAgents()
      .map((a) => `- ${a.type}: ${a.label} — ${a.description}`)
      .join('\n');

    const systemPrompt = `You are a business task analyzer. Given a completed task report, recommend which AI agents would be most useful to enrich the report.

Available agent types:
${agentDescriptions}

Rules:
- Recommend 2-3 agents that would add the most value to this specific task
- Each recommendation needs: agentType (exact enum value), relevanceScore (0-100), reasoning (1 sentence in Serbian explaining why)
- Higher relevanceScore = more relevant for this specific task
- Only recommend agents that genuinely add value — don't recommend all 5
- Respond ONLY with a JSON array, no other text

Example output:
[{"agentType":"web_search","relevanceScore":85,"reasoning":"Istraživanje tržišta bi obogatilo analizu konkurencije."},{"agentType":"financial","relevanceScore":70,"reasoning":"ROI kalkulacija bi pomogla u donošenju odluke o investiciji."}]`;

    const userMessage = `Task: ${taskTitle}

Description: ${taskContent.substring(0, 500)}

${expectedOutcome ? `Expected Outcome: ${expectedOutcome}\n` : ''}User Report (first 2000 chars):
${userReport.substring(0, 2000)}

Which agents would best enrich this report? Return JSON array only.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    let result = '';
    try {
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

      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn({
          message: 'No JSON array found in recommendation response',
          result: result.substring(0, 200),
        });
        return this.getDefaultRecommendations();
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        agentType: string;
        relevanceScore: number;
        reasoning: string;
      }>;

      const validTypes = Object.values(AgentType) as string[];
      const recommendations: AgentRecommendation[] = parsed
        .filter((r) => validTypes.includes(r.agentType))
        .map((r) => ({
          agentType: r.agentType as AgentType,
          relevanceScore: Math.max(0, Math.min(100, Number(r.relevanceScore) || 50)),
          reasoning: r.reasoning || '',
        }))
        .slice(0, 3);

      this.logger.log({
        message: 'Agent recommendations generated',
        taskTitle,
        count: recommendations.length,
        types: recommendations.map((r) => r.agentType),
      });

      return recommendations.length > 0 ? recommendations : this.getDefaultRecommendations();
    } catch (err) {
      this.logger.error({
        message: 'Failed to generate recommendations',
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return this.getDefaultRecommendations();
    }
  }

  private getDefaultRecommendations(): AgentRecommendation[] {
    return [
      {
        agentType: AgentType.WEB_SEARCH,
        relevanceScore: 70,
        reasoning: 'Online istraživanje može pronaći dodatne podatke i izvore.',
      },
      {
        agentType: AgentType.MARKETING,
        relevanceScore: 60,
        reasoning: 'Marketing analiza može dati uvid u tržište i konkurenciju.',
      },
    ];
  }
}
