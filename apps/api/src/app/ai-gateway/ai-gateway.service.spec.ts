import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException, HttpException } from '@nestjs/common';
import { AiGatewayService } from './ai-gateway.service';
import { LlmConfigService } from '../llm-config/llm-config.service';
import { RateLimiterService } from './rate-limiter.service';
import { QuotaService } from './quota.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { TokenTrackerService } from './token-tracker.service';
import { CostCalculatorService } from './cost-calculator.service';
import { ConfidenceService } from './confidence/confidence.service';
import { ConfidenceLevel } from '@mentor-ai/shared/types';

describe('AiGatewayService', () => {
  let service: AiGatewayService;
  let mockLlmConfigService: {
    getConfig: jest.Mock;
    getDecryptedApiKey: jest.Mock;
  };
  let mockConfigService: { get: jest.Mock };
  let mockRateLimiterService: {
    checkLimits: jest.Mock;
    getHeaders: jest.Mock;
  };
  let mockQuotaService: { checkQuota: jest.Mock };
  let mockCircuitBreakerService: {
    isAllowed: jest.Mock;
    recordSuccess: jest.Mock;
    recordFailure: jest.Mock;
  };
  let mockTokenTrackerService: { trackUsage: jest.Mock };
  let mockCostCalculatorService: { calculateCost: jest.Mock };
  let mockConfidenceService: { calculateConfidence: jest.Mock };

  beforeEach(async () => {
    mockLlmConfigService = {
      getConfig: jest.fn(),
      getDecryptedApiKey: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue('http://localhost:4200'),
    };

    mockRateLimiterService = {
      checkLimits: jest.fn().mockResolvedValue({
        allowed: true,
        limit: 20,
        remaining: 19,
        reset: Math.floor(Date.now() / 1000) + 60,
        limitType: 'user',
      }),
      getHeaders: jest.fn().mockReturnValue({
        'X-RateLimit-Limit': '20',
        'X-RateLimit-Remaining': '19',
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
      }),
    };

    mockQuotaService = {
      checkQuota: jest.fn().mockResolvedValue({
        allowed: true,
        remaining: 900000,
        limit: 1000000,
        used: 100000,
        percentUsed: 10,
      }),
    };

    mockCircuitBreakerService = {
      isAllowed: jest.fn().mockResolvedValue(true),
      recordSuccess: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
    };

    mockTokenTrackerService = {
      trackUsage: jest.fn().mockResolvedValue({
        id: 'tku_test',
        totalTokens: 100,
      }),
    };

    mockCostCalculatorService = {
      calculateCost: jest.fn().mockReturnValue({
        inputCost: 0.001,
        outputCost: 0.002,
        totalCost: 0.003,
        pricingFound: true,
      }),
    };

    mockConfidenceService = {
      calculateConfidence: jest.fn().mockReturnValue({
        score: 0.75,
        level: ConfidenceLevel.MEDIUM,
        factors: [
          { name: 'hedging_language', score: 0.8, weight: 0.35 },
          { name: 'context_depth', score: 0.7, weight: 0.35 },
          { name: 'response_specificity', score: 0.75, weight: 0.3 },
        ],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiGatewayService,
        { provide: LlmConfigService, useValue: mockLlmConfigService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RateLimiterService, useValue: mockRateLimiterService },
        { provide: QuotaService, useValue: mockQuotaService },
        { provide: CircuitBreakerService, useValue: mockCircuitBreakerService },
        { provide: TokenTrackerService, useValue: mockTokenTrackerService },
        { provide: CostCalculatorService, useValue: mockCostCalculatorService },
        { provide: ConfidenceService, useValue: mockConfidenceService },
      ],
    }).compile();

    service = module.get<AiGatewayService>(AiGatewayService);
  });

  describe('streamCompletion (legacy)', () => {
    it('should throw when no provider is configured', async () => {
      mockLlmConfigService.getConfig.mockResolvedValue({
        primaryProvider: null,
        fallbackProvider: null,
      });

      const onChunk = jest.fn();

      await expect(
        service.streamCompletion(
          [{ role: 'user', content: 'Hello' }],
          onChunk
        )
      ).rejects.toThrow(InternalServerErrorException);

      expect(onChunk).not.toHaveBeenCalled();
    });

    it('should throw when provider type is not implemented', async () => {
      mockLlmConfigService.getConfig.mockResolvedValue({
        primaryProvider: {
          providerType: 'OPENAI',
          modelId: 'gpt-4',
        },
        fallbackProvider: null,
      });

      const onChunk = jest.fn();

      await expect(
        service.streamCompletion(
          [{ role: 'user', content: 'Hello' }],
          onChunk
        )
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw when OpenRouter API key is not configured', async () => {
      mockLlmConfigService.getConfig.mockResolvedValue({
        primaryProvider: {
          providerType: 'OPENROUTER',
          modelId: 'meta-llama/llama-3.1-70b',
        },
        fallbackProvider: null,
      });
      mockLlmConfigService.getDecryptedApiKey.mockResolvedValue(null);

      const onChunk = jest.fn();

      await expect(
        service.streamCompletion(
          [{ role: 'user', content: 'Hello' }],
          onChunk
        )
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should try fallback provider when primary fails', async () => {
      mockLlmConfigService.getConfig.mockResolvedValue({
        primaryProvider: {
          providerType: 'OPENROUTER',
          modelId: 'primary-model',
        },
        fallbackProvider: {
          providerType: 'LOCAL_LLAMA',
          modelId: 'llama3.1:8b',
          endpoint: 'http://localhost:11434',
        },
      });
      mockLlmConfigService.getDecryptedApiKey.mockResolvedValue(
        'sk-or-test-key'
      );

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const onChunk = jest.fn();

      await expect(
        service.streamCompletion(
          [{ role: 'user', content: 'Hello' }],
          onChunk
        )
      ).rejects.toThrow();

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('streamCompletionWithContext', () => {
    it('should throw when rate limit exceeded', async () => {
      mockRateLimiterService.checkLimits.mockResolvedValue({
        allowed: false,
        limit: 20,
        remaining: 0,
        reset: Math.floor(Date.now() / 1000) + 60,
        retryAfter: 30,
        limitType: 'user',
      });

      const onChunk = jest.fn();

      await expect(
        service.streamCompletionWithContext(
          [{ role: 'user', content: 'Hello' }],
          { tenantId: 'tnt_123', userId: 'usr_456' },
          onChunk
        )
      ).rejects.toThrow(HttpException);

      expect(onChunk).not.toHaveBeenCalled();
    });

    it('should throw when quota exceeded', async () => {
      mockQuotaService.checkQuota.mockResolvedValue({
        allowed: false,
        remaining: 0,
        limit: 1000000,
        used: 1000000,
        percentUsed: 100,
      });

      const onChunk = jest.fn();

      await expect(
        service.streamCompletionWithContext(
          [{ role: 'user', content: 'Hello' }],
          { tenantId: 'tnt_123', userId: 'usr_456' },
          onChunk
        )
      ).rejects.toThrow(HttpException);
    });

    it('should throw when circuit breaker is open and no fallback', async () => {
      mockCircuitBreakerService.isAllowed.mockResolvedValue(false);
      mockLlmConfigService.getConfig.mockResolvedValue({
        primaryProvider: {
          providerType: 'OPENROUTER',
          modelId: 'gpt-4',
        },
        fallbackProvider: null,
      });

      const onChunk = jest.fn();

      await expect(
        service.streamCompletionWithContext(
          [{ role: 'user', content: 'Hello' }],
          { tenantId: 'tnt_123', userId: 'usr_456' },
          onChunk
        )
      ).rejects.toThrow(HttpException);
    });

    it('should skip rate limit check when skipRateLimit is true', async () => {
      mockLlmConfigService.getConfig.mockResolvedValue({
        primaryProvider: {
          providerType: 'OPENROUTER',
          modelId: 'gpt-4',
        },
        fallbackProvider: null,
      });
      mockLlmConfigService.getDecryptedApiKey.mockResolvedValue('sk-test');

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const onChunk = jest.fn();

      await expect(
        service.streamCompletionWithContext(
          [{ role: 'user', content: 'Hello' }],
          { tenantId: 'tnt_123', userId: 'usr_456', skipRateLimit: true },
          onChunk
        )
      ).rejects.toThrow();

      expect(mockRateLimiterService.checkLimits).not.toHaveBeenCalled();
    });

    it('should skip quota check when skipQuotaCheck is true', async () => {
      mockLlmConfigService.getConfig.mockResolvedValue({
        primaryProvider: {
          providerType: 'OPENROUTER',
          modelId: 'gpt-4',
        },
        fallbackProvider: null,
      });
      mockLlmConfigService.getDecryptedApiKey.mockResolvedValue('sk-test');

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const onChunk = jest.fn();

      await expect(
        service.streamCompletionWithContext(
          [{ role: 'user', content: 'Hello' }],
          { tenantId: 'tnt_123', userId: 'usr_456', skipQuotaCheck: true },
          onChunk
        )
      ).rejects.toThrow();

      expect(mockQuotaService.checkQuota).not.toHaveBeenCalled();
    });

    it('should record failure and try fallback when primary fails', async () => {
      mockLlmConfigService.getConfig.mockResolvedValue({
        primaryProvider: {
          providerType: 'OPENROUTER',
          modelId: 'primary-model',
        },
        fallbackProvider: {
          providerType: 'LOCAL_LLAMA',
          modelId: 'llama3',
          endpoint: 'http://localhost:11434',
        },
      });
      mockLlmConfigService.getDecryptedApiKey.mockResolvedValue('sk-test');

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const onChunk = jest.fn();

      await expect(
        service.streamCompletionWithContext(
          [{ role: 'user', content: 'Hello' }],
          { tenantId: 'tnt_123', userId: 'usr_456' },
          onChunk
        )
      ).rejects.toThrow();

      expect(mockCircuitBreakerService.recordFailure).toHaveBeenCalled();
    });

    it('should use fallback when primary circuit is open', async () => {
      mockCircuitBreakerService.isAllowed.mockResolvedValue(false);
      mockLlmConfigService.getConfig.mockResolvedValue({
        primaryProvider: {
          providerType: 'OPENROUTER',
          modelId: 'primary-model',
        },
        fallbackProvider: {
          providerType: 'LOCAL_LLAMA',
          modelId: 'llama3',
          endpoint: 'http://localhost:11434',
        },
      });

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const onChunk = jest.fn();

      await expect(
        service.streamCompletionWithContext(
          [{ role: 'user', content: 'Hello' }],
          { tenantId: 'tnt_123', userId: 'usr_456' },
          onChunk
        )
      ).rejects.toThrow();

      // Should have called fetch for fallback, not primary
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.any(Object)
      );
    });

    it('should return completion result with correlation ID', async () => {
      mockLlmConfigService.getConfig.mockResolvedValue({
        primaryProvider: {
          providerType: 'OPENROUTER',
          modelId: 'gpt-4',
        },
        fallbackProvider: null,
      });
      mockLlmConfigService.getDecryptedApiKey.mockResolvedValue('sk-test');

      // Mock successful streaming response
      const mockReader = {
        read: jest
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'
            ),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: [DONE]\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: jest.fn(),
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const chunks: string[] = [];
      const onChunk = (chunk: string) => chunks.push(chunk);

      const result = await service.streamCompletionWithContext(
        [{ role: 'user', content: 'Hi' }],
        { tenantId: 'tnt_123', userId: 'usr_456' },
        onChunk
      );

      expect(result.correlationId).toMatch(/^cor_/);
      expect(result.success).toBe(true);
      expect(chunks).toContain('Hello');
      expect(mockCircuitBreakerService.recordSuccess).toHaveBeenCalled();
      expect(mockTokenTrackerService.trackUsage).toHaveBeenCalled();
      expect(mockCostCalculatorService.calculateCost).toHaveBeenCalled();
    });
  });
});
