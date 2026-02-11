import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { createId } from '@paralleldrive/cuid2';
import { Decimal } from '@prisma/client/runtime/library';
import type { TokenUsage } from '@prisma/client';
import { UsageSummary, UsagePeriod } from '@mentor-ai/shared/types';

/**
 * Internal token usage record with Date type for service operations.
 * Uses Date instead of string (shared TokenUsage) because Prisma returns Date objects.
 * Shared TokenUsage uses string for JSON serialization in API responses.
 */
export interface TokenUsageRecord {
  id: string;
  tenantId: string;
  userId: string;
  conversationId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  modelId: string;
  providerId?: string;
  createdAt: Date;
}

// Re-export shared types for consumers
export type { UsageSummary, UsagePeriod };

/**
 * Service for tracking AI token consumption and costs.
 * Records all AI requests for billing and quota enforcement.
 */
@Injectable()
export class TokenTrackerService {
  private readonly logger = new Logger(TokenTrackerService.name);

  constructor(private readonly prismaService: PlatformPrismaService) {}

  /**
   * Records token usage for an AI request.
   *
   * @param tenantId - The tenant identifier
   * @param userId - The user identifier
   * @param inputTokens - Number of input tokens used
   * @param outputTokens - Number of output tokens generated
   * @param cost - Cost of the request in USD
   * @param modelId - The model used for the request
   * @param conversationId - Optional conversation ID
   * @param providerId - Optional provider ID
   * @returns The created token usage record
   */
  async trackUsage(
    tenantId: string,
    userId: string,
    inputTokens: number,
    outputTokens: number,
    cost: number,
    modelId: string,
    conversationId?: string,
    providerId?: string
  ): Promise<TokenUsageRecord> {
    const id = `tku_${createId()}`;
    const totalTokens = inputTokens + outputTokens;

    const record = await this.prismaService.tokenUsage.create({
      data: {
        id,
        tenantId,
        userId,
        conversationId,
        inputTokens,
        outputTokens,
        totalTokens,
        cost: new Decimal(cost),
        modelId,
        providerId,
      },
    });

    this.logger.log({
      message: 'Token usage tracked',
      id,
      tenantId,
      userId,
      totalTokens,
      cost,
      modelId,
    });

    return {
      id: record.id,
      tenantId: record.tenantId,
      userId: record.userId,
      conversationId: record.conversationId ?? undefined,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      totalTokens: record.totalTokens,
      cost: record.cost.toNumber(),
      modelId: record.modelId,
      providerId: record.providerId ?? undefined,
      createdAt: record.createdAt,
    };
  }

  /**
   * Gets aggregated usage for a tenant over a time period.
   *
   * @param tenantId - The tenant identifier
   * @param period - Time period to query ('day', 'week', 'month', 'all')
   * @returns Aggregated usage summary
   */
  async getUsage(tenantId: string, period: UsagePeriod): Promise<UsageSummary> {
    const startDate = this.getStartDate(period);

    const result = await this.prismaService.tokenUsage.aggregate({
      where: {
        tenantId,
        ...(startDate && { createdAt: { gte: startDate } }),
      },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        cost: true,
      },
      _count: true,
    });

    return {
      inputTokens: result._sum.inputTokens ?? 0,
      outputTokens: result._sum.outputTokens ?? 0,
      totalTokens: result._sum.totalTokens ?? 0,
      totalCost: result._sum.cost?.toNumber() ?? 0,
      requestCount: result._count,
    };
  }

  /**
   * Gets aggregated usage for a specific user within a tenant.
   *
   * @param tenantId - The tenant identifier
   * @param userId - The user identifier
   * @param period - Time period to query
   * @returns Aggregated usage summary for the user
   */
  async getUserUsage(
    tenantId: string,
    userId: string,
    period: UsagePeriod
  ): Promise<UsageSummary> {
    const startDate = this.getStartDate(period);

    const result = await this.prismaService.tokenUsage.aggregate({
      where: {
        tenantId,
        userId,
        ...(startDate && { createdAt: { gte: startDate } }),
      },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        cost: true,
      },
      _count: true,
    });

    return {
      inputTokens: result._sum.inputTokens ?? 0,
      outputTokens: result._sum.outputTokens ?? 0,
      totalTokens: result._sum.totalTokens ?? 0,
      totalCost: result._sum.cost?.toNumber() ?? 0,
      requestCount: result._count,
    };
  }

  /**
   * Gets the total token count for a tenant in the current billing period (month).
   * Used for quota enforcement.
   *
   * @param tenantId - The tenant identifier
   * @returns Total tokens used this month
   */
  async getMonthlyTokenCount(tenantId: string): Promise<number> {
    const usage = await this.getUsage(tenantId, 'month');
    return usage.totalTokens;
  }

  /**
   * Gets usage records for a specific conversation.
   *
   * @param conversationId - The conversation identifier
   * @returns Array of token usage records
   */
  async getConversationUsage(
    conversationId: string
  ): Promise<TokenUsageRecord[]> {
    const records = await this.prismaService.tokenUsage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    return records.map((record: TokenUsage) => ({
      id: record.id,
      tenantId: record.tenantId,
      userId: record.userId,
      conversationId: record.conversationId ?? undefined,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      totalTokens: record.totalTokens,
      cost: record.cost.toNumber(),
      modelId: record.modelId,
      providerId: record.providerId ?? undefined,
      createdAt: record.createdAt,
    }));
  }

  /**
   * Calculates the start date for a usage period.
   */
  private getStartDate(period: UsagePeriod): Date | null {
    const now = new Date();

    switch (period) {
      case 'day':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return weekAgo;
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1);
      case 'all':
        return null;
    }
  }
}
