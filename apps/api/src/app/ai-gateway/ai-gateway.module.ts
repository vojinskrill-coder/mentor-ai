import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { LlmConfigModule } from '../llm-config/llm-config.module';
import { AiGatewayService } from './ai-gateway.service';
import { RedisService } from './redis.service';
import { RateLimiterService } from './rate-limiter.service';
import { TokenTrackerService } from './token-tracker.service';
import { QuotaService } from './quota.service';
import { RequestQueueService } from './request-queue.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { CostCalculatorService } from './cost-calculator.service';
import { ConfidenceService } from './confidence/confidence.service';
import { ImprovementSuggestionsService } from './confidence/improvement-suggestions.service';

@Module({
  // TenantModule provides PlatformPrismaService used by TokenTrackerService and QuotaService
  imports: [ConfigModule, TenantModule, LlmConfigModule],
  providers: [
    AiGatewayService,
    RedisService,
    RateLimiterService,
    TokenTrackerService,
    QuotaService,
    RequestQueueService,
    CircuitBreakerService,
    CostCalculatorService,
    ConfidenceService,
    ImprovementSuggestionsService,
  ],
  exports: [
    AiGatewayService,
    RedisService,
    RateLimiterService,
    TokenTrackerService,
    QuotaService,
    RequestQueueService,
    CircuitBreakerService,
    CostCalculatorService,
    ConfidenceService,
    ImprovementSuggestionsService,
  ],
})
export class AiGatewayModule {}
