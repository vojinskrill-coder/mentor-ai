import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { PersonaType } from '@mentor-ai/shared/types';
import { PERSONA_LABELS } from './persona-labels';

export interface CrossPersonaOutput {
  personaType: string;
  personaLabel: string;
  conceptName: string;
  relationshipType: 'PREREQUISITE' | 'RELATED' | 'ADVANCED';
  outputSummary: string;
  aiScore: number | null;
}

export interface CrossPersonaResult {
  outputs: CrossPersonaOutput[];
  totalTokensEstimate: number;
  truncated: boolean;
  promptSection: string;
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  PREREQUISITE: 'PREDUSLOV',
  RELATED: 'POVEZAN',
  ADVANCED: 'NAPREDNO',
};

const RELATIONSHIP_PRIORITY: Record<string, number> = {
  PREREQUISITE: 0,
  RELATED: 1,
  ADVANCED: 2,
};

const DEFAULT_TOKEN_BUDGET = 2000;
const MAX_OUTPUT_CHARS = 1500;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: CrossPersonaOutput[];
  expiry: number;
}

@Injectable()
export class CrossPersonaIntelligenceService {
  private readonly logger = new Logger(CrossPersonaIntelligenceService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Clear cached cross-persona data for a tenant so subsequent tasks
   * see freshly completed results instead of stale cached data.
   */
  clearCache(tenantId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  async getRelevantOutputs(params: {
    tenantId: string;
    conceptId: string;
    currentPersonaType: string;
    stage: string;
    tokenBudget?: number;
  }): Promise<CrossPersonaResult> {
    const {
      tenantId,
      conceptId,
      currentPersonaType,
      stage,
      tokenBudget = DEFAULT_TOKEN_BUDGET,
    } = params;

    const allOutputs = await this.fetchOutputs(tenantId, conceptId, stage);

    // Filter out current persona
    const filtered = allOutputs.filter(
      (o) => o.personaType !== currentPersonaType,
    );

    if (filtered.length === 0) {
      return { outputs: [], totalTokensEstimate: 0, truncated: false, promptSection: '' };
    }

    // Sort: PREREQUISITE first, then RELATED, then ADVANCED; within tier by aiScore desc
    filtered.sort((a, b) => {
      const prioA = RELATIONSHIP_PRIORITY[a.relationshipType] ?? 99;
      const prioB = RELATIONSHIP_PRIORITY[b.relationshipType] ?? 99;
      if (prioA !== prioB) return prioA - prioB;
      return (b.aiScore ?? 0) - (a.aiScore ?? 0);
    });

    // Apply token budget
    const selected: CrossPersonaOutput[] = [];
    let totalTokens = 0;
    let truncated = false;

    for (const output of filtered) {
      const tokens = Math.ceil(output.outputSummary.length / 4);
      if (totalTokens + tokens > tokenBudget) {
        truncated = true;
        break;
      }
      selected.push(output);
      totalTokens += tokens;
    }

    const promptSection = this.formatPromptSection(selected);

    return {
      outputs: selected,
      totalTokensEstimate: totalTokens,
      truncated,
      promptSection,
    };
  }

  private async fetchOutputs(
    tenantId: string,
    conceptId: string,
    stage: string,
  ): Promise<CrossPersonaOutput[]> {
    const cacheKey = `${tenantId}:${conceptId}:${stage}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    // Query 1: Get related concepts (both directions)
    const relationships = await this.prisma.conceptRelationship.findMany({
      where: {
        OR: [
          { targetConceptId: conceptId },
          { sourceConceptId: conceptId },
        ],
      },
      select: {
        sourceConceptId: true,
        targetConceptId: true,
        relationshipType: true,
        sourceConcept: { select: { id: true, name: true } },
        targetConcept: { select: { id: true, name: true } },
      },
    });

    if (relationships.length === 0) {
      this.cache.set(cacheKey, { data: [], expiry: Date.now() + CACHE_TTL_MS });
      return [];
    }

    // Build map: relatedConceptId → { name, relationshipType }
    const relatedMap = new Map<string, { name: string; relationshipType: string }>();
    for (const rel of relationships) {
      const relatedId =
        rel.sourceConceptId === conceptId
          ? rel.targetConceptId
          : rel.sourceConceptId;
      const relatedName =
        rel.sourceConceptId === conceptId
          ? rel.targetConcept.name
          : rel.sourceConcept.name;
      relatedMap.set(relatedId, {
        name: relatedName,
        relationshipType: rel.relationshipType,
      });
    }

    // Query 2: Get COMPLETED assignments for related concepts in the same stage
    const assignments = await this.prisma.stageConceptAssignment.findMany({
      where: {
        tenantId,
        conceptId: { in: [...relatedMap.keys()] },
        stage: stage as any,
        status: 'COMPLETED',
        noteId: { not: null },
      },
      select: {
        conceptId: true,
        personaType: true,
        noteId: true,
      },
    });

    if (assignments.length === 0) {
      this.cache.set(cacheKey, { data: [], expiry: Date.now() + CACHE_TTL_MS });
      return [];
    }

    // Query 3: Batch-load notes
    const noteIds = assignments.map((a) => a.noteId!);
    const notes = await this.prisma.note.findMany({
      where: { id: { in: noteIds } },
      select: { id: true, userReport: true, aiScore: true },
    });

    const noteMap = new Map(notes.map((n) => [n.id, n]));

    // Assemble outputs
    const outputs: CrossPersonaOutput[] = [];
    for (const assignment of assignments) {
      const note = noteMap.get(assignment.noteId!);
      const related = relatedMap.get(assignment.conceptId);
      if (!note || !related) continue;

      const text = note.userReport || '';
      if (!text) continue;

      outputs.push({
        personaType: assignment.personaType,
        personaLabel:
          PERSONA_LABELS[assignment.personaType as PersonaType] ??
          assignment.personaType,
        conceptName: related.name,
        relationshipType: related.relationshipType as CrossPersonaOutput['relationshipType'],
        outputSummary:
          text.length > MAX_OUTPUT_CHARS
            ? text.substring(0, MAX_OUTPUT_CHARS) + '...'
            : text,
        aiScore: note.aiScore,
      });
    }

    this.cache.set(cacheKey, { data: outputs, expiry: Date.now() + CACHE_TTL_MS });
    return outputs;
  }

  private formatPromptSection(outputs: CrossPersonaOutput[]): string {
    if (outputs.length === 0) return '';

    const lines = outputs.map((o) => {
      const relLabel = RELATIONSHIP_LABELS[o.relationshipType] ?? o.relationshipType;
      const scoreStr = o.aiScore != null ? `\n(AI ocena: ${o.aiScore}/100)` : '';
      return `[${o.personaLabel} — ${o.conceptName} (${relLabel})]:${scoreStr}\n${o.outputSummary}`;
    });

    return `\n--- CROSS-PERSONA UVIDI ---
Sledeći rezultati dolaze od drugih persona koje su analizirale POVEZANE koncepte.
Koristi ove uvide da obogatiš svoju analizu međufunkcionalnim perspektivama.

${lines.join('\n\n')}
--- KRAJ CROSS-PERSONA UVIDA ---\n`;
  }
}
