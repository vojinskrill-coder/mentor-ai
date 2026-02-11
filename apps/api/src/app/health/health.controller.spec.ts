import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaHealthIndicator } from './indicators/prisma.health';
import { MemoryHealthIndicator } from './indicators/memory.health';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: HealthService;
  let healthCheckService: HealthCheckService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: {
            check: jest.fn(),
          },
        },
        {
          provide: HealthService,
          useValue: {
            getVersion: jest.fn().mockReturnValue('1.0.0'),
            getTimestamp: jest.fn().mockReturnValue('2026-02-04T12:00:00.000Z'),
          },
        },
        {
          provide: PrismaHealthIndicator,
          useValue: {
            isHealthy: jest.fn(),
          },
        },
        {
          provide: MemoryHealthIndicator,
          useValue: {
            isHealthy: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthService = module.get<HealthService>(HealthService);
    healthCheckService = module.get<HealthCheckService>(HealthCheckService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /health', () => {
    it('should return healthy status with timestamp and version', () => {
      const result = controller.getHealth();

      expect(result).toEqual({
        status: 'healthy',
        timestamp: '2026-02-04T12:00:00.000Z',
        version: '1.0.0',
      });
      expect(healthService.getTimestamp).toHaveBeenCalled();
      expect(healthService.getVersion).toHaveBeenCalled();
    });

    it('should include correlationId when provided', () => {
      const correlationId = 'corr_abc123';

      const result = controller.getHealth(correlationId);

      expect(result).toEqual({
        status: 'healthy',
        timestamp: '2026-02-04T12:00:00.000Z',
        version: '1.0.0',
        correlationId: 'corr_abc123',
      });
    });

    it('should not include correlationId when not provided', () => {
      const result = controller.getHealth();

      expect(result.correlationId).toBeUndefined();
    });
  });

  describe('GET /health/live', () => {
    it('should return minimal ok status', () => {
      const result = controller.getLiveness();

      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('GET /health/ready', () => {
    it('should check all health indicators', async () => {
      const mockResult = {
        status: 'ok' as const,
        info: { database: { status: 'up' }, memory: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' }, memory: { status: 'up' } },
      };

      (healthCheckService.check as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getReadiness();

      expect(result).toEqual(mockResult);
      expect(healthCheckService.check).toHaveBeenCalled();
    });

    it('should return error status when database check fails', async () => {
      const mockResult = {
        status: 'error' as const,
        info: { memory: { status: 'up' } },
        error: { database: { status: 'down', message: 'Connection failed' } },
        details: {
          memory: { status: 'up' },
          database: { status: 'down', message: 'Connection failed' },
        },
      };

      (healthCheckService.check as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getReadiness();

      expect(result.status).toBe('error');
      expect(result.error).toHaveProperty('database');
    });

    it('should include correlation ID in response when provided', async () => {
      const mockResult = {
        status: 'ok' as const,
        info: { database: { status: 'up' }, memory: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' }, memory: { status: 'up' } },
      };

      (healthCheckService.check as jest.Mock).mockResolvedValue(mockResult);
      const correlationId = 'corr_ready_123';

      const result = await controller.getReadiness(correlationId);

      expect((result as { correlationId?: string }).correlationId).toBe(
        correlationId
      );
    });

    it('should not include correlation ID when not provided', async () => {
      const mockResult = {
        status: 'ok' as const,
        info: { database: { status: 'up' }, memory: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' }, memory: { status: 'up' } },
      };

      (healthCheckService.check as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getReadiness();

      expect((result as { correlationId?: string }).correlationId).toBeUndefined();
    });
  });
});
