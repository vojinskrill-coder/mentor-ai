import { ConfigService } from '@nestjs/config';
import { BudgetService } from './budget.service';

describe('BudgetService', () => {
  let service: BudgetService;
  let mockPrisma: any;
  let mockConfig: { get: jest.Mock };

  function createService(configOverrides?: Record<string, string>) {
    mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (configOverrides?.[key] !== undefined) return configOverrides[key];
        switch (key) {
          case 'AGENT_DAILY_BUDGET_EUR': return '20';
          case 'AGENT_ESTIMATED_COST_EUR': return '0.50';
          default: return undefined;
        }
      }),
    };

    mockPrisma = {
      agentDailyBudget: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    return new BudgetService(mockPrisma, mockConfig as unknown as ConfigService);
  }

  beforeEach(() => {
    service = createService();
  });

  describe('getEstimatedCost()', () => {
    it('should return configured estimated cost', () => {
      expect(service.getEstimatedCost()).toBe(0.5);
    });

    it('should return custom configured value', () => {
      const svc = createService({ AGENT_ESTIMATED_COST_EUR: '1.25' });
      expect(svc.getEstimatedCost()).toBe(1.25);
    });

    it('should default to 0.50 when env not set', () => {
      mockConfig.get.mockImplementation(() => undefined);
      const svc = new BudgetService(mockPrisma, mockConfig as unknown as ConfigService);
      expect(svc.getEstimatedCost()).toBe(0.5);
    });
  });

  describe('getDailyLimit()', () => {
    it('should return configured daily limit', () => {
      expect(service.getDailyLimit()).toBe(20);
    });

    it('should return custom configured value', () => {
      const svc = createService({ AGENT_DAILY_BUDGET_EUR: '50' });
      expect(svc.getDailyLimit()).toBe(50);
    });

    it('should default to 20 when env not set', () => {
      mockConfig.get.mockImplementation(() => undefined);
      const svc = new BudgetService(mockPrisma, mockConfig as unknown as ConfigService);
      expect(svc.getDailyLimit()).toBe(20);
    });
  });

  describe('getDailySpent()', () => {
    it('should return spent amount from existing budget record', async () => {
      mockPrisma.agentDailyBudget.findUnique.mockResolvedValue({
        spentEur: 5.5,
        limitEur: 20,
      });

      const result = await service.getDailySpent('tenant-1');

      expect(result).toEqual({ spentEur: 5.5, limitEur: 20 });
    });

    it('should return zero spent when no budget record exists', async () => {
      mockPrisma.agentDailyBudget.findUnique.mockResolvedValue(null);

      const result = await service.getDailySpent('tenant-1');

      expect(result).toEqual({ spentEur: 0, limitEur: 20 });
    });

    it('should query with correct tenantId and today date at midnight', async () => {
      mockPrisma.agentDailyBudget.findUnique.mockResolvedValue(null);

      await service.getDailySpent('tenant-abc');

      expect(mockPrisma.agentDailyBudget.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_date: {
            tenantId: 'tenant-abc',
            date: expect.any(Date),
          },
        },
      });

      const calledDate = mockPrisma.agentDailyBudget.findUnique.mock.calls[0][0].where.tenantId_date.date;
      expect(calledDate.getHours()).toBe(0);
      expect(calledDate.getMinutes()).toBe(0);
      expect(calledDate.getSeconds()).toBe(0);
      expect(calledDate.getMilliseconds()).toBe(0);
    });

    it('should use configured daily limit as fallback when no record exists', async () => {
      const svc = createService({ AGENT_DAILY_BUDGET_EUR: '50' });
      mockPrisma.agentDailyBudget.findUnique.mockResolvedValue(null);

      const result = await svc.getDailySpent('tenant-1');

      expect(result.limitEur).toBe(50);
    });

    it('should use record limitEur over configured default', async () => {
      mockPrisma.agentDailyBudget.findUnique.mockResolvedValue({
        spentEur: 3,
        limitEur: 30,
      });

      const result = await service.getDailySpent('tenant-1');

      expect(result.limitEur).toBe(30);
    });
  });

  describe('canSpend()', () => {
    it('should return true when under budget', async () => {
      mockPrisma.agentDailyBudget.findUnique.mockResolvedValue({
        spentEur: 5,
        limitEur: 20,
      });

      expect(await service.canSpend('tenant-1')).toBe(true);
    });

    it('should return false when budget would be exceeded', async () => {
      mockPrisma.agentDailyBudget.findUnique.mockResolvedValue({
        spentEur: 19.6,
        limitEur: 20,
      });

      expect(await service.canSpend('tenant-1')).toBe(false);
    });

    it('should return true when exactly at limit after spend', async () => {
      mockPrisma.agentDailyBudget.findUnique.mockResolvedValue({
        spentEur: 19.5,
        limitEur: 20,
      });

      expect(await service.canSpend('tenant-1')).toBe(true);
    });

    it('should use custom amount when provided', async () => {
      mockPrisma.agentDailyBudget.findUnique.mockResolvedValue({
        spentEur: 18,
        limitEur: 20,
      });

      expect(await service.canSpend('tenant-1', 3)).toBe(false);
    });

    it('should use estimatedCost as default amount', async () => {
      mockPrisma.agentDailyBudget.findUnique.mockResolvedValue({
        spentEur: 19.4,
        limitEur: 20,
      });

      expect(await service.canSpend('tenant-1')).toBe(true);
    });

    it('should return true for new tenant with no budget record', async () => {
      mockPrisma.agentDailyBudget.findUnique.mockResolvedValue(null);

      expect(await service.canSpend('new-tenant')).toBe(true);
    });

    it('should return false when already at limit', async () => {
      mockPrisma.agentDailyBudget.findUnique.mockResolvedValue({
        spentEur: 20,
        limitEur: 20,
      });

      expect(await service.canSpend('tenant-1')).toBe(false);
    });
  });

  describe('recordSpend()', () => {
    it('should upsert budget record with correct tenantId', async () => {
      mockPrisma.agentDailyBudget.upsert.mockResolvedValue({});

      await service.recordSpend('tenant-1', 0.5);

      expect(mockPrisma.agentDailyBudget.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_date: {
              tenantId: 'tenant-1',
              date: expect.any(Date),
            },
          },
        })
      );
    });

    it('should use midnight date for budget record', async () => {
      mockPrisma.agentDailyBudget.upsert.mockResolvedValue({});

      await service.recordSpend('tenant-1', 1.0);

      const callArgs = mockPrisma.agentDailyBudget.upsert.mock.calls[0][0];
      const date = callArgs.where.tenantId_date.date;
      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
    });

    it('should set limitEur from config in create clause', async () => {
      const svc = createService({ AGENT_DAILY_BUDGET_EUR: '35' });
      mockPrisma.agentDailyBudget.upsert.mockResolvedValue({});

      await svc.recordSpend('tenant-1', 0.5);

      const callArgs = mockPrisma.agentDailyBudget.upsert.mock.calls[0][0];
      expect(Number(callArgs.create.limitEur)).toBe(35);
    });

    it('should include increment in update clause', async () => {
      mockPrisma.agentDailyBudget.upsert.mockResolvedValue({});

      await service.recordSpend('tenant-1', 0.75);

      const callArgs = mockPrisma.agentDailyBudget.upsert.mock.calls[0][0];
      expect(callArgs.update.spentEur).toHaveProperty('increment');
    });

    it('should handle negative amounts for cost adjustments', async () => {
      mockPrisma.agentDailyBudget.upsert.mockResolvedValue({});

      await service.recordSpend('tenant-1', -0.15);

      expect(mockPrisma.agentDailyBudget.upsert).toHaveBeenCalled();
    });
  });
});
