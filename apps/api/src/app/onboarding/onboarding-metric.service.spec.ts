import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingMetricService } from './onboarding-metric.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

describe('OnboardingMetricService', () => {
  let service: OnboardingMetricService;

  const mockPrismaService = {
    onboardingMetric: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingMetricService,
        { provide: PlatformPrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<OnboardingMetricService>(OnboardingMetricService);
  });

  describe('startOnboarding', () => {
    it('should create a metric record with obm_ prefix', async () => {
      const mockMetric = {
        id: 'obm_test123',
        tenantId: 'tnt_123',
        userId: 'usr_456',
        startedAt: new Date(),
        completedAt: null,
        timeToFirstValueMs: null,
        quickTaskType: 'finance-email',
        industry: 'FINANCE',
        createdAt: new Date(),
      };

      mockPrismaService.onboardingMetric.create.mockResolvedValue(mockMetric);

      const result = await service.startOnboarding(
        'tnt_123',
        'usr_456',
        'FINANCE',
        'finance-email'
      );

      expect(result.id).toMatch(/^obm_/);
      expect(result.tenantId).toBe('tnt_123');
      expect(result.userId).toBe('usr_456');
      expect(result.industry).toBe('FINANCE');
      expect(result.quickTaskType).toBe('finance-email');
      expect(result.completedAt).toBeNull();
      expect(mockPrismaService.onboardingMetric.create).toHaveBeenCalled();
    });
  });

  describe('completeOnboarding', () => {
    it('should update metric with completion time', async () => {
      const startTime = new Date(Date.now() - 120000); // 2 minutes ago
      const mockMetric = {
        id: 'obm_test123',
        tenantId: 'tnt_123',
        userId: 'usr_456',
        startedAt: startTime,
        completedAt: null,
        timeToFirstValueMs: null,
        quickTaskType: 'finance-email',
        industry: 'FINANCE',
        createdAt: new Date(),
      };

      const updatedMetric = {
        ...mockMetric,
        completedAt: new Date(),
        timeToFirstValueMs: 120000,
      };

      mockPrismaService.onboardingMetric.findFirst.mockResolvedValue(mockMetric);
      mockPrismaService.onboardingMetric.update.mockResolvedValue(updatedMetric);

      const result = await service.completeOnboarding('usr_456');

      expect(result).not.toBeNull();
      expect(result?.completedAt).not.toBeNull();
      expect(result?.timeToFirstValueMs).toBeGreaterThan(0);
      expect(mockPrismaService.onboardingMetric.update).toHaveBeenCalled();
    });

    it('should return null if no incomplete metric found', async () => {
      mockPrismaService.onboardingMetric.findFirst.mockResolvedValue(null);

      const result = await service.completeOnboarding('usr_456');

      expect(result).toBeNull();
      expect(mockPrismaService.onboardingMetric.update).not.toHaveBeenCalled();
    });
  });

  describe('getMetric', () => {
    it('should return most recent metric for user', async () => {
      const mockMetric = {
        id: 'obm_test123',
        tenantId: 'tnt_123',
        userId: 'usr_456',
        startedAt: new Date(),
        completedAt: new Date(),
        timeToFirstValueMs: 180000,
        quickTaskType: 'finance-email',
        industry: 'FINANCE',
        createdAt: new Date(),
      };

      mockPrismaService.onboardingMetric.findFirst.mockResolvedValue(mockMetric);

      const result = await service.getMetric('usr_456');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('obm_test123');
      expect(result?.timeToFirstValueMs).toBe(180000);
    });

    it('should return null if no metric found', async () => {
      mockPrismaService.onboardingMetric.findFirst.mockResolvedValue(null);

      const result = await service.getMetric('usr_456');

      expect(result).toBeNull();
    });
  });

  describe('hasIncompleteOnboarding', () => {
    it('should return true if incomplete metric exists', async () => {
      mockPrismaService.onboardingMetric.count.mockResolvedValue(1);

      const result = await service.hasIncompleteOnboarding('usr_456');

      expect(result).toBe(true);
    });

    it('should return false if no incomplete metric', async () => {
      mockPrismaService.onboardingMetric.count.mockResolvedValue(0);

      const result = await service.hasIncompleteOnboarding('usr_456');

      expect(result).toBe(false);
    });
  });
});
