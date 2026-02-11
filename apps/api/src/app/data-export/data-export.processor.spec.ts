import { Test, TestingModule } from '@nestjs/testing';
import { DataExportProcessor } from './data-export.processor';
import { DataExportService } from './data-export.service';
import type { Job } from 'bullmq';

const mockDataExportService = {
  processExport: jest.fn(),
  cleanupExpiredExports: jest.fn(),
};

describe('DataExportProcessor', () => {
  let processor: DataExportProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataExportProcessor,
        { provide: DataExportService, useValue: mockDataExportService },
      ],
    }).compile();

    processor = module.get<DataExportProcessor>(DataExportProcessor);
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should handle generate-export job', async () => {
      mockDataExportService.processExport.mockResolvedValue(undefined);

      const job = {
        name: 'generate-export',
        data: {
          exportId: 'exp_123',
          userId: 'usr_1',
          tenantId: 'tnt_1',
          format: 'JSON',
          dataTypes: ['all'],
        },
      } as Job;

      await processor.process(job);

      expect(mockDataExportService.processExport).toHaveBeenCalledWith(
        'exp_123',
        'usr_1',
        'tnt_1',
        'JSON',
        ['all']
      );
    });

    it('should handle cleanup-expired job', async () => {
      mockDataExportService.cleanupExpiredExports.mockResolvedValue(3);

      const job = {
        name: 'cleanup-expired',
        data: {},
      } as Job;

      await processor.process(job);

      expect(mockDataExportService.cleanupExpiredExports).toHaveBeenCalled();
    });

    it('should warn on unknown job name', async () => {
      const job = {
        name: 'unknown-job',
        data: {},
      } as Job;

      // Should not throw
      await processor.process(job);

      expect(mockDataExportService.processExport).not.toHaveBeenCalled();
      expect(
        mockDataExportService.cleanupExpiredExports
      ).not.toHaveBeenCalled();
    });
  });
});
