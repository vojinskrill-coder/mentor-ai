import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);
  private readonly dailyLimitEur: number;
  private readonly estimatedCostEur: number;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly configService: ConfigService
  ) {
    this.dailyLimitEur = parseFloat(
      this.configService.get<string>('AGENT_DAILY_BUDGET_EUR') ?? '200'
    );
    this.estimatedCostEur = parseFloat(
      this.configService.get<string>('AGENT_ESTIMATED_COST_EUR') ?? '0.50'
    );
  }

  getEstimatedCost(): number {
    return this.estimatedCostEur;
  }

  getDailyLimit(): number {
    return this.dailyLimitEur;
  }

  async getDailySpent(tenantId: string): Promise<{ spentEur: number; limitEur: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const budget = await this.prisma.agentDailyBudget.findUnique({
      where: { tenantId_date: { tenantId, date: today } },
    });

    return {
      spentEur: budget ? Number(budget.spentEur) : 0,
      limitEur: budget ? Number(budget.limitEur) : this.dailyLimitEur,
    };
  }

  async canSpend(tenantId: string, amount?: number): Promise<boolean> {
    const cost = amount ?? this.estimatedCostEur;
    const { spentEur, limitEur } = await this.getDailySpent(tenantId);
    return spentEur + cost <= limitEur;
  }

  /**
   * Atomically check budget and reserve estimated cost in a single transaction.
   * Prevents race conditions where two concurrent requests both pass canSpend()
   * but together overshoot the budget.
   */
  async canSpendAndReserve(tenantId: string, estimatedCost: number): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const budget = await tx.agentDailyBudget.findUnique({
        where: { tenantId_date: { tenantId, date: today } },
      });

      const spent = budget ? Number(budget.spentEur) : 0;
      const limit = budget ? Number(budget.limitEur) : this.dailyLimitEur;

      if (spent + estimatedCost > limit) {
        this.logger.warn({
          message: 'Budget reservation rejected',
          tenantId,
          estimatedCost,
          spent,
          limit,
        });
        return false;
      }

      await tx.agentDailyBudget.upsert({
        where: { tenantId_date: { tenantId, date: today } },
        update: {
          spentEur: { increment: new Decimal(estimatedCost) },
        },
        create: {
          tenantId,
          date: today,
          spentEur: new Decimal(estimatedCost),
          limitEur: new Decimal(this.dailyLimitEur),
        },
      });

      this.logger.log({
        message: 'Budget reserved atomically',
        tenantId,
        estimatedCost,
        newSpent: spent + estimatedCost,
        limit,
      });

      return true;
    });
  }

  async recordSpend(tenantId: string, amountEur: number): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.prisma.agentDailyBudget.upsert({
      where: { tenantId_date: { tenantId, date: today } },
      update: {
        spentEur: { increment: new Decimal(amountEur) },
      },
      create: {
        tenantId,
        date: today,
        spentEur: new Decimal(amountEur),
        limitEur: new Decimal(this.dailyLimitEur),
      },
    });

    this.logger.log({
      message: 'Budget spend recorded',
      tenantId,
      amountEur,
    });
  }
}
