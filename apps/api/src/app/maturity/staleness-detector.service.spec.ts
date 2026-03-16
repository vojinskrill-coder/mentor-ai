import { StalenessDetectorService } from './staleness-detector.service';
import { MaturityStage, StageConceptStatus } from '@mentor-ai/shared/types';

jest.mock('@paralleldrive/cuid2', () => ({
  createId: jest.fn(() => 'mock_cuid_id'),
}));

describe('StalenessDetectorService', () => {
  let service: StalenessDetectorService;

  const mockPrisma = {
    stageConceptAssignment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    conceptRelationship: {
      findMany: jest.fn(),
    },
    concept: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    note: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const TENANT_ID = 'tnt_test_001';
  const USER_ID = 'usr_test_001';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StalenessDetectorService(mockPrisma as any);
  });

  // ─── checkStaleness ───

  describe('checkStaleness', () => {
    it('should return isStale=false for non-completed assignment', async () => {
      mockPrisma.stageConceptAssignment.findUnique.mockResolvedValue({
        id: 'sca_1',
        status: StageConceptStatus.PENDING,
        completedAt: null,
      });

      const result = await service.checkStaleness(TENANT_ID, 'sca_1');

      expect(result).toEqual({ isStale: false });
    });

    it('should return isStale=false when assignment not found', async () => {
      mockPrisma.stageConceptAssignment.findUnique.mockResolvedValue(null);

      const result = await service.checkStaleness(TENANT_ID, 'sca_nonexistent');

      expect(result).toEqual({ isStale: false });
    });

    it('should detect PREREQUISITE_RERUN staleness', async () => {
      const assignmentDate = new Date('2025-01-01');
      const prereqDate = new Date('2025-01-15'); // After assignment

      mockPrisma.stageConceptAssignment.findUnique.mockResolvedValue({
        id: 'sca_1',
        conceptId: 'cpt_target',
        stage: MaturityStage.BASIC,
        status: StageConceptStatus.COMPLETED,
        completedAt: assignmentDate,
      });

      mockPrisma.conceptRelationship.findMany.mockResolvedValue([
        { sourceConceptId: 'cpt_prereq' },
      ]);

      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([
        { conceptId: 'cpt_prereq', completedAt: prereqDate },
      ]);

      mockPrisma.concept.findUnique.mockResolvedValue({
        id: 'cpt_prereq',
        name: 'Prereq Concept',
      });

      const result = await service.checkStaleness(TENANT_ID, 'sca_1');

      expect(result.isStale).toBe(true);
      expect(result.reason).toContain('Prereq Concept');
    });

    it('should detect TIME_DECAY staleness (>30 days)', async () => {
      const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000); // 45 days ago

      mockPrisma.stageConceptAssignment.findUnique.mockResolvedValue({
        id: 'sca_1',
        conceptId: 'cpt_1',
        stage: MaturityStage.BASIC,
        status: StageConceptStatus.COMPLETED,
        completedAt: oldDate,
      });

      mockPrisma.conceptRelationship.findMany.mockResolvedValue([]); // No prereqs

      const result = await service.checkStaleness(TENANT_ID, 'sca_1');

      expect(result.isStale).toBe(true);
      expect(result.reason).toContain('30');
      expect(result.reason).toContain('45');
    });

    it('should return isStale=false when no staleness triggers match', async () => {
      const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

      mockPrisma.stageConceptAssignment.findUnique.mockResolvedValue({
        id: 'sca_1',
        conceptId: 'cpt_1',
        stage: MaturityStage.BASIC,
        status: StageConceptStatus.COMPLETED,
        completedAt: recentDate,
      });

      mockPrisma.conceptRelationship.findMany.mockResolvedValue([]); // No prereqs

      const result = await service.checkStaleness(TENANT_ID, 'sca_1');

      expect(result).toEqual({ isStale: false });
    });

    it('should not detect staleness when prerequisite completed before this assignment', async () => {
      const prereqDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const assignmentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago (after prereq)

      mockPrisma.stageConceptAssignment.findUnique.mockResolvedValue({
        id: 'sca_1',
        conceptId: 'cpt_target',
        stage: MaturityStage.BASIC,
        status: StageConceptStatus.COMPLETED,
        completedAt: assignmentDate,
      });

      mockPrisma.conceptRelationship.findMany.mockResolvedValue([
        { sourceConceptId: 'cpt_prereq' },
      ]);

      // Prereq completed BEFORE this assignment — not stale
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([]);

      const result = await service.checkStaleness(TENANT_ID, 'sca_1');

      expect(result).toEqual({ isStale: false });
    });
  });

  // ─── scanStage ───

  describe('scanStage', () => {
    it('should return empty array when no completed assignments', async () => {
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([]);

      const result = await service.scanStage(TENANT_ID, MaturityStage.BASIC);

      expect(result).toEqual([]);
    });

    it('should detect PREREQUISITE_RERUN when prereq completed later', async () => {
      const assignmentDate = new Date('2025-01-01');
      const prereqDate = new Date('2025-01-15');

      // Query 1: Completed assignments
      mockPrisma.stageConceptAssignment.findMany
        .mockResolvedValueOnce([
          { id: 'sca_1', conceptId: 'cpt_target', completedAt: assignmentDate },
        ]);

      // Query 2: Prerequisites
      mockPrisma.conceptRelationship.findMany.mockResolvedValue([
        { sourceConceptId: 'cpt_prereq', targetConceptId: 'cpt_target' },
      ]);

      // Query 3: Prereq assignments
      mockPrisma.stageConceptAssignment.findMany
        .mockResolvedValueOnce([
          { conceptId: 'cpt_prereq', completedAt: prereqDate },
        ]);

      // Query 4: Concept names
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'cpt_prereq', name: 'Prereq Name' },
      ]);

      const result = await service.scanStage(TENANT_ID, MaturityStage.BASIC);

      expect(result).toHaveLength(1);
      expect(result[0]!.conceptId).toBe('cpt_target');
      expect(result[0]!.reason).toContain('Prereq Name');
    });

    it('should detect TIME_DECAY for old completions', async () => {
      const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);

      mockPrisma.stageConceptAssignment.findMany
        .mockResolvedValueOnce([
          { id: 'sca_1', conceptId: 'cpt_1', completedAt: oldDate },
        ]);

      // No prerequisites
      mockPrisma.conceptRelationship.findMany.mockResolvedValue([]);

      const result = await service.scanStage(TENANT_ID, MaturityStage.BASIC);

      expect(result).toHaveLength(1);
      expect(result[0]!.reason).toContain('30');
    });

    it('should handle concepts with no prerequisites', async () => {
      const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

      mockPrisma.stageConceptAssignment.findMany
        .mockResolvedValueOnce([
          { id: 'sca_1', conceptId: 'cpt_1', completedAt: recentDate },
        ]);

      mockPrisma.conceptRelationship.findMany.mockResolvedValue([]);

      const result = await service.scanStage(TENANT_ID, MaturityStage.BASIC);

      expect(result).toEqual([]); // Recent + no prereqs = not stale
    });

    it('should handle assignments with null completedAt', async () => {
      mockPrisma.stageConceptAssignment.findMany
        .mockResolvedValueOnce([
          { id: 'sca_1', conceptId: 'cpt_1', completedAt: null },
        ]);

      mockPrisma.conceptRelationship.findMany.mockResolvedValue([]);

      const result = await service.scanStage(TENANT_ID, MaturityStage.BASIC);

      expect(result).toEqual([]); // null completedAt skipped
    });
  });

  // ─── triggerReExecution ───

  describe('triggerReExecution', () => {
    it('should create new PENDING note and mark assignment STALE', async () => {
      const mockTx = {
        stageConceptAssignment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'sca_1',
            conceptId: 'cpt_1',
            version: 1,
            noteId: 'note_old',
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        concept: {
          findUnique: jest.fn().mockResolvedValue({ name: 'Test Concept' }),
        },
        note: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.triggerReExecution(
        TENANT_ID, 'cpt_1', 'Stale reason', USER_ID
      );

      expect(result.newNoteId).toBe('note_mock_cuid_id');
      expect(result.version).toBe(2);

      expect(mockTx.note.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'note_mock_cuid_id',
          status: 'PENDING',
          noteType: 'TASK',
          conceptId: 'cpt_1',
          reusedFromNoteId: 'note_old',
        }),
      });

      expect(mockTx.stageConceptAssignment.update).toHaveBeenCalledWith({
        where: { id: 'sca_1' },
        data: {
          status: StageConceptStatus.STALE,
          staleReason: 'Stale reason',
          version: 2,
          noteId: 'note_mock_cuid_id',
        },
      });
    });

    it('should increment version number', async () => {
      const mockTx = {
        stageConceptAssignment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'sca_1', conceptId: 'cpt_1', version: 3, noteId: 'old',
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        concept: { findUnique: jest.fn().mockResolvedValue({ name: 'C' }) },
        note: { create: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.triggerReExecution(
        TENANT_ID, 'cpt_1', 'reason', USER_ID
      );

      expect(result.version).toBe(4);
    });

    it('should use note_ prefix on new note ID', async () => {
      const mockTx = {
        stageConceptAssignment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'sca_1', conceptId: 'cpt_1', version: 1, noteId: 'old',
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        concept: { findUnique: jest.fn().mockResolvedValue({ name: 'C' }) },
        note: { create: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.triggerReExecution(
        TENANT_ID, 'cpt_1', 'reason', USER_ID
      );

      expect(result.newNoteId).toMatch(/^note_/);
    });

    it('should throw when no COMPLETED assignment found', async () => {
      const mockTx = {
        stageConceptAssignment: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));

      await expect(
        service.triggerReExecution(TENANT_ID, 'cpt_1', 'reason', USER_ID)
      ).rejects.toThrow('No completed assignment found');
    });

    it('should filter by stage when provided', async () => {
      const mockTx = {
        stageConceptAssignment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'sca_1', conceptId: 'cpt_1', version: 1, noteId: 'old',
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        concept: { findUnique: jest.fn().mockResolvedValue({ name: 'C' }) },
        note: { create: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));

      await service.triggerReExecution(
        TENANT_ID, 'cpt_1', 'reason', USER_ID, MaturityStage.AUTONOMOUS
      );

      expect(mockTx.stageConceptAssignment.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          stage: MaturityStage.AUTONOMOUS,
        }),
      });
    });

    it('should use $transaction for atomicity', async () => {
      const mockTx = {
        stageConceptAssignment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'sca_1', conceptId: 'cpt_1', version: 1, noteId: 'old',
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        concept: { findUnique: jest.fn().mockResolvedValue({ name: 'C' }) },
        note: { create: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));

      await service.triggerReExecution(TENANT_ID, 'cpt_1', 'reason', USER_ID);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should handle concept with no name gracefully', async () => {
      const mockTx = {
        stageConceptAssignment: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'sca_1', conceptId: 'cpt_1', version: 1, noteId: 'old',
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        concept: { findUnique: jest.fn().mockResolvedValue(null) },
        note: { create: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockTx));

      const result = await service.triggerReExecution(
        TENANT_ID, 'cpt_1', 'reason', USER_ID
      );

      // Should use conceptId as fallback in title
      expect(mockTx.note.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: expect.stringContaining('cpt_1'),
        }),
      });
      expect(result.version).toBe(2);
    });
  });
});
