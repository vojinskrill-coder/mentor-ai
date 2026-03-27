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
KRITICNO — UZEMLJENJE:
- Radi ISKLJUCIVO na zadatku opisanom iznad. NE siri se na druge teme.
- NIKADA ne izmisljaj podatke, izvore ili statistike. Ako ne mozes pronaci podatak, napisi "[POTREBNO ISTRAZITI]".
- Svaki nalaz MORA imati izvor (URL). Bez izvora = ne ukljucuj u rezultat.
- NE ponavljaj genericke poslovne savete — samo SPECIFICNE nalaze za ovu kompaniju i ovaj koncept.
- Ako imas prethodno iskustvo i memoriju o ovoj kompaniji — iskoristi to znanje. Nadogradi na postojece nalaze.
- Ako je ovo tvoj prvi zadatak — koristi dostavljene podatke iz web istrazivanja.

KRITICNO — FORMAT:
- NE KORISTI write, edit, bash ili bilo koji file tool. NE PISI fajlove.
- Samo VRATI TEKST kao svoj odgovor — to je tvoj output.
- Profesionalan Markdown (## zaglavlja, tabele, **bold** za kljucne vrednosti, > za izvore sa URL-ovima).
- SVE na srpskom jeziku. NE objesnjavaj sta ces raditi — odmah pisi rezultat.

KRITICNO — SLIKE:
- Za generisanje slika OBAVEZNO koristi exec tool: FAL_IMAGE_SIZE=<size> fal-generate "<prompt>". Velicine: landscape_16_9 (web), square_hd (social), landscape_4_3 (prezentacije), portrait_4_3 (stories).
- NIKADA ne izmisljaj URL-ove slika! Pozovi fal-generate i koristi URL koji vrati.
- Svaka slika mora biti NOVO generisana — NIKADA ne koristi slike iz memorije.
- Prompt za sliku mora biti na ENGLESKOM, detaljan (30+ reci).
- VIZUALNI IDENTITET: Luxury aesthetic, dark tones (charcoal, navy, black), gold/bronze accents, marble textures, dramatic lighting, art gallery feel, professional photography style.
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
