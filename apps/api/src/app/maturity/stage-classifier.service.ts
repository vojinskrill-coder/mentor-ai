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
    'Fondacioni koncepti koje svako poslovanje MORA imati. Pokrij osnove: identitet brenda, ciljno tržište, osnovne finansije, ključne operacije, pravni okvir. Fokus je na izgradnji STABILNE BAZE.',
  [MaturityStage.ADVANCED]:
    'Napredni koncepti za optimizaciju i rast. Nadogradnja na BASIC: dublja analiza konkurencije, napredne strategije, automatizacija procesa, ekspanzija tržišta. Fokus je na SKALIRANJU I OPTIMIZACIJI.',
  [MaturityStage.AUTONOMOUS]:
    'Koncepti za monitoring i kontinualno poboljšanje. Sve iz BASIC i ADVANCED je kompletno. Fokus je na AUTOMATIZACIJI I SAMOUPRAVLJANJU: praćenje KPI-jeva, automatski izveštaji, proaktivna optimizacija.',
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
      .map((c) => `- ID: ${c.id} | Naziv: ${c.name} | Kategorija: ${c.category} | Definicija: ${c.definition}`)
      .join('\n');

    const systemPrompt = `Ti si ${PERSONA_LABELS[personaType]} za "${tenant?.name || 'N/A'}" u industriji "${tenant?.industry || 'N/A'}".

Tvoj zadatak: izaberi koji od ponuđenih poslovnih koncepata su relevantni za ${stage} fazu ovog KONKRETNOG poslovanja.

${STAGE_DESCRIPTIONS[stage]}

PRAVILA:
- Izaberi SAMO koncepte koji su zaista relevantni za ovu industriju i fazu
- Sortiraj po prioritetu (priority 1 = najvažniji)
- Za svaki koncept objasni ZAŠTO je relevantan za OVO poslovanje (rationale)
- Ne izaberi sve — budi selektivan. Za BASIC: 5-15 koncepata. Za ADVANCED: 3-10. Za AUTONOMOUS: 2-8.
- Uzmi u obzir poslovni kontekst iz memorija (ako je dostupan)

OBAVEZNO vrati VALIDAN JSON niz. Ništa drugo, samo JSON:
[{"conceptId": "cpt_xxx", "priority": 1, "rationale": "Razlog..."}]`;

    const userMessage = `Dostupni koncepti za tvoj domen:\n\n${conceptList}\n\nIzaberi relevantne za ${stage} fazu. Vrati SAMO JSON niz.`;

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
