import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QuotaService } from './quota.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { TokenTrackerService } from './token-tracker.service';

describe('QuotaService', () => {
  let service: QuotaService;

  const mockPrismaService = {
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockTokenTrackerService = {
    getMonthlyTokenCount: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue: number) => defaultValue),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaService,
        { provide: PlatformPrismaService, useValue: mockPrismaService },
        { provide: TokenTrackerService, useValue: mockTokenTrackerService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<QuotaService>(QuotaService);
  });

  describe('checkQuota', () => {
    it('should allow request when under quota', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        tokenQuota: 1000000,
      });
      mockTokenTrackerService.getMonthlyTokenCount.mockResolvedValue(500000);

      const result = await service.checkQuota('tnt_123');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(500000);
      expect(result.limit).toBe(1000000);
      expect(result.used).toBe(500000);
      expect(result.percentUsed).toBe(50);
    });

    it('should reject request when quota exceeded', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        tokenQuota: 1000000,
      });
      mockTokenTrackerService.getMonthlyTokenCount.mockResolvedValue(1000000);

      const result = await service.checkQuota('tnt_123');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.percentUsed).toBe(100);
    });

    it('should use default quota when tenant not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);
      mockTokenTrackerService.getMonthlyTokenCount.mockResolvedValue(0);

      const result = await service.checkQuota('tnt_123');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(10000000); // default quota
    });

    it('should calculate percentage correctly at boundary', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        tokenQuota: 1000000,
      });
      mockTokenTrackerService.getMonthlyTokenCount.mockResolvedValue(800000);

      const result = await service.checkQuota('tnt_123');

      expect(result.percentUsed).toBe(80);
    });
  });

  describe('checkQuotaWithEstimate', () => {
    it('should allow when estimated usage within quota', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        tokenQuota: 1000000,
      });
      mockTokenTrackerService.getMonthlyTokenCount.mockResolvedValue(500000);

      const result = await service.checkQuotaWithEstimate('tnt_123', 100000);

      expect(result.allowed).toBe(true);
    });

    it('should reject when estimated usage would exceed quota', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        tokenQuota: 1000000,
      });
      mockTokenTrackerService.getMonthlyTokenCount.mockResolvedValue(950000);

      const result = await service.checkQuotaWithEstimate('tnt_123', 100000);

      expect(result.allowed).toBe(false);
    });
  });

  describe('getQuotaLimit', () => {
    it('should return tenant quota limit', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        tokenQuota: 2000000,
      });

      const result = await service.getQuotaLimit('tnt_123');

      expect(result).toBe(2000000);
    });

    it('should return default quota when tenant not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      const result = await service.getQuotaLimit('tnt_123');

      expect(result).toBe(10000000);
    });
  });

  describe('updateQuota', () => {
    it('should update tenant quota', async () => {
      mockPrismaService.tenant.update.mockResolvedValue({
        id: 'tnt_123',
        tokenQuota: 5000000,
      });

      await service.updateQuota('tnt_123', 5000000);

      expect(mockPrismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tnt_123' },
        data: { tokenQuota: 5000000 },
      });
    });
  });
});
