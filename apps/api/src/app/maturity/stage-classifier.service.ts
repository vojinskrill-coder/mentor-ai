import { Injectable, Logger } from '@nestjs/common';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { ChatMessage, MaturityStage, PersonaType } from '@mentor-ai/shared/types';
import { PERSONA_LABELS } from './persona-labels';

interface ConceptForClassification {
  id: string;
  name: string;
  category: string;
  definition: string;
}

interface ClassificationResult {
  conceptId: string;
  priority: number;
  rationale: string;
}

const STAGE_DESCRIPTIONS: Record<MaturityStage, string> = {
  [MaturityStage.BASIC]:
    'Foundational concepts every business MUST have. Cover the basics: brand identity, target market, basic finance, key operations, legal framework. Focus is on building a STABLE BASE.',
  [MaturityStage.ADVANCED]:
    'Advanced concepts for optimization and growth. Building on BASIC: deeper competitive analysis, advanced strategies, process automation, market expansion. Focus is on SCALING AND OPTIMIZATION.',
  [MaturityStage.AUTONOMOUS]:
    'Concepts for monitoring and continuous improvement. Everything from BASIC and ADVANCED is complete. Focus is on AUTOMATION AND SELF-MANAGEMENT: KPI tracking, automated reports, proactive optimization.',
};

@Injectable()
export class StageClassifierService {
  private readonly logger = new Logger(StageClassifierService.name);

  constructor(
    private readonly aiGateway: AiGatewayService,
    private readonly prisma: PlatformPrismaService
  ) {}

  /**
   * For a given persona and stage, uses LLM to classify which concepts are relevant
   * for THIS specific business. Business context is auto-injected by AiGatewayService.
   */
  async classifyForStage(params: {
    tenantId: string;
    userId: string;
    stage: MaturityStage;
    personaType: PersonaType;
    availableConcepts: ConceptForClassification[];
  }): Promise<ClassificationResult[]> {
    const { tenantId, userId, stage, personaType, availableConcepts } = params;

    if (availableConcepts.length === 0) {
      return [];
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { industry: true, name: true },
    });

    const conceptList = availableConcepts
      .map((c) => `- ID: ${c.id} | Name: ${c.name} | Category: ${c.category} | Definition: ${c.definition}`)
      .join('\n');

    const systemPrompt = `You are a ${PERSONA_LABELS[personaType]} for "${tenant?.name || 'N/A'}" in the "${tenant?.industry || 'N/A'}" industry.

Your task: select which of the offered business concepts are relevant for the ${stage} phase of THIS SPECIFIC business.

${STAGE_DESCRIPTIONS[stage]}

RULES:
- Select ONLY concepts that are truly relevant for this industry and phase
- Sort by priority (priority 1 = most important)
- For each concept explain WHY it is relevant for THIS business (rationale)
- Do not select all — be selective. For BASIC: 5-15 concepts. For ADVANCED: 3-10. For AUTONOMOUS: 2-8.
- Take into account business context from memories (if available)

You MUST return a VALID JSON array. Nothing else, just JSON:
[{"conceptId": "cpt_xxx", "priority": 1, "rationale": "Reason..."}]`;

    const userMessage = `Available concepts for your domain:\n\n${conceptList}\n\nSelect relevant ones for the ${stage} phase. Return ONLY a JSON array.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
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

    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn({
          message: 'Stage classifier returned no JSON array',
          personaType,
          stage,
          resultPreview: result.substring(0, 200),
        });
        return [];
      }

      const parsed: ClassificationResult[] = JSON.parse(jsonMatch[0]);

      // Validate conceptIds exist in available concepts
      const validIds = new Set(availableConcepts.map((c) => c.id));
      const validated = parsed.filter((r) => validIds.has(r.conceptId));

      this.logger.log({
        message: 'Stage classification complete',
        personaType,
        stage,
        totalAvailable: availableConcepts.length,
        selected: validated.length,
      });

      return validated;
    } catch (err) {
      this.logger.error({
        message: 'Failed to parse stage classification result',
        personaType,
        stage,
        error: err instanceof Error ? err.message : 'Unknown',
        resultPreview: result.substring(0, 300),
      });
      return [];
    }
  }
}
