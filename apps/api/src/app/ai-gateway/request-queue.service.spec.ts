import { Test, TestingModule } from '@nestjs/testing';
import { RequestQueueService, PRIORITY_MAP } from './request-queue.service';
import { RedisService } from './redis.service';
import { UserRole } from '@prisma/client';

describe('RequestQueueService', () => {
  let service: RequestQueueService;
  let redisService: jest.Mocked<RedisService>;

  const mockRedisClient = {
    zadd: jest.fn(),
    zrem: jest.fn(),
    zcount: jest.fn(),
    zrange: jest.fn(),
    zcard: jest.fn(),
    expire: jest.fn(),
  };

  const mockRedisService = {
    isConfigured: jest.fn(),
    getClient: jest.fn().mockReturnValue(mockRedisClient),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestQueueService,
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<RequestQueueService>(RequestQueueService);
    redisService = module.get(RedisService);
  });

  describe('PRIORITY_MAP', () => {
    it('should have correct priority values', () => {
      expect(PRIORITY_MAP[UserRole.TENANT_OWNER]).toBe(3);
      expect(PRIORITY_MAP[UserRole.ADMIN]).toBe(2);
      expect(PRIORITY_MAP[UserRole.MEMBER]).toBe(1);
    });
  });

  describe('enqueue', () => {
    it('should return request when Redis is not configured', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);

      const result = await service.enqueue(
        'tnt_123',
        'usr_456',
        UserRole.MEMBER
      );

      expect(result.id).toMatch(/^req_/);
      expect(result.tenantId).toBe('tnt_123');
      expect(result.userId).toBe('usr_456');
      expect(result.priority).toBe(1);
    });

    it('should add request to Redis queue when configured', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);

      const result = await service.enqueue(
        'tnt_123',
        'usr_456',
        UserRole.TENANT_OWNER,
        'sess_789'
      );

      expect(result.priority).toBe(3);
      expect(result.conversationId).toBe('sess_789');
      expect(mockRedisClient.zadd).toHaveBeenCalled();
      expect(mockRedisClient.expire).toHaveBeenCalled();
    });
  });

  describe('dequeue', () => {
    it('should not throw when Redis is not configured', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);

      const request = {
        id: 'req_123',
        tenantId: 'tnt_123',
        userId: 'usr_456',
        priority: 1,
        timestamp: Date.now(),
      };

      await expect(service.dequeue(request)).resolves.not.toThrow();
    });

    it('should remove request from Redis when configured', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);

      const request = {
        id: 'req_123',
        tenantId: 'tnt_123',
        userId: 'usr_456',
        priority: 1,
        timestamp: Date.now(),
      };

      await service.dequeue(request);

      expect(mockRedisClient.zrem).toHaveBeenCalled();
    });
  });

  describe('getPosition', () => {
    it('should return position 0 when Redis is not configured', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);

      const request = {
        id: 'req_123',
        tenantId: 'tnt_123',
        userId: 'usr_456',
        priority: 1,
        timestamp: Date.now(),
      };

      const result = await service.getPosition(request);

      expect(result.position).toBe(0);
      expect(result.estimatedWait).toBe(0);
    });

    it('should calculate position from Redis', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);
      mockRedisClient.zcount.mockResolvedValue(3);

      const request = {
        id: 'req_123',
        tenantId: 'tnt_123',
        userId: 'usr_456',
        priority: 1,
        timestamp: Date.now(),
      };

      const result = await service.getPosition(request);

      expect(result.position).toBe(4); // 3 ahead + 1 for self
      expect(result.estimatedWait).toBe(15); // 3 * 5 seconds
    });
  });

  describe('isTimedOut', () => {
    it('should return false for recent request', () => {
      const request = {
        id: 'req_123',
        tenantId: 'tnt_123',
        userId: 'usr_456',
        priority: 1,
        timestamp: Date.now(),
      };

      expect(service.isTimedOut(request)).toBe(false);
    });

    it('should return true for old request', () => {
      const request = {
        id: 'req_123',
        tenantId: 'tnt_123',
        userId: 'usr_456',
        priority: 1,
        timestamp: Date.now() - 3 * 60 * 1000, // 3 minutes ago
      };

      expect(service.isTimedOut(request)).toBe(true);
    });
  });

  describe('getNext', () => {
    it('should return null when Redis is not configured', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);

      const result = await service.getNext('tnt_123');

      expect(result).toBeNull();
    });

    it('should return next request from queue', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);
      const request = {
        id: 'req_123',
        tenantId: 'tnt_123',
        userId: 'usr_456',
        priority: 3,
        timestamp: Date.now(),
      };
      mockRedisClient.zrange.mockResolvedValue([JSON.stringify(request)]);

      const result = await service.getNext('tnt_123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('req_123');
    });

    it('should return null for empty queue', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);
      mockRedisClient.zrange.mockResolvedValue([]);

      const result = await service.getNext('tnt_123');

      expect(result).toBeNull();
    });
  });

  describe('getQueueLength', () => {
    it('should return 0 when Redis is not configured', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);

      const result = await service.getQueueLength('tnt_123');

      expect(result).toBe(0);
    });

    it('should return queue length from Redis', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);
      mockRedisClient.zcard.mockResolvedValue(5);

      const result = await service.getQueueLength('tnt_123');

      expect(result).toBe(5);
    });
  });

  describe('cleanupExpired', () => {
    it('should return 0 when Redis is not configured', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);

      const result = await service.cleanupExpired('tnt_123');

      expect(result).toBe(0);
    });

    it('should remove expired requests', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);
      const expiredRequest = {
        id: 'req_old',
        tenantId: 'tnt_123',
        userId: 'usr_456',
        priority: 1,
        timestamp: Date.now() - 5 * 60 * 1000, // 5 minutes ago
      };
      mockRedisClient.zrange.mockResolvedValue([JSON.stringify(expiredRequest)]);

      const result = await service.cleanupExpired('tnt_123');

      expect(result).toBe(1);
      expect(mockRedisClient.zrem).toHaveBeenCalled();
    });
  });
});
