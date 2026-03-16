import { MaturityEngineService } from './maturity-engine.service';
import {
  MaturityStage,
  PersonaType,
  StageConceptStatus,
} from '@mentor-ai/shared/types';

describe('MaturityEngineService', () => {
  let service: MaturityEngineService;

  const mockPrisma = {
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    stageConceptAssignment: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    concept: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    conceptRelationship: {
      findMany: jest.fn(),
    },
    note: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
    agentJob: {
      findMany: jest.fn(),
    },
    stageCompletionLog: {
      create: jest.fn(),
    },
  };

  const mockClassifier = {
    classifyForStage: jest.fn(),
  };

  const mockWsHolder = {
    emitToTenant: jest.fn(),
  };

  const mockHeadlessExecutor = {
    executeNote: jest.fn().mockResolvedValue(undefined),
  };

  const TENANT_ID = 'tnt_test_001';
  const USER_ID = 'usr_test_001';

  beforeEach(() => {
    jest.clearAllMocks();
    const mockCrossPersonaIntelligence = { clearCache: jest.fn() };
    const mockConfigService = { get: jest.fn().mockReturnValue('2') };
    service = new MaturityEngineService(
      mockPrisma as any,
      mockClassifier as any,
      mockWsHolder as any,
      mockHeadlessExecutor as any,
      mockCrossPersonaIntelligence as any,
      mockConfigService as any,
    );
  });

  // ─── initializeStage ───

  describe('initializeStage', () => {
    it('should return existing count if stage already initialized (idempotency)', async () => {
      mockPrisma.stageConceptAssignment.count.mockResolvedValue(12);

      const result = await service.initializeStage(TENANT_ID, MaturityStage.BASIC, USER_ID);

      expect(result).toEqual({ assignmentCount: 12 });
      expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
      expect(mockClassifier.classifyForStage).not.toHaveBeenCalled();
    });

    it('should update tenant maturityStage', async () => {
      mockPrisma.stageConceptAssignment.count.mockResolvedValue(0);
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockClassifier.classifyForStage.mockResolvedValue([]);
      // reconcile: no pending
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([]);

      await service.initializeStage(TENANT_ID, MaturityStage.BASIC, USER_ID);

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: TENANT_ID },
        data: { maturityStage: MaturityStage.BASIC },
      });
    });

    it('should iterate all 8 personas', async () => {
      mockPrisma.stageConceptAssignment.count
        .mockResolvedValueOnce(0) // initial check
        .mockResolvedValue(0);    // final count
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockClassifier.classifyForStage.mockResolvedValue([]);
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([]);

      await service.initializeStage(TENANT_ID, MaturityStage.BASIC, USER_ID);

      // 8 personas × 1 call each = 8 calls (execution no longer auto-starts from initializeStage)
      expect(mockPrisma.concept.findMany).toHaveBeenCalledTimes(8);
    });

    it('should create assignments from classified concepts', async () => {
      mockPrisma.stageConceptAssignment.count
        .mockResolvedValueOnce(0)  // initial check
        .mockResolvedValue(2);     // final count

      const mockConcepts = [
        { id: 'cpt_1', name: 'Test', category: 'Vrednost', definition: 'def' },
      ];
      mockPrisma.concept.findMany.mockResolvedValue(mockConcepts);
      mockClassifier.classifyForStage.mockResolvedValue([
        { conceptId: 'cpt_1', priority: 1, rationale: 'Important' },
      ]);
      mockPrisma.stageConceptAssignment.create.mockResolvedValue({});
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([]);

      await service.initializeStage(TENANT_ID, MaturityStage.BASIC, USER_ID);

      expect(mockPrisma.stageConceptAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            conceptId: 'cpt_1',
            stage: MaturityStage.BASIC,
            status: StageConceptStatus.PENDING,
          }),
        })
      );
    });

    it('should handle unique constraint violations gracefully (cross-persona overlap)', async () => {
      mockPrisma.stageConceptAssignment.count
        .mockResolvedValueOnce(0)
        .mockResolvedValue(1);

      const mockConcepts = [
        { id: 'cpt_1', name: 'Test', category: 'Vrednost', definition: 'def' },
      ];
      mockPrisma.concept.findMany.mockResolvedValue(mockConcepts);
      mockClassifier.classifyForStage.mockResolvedValue([
        { conceptId: 'cpt_1', priority: 1, rationale: 'Important' },
      ]);

      // First call succeeds, rest throw unique constraint
      mockPrisma.stageConceptAssignment.create
        .mockResolvedValueOnce({})
        .mockRejectedValue(new Error('Unique constraint failed'));
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([]);

      // Should not throw
      const result = await service.initializeStage(TENANT_ID, MaturityStage.BASIC, USER_ID);
      expect(result).toEqual({ assignmentCount: 1 });
    });

    it('should handle classifier failures gracefully per persona', async () => {
      mockPrisma.stageConceptAssignment.count
        .mockResolvedValueOnce(0)
        .mockResolvedValue(0);

      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'cpt_1', name: 'Test', category: 'Vrednost', definition: 'def' },
      ]);
      mockClassifier.classifyForStage.mockRejectedValue(new Error('LLM down'));
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([]);

      // Should not throw despite all 8 classifiers failing
      const result = await service.initializeStage(TENANT_ID, MaturityStage.BASIC, USER_ID);
      expect(result).toEqual({ assignmentCount: 0 });
    });

    it('should call reconcileBrainSeededCompletions after creating assignments', async () => {
      mockPrisma.stageConceptAssignment.count
        .mockResolvedValueOnce(0)
        .mockResolvedValue(1);

      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockClassifier.classifyForStage.mockResolvedValue([]);

      // Reconciliation queries
      const pendingAssignment = {
        id: 'sca_1', conceptId: 'cpt_1', status: StageConceptStatus.PENDING,
      };
      mockPrisma.stageConceptAssignment.findMany
        .mockResolvedValueOnce([pendingAssignment]) // reconciliation
        .mockResolvedValue([]);                     // createNotesForPendingAssignments
      mockPrisma.note.findMany
        .mockResolvedValueOnce([{ id: 'note_1', conceptId: 'cpt_1' }]) // reconciliation
        .mockResolvedValue([]);  // createNotes existing check
      mockPrisma.stageConceptAssignment.update.mockResolvedValue({});

      await service.initializeStage(TENANT_ID, MaturityStage.BASIC, USER_ID);

      // Verify reconciliation updated the assignment
      expect(mockPrisma.stageConceptAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sca_1' },
          data: expect.objectContaining({
            status: StageConceptStatus.COMPLETED,
            noteId: 'note_1',
          }),
        })
      );
    });
  });

  // ─── getStageProgress ───

  describe('getStageProgress', () => {
    it('should return correct counts in single pass', async () => {
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { status: StageConceptStatus.COMPLETED, personaType: PersonaType.CFO },
        { status: StageConceptStatus.COMPLETED, personaType: PersonaType.CFO },
        { status: StageConceptStatus.IN_PROGRESS, personaType: PersonaType.CMO },
        { status: StageConceptStatus.PENDING, personaType: PersonaType.CTO },
        { status: StageConceptStatus.STALE, personaType: PersonaType.CFO },
      ]);

      const result = await service.getStageProgress(TENANT_ID, MaturityStage.BASIC);

      expect(result.totalAssignments).toBe(5);
      expect(result.completed).toBe(2);
      expect(result.inProgress).toBe(1);
      expect(result.pending).toBe(1);
      expect(result.stale).toBe(1);
      expect(result.completionPercent).toBe(40);
      expect(result.canTransition).toBe(false);
    });

    it('should return 0 for all fields when no assignments exist', async () => {
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([]);

      const result = await service.getStageProgress(TENANT_ID, MaturityStage.BASIC);

      expect(result.totalAssignments).toBe(0);
      expect(result.completed).toBe(0);
      expect(result.completionPercent).toBe(0);
      expect(result.canTransition).toBe(false);
    });

    it('should track per-persona breakdown correctly', async () => {
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { status: StageConceptStatus.COMPLETED, personaType: PersonaType.CFO },
        { status: StageConceptStatus.PENDING, personaType: PersonaType.CFO },
        { status: StageConceptStatus.IN_PROGRESS, personaType: PersonaType.CMO },
      ]);

      const result = await service.getStageProgress(TENANT_ID, MaturityStage.BASIC);

      expect(result.byPersona[PersonaType.CFO]).toEqual({
        total: 2, completed: 1, pending: 1, inProgress: 0,
      });
      expect(result.byPersona[PersonaType.CMO]).toEqual({
        total: 1, completed: 0, pending: 0, inProgress: 1,
      });
    });

    it('should set canTransition=true only when all completed', async () => {
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { status: StageConceptStatus.COMPLETED, personaType: PersonaType.CFO },
        { status: StageConceptStatus.COMPLETED, personaType: PersonaType.CMO },
      ]);

      const result = await service.getStageProgress(TENANT_ID, MaturityStage.BASIC);

      expect(result.canTransition).toBe(true);
      expect(result.completionPercent).toBe(100);
    });

    it('should ensure all 8 persona types are present even with 0 counts', async () => {
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([]);

      const result = await service.getStageProgress(TENANT_ID, MaturityStage.BASIC);

      const allPersonas = Object.values(PersonaType);
      for (const pt of allPersonas) {
        expect(result.byPersona[pt]).toEqual({
          total: 0, completed: 0, pending: 0, inProgress: 0,
        });
      }
    });

    it('should count STALE in totals but not as completed', async () => {
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { status: StageConceptStatus.COMPLETED, personaType: PersonaType.CFO },
        { status: StageConceptStatus.STALE, personaType: PersonaType.CMO },
      ]);

      const result = await service.getStageProgress(TENANT_ID, MaturityStage.BASIC);

      expect(result.stale).toBe(1);
      expect(result.completed).toBe(1);
      expect(result.totalAssignments).toBe(2);
      expect(result.canTransition).toBe(false);
    });
  });

  // ─── onConceptCompleted ───

  describe('onConceptCompleted', () => {
    const NOTE_ID = 'note_test_001';

    it('should return early if no maturity stage set on tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: null });

      const result = await service.onConceptCompleted(TENANT_ID, 'cpt_1', NOTE_ID, USER_ID);

      expect(result).toEqual({ stageCompleted: false });
      expect(mockPrisma.stageConceptAssignment.findUnique).not.toHaveBeenCalled();
    });

    it('should return early if assignment already COMPLETED (idempotency)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockPrisma.stageConceptAssignment.findUnique.mockResolvedValue({
        id: 'sca_1',
        status: StageConceptStatus.COMPLETED,
        conceptId: 'cpt_1',
      });

      const result = await service.onConceptCompleted(TENANT_ID, 'cpt_1', NOTE_ID, USER_ID);

      expect(result).toEqual({ stageCompleted: false });
      expect(mockPrisma.agentJob.findMany).not.toHaveBeenCalled();
    });

    it('should create retroactive assignment if none exists (brain-seeding)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockPrisma.stageConceptAssignment.findUnique.mockResolvedValue(null);
      mockPrisma.stageConceptAssignment.create.mockResolvedValue({});

      const result = await service.onConceptCompleted(TENANT_ID, 'cpt_1', NOTE_ID, USER_ID);

      expect(result).toEqual({ stageCompleted: false });
      expect(mockPrisma.stageConceptAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          conceptId: 'cpt_1',
          stage: MaturityStage.BASIC,
          personaType: PersonaType.CFO,
          priority: 999,
          status: StageConceptStatus.COMPLETED,
          noteId: NOTE_ID,
        }),
      });
    });

    it('should catch unique constraint on retroactive assignment (race condition)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockPrisma.stageConceptAssignment.findUnique.mockResolvedValue(null);
      mockPrisma.stageConceptAssignment.create.mockRejectedValue(
        new Error('Unique constraint failed')
      );

      // Should not throw
      const result = await service.onConceptCompleted(TENANT_ID, 'cpt_1', NOTE_ID, USER_ID);
      expect(result).toEqual({ stageCompleted: false });
    });

    it('should mark assignment as IN_PROGRESS when jobs still running', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockPrisma.stageConceptAssignment.findUnique.mockResolvedValue({
        id: 'sca_1',
        status: StageConceptStatus.PENDING,
        conceptId: 'cpt_1',
      });
      mockPrisma.agentJob.findMany.mockResolvedValue([
        { status: 'COMPLETED' },
        { status: 'RUNNING' },
      ]);

      const result = await service.onConceptCompleted(TENANT_ID, 'cpt_1', NOTE_ID, USER_ID);

      expect(result).toEqual({ stageCompleted: false });
      expect(mockPrisma.stageConceptAssignment.update).toHaveBeenCalledWith({
        where: { id: 'sca_1' },
        data: { status: StageConceptStatus.IN_PROGRESS, noteId: NOTE_ID },
      });
    });

    it('should not update to IN_PROGRESS if already IN_PROGRESS', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockPrisma.stageConceptAssignment.findUnique.mockResolvedValue({
        id: 'sca_1',
        status: StageConceptStatus.IN_PROGRESS,
        conceptId: 'cpt_1',
      });
      mockPrisma.agentJob.findMany.mockResolvedValue([
        { status: 'RUNNING' },
      ]);

      await service.onConceptCompleted(TENANT_ID, 'cpt_1', NOTE_ID, USER_ID);

      // Should NOT call update since already IN_PROGRESS
      expect(mockPrisma.stageConceptAssignment.update).not.toHaveBeenCalled();
    });

    it('should mark assignment as COMPLETED when all jobs done', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockPrisma.stageConceptAssignment.findUnique.mockResolvedValue({
        id: 'sca_1',
        status: StageConceptStatus.IN_PROGRESS,
        conceptId: 'cpt_1',
      });
      mockPrisma.agentJob.findMany.mockResolvedValue([
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
      ]);
      mockPrisma.stageConceptAssignment.update.mockResolvedValue({});

      // Stage NOT complete (still other assignments)
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { status: StageConceptStatus.COMPLETED, personaType: PersonaType.CFO },
        { status: StageConceptStatus.PENDING, personaType: PersonaType.CMO },
      ]);

      const result = await service.onConceptCompleted(TENANT_ID, 'cpt_1', NOTE_ID, USER_ID);

      expect(result).toEqual({ stageCompleted: false });
      expect(mockPrisma.stageConceptAssignment.update).toHaveBeenCalledWith({
        where: { id: 'sca_1' },
        data: expect.objectContaining({
          status: StageConceptStatus.COMPLETED,
          noteId: NOTE_ID,
        }),
      });
    });

    it('should mark assignment as COMPLETED when no agent jobs exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockPrisma.stageConceptAssignment.findUnique.mockResolvedValue({
        id: 'sca_1',
        status: StageConceptStatus.PENDING,
        conceptId: 'cpt_1',
      });
      mockPrisma.agentJob.findMany.mockResolvedValue([]); // No jobs
      mockPrisma.stageConceptAssignment.update.mockResolvedValue({});
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { status: StageConceptStatus.COMPLETED, personaType: PersonaType.CFO },
        { status: StageConceptStatus.PENDING, personaType: PersonaType.CMO },
      ]);

      const result = await service.onConceptCompleted(TENANT_ID, 'cpt_1', NOTE_ID, USER_ID);

      expect(result).toEqual({ stageCompleted: false });
      expect(mockPrisma.stageConceptAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: StageConceptStatus.COMPLETED }),
        })
      );
    });

    it('should detect stage completion and return nextStage', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockPrisma.stageConceptAssignment.findUnique.mockResolvedValue({
        id: 'sca_1',
        status: StageConceptStatus.IN_PROGRESS,
        conceptId: 'cpt_1',
      });
      mockPrisma.agentJob.findMany.mockResolvedValue([{ status: 'COMPLETED' }]);
      mockPrisma.stageConceptAssignment.update.mockResolvedValue({});
      mockPrisma.stageCompletionLog.create.mockResolvedValue({});

      // All completed after this one finishes
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { status: StageConceptStatus.COMPLETED, personaType: PersonaType.CFO },
      ]);

      const result = await service.onConceptCompleted(TENANT_ID, 'cpt_1', NOTE_ID, USER_ID);

      expect(result.stageCompleted).toBe(true);
      expect(result.nextStage).toBe(MaturityStage.ADVANCED);
      expect(mockPrisma.stageCompletionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          stage: MaturityStage.BASIC,
          triggeredBy: USER_ID,
        }),
      });
    });

    it('should return no nextStage when AUTONOMOUS stage completes', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'AUTONOMOUS' });
      mockPrisma.stageConceptAssignment.findUnique.mockResolvedValue({
        id: 'sca_1',
        status: StageConceptStatus.IN_PROGRESS,
        conceptId: 'cpt_1',
      });
      mockPrisma.agentJob.findMany.mockResolvedValue([{ status: 'COMPLETED' }]);
      mockPrisma.stageConceptAssignment.update.mockResolvedValue({});
      mockPrisma.stageCompletionLog.create.mockResolvedValue({});

      // All completed
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { status: StageConceptStatus.COMPLETED, personaType: PersonaType.CFO },
      ]);

      const result = await service.onConceptCompleted(TENANT_ID, 'cpt_1', NOTE_ID, USER_ID);

      expect(result.stageCompleted).toBe(true);
      expect(result.nextStage).toBeUndefined();
    });
  });

  // ─── checkPrerequisites ───

  describe('checkPrerequisites', () => {
    it('should return canProceed=true when no prerequisites exist', async () => {
      mockPrisma.conceptRelationship.findMany.mockResolvedValue([]);

      const result = await service.checkPrerequisites(TENANT_ID, 'cpt_1', MaturityStage.BASIC);

      expect(result).toEqual({
        canProceed: true,
        warnings: [],
        prerequisiteOutputs: [],
      });
    });

    it('should return warnings for incomplete prerequisites', async () => {
      mockPrisma.conceptRelationship.findMany.mockResolvedValue([
        {
          sourceConceptId: 'cpt_prereq',
          targetConceptId: 'cpt_1',
          sourceConcept: { id: 'cpt_prereq', name: 'Prerequisite Concept' },
        },
      ]);
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { conceptId: 'cpt_prereq', status: StageConceptStatus.PENDING, noteId: null },
      ]);

      const result = await service.checkPrerequisites(TENANT_ID, 'cpt_1', MaturityStage.BASIC);

      expect(result.canProceed).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.conceptName).toBe('Prerequisite Concept');
      expect(result.warnings[0]!.status).toBe(StageConceptStatus.PENDING);
    });

    it('should include prerequisite outputs for completed concepts', async () => {
      mockPrisma.conceptRelationship.findMany.mockResolvedValue([
        {
          sourceConceptId: 'cpt_prereq',
          targetConceptId: 'cpt_1',
          sourceConcept: { id: 'cpt_prereq', name: 'Done Prereq' },
        },
      ]);
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { conceptId: 'cpt_prereq', status: StageConceptStatus.COMPLETED, noteId: 'note_pre' },
      ]);
      mockPrisma.note.findMany.mockResolvedValue([
        { id: 'note_pre', userReport: 'Full report content here', content: 'raw' },
      ]);

      const result = await service.checkPrerequisites(TENANT_ID, 'cpt_1', MaturityStage.BASIC);

      expect(result.canProceed).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.prerequisiteOutputs).toHaveLength(1);
      expect(result.prerequisiteOutputs[0]!.conceptName).toBe('Done Prereq');
      expect(result.prerequisiteOutputs[0]!.outputSummary).toBe('Full report content here');
    });

    it('should use content when userReport is missing', async () => {
      mockPrisma.conceptRelationship.findMany.mockResolvedValue([
        {
          sourceConceptId: 'cpt_prereq',
          targetConceptId: 'cpt_1',
          sourceConcept: { id: 'cpt_prereq', name: 'Done Prereq' },
        },
      ]);
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { conceptId: 'cpt_prereq', status: StageConceptStatus.COMPLETED, noteId: 'note_pre' },
      ]);
      mockPrisma.note.findMany.mockResolvedValue([
        { id: 'note_pre', userReport: '', content: 'Fallback content' },
      ]);

      const result = await service.checkPrerequisites(TENANT_ID, 'cpt_1', MaturityStage.BASIC);

      expect(result.prerequisiteOutputs[0]!.outputSummary).toBe('Fallback content');
    });

    it('should truncate output to 2000 chars', async () => {
      const longContent = 'x'.repeat(3000);
      mockPrisma.conceptRelationship.findMany.mockResolvedValue([
        {
          sourceConceptId: 'cpt_prereq',
          targetConceptId: 'cpt_1',
          sourceConcept: { id: 'cpt_prereq', name: 'Done' },
        },
      ]);
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { conceptId: 'cpt_prereq', status: StageConceptStatus.COMPLETED, noteId: 'note_pre' },
      ]);
      mockPrisma.note.findMany.mockResolvedValue([
        { id: 'note_pre', userReport: longContent, content: '' },
      ]);

      const result = await service.checkPrerequisites(TENANT_ID, 'cpt_1', MaturityStage.BASIC);

      expect(result.prerequisiteOutputs[0]!.outputSummary).toHaveLength(2000);
    });

    it('should batch-load notes in a single findMany call', async () => {
      mockPrisma.conceptRelationship.findMany.mockResolvedValue([
        {
          sourceConceptId: 'cpt_a',
          targetConceptId: 'cpt_1',
          sourceConcept: { id: 'cpt_a', name: 'A' },
        },
        {
          sourceConceptId: 'cpt_b',
          targetConceptId: 'cpt_1',
          sourceConcept: { id: 'cpt_b', name: 'B' },
        },
      ]);
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { conceptId: 'cpt_a', status: StageConceptStatus.COMPLETED, noteId: 'note_a' },
        { conceptId: 'cpt_b', status: StageConceptStatus.COMPLETED, noteId: 'note_b' },
      ]);
      mockPrisma.note.findMany.mockResolvedValue([
        { id: 'note_a', userReport: 'A output', content: '' },
        { id: 'note_b', userReport: 'B output', content: '' },
      ]);

      await service.checkPrerequisites(TENANT_ID, 'cpt_1', MaturityStage.BASIC);

      // Only one note.findMany call for all notes
      expect(mockPrisma.note.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.note.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['note_a', 'note_b'] } },
        select: { id: true, userReport: true, content: true },
      });
    });

    it('should handle missing assignment for prerequisite', async () => {
      mockPrisma.conceptRelationship.findMany.mockResolvedValue([
        {
          sourceConceptId: 'cpt_missing',
          targetConceptId: 'cpt_1',
          sourceConcept: { id: 'cpt_missing', name: 'Missing' },
        },
      ]);
      // No assignments at all
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([]);

      const result = await service.checkPrerequisites(TENANT_ID, 'cpt_1', MaturityStage.BASIC);

      expect(result.canProceed).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.status).toBe(StageConceptStatus.PENDING);
    });
  });

  // ─── transitionToNextStage ───

  describe('transitionToNextStage', () => {
    it('should transition BASIC → ADVANCED', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });

      // getStageProgress: all completed
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { status: StageConceptStatus.COMPLETED, personaType: PersonaType.CFO },
      ]);

      // initializeStage for ADVANCED
      mockPrisma.stageConceptAssignment.count
        .mockResolvedValueOnce(0) // initial check
        .mockResolvedValue(5);    // final count
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockClassifier.classifyForStage.mockResolvedValue([]);

      const result = await service.transitionToNextStage(TENANT_ID, USER_ID);

      expect(result.newStage).toBe(MaturityStage.ADVANCED);
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: TENANT_ID },
        data: { maturityStage: MaturityStage.ADVANCED },
      });
    });

    it('should throw when current stage is not complete', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });

      // getStageProgress: not all completed
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { status: StageConceptStatus.COMPLETED, personaType: PersonaType.CFO },
        { status: StageConceptStatus.PENDING, personaType: PersonaType.CMO },
      ]);

      await expect(service.transitionToNextStage(TENANT_ID, USER_ID))
        .rejects.toThrow('Cannot transition');
    });

    it('should throw when already at AUTONOMOUS', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'AUTONOMOUS' });

      // All completed
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { status: StageConceptStatus.COMPLETED, personaType: PersonaType.CFO },
      ]);

      await expect(service.transitionToNextStage(TENANT_ID, USER_ID))
        .rejects.toThrow('Already at maximum maturity stage');
    });

    it('should throw when maturity engine not initialized', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: null });

      await expect(service.transitionToNextStage(TENANT_ID, USER_ID))
        .rejects.toThrow('Maturity engine not initialized');
    });
  });

  // ─── linkDiscoveredTasksToStage ───

  describe('linkDiscoveredTasksToStage', () => {
    it('should update PENDING assignments to IN_PROGRESS with noteId', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockPrisma.stageConceptAssignment.updateMany.mockResolvedValue({ count: 1 });

      await service.linkDiscoveredTasksToStage(TENANT_ID, [
        { noteId: 'note_1', conceptId: 'cpt_1' },
      ]);

      expect(mockPrisma.stageConceptAssignment.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          conceptId: 'cpt_1',
          stage: MaturityStage.BASIC,
          status: StageConceptStatus.PENDING,
          noteId: null,
        },
        data: {
          noteId: 'note_1',
          status: StageConceptStatus.IN_PROGRESS,
        },
      });
    });

    it('should skip when no maturity stage set', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: null });

      await service.linkDiscoveredTasksToStage(TENANT_ID, [
        { noteId: 'note_1', conceptId: 'cpt_1' },
      ]);

      expect(mockPrisma.stageConceptAssignment.updateMany).not.toHaveBeenCalled();
    });
  });
});
