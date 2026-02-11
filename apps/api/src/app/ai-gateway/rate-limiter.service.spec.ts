import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RateLimiterService } from './rate-limiter.service';
import { RedisService } from './redis.service';

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  let redisService: jest.Mocked<RedisService>;

  const mockRedisService = {
    isConfigured: jest.fn(),
    getRateLimiter: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue: number) => defaultValue),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
    redisService = module.get(RedisService);
  });

  describe('checkTenantLimit', () => {
    it('should allow request when Redis is not configured', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);

      const result = await service.checkTenantLimit('tnt_123');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(60);
      expect(result.remaining).toBe(60);
    });

    it('should check rate limit when Redis is configured', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);
      mockRedisService.getRateLimiter.mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          success: true,
          limit: 60,
          remaining: 55,
          reset: Date.now() + 60000,
        }),
      });

      const result = await service.checkTenantLimit('tnt_123');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(60);
      expect(result.remaining).toBe(55);
    });

    it('should reject request when rate limit exceeded', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);
      mockRedisService.getRateLimiter.mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          success: false,
          limit: 60,
          remaining: 0,
          reset: Date.now() + 30000,
        }),
      });

      const result = await service.checkTenantLimit('tnt_123');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
    });
  });

  describe('checkUserLimit', () => {
    it('should allow request when Redis is not configured', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);

      const result = await service.checkUserLimit('tnt_123', 'usr_456');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(20);
    });

    it('should use user-specific rate limit', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);
      mockRedisService.getRateLimiter.mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          success: true,
          limit: 20,
          remaining: 15,
          reset: Date.now() + 60000,
        }),
      });

      const result = await service.checkUserLimit('tnt_123', 'usr_456');

      expect(result.limit).toBe(20);
      expect(result.remaining).toBe(15);
    });
  });

  describe('checkLimits', () => {
    it('should check both tenant and user limits', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);

      const result = await service.checkLimits('tnt_123', 'usr_456');

      expect(result.allowed).toBe(true);
      expect(result.limitType).toBe('user');
    });

    it('should return tenant result when tenant limit exceeded', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);
      mockRedisService.getRateLimiter.mockReturnValueOnce({
        limit: jest.fn().mockResolvedValue({
          success: false,
          limit: 60,
          remaining: 0,
          reset: Date.now() + 30000,
        }),
      });

      const result = await service.checkLimits('tnt_123', 'usr_456');

      expect(result.allowed).toBe(false);
      expect(result.limitType).toBe('tenant');
    });
  });

  describe('getHeaders', () => {
    it('should generate rate limit headers', () => {
      const result = {
        allowed: true,
        limit: 60,
        remaining: 55,
        reset: 1700000000,
      };

      const headers = service.getHeaders(result);

      expect(headers['X-RateLimit-Limit']).toBe('60');
      expect(headers['X-RateLimit-Remaining']).toBe('55');
      expect(headers['X-RateLimit-Reset']).toBe('1700000000');
    });

    it('should include Retry-After when rate limited', () => {
      const result = {
        allowed: false,
        limit: 60,
        remaining: 0,
        reset: 1700000000,
        retryAfter: 30,
      };

      const headers = service.getHeaders(result);

      expect(headers['Retry-After']).toBe('30');
    });
  });
});
