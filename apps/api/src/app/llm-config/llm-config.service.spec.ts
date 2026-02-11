import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { LlmConfigService } from './llm-config.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { LlmProviderType } from '@mentor-ai/shared/types';

// Mock the provider modules
jest.mock('./providers/openrouter.provider', () => ({
  OpenRouterProvider: jest.fn().mockImplementation(() => ({
    validateCredentials: jest.fn().mockResolvedValue(true),
    fetchModels: jest.fn().mockResolvedValue([
      { id: 'meta-llama/llama-3.1-70b', name: 'Llama 3.1 70B', costPer1kTokens: 0.0009 },
    ]),
    getResourceInfo: jest.fn().mockResolvedValue(null),
  })),
}));

jest.mock('./providers/local-llama.provider', () => ({
  LocalLlamaProvider: jest.fn().mockImplementation(() => ({
    validateCredentials: jest.fn().mockResolvedValue(true),
    fetchModels: jest.fn().mockResolvedValue([
      { id: 'llama3.1:8b', name: 'Llama 3.1 8B', costPer1kTokens: null },
    ]),
    getResourceInfo: jest.fn().mockResolvedValue({
      gpuRequired: true,
      gpuMemoryGb: 8,
      cpuCores: 4,
      ramGb: 16,
    }),
  })),
}));

describe('LlmConfigService', () => {
  let service: LlmConfigService;
  let mockPrisma: {
    llmProviderConfig: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    llmConfigAuditLog: {
      create: jest.Mock;
    };
  };
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      llmProviderConfig: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      llmConfigAuditLog: {
        create: jest.fn(),
      },
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'LLM_CONFIG_ENCRYPTION_KEY') {
          // 32 bytes = 64 hex chars for AES-256
          return 'a'.repeat(64);
        }
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmConfigService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LlmConfigService>(LlmConfigService);
  });

  describe('getConfig', () => {
    it('should return empty config when no providers configured', async () => {
      mockPrisma.llmProviderConfig.findMany.mockResolvedValue([]);

      const result = await service.getConfig();

      expect(result.primaryProvider).toBeNull();
      expect(result.fallbackProvider).toBeNull();
    });

    it('should return primary and fallback providers', async () => {
      const mockConfigs = [
        {
          id: 'cfg_1',
          providerType: 'OPENROUTER',
          apiKey: 'encrypted-key',
          endpoint: null,
          modelId: 'meta-llama/llama-3.1-70b',
          isPrimary: true,
          isFallback: false,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'cfg_2',
          providerType: 'LOCAL_LLAMA',
          apiKey: null,
          endpoint: 'http://localhost:11434',
          modelId: 'llama3.1:8b',
          isPrimary: false,
          isFallback: true,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrisma.llmProviderConfig.findMany.mockResolvedValue(mockConfigs);

      const result = await service.getConfig();

      expect(result.primaryProvider).not.toBeNull();
      expect(result.primaryProvider?.providerType).toBe('OPENROUTER');
      expect(result.primaryProvider?.apiKey).toBe('***masked***');
      expect(result.fallbackProvider).not.toBeNull();
      expect(result.fallbackProvider?.providerType).toBe('LOCAL_LLAMA');
    });
  });

  describe('updateConfig', () => {
    it('should create new configuration and deactivate old ones', async () => {
      mockPrisma.llmProviderConfig.findMany.mockResolvedValue([]);
      mockPrisma.llmProviderConfig.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.llmProviderConfig.create.mockResolvedValue({
        id: 'cfg_new',
        providerType: 'OPENROUTER',
        apiKey: 'encrypted-key',
        endpoint: null,
        modelId: 'meta-llama/llama-3.1-70b',
        isPrimary: true,
        isFallback: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.llmConfigAuditLog.create.mockResolvedValue({});

      const result = await service.updateConfig(
        'usr_123',
        {
          type: LlmProviderType.OPENROUTER,
          apiKey: 'sk-or-test-key',
          modelId: 'meta-llama/llama-3.1-70b',
        }
      );

      expect(mockPrisma.llmProviderConfig.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { isActive: false },
      });
      expect(mockPrisma.llmProviderConfig.create).toHaveBeenCalled();
      expect(mockPrisma.llmConfigAuditLog.create).toHaveBeenCalled();
      expect(result.primaryProvider).not.toBeNull();
    });

    it('should encrypt API keys before storage', async () => {
      mockPrisma.llmProviderConfig.findMany.mockResolvedValue([]);
      mockPrisma.llmProviderConfig.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.llmProviderConfig.create.mockResolvedValue({
        id: 'cfg_new',
        providerType: 'OPENROUTER',
        apiKey: 'some-encrypted-value',
        endpoint: null,
        modelId: 'test-model',
        isPrimary: true,
        isFallback: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.llmConfigAuditLog.create.mockResolvedValue({});

      await service.updateConfig('usr_123', {
        type: LlmProviderType.OPENROUTER,
        apiKey: 'sk-or-plaintext-key',
        modelId: 'test-model',
      });

      const createCall = mockPrisma.llmProviderConfig.create.mock.calls[0][0];
      // API key should be encrypted (not the plaintext value)
      expect(createCall.data.apiKey).not.toBe('sk-or-plaintext-key');
      // Should contain the encryption format (iv:authTag:encrypted)
      expect(createCall.data.apiKey).toContain(':');
    });
  });

  describe('validateProvider', () => {
    it('should validate OpenRouter provider with valid API key', async () => {
      const result = await service.validateProvider(
        LlmProviderType.OPENROUTER,
        'sk-or-valid-key'
      );

      expect(result.valid).toBe(true);
      expect(result.models.length).toBeGreaterThan(0);
      expect(result.resourceInfo).toBeNull();
    });

    it('should validate Local Llama provider', async () => {
      const result = await service.validateProvider(
        LlmProviderType.LOCAL_LLAMA,
        undefined,
        'http://localhost:11434'
      );

      expect(result.valid).toBe(true);
      expect(result.models.length).toBeGreaterThan(0);
      expect(result.resourceInfo).not.toBeNull();
    });

    it('should return invalid result for OpenRouter without API key', async () => {
      const result = await service.validateProvider(LlmProviderType.OPENROUTER);
      expect(result.valid).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return invalid result for unsupported provider types', async () => {
      const result = await service.validateProvider(LlmProviderType.OPENAI, 'test-key');
      expect(result.valid).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });
  });

  describe('encryption', () => {
    it('should correctly encrypt and decrypt API keys', async () => {
      mockPrisma.llmProviderConfig.findMany.mockResolvedValue([]);
      mockPrisma.llmProviderConfig.updateMany.mockResolvedValue({ count: 0 });

      let capturedApiKey = '';
      mockPrisma.llmProviderConfig.create.mockImplementation((args) => {
        capturedApiKey = args.data.apiKey;
        return Promise.resolve({
          id: 'cfg_new',
          providerType: 'OPENROUTER',
          apiKey: capturedApiKey,
          endpoint: null,
          modelId: 'test-model',
          isPrimary: true,
          isFallback: false,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });
      mockPrisma.llmConfigAuditLog.create.mockResolvedValue({});

      await service.updateConfig('usr_123', {
        type: LlmProviderType.OPENROUTER,
        apiKey: 'sk-or-test-secret-key',
        modelId: 'test-model',
      });

      // Now test decryption via getDecryptedApiKey
      mockPrisma.llmProviderConfig.findFirst.mockResolvedValue({
        id: 'cfg_new',
        providerType: 'OPENROUTER',
        apiKey: capturedApiKey,
        isActive: true,
      });

      const decryptedKey = await service.getDecryptedApiKey(LlmProviderType.OPENROUTER);
      expect(decryptedKey).toBe('sk-or-test-secret-key');
    });
  });
});
