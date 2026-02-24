import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QdrantClientService } from './qdrant-client.service';

describe('QdrantClientService', () => {
  let service: QdrantClientService;
  let mockConfigService: {
    get: jest.Mock;
  };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [QdrantClientService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<QdrantClientService>(QdrantClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should not initialize client when QDRANT_URL is not set', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await service.onModuleInit();

      expect(service.isAvailable()).toBe(false);
    });

    it('should initialize client when QDRANT_URL is set', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'QDRANT_URL') return 'http://localhost:6333';
        if (key === 'QDRANT_API_KEY') return 'test-key';
        return undefined;
      });

      await service.onModuleInit();

      expect(service.isAvailable()).toBe(true);
    });

    it('should initialize client without API key', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'QDRANT_URL') return 'http://localhost:6333';
        return undefined;
      });

      await service.onModuleInit();

      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('getClient', () => {
    it('should throw when client is not initialized', () => {
      expect(() => service.getClient()).toThrow(
        'Qdrant client not initialized. Check QDRANT_URL env var.'
      );
    });

    it('should return client when initialized', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'QDRANT_URL') return 'http://localhost:6333';
        return undefined;
      });

      await service.onModuleInit();

      expect(() => service.getClient()).not.toThrow();
      expect(service.getClient()).toBeDefined();
    });
  });

  describe('isAvailable', () => {
    it('should return false before initialization', () => {
      expect(service.isAvailable()).toBe(false);
    });

    it('should return false when URL not configured', async () => {
      await service.onModuleInit();

      expect(service.isAvailable()).toBe(false);
    });

    it('should return true when URL is configured and client initialized', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'QDRANT_URL') return 'http://localhost:6333';
        return undefined;
      });

      await service.onModuleInit();

      expect(service.isAvailable()).toBe(true);
    });
  });
});
