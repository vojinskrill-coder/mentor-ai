import { Test, TestingModule } from '@nestjs/testing';
import {
  CircuitBreakerService,
  CircuitBreakerState,
} from './circuit-breaker.service';
import { RedisService } from './redis.service';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;
  let redisService: jest.Mocked<RedisService>;

  const mockRedisService = {
    isConfigured: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CircuitBreakerService,
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);
    redisService = module.get(RedisService);
  });

  describe('isAllowed', () => {
    it('should allow requests when circuit is closed', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);

      const result = await service.isAllowed('openrouter:gpt-4');

      expect(result).toBe(true);
    });

    it('should block requests when circuit is open', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);
      mockRedisService.get.mockResolvedValue({
        state: CircuitBreakerState.OPEN,
        failures: 5,
        openedAt: Date.now(), // Just opened
      });

      const result = await service.isAllowed('openrouter:gpt-4');

      expect(result).toBe(false);
    });

    it('should transition to half-open after recovery timeout', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);
      mockRedisService.get.mockResolvedValue({
        state: CircuitBreakerState.OPEN,
        failures: 5,
        openedAt: Date.now() - 35000, // 35 seconds ago (> 30s recovery)
      });

      const result = await service.isAllowed('openrouter:gpt-4');

      expect(result).toBe(true); // Allows test request
    });
  });

  describe('recordSuccess', () => {
    it('should reset failures on success', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);

      await service.recordSuccess('openrouter:gpt-4');

      const status = await service.getStatus('openrouter:gpt-4');
      expect(status.state).toBe(CircuitBreakerState.CLOSED);
      expect(status.failures).toBe(0);
    });

    it('should close circuit from half-open on success', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);
      mockRedisService.get.mockResolvedValue({
        state: CircuitBreakerState.HALF_OPEN,
        failures: 5,
      });

      await service.recordSuccess('openrouter:gpt-4', 'cor_123');

      expect(mockRedisService.set).toHaveBeenCalled();
    });
  });

  describe('recordFailure', () => {
    it('should increment failure count', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);

      await service.recordFailure('openrouter:gpt-4');

      const status = await service.getStatus('openrouter:gpt-4');
      expect(status.failures).toBe(1);
    });

    it('should open circuit after threshold failures', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);

      // Record 5 failures
      for (let i = 0; i < 5; i++) {
        await service.recordFailure('openrouter:gpt-4');
      }

      const status = await service.getStatus('openrouter:gpt-4');
      expect(status.state).toBe(CircuitBreakerState.OPEN);
    });

    it('should reopen circuit from half-open on failure', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);
      mockRedisService.get.mockResolvedValue({
        state: CircuitBreakerState.HALF_OPEN,
        failures: 5,
      });

      await service.recordFailure('openrouter:gpt-4', 'cor_123');

      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          state: CircuitBreakerState.OPEN,
        }),
        expect.any(Number)
      );
    });
  });

  describe('getStatus', () => {
    it('should return closed state by default', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);

      const status = await service.getStatus('unknown-provider');

      expect(status.state).toBe(CircuitBreakerState.CLOSED);
      expect(status.failures).toBe(0);
    });

    it('should retrieve status from Redis when configured', async () => {
      mockRedisService.isConfigured.mockReturnValue(true);
      mockRedisService.get.mockResolvedValue({
        state: CircuitBreakerState.OPEN,
        failures: 5,
        openedAt: Date.now(),
      });

      const status = await service.getStatus('openrouter:gpt-4');

      expect(status.state).toBe(CircuitBreakerState.OPEN);
      expect(status.failures).toBe(5);
    });
  });

  describe('reset', () => {
    it('should reset circuit to closed state', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);

      // First open the circuit
      for (let i = 0; i < 5; i++) {
        await service.recordFailure('openrouter:gpt-4');
      }

      // Then reset
      await service.reset('openrouter:gpt-4');

      const status = await service.getStatus('openrouter:gpt-4');
      expect(status.state).toBe(CircuitBreakerState.CLOSED);
      expect(status.failures).toBe(0);
    });
  });

  describe('onStateChange', () => {
    it('should register and call event listeners', async () => {
      mockRedisService.isConfigured.mockReturnValue(false);
      const listener = jest.fn();

      service.onStateChange(listener);

      // Trigger state change by reaching threshold
      for (let i = 0; i < 5; i++) {
        await service.recordFailure('openrouter:gpt-4');
      }

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'openrouter:gpt-4',
          previousState: CircuitBreakerState.CLOSED,
          newState: CircuitBreakerState.OPEN,
        })
      );
    });
  });
});
