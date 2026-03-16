import { AutonomousSchedulerService } from './autonomous-scheduler.service';
import { MaturityStage } from '@mentor-ai/shared/types';

jest.mock('@paralleldrive/cuid2', () => ({
  createId: jest.fn(() => 'mock_cuid_id'),
}));

describe('AutonomousSchedulerService', () => {
  let service: AutonomousSchedulerService;

  const mockPrisma = {
    tenant: { findMany: jest.fn(), findUnique: jest.fn() },
    stageConceptAssignment: { findMany: jest.fn() },
    note: { findMany: jest.fn(), create: jest.fn() },
    autonomousRun: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    user: { findFirst: jest.fn() },
  };

  const mockStaleness = {
    scanStage: jest.fn(),
    checkStaleness: jest.fn(),
    triggerReExecution: jest.fn(),
  };

  const mockMaturityEngine = {
    getStageProgress: jest.fn(),
  };

  const mockHeadlessExecutor = {
    executeBatch: jest.fn(),
  };

  const mockAiGateway = {
    streamCompletionWithContext: jest.fn(),
  };

  const mockWsHolder = {
    emitToTenant: jest.fn(),
  };

  const TENANT_ID = 'tnt_test_001';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AutonomousSchedulerService(
      mockPrisma as any,
      mockStaleness as any,
      mockMaturityEngine as any,
      mockHeadlessExecutor as any,
      mockAiGateway as any,
      mockWsHolder as any,
    );
  });

  // ─── runStalenessForTenant (via runForTenant) ───

  describe('runForTenant / runStalenessForTenant', () => {
    it('should create AutonomousRun and execute staleness scan', async () => {
      mockPrisma.autonomousRun.findFirst.mockResolvedValue(null); // No running
      mockPrisma.autonomousRun.create.mockResolvedValue({ id: 'run_1' });
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'AUTONOMOUS' });
      mockStaleness.scanStage.mockResolvedValue([
        { assignmentId: 'sca_1', conceptId: 'cpt_1', reason: 'Stale' },
      ]);
      mockStaleness.triggerReExecution.mockResolvedValue({
        newNoteId: 'note_new', version: 2,
      });
      mockHeadlessExecutor.executeBatch.mockResolvedValue({ completed: 1 });
      mockPrisma.autonomousRun.update.mockResolvedValue({});

      const result = await service.runForTenant(TENANT_ID, 'system');

      expect(result.staleFound).toBe(1);
      expect(result.reExecuted).toBe(1);
      expect(result.tasksCompleted).toBe(1);
      expect(result.status).toBe('COMPLETED');
      expect(mockPrisma.autonomousRun.create).toHaveBeenCalled();
    });

    it('should skip when no maturity stage set', async () => {
      mockPrisma.autonomousRun.findFirst.mockResolvedValue(null);
      mockPrisma.autonomousRun.create.mockResolvedValue({ id: 'run_1' });
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: null });
      mockPrisma.autonomousRun.update.mockResolvedValue({});

      const result = await service.runForTenant(TENANT_ID, 'system');

      expect(result.staleFound).toBe(0);
      expect(mockStaleness.scanStage).not.toHaveBeenCalled();
    });

    it('should skip when scan already RUNNING (race lock)', async () => {
      const recentStart = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
      mockPrisma.autonomousRun.findFirst.mockResolvedValue({
        id: 'run_existing', startedAt: recentStart,
      });

      const result = await service.runForTenant(TENANT_ID, 'system');

      expect(result.runId).toBe('run_existing');
      expect(result.staleFound).toBe(0);
      expect(mockPrisma.autonomousRun.create).not.toHaveBeenCalled();
    });

    it('should clean up stuck runs older than 30 minutes', async () => {
      const oldStart = new Date(Date.now() - 45 * 60 * 1000); // 45 min ago
      mockPrisma.autonomousRun.findFirst.mockResolvedValue({
        id: 'run_stuck', startedAt: oldStart,
      });
      mockPrisma.autonomousRun.update.mockResolvedValue({});
      mockPrisma.autonomousRun.create.mockResolvedValue({ id: 'run_new' });
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'AUTONOMOUS' });
      mockStaleness.scanStage.mockResolvedValue([]);

      await service.runForTenant(TENANT_ID, 'system');

      // Should mark stuck run as FAILED
      expect(mockPrisma.autonomousRun.update).toHaveBeenCalledWith({
        where: { id: 'run_stuck' },
        data: expect.objectContaining({
          status: 'FAILED',
          error: expect.stringContaining('30 minutes'),
        }),
      });
      // Should proceed with new run
      expect(mockPrisma.autonomousRun.create).toHaveBeenCalled();
    });

    it('should complete run with correct stats', async () => {
      mockPrisma.autonomousRun.findFirst.mockResolvedValue(null);
      mockPrisma.autonomousRun.create.mockResolvedValue({ id: 'run_1' });
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'AUTONOMOUS' });
      mockStaleness.scanStage.mockResolvedValue([
        { assignmentId: 'sca_1', conceptId: 'cpt_1', reason: 'R1' },
        { assignmentId: 'sca_2', conceptId: 'cpt_2', reason: 'R2' },
      ]);
      mockStaleness.triggerReExecution.mockResolvedValue({ newNoteId: 'n', version: 2 });
      mockHeadlessExecutor.executeBatch.mockResolvedValue({ completed: 2 });
      mockPrisma.autonomousRun.update.mockResolvedValue({});

      const result = await service.runForTenant(TENANT_ID, 'system');

      expect(result.staleFound).toBe(2);
      expect(result.reExecuted).toBe(2);
      expect(result.tasksCompleted).toBe(2);
    });

    it('should fail run on error', async () => {
      mockPrisma.autonomousRun.findFirst.mockResolvedValue(null);
      mockPrisma.autonomousRun.create.mockResolvedValue({ id: 'run_1' });
      mockPrisma.tenant.findUnique.mockRejectedValue(new Error('DB down'));
      mockPrisma.autonomousRun.update.mockResolvedValue({});

      await expect(
        service.runForTenant(TENANT_ID, 'system')
      ).rejects.toThrow('DB down');

      expect(mockPrisma.autonomousRun.update).toHaveBeenCalledWith({
        where: { id: 'run_1' },
        data: expect.objectContaining({
          status: 'FAILED',
          error: 'DB down',
        }),
      });
    });
  });

  // ─── dailyStalenessRun ───

  describe('dailyStalenessRun', () => {
    it('should skip when no autonomous tenants', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([]);

      await service.dailyStalenessRun();

      expect(mockPrisma.autonomousRun.create).not.toHaveBeenCalled();
    });

    it('should run staleness for each autonomous tenant', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: 'tnt_1', name: 'T1' },
        { id: 'tnt_2', name: 'T2' },
      ]);

      // For each tenant: no running, create run, find tenant stage, scan empty
      mockPrisma.autonomousRun.findFirst.mockResolvedValue(null);
      mockPrisma.autonomousRun.create.mockResolvedValue({ id: 'run_x' });
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'AUTONOMOUS' });
      mockStaleness.scanStage.mockResolvedValue([]);
      mockPrisma.autonomousRun.update.mockResolvedValue({});

      await service.dailyStalenessRun();

      // Should process both tenants
      expect(mockPrisma.autonomousRun.create).toHaveBeenCalledTimes(2);
    });

    it('should handle per-tenant errors gracefully', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: 'tnt_fail', name: 'Fail' },
        { id: 'tnt_ok', name: 'OK' },
      ]);

      // First tenant fails, second succeeds
      mockPrisma.autonomousRun.findFirst.mockResolvedValue(null);
      mockPrisma.autonomousRun.create
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ id: 'run_2' });
      mockPrisma.tenant.findUnique.mockResolvedValue({ maturityStage: 'AUTONOMOUS' });
      mockStaleness.scanStage.mockResolvedValue([]);
      mockPrisma.autonomousRun.update.mockResolvedValue({});

      // Should not throw
      await service.dailyStalenessRun();
    });
  });

  // ─── weeklyKpiMonitor ───

  describe('weeklyKpiMonitor', () => {
    it('should complete run with zero when no recent completions', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: 'tnt_1', name: 'T' }]);
      mockPrisma.autonomousRun.create.mockResolvedValue({ id: 'run_1' });
      mockPrisma.stageConceptAssignment.findMany.mockResolvedValue([]);
      mockPrisma.autonomousRun.update.mockResolvedValue({});

      await service.weeklyKpiMonitor();

      expect(mockPrisma.autonomousRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            staleFound: 0,
            reExecuted: 0,
          }),
        })
      );
    });
  });

  // ─── weeklyDigest ───

  describe('weeklyDigest', () => {
    it('should generate digest via LLM and save as note', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: 'tnt_1', name: 'Test Co' }]);
      mockPrisma.autonomousRun.create.mockResolvedValue({ id: 'run_1' });
      mockMaturityEngine.getStageProgress.mockResolvedValue({
        totalAssignments: 10, completed: 8, inProgress: 1,
        completionPercent: 80,
      });
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.autonomousRun.findMany.mockResolvedValue([]);
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        (_msgs: any, _opts: any, cb: (chunk: string) => void) => {
          cb('## Weekly Report\nEverything good.');
          return Promise.resolve();
        }
      );
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'usr_1' });
      mockPrisma.note.create.mockResolvedValue({});
      mockPrisma.autonomousRun.update.mockResolvedValue({});

      await service.weeklyDigest();

      expect(mockPrisma.note.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: expect.stringContaining('note_'),
          noteType: 'SUMMARY',
          status: 'COMPLETED',
          tenantId: 'tnt_1',
        }),
      });
      expect(mockWsHolder.emitToTenant).toHaveBeenCalledWith(
        'tnt_1',
        'autonomous:digest-ready',
        expect.any(Object)
      );
    });
  });
});
