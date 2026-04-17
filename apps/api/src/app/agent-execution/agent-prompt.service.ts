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
CRITICAL — GROUNDING:
- Work EXCLUSIVELY on the task described above. Do NOT expand to other topics.
- NEVER fabricate data, sources, or statistics. If you cannot find a data point, write "[NEEDS RESEARCH]".
- Every finding MUST have a source (URL). Without source = do not include in result.
- Do NOT repeat generic business advice — only SPECIFIC findings for this company and this concept.
- If you have prior experience and memory about this company — use that knowledge. Build on existing findings.
- If this is your first task — use the provided web research data.

CRITICAL — FORMAT:
- Do NOT USE write, edit, bash or any file tool. Do NOT WRITE files.
- Only RETURN TEXT as your response — that is your output.
- Professional Markdown (## headings, tables, **bold** for key values, > for sources with URLs).
- ALL in English. Do NOT explain what you will do — write the result immediately.

CRITICAL — IMAGES:
- To generate images MUST use exec tool: FAL_IMAGE_SIZE=<size> fal-generate "<prompt>". Sizes: landscape_16_9 (web), square_hd (social), landscape_4_3 (presentations), portrait_4_3 (stories).
- NEVER fabricate image URLs! Call fal-generate and use the URL it returns.
- Every image must be NEWLY generated — NEVER reuse images from memory.
- Image prompt must be in ENGLISH, detailed (30+ words).
- VISUAL IDENTITY: Luxury aesthetic, dark tones (charcoal, navy, black), gold/bronze accents, marble textures, dramatic lighting, art gallery feel, professional photography style.
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
