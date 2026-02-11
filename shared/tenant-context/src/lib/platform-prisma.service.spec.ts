import { ConfigService } from '@nestjs/config';
import { PlatformPrismaService } from './platform-prisma.service';

// Mock PrismaClient as a class
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('@prisma/client', () => ({
  PrismaClient: class MockPrismaClient {
    $connect = mockConnect;
    $disconnect = mockDisconnect;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_options?: unknown) {
      // Constructor mock
    }
  },
}));

describe('PlatformPrismaService', () => {
  let service: PlatformPrismaService;
  let configService: ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'DATABASE_URL') {
          return 'postgresql://postgres:postgres@localhost:5432/mentor_ai_platform';
        }
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new PlatformPrismaService(configService);
  });

  describe('constructor', () => {
    it('should create service with database URL from config', () => {
      expect(service).toBeDefined();
      expect(configService.get).toHaveBeenCalledWith('DATABASE_URL');
    });

    it('should throw error when DATABASE_URL is not set', () => {
      const emptyConfigService = {
        get: jest.fn(() => undefined),
      } as unknown as ConfigService;

      expect(() => new PlatformPrismaService(emptyConfigService)).toThrow(
        'DATABASE_URL environment variable is required'
      );
    });
  });

  describe('onModuleInit', () => {
    it('should connect to database', async () => {
      await service.onModuleInit();

      expect(mockConnect).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect from database', async () => {
      await service.onModuleDestroy();

      expect(mockDisconnect).toHaveBeenCalled();
    });
  });
});
