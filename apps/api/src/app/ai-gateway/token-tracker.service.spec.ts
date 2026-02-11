import { Test, TestingModule } from '@nestjs/testing';
import { TokenTrackerService } from './token-tracker.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { Decimal } from '@prisma/client/runtime/library';

describe('TokenTrackerService', () => {
  let service: TokenTrackerService;

  const mockPrismaService = {
    tokenUsage: {
      create: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenTrackerService,
        { provide: PlatformPrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TokenTrackerService>(TokenTrackerService);
  });

  describe('trackUsage', () => {
    it('should create token usage record with tku_ prefix', async () => {
      const mockRecord = {
        id: 'tku_test123',
        tenantId: 'tnt_123',
        userId: 'usr_456',
        conversationId: 'sess_789',
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        cost: new Decimal(0.001),
        modelId: 'gpt-4',
        providerId: 'openrouter',
        createdAt: new Date(),
      };

      mockPrismaService.tokenUsage.create.mockResolvedValue(mockRecord);

      const result = await service.trackUsage(
        'tnt_123',
        'usr_456',
        100,
        200,
        0.001,
        'gpt-4',
        'sess_789',
        'openrouter'
      );

      expect(result.id).toMatch(/^tku_/);
      expect(result.tenantId).toBe('tnt_123');
      expect(result.userId).toBe('usr_456');
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(200);
      expect(result.totalTokens).toBe(300);
      expect(mockPrismaService.tokenUsage.create).toHaveBeenCalled();
    });

    it('should calculate total tokens correctly', async () => {
      const mockRecord = {
        id: 'tku_test',
        tenantId: 'tnt_123',
        userId: 'usr_456',
        conversationId: null,
        inputTokens: 50,
        outputTokens: 150,
        totalTokens: 200,
        cost: new Decimal(0.001),
        modelId: 'gpt-4',
        providerId: null,
        createdAt: new Date(),
      };

      mockPrismaService.tokenUsage.create.mockResolvedValue(mockRecord);

      const result = await service.trackUsage(
        'tnt_123',
        'usr_456',
        50,
        150,
        0.001,
        'gpt-4'
      );

      expect(result.totalTokens).toBe(200);
    });
  });

  describe('getUsage', () => {
    it('should return aggregated usage for tenant', async () => {
      mockPrismaService.tokenUsage.aggregate.mockResolvedValue({
        _sum: {
          inputTokens: 1000,
          outputTokens: 2000,
          totalTokens: 3000,
          cost: new Decimal(0.05),
        },
        _count: 10,
      });

      const result = await service.getUsage('tnt_123', 'month');

      expect(result.inputTokens).toBe(1000);
      expect(result.outputTokens).toBe(2000);
      expect(result.totalTokens).toBe(3000);
      expect(result.totalCost).toBe(0.05);
      expect(result.requestCount).toBe(10);
    });

    it('should handle empty usage data', async () => {
      mockPrismaService.tokenUsage.aggregate.mockResolvedValue({
        _sum: {
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          cost: null,
        },
        _count: 0,
      });

      const result = await service.getUsage('tnt_123', 'day');

      expect(result.totalTokens).toBe(0);
      expect(result.totalCost).toBe(0);
      expect(result.requestCount).toBe(0);
    });
  });

  describe('getUserUsage', () => {
    it('should return aggregated usage for specific user', async () => {
      mockPrismaService.tokenUsage.aggregate.mockResolvedValue({
        _sum: {
          inputTokens: 500,
          outputTokens: 1000,
          totalTokens: 1500,
          cost: new Decimal(0.025),
        },
        _count: 5,
      });

      const result = await service.getUserUsage('tnt_123', 'usr_456', 'week');

      expect(result.totalTokens).toBe(1500);
      expect(result.requestCount).toBe(5);
    });
  });

  describe('getMonthlyTokenCount', () => {
    it('should return total tokens for current month', async () => {
      mockPrismaService.tokenUsage.aggregate.mockResolvedValue({
        _sum: {
          inputTokens: 10000,
          outputTokens: 20000,
          totalTokens: 30000,
          cost: new Decimal(0.5),
        },
        _count: 100,
      });

      const result = await service.getMonthlyTokenCount('tnt_123');

      expect(result).toBe(30000);
    });
  });

  describe('getConversationUsage', () => {
    it('should return usage records for a conversation', async () => {
      const mockRecords = [
        {
          id: 'tku_1',
          tenantId: 'tnt_123',
          userId: 'usr_456',
          conversationId: 'sess_789',
          inputTokens: 100,
          outputTokens: 200,
          totalTokens: 300,
          cost: new Decimal(0.001),
          modelId: 'gpt-4',
          providerId: 'openrouter',
          createdAt: new Date(),
        },
      ];

      mockPrismaService.tokenUsage.findMany.mockResolvedValue(mockRecords);

      const result = await service.getConversationUsage('sess_789');

      expect(result).toHaveLength(1);
      expect(result[0]?.conversationId).toBe('sess_789');
    });
  });
});
