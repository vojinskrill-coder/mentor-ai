import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { createId } from '@paralleldrive/cuid2';
import type { OnboardingMetricResponse } from '@mentor-ai/shared/types';

/**
 * Service for tracking onboarding metrics, specifically time-to-first-value.
 * Records when users start and complete the onboarding quick win flow.
 */
@Injectable()
export class OnboardingMetricService {
  private readonly logger = new Logger(OnboardingMetricService.name);

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Records the start of the onboarding process for a user.
   *
   * @param tenantId - The tenant ID
   * @param userId - The user ID
   * @param industry - The selected industry
   * @param quickTaskType - The type of quick task selected
   * @returns The created metric record
   */
  async startOnboarding(
    tenantId: string,
    userId: string,
    industry: string,
    quickTaskType: string
  ): Promise<OnboardingMetricResponse> {
    const id = `obm_${createId()}`;

    this.logger.log({
      message: 'Recording onboarding start',
      tenantId,
      userId,
      industry,
      quickTaskType,
      metricId: id,
    });

    const metric = await this.prisma.onboardingMetric.create({
      data: {
        id,
        tenantId,
        userId,
        startedAt: new Date(),
        industry,
        quickTaskType,
      },
    });

    return this.toResponse(metric);
  }

  /**
   * Marks the onboarding as complete and calculates time-to-first-value.
   *
   * @param userId - The user ID
   * @returns The updated metric record with completion time
   */
  async completeOnboarding(userId: string): Promise<OnboardingMetricResponse | null> {
    // Find the most recent incomplete onboarding metric for this user
    const metric = await this.prisma.onboardingMetric.findFirst({
      where: {
        userId,
        completedAt: null,
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    if (!metric) {
      this.logger.warn({
        message: 'No incomplete onboarding metric found for user',
        userId,
      });
      return null;
    }

    const completedAt = new Date();
    const timeToFirstValueMs = completedAt.getTime() - metric.startedAt.getTime();

    this.logger.log({
      message: 'Recording onboarding completion',
      userId,
      metricId: metric.id,
      timeToFirstValueMs,
      timeToFirstValueMinutes: Math.round(timeToFirstValueMs / 60000),
    });

    const updated = await this.prisma.onboardingMetric.update({
      where: { id: metric.id },
      data: {
        completedAt,
        timeToFirstValueMs,
      },
    });

    return this.toResponse(updated);
  }

  /**
   * Gets the onboarding metric for a user.
   *
   * @param userId - The user ID
   * @returns The most recent metric record or null
   */
  async getMetric(userId: string): Promise<OnboardingMetricResponse | null> {
    const metric = await this.prisma.onboardingMetric.findFirst({
      where: { userId },
      orderBy: { startedAt: 'desc' },
    });

    if (!metric) {
      return null;
    }

    return this.toResponse(metric);
  }

  /**
   * Checks if a user has an incomplete onboarding session.
   *
   * @param userId - The user ID
   * @returns True if there's an incomplete onboarding
   */
  async hasIncompleteOnboarding(userId: string): Promise<boolean> {
    const count = await this.prisma.onboardingMetric.count({
      where: {
        userId,
        completedAt: null,
      },
    });
    return count > 0;
  }

  /**
   * Converts a Prisma OnboardingMetric to the API response type.
   */
  private toResponse(metric: {
    id: string;
    tenantId: string;
    userId: string;
    startedAt: Date;
    completedAt: Date | null;
    timeToFirstValueMs: number | null;
    quickTaskType: string;
    industry: string;
  }): OnboardingMetricResponse {
    return {
      id: metric.id,
      tenantId: metric.tenantId,
      userId: metric.userId,
      startedAt: metric.startedAt.toISOString(),
      completedAt: metric.completedAt?.toISOString() ?? null,
      timeToFirstValueMs: metric.timeToFirstValueMs,
      quickTaskType: metric.quickTaskType,
      industry: metric.industry,
    };
  }
}
