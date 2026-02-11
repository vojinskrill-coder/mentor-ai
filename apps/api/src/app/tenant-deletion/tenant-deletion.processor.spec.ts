import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { TenantDeletionProcessor } from './tenant-deletion.processor';
import { TenantDeletionService } from './tenant-deletion.service';

const mockTenantDeletionService = {
  checkExpiredGracePeriods: jest.fn(),
  sendDeletionInitiatedEmails: jest.fn(),
  sendDeletionCancelledEmails: jest.fn(),
  executeDeletion: jest.fn(),
  purgeTenantData: jest.fn(),
};

describe('TenantDeletionProcessor', () => {
  let processor: TenantDeletionProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantDeletionProcessor,
        { provide: TenantDeletionService, useValue: mockTenantDeletionService },
      ],
    }).compile();

    processor = module.get<TenantDeletionProcessor>(TenantDeletionProcessor);
    jest.clearAllMocks();
  });

  describe('process', () => {
    describe('check-expired-grace-periods job', () => {
      it('should call checkExpiredGracePeriods', async () => {
        mockTenantDeletionService.checkExpiredGracePeriods.mockResolvedValue(2);

        const job = {
          id: 'job_1',
          name: 'check-expired-grace-periods',
          data: {},
        } as Job;

        await processor.process(job);

        expect(mockTenantDeletionService.checkExpiredGracePeriods).toHaveBeenCalled();
      });
    });

    describe('send-deletion-emails job', () => {
      it('should send initiated emails when type is "initiated"', async () => {
        mockTenantDeletionService.sendDeletionInitiatedEmails.mockResolvedValue(undefined);

        const job = {
          id: 'job_2',
          name: 'send-deletion-emails',
          data: {
            type: 'initiated',
            tenantId: 'tnt_test1',
            tenantName: 'Test Workspace',
            requestedByUserId: 'usr_owner',
            gracePeriodEndsAt: new Date().toISOString(),
            members: [
              { id: 'usr_1', email: 'user1@test.com', name: 'User 1' },
            ],
          },
        } as Job;

        await processor.process(job);

        expect(mockTenantDeletionService.sendDeletionInitiatedEmails).toHaveBeenCalledWith(
          'Test Workspace',
          'usr_owner',
          expect.any(String),
          expect.any(Array)
        );
      });

      it('should send cancelled emails when type is "cancelled"', async () => {
        mockTenantDeletionService.sendDeletionCancelledEmails.mockResolvedValue(undefined);

        const job = {
          id: 'job_3',
          name: 'send-deletion-emails',
          data: {
            type: 'cancelled',
            tenantId: 'tnt_test1',
            tenantName: 'Test Workspace',
            cancelledByUserId: 'usr_owner',
            members: [
              { id: 'usr_1', email: 'user1@test.com', name: 'User 1' },
            ],
          },
        } as Job;

        await processor.process(job);

        expect(mockTenantDeletionService.sendDeletionCancelledEmails).toHaveBeenCalledWith(
          'Test Workspace',
          expect.any(Array)
        );
      });
    });

    describe('execute-deletion job', () => {
      it('should call executeDeletion with tenant details', async () => {
        mockTenantDeletionService.executeDeletion.mockResolvedValue(undefined);

        const job = {
          id: 'job_4',
          name: 'execute-deletion',
          data: {
            tenantId: 'tnt_test1',
            tenantName: 'Test Workspace',
          },
        } as Job;

        await processor.process(job);

        expect(mockTenantDeletionService.executeDeletion).toHaveBeenCalledWith(
          'tnt_test1',
          'Test Workspace'
        );
      });
    });

    describe('purge-tenant-data job', () => {
      it('should call purgeTenantData with all parameters', async () => {
        mockTenantDeletionService.purgeTenantData.mockResolvedValue(undefined);

        const job = {
          id: 'job_5',
          name: 'purge-tenant-data',
          data: {
            tenantId: 'tnt_test1',
            tenantName: 'Test Workspace',
            ownerEmail: 'owner@test.com',
            ownerName: 'Owner',
          },
        } as Job;

        await processor.process(job);

        expect(mockTenantDeletionService.purgeTenantData).toHaveBeenCalledWith(
          'tnt_test1',
          'Test Workspace',
          'owner@test.com',
          'Owner'
        );
      });

      it('should call purgeTenantData without owner info if not provided', async () => {
        mockTenantDeletionService.purgeTenantData.mockResolvedValue(undefined);

        const job = {
          id: 'job_6',
          name: 'purge-tenant-data',
          data: {
            tenantId: 'tnt_test1',
            tenantName: 'Test Workspace',
          },
        } as Job;

        await processor.process(job);

        expect(mockTenantDeletionService.purgeTenantData).toHaveBeenCalledWith(
          'tnt_test1',
          'Test Workspace',
          undefined,
          undefined
        );
      });
    });

    describe('unknown job type', () => {
      it('should log warning for unknown job types', async () => {
        const job = {
          id: 'job_unknown',
          name: 'unknown-job-type',
          data: {},
        } as Job;

        // Should not throw
        await expect(processor.process(job)).resolves.toBeUndefined();
      });
    });
  });
});
