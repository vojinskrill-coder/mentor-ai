import { Injectable, Logger } from '@nestjs/common';
import { AgentRegistryService } from './agent-registry.service';
import { AgentType } from '@mentor-ai/shared/types';

@Injectable()
export class AgentPromptService {
  private readonly logger = new Logger(AgentPromptService.name);

  constructor(
    private readonly registry: AgentRegistryService
  ) {}

  /**
   * Builds the final prompt for an OpenClaw agent by combining:
   * 1. The job planner's instruction (already contextualized)
   * 2. Task context (title, content, report excerpt)
   * 3. Pre-check context from main agent (what's already known)
   * 4. Grounding block (concept focus, format, anti-hallucination)
   *
   * NO LLM call — deterministic template assembly.
   * The job planner's LLM call already produced a contextualized instruction.
   * Adding another LLM call to "reformat" it was redundant.
   */
  formatPrompt(params: {
    agentType: AgentType;
    taskTitle: string;
    taskContent: string;
    userReport: string;
    expectedOutcome?: string | null;
    preCheckContext?: string | null;
    tenantId: string;
    userId: string;
    onChunk?: (chunk: string) => void;
  }): string {
    const { agentType, taskTitle, taskContent, userReport, expectedOutcome, preCheckContext } =
      params;

    const agentDef = this.registry.getAgent(agentType);

    // Build the prompt from components — no LLM call needed
    const parts: string[] = [];

    // 1. Task context
    parts.push(`ZADATAK: ${taskTitle}`);
    parts.push(`OPIS: ${taskContent}`);
    if (expectedOutcome) {
      parts.push(`OČEKIVANI REZULTAT: ${expectedOutcome}`);
    }

    // 2. What is already known (from main agent pre-check)
    if (preCheckContext && preCheckContext.length > 50) {
      parts.push(`\n--- VEĆ POZNATO (ne istraži ponovo) ---\n${preCheckContext}\n--- KRAJ VEĆ POZNATOG ---`);
    }

    // 3. Current report excerpt for context
    if (userReport && userReport.length > 100) {
      parts.push(`\n--- TRENUTNI IZVEŠTAJ (kontekst) ---\n${userReport.substring(0, 4000)}\n--- KRAJ IZVEŠTAJA ---`);
    }

    // 4. Grounding block — ALWAYS appended
    parts.push(`
---
KRITIČNO — UZEMLJENJE:
- Radi ISKLJUČIVO na zadatku opisanom iznad. NE širi se na druge teme.
- NIKADA ne izmišljaj podatke, izvore ili statistike. Ako ne možeš pronaći podatak, napiši "[POTREBNO ISTRAŽITI]".
- Svaki nalaz MORA imati izvor (URL). Bez izvora = ne uključuj u rezultat.
- NE ponavljaj generičke poslovne savete — samo SPECIFIČNE nalaze za ovu kompaniju i ovaj koncept.
- Ako imaš prethodno iskustvo i memoriju o ovoj kompaniji — iskoristi to znanje. Nadogradi na postojeće nalaze.
- Ako je ovo tvoj prvi zadatak — istraži temeljno od početka.

FORMAT IZLAZA: Profesionalan Markdown (## zaglavlja, tabele, **bold** za ključne vrednosti, > za izvore sa URL-ovima). SVE na srpskom jeziku. NE objašnjavaj šta ćeš raditi — odmah piši rezultat.
---`);

    const finalPrompt = parts.join('\n\n');

    // Emit chunks for streaming feedback (simulate progress)
    if (params.onChunk) {
      params.onChunk(finalPrompt);
    }

    this.logger.log({
      message: 'Prompt assembled for agent (no LLM call)',
      agentType,
      taskTitle,
      hasPreCheck: !!preCheckContext,
      instructionLength: finalPrompt.length,
    });

    return finalPrompt;
  }
}
