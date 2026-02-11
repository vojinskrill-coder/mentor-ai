import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    configService = module.get(ConfigService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('constructor', () => {
    it('should create service with Redis disabled when no config', () => {
      configService.get.mockReturnValue(undefined);
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('isConfigured', () => {
    it('should return false when Redis URL is not configured', () => {
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('getRateLimiter', () => {
    it('should return null when Redis is not configured', () => {
      const result = service.getRateLimiter('test', 10, 60000);
      expect(result).toBeNull();
    });
  });

  describe('increment', () => {
    it('should return 0 when Redis is not configured', async () => {
      const result = await service.increment('test-key');
      expect(result).toBe(0);
    });
  });

  describe('get', () => {
    it('should return null when Redis is not configured', async () => {
      const result = await service.get('test-key');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should not throw when Redis is not configured', async () => {
      await expect(
        service.set('test-key', { value: 'test' })
      ).resolves.not.toThrow();
    });
  });

  describe('delete', () => {
    it('should not throw when Redis is not configured', async () => {
      await expect(service.delete('test-key')).resolves.not.toThrow();
    });
  });

  describe('onModuleDestroy', () => {
    it('should cleanup rate limiters', async () => {
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });
});
