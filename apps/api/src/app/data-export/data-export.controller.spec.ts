import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaRequiredGuard } from '../auth/guards/mfa-required.guard';
import { UserThrottlerGuard } from './guards/user-throttler.guard';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';

const mockDataExportService = {
  requestExport: jest.fn(),
  getUserExports: jest.fn(),
  downloadExport: jest.fn(),
};

const mockUser: CurrentUserPayload = {
  userId: 'usr_test1',
  tenantId: 'tnt_test1',
  role: 'MEMBER',
  email: 'member@test.com',
  auth0Id: 'auth0|test1',
};

describe('DataExportController', () => {
  let controller: DataExportController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataExportController],
      providers: [
        { provide: DataExportService, useValue: mockDataExportService },
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(MfaRequiredGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(UserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DataExportController>(DataExportController);
    jest.clearAllMocks();
  });

  describe('requestExport', () => {
    it('should queue an export and return success response', async () => {
      const exportResponse = {
        exportId: 'exp_abc',
        status: 'PENDING',
        format: 'JSON',
        dataTypes: ['all'],
        fileSize: null,
        requestedAt: new Date().toISOString(),
        completedAt: null,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        downloadUrl: null,
      };
      mockDataExportService.requestExport.mockResolvedValue(exportResponse);

      const dto = { format: 'JSON' as const, dataTypes: ['all'] };
      const result = await controller.requestExport(mockUser, dto);

      expect(result.data).toEqual(exportResponse);
      expect(result.message).toBe('Export queued successfully');
      expect(mockDataExportService.requestExport).toHaveBeenCalledWith(
        'usr_test1',
        'tnt_test1',
        'JSON',
        ['all']
      );
    });

    it('should handle PDF format request', async () => {
      const exportResponse = {
        exportId: 'exp_pdf',
        status: 'PENDING',
        format: 'PDF',
        dataTypes: ['profile'],
        fileSize: null,
        requestedAt: new Date().toISOString(),
        completedAt: null,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        downloadUrl: null,
      };
      mockDataExportService.requestExport.mockResolvedValue(exportResponse);

      const dto = { format: 'PDF' as const, dataTypes: ['profile'] };
      const result = await controller.requestExport(mockUser, dto);

      expect(result.data.format).toBe('PDF');
    });
  });

  describe('getExportStatus', () => {
    it('should return all exports for the current user', async () => {
      const exports = [
        {
          exportId: 'exp_1',
          status: 'COMPLETED',
          format: 'JSON',
          dataTypes: ['all'],
          fileSize: 2048,
          requestedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          downloadUrl: '/api/v1/data-export/exp_1/download',
        },
      ];
      mockDataExportService.getUserExports.mockResolvedValue(exports);

      const result = await controller.getExportStatus(mockUser);

      expect(result.data).toEqual(exports);
      expect(mockDataExportService.getUserExports).toHaveBeenCalledWith(
        'usr_test1',
        'tnt_test1'
      );
    });

    it('should return empty array when no exports exist', async () => {
      mockDataExportService.getUserExports.mockResolvedValue([]);

      const result = await controller.getExportStatus(mockUser);

      expect(result.data).toEqual([]);
    });
  });

  describe('downloadExport', () => {
    it('should return a StreamableFile with correct headers', async () => {
      const downloadResult = {
        buffer: Buffer.from('test-content'),
        mimeType: 'application/json',
        filename: 'mentor-ai-export-exp_1.json',
      };
      mockDataExportService.downloadExport.mockResolvedValue(downloadResult);

      const mockRes = {
        set: jest.fn(),
      } as any;

      const result = await controller.downloadExport(
        'exp_1',
        mockUser,
        mockRes
      );

      expect(mockDataExportService.downloadExport).toHaveBeenCalledWith(
        'exp_1',
        'usr_test1'
      );
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/json',
        'Content-Disposition':
          'attachment; filename="mentor-ai-export-exp_1.json"',
      });
      expect(result).toBeInstanceOf(StreamableFile);
    });
  });
});
