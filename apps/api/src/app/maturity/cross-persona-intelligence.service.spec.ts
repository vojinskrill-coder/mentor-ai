import { CrossPersonaIntelligenceService } from './cross-persona-intelligence.service';
import { PersonaType } from '@mentor-ai/shared/types';

describe('CrossPersonaIntelligenceService', () => {
  let service: CrossPersonaIntelligenceService;

  const mockPrisma = {
    conceptRelationship: { findMany: jest.fn() },
    stageConceptAssignment: { findMany: jest.fn() },
    note: { findMany: jest.fn() },
  };

  const TENANT_ID = 'tnt_test_001';
  const CONCEPT_ID = 'cpt_cashflow';

  beforeEach(() => {
    jest.resetAllMocks();
    service = new CrossPersonaIntelligenceService(mockPrisma as any);
  });

  it('should return empty when no related concepts exist', async () => {
    mockPrisma.conceptRelationship.findMany.mockResolvedValue([]);

    const result = await service.getRelevantOutputs({
      tenantId: TENANT_ID,
      conceptId: CONCEPT_ID,
      currentPersonaType: PersonaType.CFO,
      stage: 'BASIC',
    });

    expect(result.outputs).toEqual([]);
    expect(result.promptSection).toBe('');
    expect(result.truncated).toBe(false);
  });

  it('should return empty when related concepts have no completed assignments', async () => {
    mockPrisma.conceptRelationship.findMany.mockResolvedValue([
      {
        sourceConceptId: 'cpt_prereq',
        targetConceptId: CONCEPT_ID,
        relationshipType: 'PREREQUISITE',
        sourceConcept: { id: 'cpt_prereq', name: 'Budget Prereq' },
        targetConcept: { id: CONCEPT_ID, name: 'Cash Flow' },
      },
    ]);
    mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([]);

    const result = await service.getRelevantOutputs({
      tenantId: TENANT_ID,
      conceptId: CONCEPT_ID,
      currentPersonaType: PersonaType.CFO,
      stage: 'BASIC',
    });

    expect(result.outputs).toEqual([]);
    expect(result.promptSection).toBe('');
  });

  it('should return cross-persona outputs for PREREQUISITE concepts', async () => {
    mockPrisma.conceptRelationship.findMany.mockResolvedValue([
      {
        sourceConceptId: 'cpt_budget',
        targetConceptId: CONCEPT_ID,
        relationshipType: 'PREREQUISITE',
        sourceConcept: { id: 'cpt_budget', name: 'Marketing Budget' },
        targetConcept: { id: CONCEPT_ID, name: 'Cash Flow' },
      },
    ]);
    mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
      { conceptId: 'cpt_budget', personaType: PersonaType.CMO, noteId: 'note_1' },
    ]);
    mockPrisma.note.findMany.mockResolvedValue([
      { id: 'note_1', userReport: 'CMO budget analysis content', aiScore: 80 },
    ]);

    const result = await service.getRelevantOutputs({
      tenantId: TENANT_ID,
      conceptId: CONCEPT_ID,
      currentPersonaType: PersonaType.CFO,
      stage: 'BASIC',
    });

    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.personaType).toBe(PersonaType.CMO);
    expect(result.outputs[0]!.conceptName).toBe('Marketing Budget');
    expect(result.outputs[0]!.relationshipType).toBe('PREREQUISITE');
    expect(result.outputs[0]!.outputSummary).toContain('CMO budget analysis');
    expect(result.outputs[0]!.aiScore).toBe(80);
  });

  it('should return cross-persona outputs for RELATED concepts', async () => {
    mockPrisma.conceptRelationship.findMany.mockResolvedValue([
      {
        sourceConceptId: CONCEPT_ID,
        targetConceptId: 'cpt_tech',
        relationshipType: 'RELATED',
        sourceConcept: { id: CONCEPT_ID, name: 'Cash Flow' },
        targetConcept: { id: 'cpt_tech', name: 'Technology Costs' },
      },
    ]);
    mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
      { conceptId: 'cpt_tech', personaType: PersonaType.CTO, noteId: 'note_2' },
    ]);
    mockPrisma.note.findMany.mockResolvedValue([
      { id: 'note_2', userReport: 'CTO tech cost breakdown', aiScore: 70 },
    ]);

    const result = await service.getRelevantOutputs({
      tenantId: TENANT_ID,
      conceptId: CONCEPT_ID,
      currentPersonaType: PersonaType.CFO,
      stage: 'BASIC',
    });

    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.personaType).toBe(PersonaType.CTO);
    expect(result.outputs[0]!.relationshipType).toBe('RELATED');
  });

  it('should exclude current persona from results', async () => {
    mockPrisma.conceptRelationship.findMany.mockResolvedValue([
      {
        sourceConceptId: 'cpt_related',
        targetConceptId: CONCEPT_ID,
        relationshipType: 'RELATED',
        sourceConcept: { id: 'cpt_related', name: 'Related Concept' },
        targetConcept: { id: CONCEPT_ID, name: 'Cash Flow' },
      },
    ]);
    mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
      { conceptId: 'cpt_related', personaType: PersonaType.CFO, noteId: 'note_same' },
    ]);
    mockPrisma.note.findMany.mockResolvedValue([
      { id: 'note_same', userReport: 'CFO own analysis', aiScore: 90 },
    ]);

    const result = await service.getRelevantOutputs({
      tenantId: TENANT_ID,
      conceptId: CONCEPT_ID,
      currentPersonaType: PersonaType.CFO, // Same as the assignment
      stage: 'BASIC',
    });

    expect(result.outputs).toEqual([]);
    expect(result.promptSection).toBe('');
  });

  it('should prioritize PREREQUISITE over RELATED outputs', async () => {
    mockPrisma.conceptRelationship.findMany.mockResolvedValue([
      {
        sourceConceptId: 'cpt_prereq',
        targetConceptId: CONCEPT_ID,
        relationshipType: 'PREREQUISITE',
        sourceConcept: { id: 'cpt_prereq', name: 'Prereq Concept' },
        targetConcept: { id: CONCEPT_ID, name: 'Cash Flow' },
      },
      {
        sourceConceptId: CONCEPT_ID,
        targetConceptId: 'cpt_related',
        relationshipType: 'RELATED',
        sourceConcept: { id: CONCEPT_ID, name: 'Cash Flow' },
        targetConcept: { id: 'cpt_related', name: 'Related Concept' },
      },
    ]);
    mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
      { conceptId: 'cpt_related', personaType: PersonaType.CTO, noteId: 'note_rel' },
      { conceptId: 'cpt_prereq', personaType: PersonaType.CMO, noteId: 'note_pre' },
    ]);
    mockPrisma.note.findMany.mockResolvedValue([
      { id: 'note_rel', userReport: 'Related output', aiScore: 90 },
      { id: 'note_pre', userReport: 'Prereq output', aiScore: 50 },
    ]);

    const result = await service.getRelevantOutputs({
      tenantId: TENANT_ID,
      conceptId: CONCEPT_ID,
      currentPersonaType: PersonaType.CFO,
      stage: 'BASIC',
    });

    expect(result.outputs).toHaveLength(2);
    // PREREQUISITE first despite lower aiScore
    expect(result.outputs[0]!.relationshipType).toBe('PREREQUISITE');
    expect(result.outputs[1]!.relationshipType).toBe('RELATED');
  });

  it('should sort by aiScore within same priority tier', async () => {
    mockPrisma.conceptRelationship.findMany.mockResolvedValue([
      {
        sourceConceptId: 'cpt_a',
        targetConceptId: CONCEPT_ID,
        relationshipType: 'RELATED',
        sourceConcept: { id: 'cpt_a', name: 'Concept A' },
        targetConcept: { id: CONCEPT_ID, name: 'Cash Flow' },
      },
      {
        sourceConceptId: 'cpt_b',
        targetConceptId: CONCEPT_ID,
        relationshipType: 'RELATED',
        sourceConcept: { id: 'cpt_b', name: 'Concept B' },
        targetConcept: { id: CONCEPT_ID, name: 'Cash Flow' },
      },
    ]);
    mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
      { conceptId: 'cpt_a', personaType: PersonaType.CMO, noteId: 'note_a' },
      { conceptId: 'cpt_b', personaType: PersonaType.CTO, noteId: 'note_b' },
    ]);
    mockPrisma.note.findMany.mockResolvedValue([
      { id: 'note_a', userReport: 'Low score output', aiScore: 40 },
      { id: 'note_b', userReport: 'High score output', aiScore: 90 },
    ]);

    const result = await service.getRelevantOutputs({
      tenantId: TENANT_ID,
      conceptId: CONCEPT_ID,
      currentPersonaType: PersonaType.CFO,
      stage: 'BASIC',
    });

    expect(result.outputs).toHaveLength(2);
    expect(result.outputs[0]!.aiScore).toBe(90);
    expect(result.outputs[1]!.aiScore).toBe(40);
  });

  it('should truncate when outputs exceed token budget', async () => {
    const longText = 'A'.repeat(4000); // ~1000 tokens each
    mockPrisma.conceptRelationship.findMany.mockResolvedValue([
      {
        sourceConceptId: 'cpt_a',
        targetConceptId: CONCEPT_ID,
        relationshipType: 'PREREQUISITE',
        sourceConcept: { id: 'cpt_a', name: 'Concept A' },
        targetConcept: { id: CONCEPT_ID, name: 'Cash Flow' },
      },
      {
        sourceConceptId: 'cpt_b',
        targetConceptId: CONCEPT_ID,
        relationshipType: 'PREREQUISITE',
        sourceConcept: { id: 'cpt_b', name: 'Concept B' },
        targetConcept: { id: CONCEPT_ID, name: 'Cash Flow' },
      },
      {
        sourceConceptId: 'cpt_c',
        targetConceptId: CONCEPT_ID,
        relationshipType: 'PREREQUISITE',
        sourceConcept: { id: 'cpt_c', name: 'Concept C' },
        targetConcept: { id: CONCEPT_ID, name: 'Cash Flow' },
      },
    ]);
    mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
      { conceptId: 'cpt_a', personaType: PersonaType.CMO, noteId: 'note_a' },
      { conceptId: 'cpt_b', personaType: PersonaType.CTO, noteId: 'note_b' },
      { conceptId: 'cpt_c', personaType: PersonaType.SALES, noteId: 'note_c' },
    ]);
    mockPrisma.note.findMany.mockResolvedValue([
      { id: 'note_a', userReport: longText, aiScore: 80 },
      { id: 'note_b', userReport: longText, aiScore: 70 },
      { id: 'note_c', userReport: longText, aiScore: 60 },
    ]);

    // Token budget of 1000 — only fits ~1 output (each is ~375 tokens after 1500-char truncation)
    const result = await service.getRelevantOutputs({
      tenantId: TENANT_ID,
      conceptId: CONCEPT_ID,
      currentPersonaType: PersonaType.CFO,
      stage: 'BASIC',
      tokenBudget: 500,
    });

    expect(result.truncated).toBe(true);
    expect(result.outputs.length).toBeLessThan(3);
  });

  it('should return cached data on second call', async () => {
    mockPrisma.conceptRelationship.findMany.mockResolvedValue([
      {
        sourceConceptId: 'cpt_x',
        targetConceptId: CONCEPT_ID,
        relationshipType: 'RELATED',
        sourceConcept: { id: 'cpt_x', name: 'Concept X' },
        targetConcept: { id: CONCEPT_ID, name: 'Cash Flow' },
      },
    ]);
    mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
      { conceptId: 'cpt_x', personaType: PersonaType.CMO, noteId: 'note_x' },
    ]);
    mockPrisma.note.findMany.mockResolvedValue([
      { id: 'note_x', userReport: 'Cached content', aiScore: 75 },
    ]);

    // First call
    await service.getRelevantOutputs({
      tenantId: TENANT_ID,
      conceptId: CONCEPT_ID,
      currentPersonaType: PersonaType.CFO,
      stage: 'BASIC',
    });

    // Second call — should use cache
    const result = await service.getRelevantOutputs({
      tenantId: TENANT_ID,
      conceptId: CONCEPT_ID,
      currentPersonaType: PersonaType.CFO,
      stage: 'BASIC',
    });

    expect(result.outputs).toHaveLength(1);
    // DB queries should only be called once (from first call)
    expect(mockPrisma.conceptRelationship.findMany).toHaveBeenCalledTimes(1);
  });

  it('should format prompt section correctly in Serbian', async () => {
    mockPrisma.conceptRelationship.findMany.mockResolvedValue([
      {
        sourceConceptId: 'cpt_prereq',
        targetConceptId: CONCEPT_ID,
        relationshipType: 'PREREQUISITE',
        sourceConcept: { id: 'cpt_prereq', name: 'Budget Analysis' },
        targetConcept: { id: CONCEPT_ID, name: 'Cash Flow' },
      },
    ]);
    mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
      { conceptId: 'cpt_prereq', personaType: PersonaType.CMO, noteId: 'note_fmt' },
    ]);
    mockPrisma.note.findMany.mockResolvedValue([
      { id: 'note_fmt', userReport: 'Formatted output content', aiScore: 85 },
    ]);

    const result = await service.getRelevantOutputs({
      tenantId: TENANT_ID,
      conceptId: CONCEPT_ID,
      currentPersonaType: PersonaType.CFO,
      stage: 'BASIC',
    });

    expect(result.promptSection).toContain('CROSS-PERSONA UVIDI');
    expect(result.promptSection).toContain('KRAJ CROSS-PERSONA UVIDA');
    expect(result.promptSection).toContain('Chief Marketing Officer (CMO)');
    expect(result.promptSection).toContain('Budget Analysis');
    expect(result.promptSection).toContain('PREDUSLOV');
    expect(result.promptSection).toContain('85/100');
    expect(result.promptSection).toContain('Formatted output content');
  });

  it('should handle notes with null userReport gracefully', async () => {
    mockPrisma.conceptRelationship.findMany.mockResolvedValue([
      {
        sourceConceptId: 'cpt_empty',
        targetConceptId: CONCEPT_ID,
        relationshipType: 'RELATED',
        sourceConcept: { id: 'cpt_empty', name: 'Empty Concept' },
        targetConcept: { id: CONCEPT_ID, name: 'Cash Flow' },
      },
    ]);
    mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
      { conceptId: 'cpt_empty', personaType: PersonaType.CTO, noteId: 'note_empty' },
    ]);
    mockPrisma.note.findMany.mockResolvedValue([
      { id: 'note_empty', userReport: null, aiScore: null },
    ]);

    const result = await service.getRelevantOutputs({
      tenantId: TENANT_ID,
      conceptId: CONCEPT_ID,
      currentPersonaType: PersonaType.CFO,
      stage: 'BASIC',
    });

    // Should skip notes with no content
    expect(result.outputs).toEqual([]);
  });
});
