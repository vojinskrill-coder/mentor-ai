import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { TokenTrackerService } from './token-tracker.service';
import { QuotaStatus } from '@mentor-ai/shared/types';

/**
 * Alias for QuotaStatus for backward compatibility.
 * @deprecated Use QuotaStatus from @mentor-ai/shared/types directly.
 */
export type QuotaCheckResult = QuotaStatus;

/**
 * Service for enforcing token quotas on AI usage.
 * Prevents tenants from exceeding their allocated token limits.
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);
  private readonly defaultQuota: number;

  constructor(
    private readonly prismaService: PlatformPrismaService,
    private readonly tokenTrackerService: TokenTrackerService,
    private readonly configService: ConfigService
  ) {
    this.defaultQuota = this.configService.get<number>(
      'DEFAULT_TENANT_TOKEN_QUOTA',
      1000000
    );

    this.logger.log({
      message: 'Quota service initialized',
      defaultQuota: this.defaultQuota,
    });
  }

  /**
   * Checks if a tenant has remaining token quota.
   *
   * @param tenantId - The tenant identifier
   * @returns Quota check result with allowed status and remaining tokens
   */
  async checkQuota(tenantId: string): Promise<QuotaCheckResult> {
    // Get tenant's quota limit
    const tenant = await this.prismaService.tenant.findUnique({
      where: { id: tenantId },
      select: { tokenQuota: true },
    });

    const limit = tenant?.tokenQuota ?? this.defaultQuota;

    // Get current month's usage
    const used = await this.tokenTrackerService.getMonthlyTokenCount(tenantId);

    const remaining = Math.max(0, limit - used);
    const allowed = remaining > 0;
    const percentUsed = Math.min(100, Math.round((used / limit) * 100));

    const result: QuotaCheckResult = {
      allowed,
      remaining,
      limit,
      used,
      percentUsed,
    };

    if (!allowed) {
      this.logger.warn({
        message: 'Quota exceeded',
        tenantId,
        limit,
        used,
      });
    } else if (percentUsed >= 80) {
      this.logger.log({
        message: 'Quota nearing limit',
        tenantId,
        limit,
        used,
        percentUsed,
      });
    }

    return result;
  }

  /**
   * Estimates if a request with given token count would exceed quota.
   * Use this for pre-flight checks before sending to LLM.
   *
   * @param tenantId - The tenant identifier
   * @param estimatedTokens - Estimated tokens the request will use
   * @returns Quota check result considering the estimated usage
   */
  async checkQuotaWithEstimate(
    tenantId: string,
    estimatedTokens: number
  ): Promise<QuotaCheckResult> {
    const quotaStatus = await this.checkQuota(tenantId);

    // Check if estimated usage would exceed remaining quota
    const wouldExceed = estimatedTokens > quotaStatus.remaining;

    return {
      ...quotaStatus,
      allowed: quotaStatus.allowed && !wouldExceed,
    };
  }

  /**
   * Gets the quota limit for a tenant.
   *
   * @param tenantId - The tenant identifier
   * @returns The token quota limit
   */
  async getQuotaLimit(tenantId: string): Promise<number> {
    const tenant = await this.prismaService.tenant.findUnique({
      where: { id: tenantId },
      select: { tokenQuota: true },
    });

    return tenant?.tokenQuota ?? this.defaultQuota;
  }

  /**
   * Updates the quota limit for a tenant.
   *
   * @param tenantId - The tenant identifier
   * @param newQuota - The new quota limit
   */
  async updateQuota(tenantId: string, newQuota: number): Promise<void> {
    await this.prismaService.tenant.update({
      where: { id: tenantId },
      data: { tokenQuota: newQuota },
    });

    this.logger.log({
      message: 'Quota updated',
      tenantId,
      newQuota,
    });
  }
}
