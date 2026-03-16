import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { MaturityController } from './maturity.controller';
import { MaturityEngineService } from './maturity-engine.service';
import { StalenessDetectorService } from './staleness-detector.service';
import { AutonomousSchedulerService } from './autonomous-scheduler.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MaturityStage, StageConceptStatus } from '@mentor-ai/shared/types';

describe('MaturityController', () => {
  let controller: MaturityController;

  const mockEngine = {
    getStageProgress: jest.fn(),
    initializeStage: jest.fn(),
    transitionToNextStage: jest.fn(),
    checkPrerequisites: jest.fn(),
  };

  const mockStaleness = {
    scanStage: jest.fn(),
    checkStaleness: jest.fn(),
    triggerReExecution: jest.fn(),
  };

  const mockScheduler = {
    runForTenant: jest.fn(),
  };

  const mockPrisma = {
    tenant: { findUnique: jest.fn() },
    stageConceptAssignment: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    concept: { findMany: jest.fn() },
    autonomousRun: { findMany: jest.fn() },
    note: { findMany: jest.fn(), count: jest.fn() },
  };

  const mockUser = { tenantId: 'tnt_test', userId: 'usr_test' };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaturityController],
      providers: [
        { provide: MaturityEngineService, useValue: mockEngine },
        { provide: StalenessDetectorService, useValue: mockStaleness },
        { provide: AutonomousSchedulerService, useValue: mockScheduler },
        { provide: PlatformPrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MaturityController>(MaturityController);
  });

  // ─── GET /stage ───

  describe('getCurrentStage', () => {
    it('should return dashboard with progress and stale concepts', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockEngine.getStageProgress.mockResolvedValue({
        stage: MaturityStage.BASIC,
        totalAssignments: 5,
        completed: 3,
        inProgress: 1,
        pending: 1,
        stale: 0,
        completionPercent: 60,
        canTransition: false,
        byPersona: {},
      });
      mockStaleness.scanStage.mockResolvedValue([]);

      const result = await controller.getCurrentStage(mockUser as any);

      expect(result.data.currentStage).toBe(MaturityStage.BASIC);
      expect(result.data.progress).toBeTruthy();
      expect(result.data.staleConcepts).toEqual([]);
    });

    it('should return null progress when no stage set', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: null });

      const result = await controller.getCurrentStage(mockUser as any);

      expect(result.data.currentStage).toBeNull();
      expect(result.data.progress).toBeNull();
      expect(result.data.staleConcepts).toEqual([]);
    });

    it('should batch-load concept names for stale results', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockEngine.getStageProgress.mockResolvedValue({
        stage: MaturityStage.BASIC, totalAssignments: 2, completed: 2,
        inProgress: 0, pending: 0, stale: 0, completionPercent: 100,
        canTransition: true, byPersona: {},
      });
      mockStaleness.scanStage.mockResolvedValue([
        { assignmentId: 'sca_1', conceptId: 'cpt_1', reason: 'Stale reason' },
      ]);
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'cpt_1', name: 'Test Concept' },
      ]);
      mockPrisma.stageConceptAssignment = {
        ...mockPrisma.stageConceptAssignment,
        findMany: jest.fn().mockResolvedValue([
          { id: 'sca_1', completedAt: new Date('2025-01-01') },
        ]),
      } as any;

      const result = await controller.getCurrentStage(mockUser as any);

      expect(result.data.staleConcepts).toHaveLength(1);
      expect(result.data.staleConcepts[0]!.conceptName).toBe('Test Concept');
    });
  });

  // ─── POST /stage/:stage/initialize ───

  describe('initializeStage', () => {
    it('should initialize stage and return assignment count', async () => {
      mockPrisma.stageConceptAssignment.count.mockResolvedValue(0);
      mockEngine.initializeStage.mockResolvedValue({ assignmentCount: 15 });

      const result = await controller.initializeStage('BASIC', mockUser as any);

      expect(result.data.assignmentCount).toBe(15);
    });

    it('should return 409 if stage already initialized', async () => {
      mockPrisma.stageConceptAssignment.count.mockResolvedValue(10);

      await expect(
        controller.initializeStage('BASIC', mockUser as any)
      ).rejects.toThrow(HttpException);

      try {
        await controller.initializeStage('BASIC', mockUser as any);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
      }
    });

    it('should return 400 for invalid stage name', async () => {
      await expect(
        controller.initializeStage('INVALID_STAGE', mockUser as any)
      ).rejects.toThrow(HttpException);

      try {
        await controller.initializeStage('INVALID_STAGE', mockUser as any);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
    });
  });

  // ─── POST /stage/transition ───

  describe('transitionStage', () => {
    it('should transition to next stage', async () => {
      mockEngine.transitionToNextStage.mockResolvedValue({
        newStage: MaturityStage.ADVANCED,
      });

      const result = await controller.transitionStage(mockUser as any);

      expect(result.data.newStage).toBe(MaturityStage.ADVANCED);
    });

    it('should return 400 when transition fails', async () => {
      mockEngine.transitionToNextStage.mockRejectedValue(
        new Error('Cannot transition: stage BASIC is not complete')
      );

      await expect(
        controller.transitionStage(mockUser as any)
      ).rejects.toThrow(HttpException);
    });
  });

  // ─── GET /concept/:id/prerequisites ───

  describe('checkPrerequisites', () => {
    it('should return prerequisite check results', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockEngine.checkPrerequisites.mockResolvedValue({
        canProceed: true,
        warnings: [],
        prerequisiteOutputs: [],
      });

      const result = await controller.checkPrerequisites('cpt_1', mockUser as any);

      expect(result.data.canProceed).toBe(true);
    });

    it('should return canProceed=true when no maturity stage', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: null });

      const result = await controller.checkPrerequisites('cpt_1', mockUser as any);

      expect(result.data.canProceed).toBe(true);
      expect(mockEngine.checkPrerequisites).not.toHaveBeenCalled();
    });
  });

  // ─── POST /concept/:id/re-execute ───

  describe('reExecuteConcept', () => {
    it('should trigger re-execution for COMPLETED assignment', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockPrisma.stageConceptAssignment.findFirst.mockResolvedValue({
        id: 'sca_1', status: 'COMPLETED',
      });
      mockStaleness.checkStaleness.mockResolvedValue({
        isStale: true, reason: 'Time decay',
      });
      mockStaleness.triggerReExecution.mockResolvedValue({
        newNoteId: 'note_new', version: 2,
      });

      const result = await controller.reExecuteConcept('cpt_1', mockUser as any);

      expect(result.data.newNoteId).toBe('note_new');
      expect(result.data.version).toBe(2);
    });

    it('should return 400 when maturity not initialized', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: null });

      await expect(
        controller.reExecuteConcept('cpt_1', mockUser as any)
      ).rejects.toThrow(HttpException);
    });

    it('should return 404 when assignment not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockPrisma.stageConceptAssignment.findFirst.mockResolvedValue(null);

      try {
        await controller.reExecuteConcept('cpt_1', mockUser as any);
        fail('Expected HttpException');
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('should return 409 when assignment not COMPLETED', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockPrisma.stageConceptAssignment.findFirst.mockResolvedValue({
        id: 'sca_1', status: 'IN_PROGRESS',
      });

      try {
        await controller.reExecuteConcept('cpt_1', mockUser as any);
        fail('Expected HttpException');
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
      }
    });

    it('should return 409 when triggerReExecution fails (concurrent)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockPrisma.stageConceptAssignment.findFirst.mockResolvedValue({
        id: 'sca_1', status: 'COMPLETED',
      });
      mockStaleness.checkStaleness.mockResolvedValue({ isStale: false });
      mockStaleness.triggerReExecution.mockRejectedValue(
        new Error('No completed assignment found')
      );

      try {
        await controller.reExecuteConcept('cpt_1', mockUser as any);
        fail('Expected HttpException');
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
      }
    });
  });

  // ─── GET /staleness ───

  describe('getStaleConcepts', () => {
    it('should return stale concepts with names', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });
      mockStaleness.scanStage.mockResolvedValue([
        { assignmentId: 'sca_1', conceptId: 'cpt_1', reason: 'Old data' },
      ]);
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'cpt_1', name: 'Test Concept' },
      ]);

      const result = await controller.getStaleConcepts(mockUser as any);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.conceptName).toBe('Test Concept');
    });

    it('should return empty array when no maturity stage', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: null });

      const result = await controller.getStaleConcepts(mockUser as any);

      expect(result.data).toEqual([]);
    });
  });

  // ─── GET /autonomous/status ───

  describe('getAutonomousStatus', () => {
    it('should return autonomous status with recent runs', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'AUTONOMOUS' });
      const runDate = new Date('2025-01-15T10:00:00Z');
      const completedDate = new Date('2025-01-15T10:05:00Z');
      mockPrisma.autonomousRun.findMany.mockResolvedValue([
        {
          id: 'run_1',
          runType: 'staleness_scan',
          staleFound: 2,
          reExecuted: 1,
          tasksCompleted: 1,
          startedAt: runDate,
          completedAt: completedDate,
          status: 'COMPLETED',
        },
      ]);

      const result = await controller.getAutonomousStatus(mockUser as any);

      expect(result.data.enabled).toBe(true);
      expect(result.data.lastRun).toBeTruthy();
      expect(result.data.lastRun!.runId).toBe('run_1');
      expect(result.data.recentRuns).toHaveLength(1);
    });
  });

  // ─── POST /autonomous/trigger ───

  describe('triggerAutonomousRun', () => {
    it('should trigger run for AUTONOMOUS tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'AUTONOMOUS' });
      mockScheduler.runForTenant.mockResolvedValue({
        runId: 'run_1', staleFound: 3, reExecuted: 2,
        tasksCompleted: 2, status: 'COMPLETED',
      });

      const result = await controller.triggerAutonomousRun(mockUser as any);

      expect(result.data.staleFound).toBe(3);
    });

    it('should return 400 for non-AUTONOMOUS tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'BASIC' });

      await expect(
        controller.triggerAutonomousRun(mockUser as any)
      ).rejects.toThrow(HttpException);
    });
  });

  // ─── GET /digests ───

  describe('getDigests', () => {
    it('should return digest notes for the tenant', async () => {
      const now = new Date();
      mockPrisma.note.findMany.mockResolvedValue([
        {
          id: 'note_digest_1',
          title: 'Nedeljni izvestaj — 13. januar 2025.',
          content: 'A'.repeat(250),
          createdAt: now,
        },
      ]);
      mockPrisma.note.count.mockResolvedValue(1);

      const result = await controller.getDigests(mockUser as any);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.id).toBe('note_digest_1');
      expect(result.data[0]!.contentPreview.length).toBeLessThanOrEqual(203);
      expect(result.data[0]!.content.length).toBe(250);
      expect(result.total).toBe(1);
    });

    it('should return empty array when no digests exist', async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      const result = await controller.getDigests(mockUser as any);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should respect limit and offset params', async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      await controller.getDigests(mockUser as any, '3', '10');

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 3,
          skip: 10,
        }),
      );
    });
  });
});
