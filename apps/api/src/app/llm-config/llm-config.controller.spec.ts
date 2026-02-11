import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmConfigController } from './llm-config.controller';
import { LlmConfigService } from './llm-config.service';
import { LlmProviderType } from '@mentor-ai/shared/types';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';

describe('LlmConfigController', () => {
  let controller: LlmConfigController;
  let mockLlmConfigService: {
    getConfig: jest.Mock;
    updateConfig: jest.Mock;
    validateProvider: jest.Mock;
  };

  const mockUser: CurrentUserPayload = {
    userId: 'usr_123',
    tenantId: 'tnt_456',
    email: 'admin@example.com',
    role: 'PLATFORM_OWNER',
    auth0Id: 'auth0|123',
  };

  beforeEach(async () => {
    mockLlmConfigService = {
      getConfig: jest.fn(),
      updateConfig: jest.fn(),
      validateProvider: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LlmConfigController],
      providers: [
        { provide: LlmConfigService, useValue: mockLlmConfigService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<LlmConfigController>(LlmConfigController);
  });

  describe('getConfig', () => {
    it('should return current LLM configuration', async () => {
      const mockConfig = {
        primaryProvider: {
          id: 'cfg_1',
          providerType: LlmProviderType.OPENROUTER,
          apiKey: '***masked***',
          modelId: 'meta-llama/llama-3.1-70b',
          isPrimary: true,
          isFallback: false,
          isActive: true,
          createdAt: '2026-02-04T00:00:00.000Z',
          updatedAt: '2026-02-04T00:00:00.000Z',
        },
        fallbackProvider: null,
      };
      mockLlmConfigService.getConfig.mockResolvedValue(mockConfig);

      const result = await controller.getConfig();

      expect(result.data).toEqual(mockConfig);
      expect(mockLlmConfigService.getConfig).toHaveBeenCalled();
    });

    it('should return empty config when no providers configured', async () => {
      mockLlmConfigService.getConfig.mockResolvedValue({
        primaryProvider: null,
        fallbackProvider: null,
      });

      const result = await controller.getConfig();

      expect(result.data.primaryProvider).toBeNull();
      expect(result.data.fallbackProvider).toBeNull();
    });
  });

  describe('updateConfig', () => {
    it('should update LLM configuration and return success message', async () => {
      const updateDto = {
        primaryProvider: {
          type: LlmProviderType.OPENROUTER,
          apiKey: 'sk-or-new-key',
          modelId: 'meta-llama/llama-3.1-70b',
        },
        fallbackProvider: null,
      };

      const updatedConfig = {
        primaryProvider: {
          id: 'cfg_new',
          providerType: LlmProviderType.OPENROUTER,
          apiKey: '***masked***',
          modelId: 'meta-llama/llama-3.1-70b',
          isPrimary: true,
          isFallback: false,
          isActive: true,
          createdAt: '2026-02-04T00:00:00.000Z',
          updatedAt: '2026-02-04T00:00:00.000Z',
        },
        fallbackProvider: null,
      };
      mockLlmConfigService.updateConfig.mockResolvedValue(updatedConfig);

      const result = await controller.updateConfig(mockUser, updateDto);

      expect(result.data).toEqual(updatedConfig);
      expect(result.message).toBe('LLM configuration updated successfully');
      expect(mockLlmConfigService.updateConfig).toHaveBeenCalledWith(
        mockUser.userId,
        updateDto.primaryProvider,
        updateDto.fallbackProvider
      );
    });

    it('should update with both primary and fallback providers', async () => {
      const updateDto = {
        primaryProvider: {
          type: LlmProviderType.OPENROUTER,
          apiKey: 'sk-or-key',
          modelId: 'meta-llama/llama-3.1-70b',
        },
        fallbackProvider: {
          type: LlmProviderType.LOCAL_LLAMA,
          endpoint: 'http://localhost:11434',
          modelId: 'llama3.1:8b',
        },
      };

      mockLlmConfigService.updateConfig.mockResolvedValue({
        primaryProvider: { ...updateDto.primaryProvider, id: 'cfg_1' },
        fallbackProvider: { ...updateDto.fallbackProvider, id: 'cfg_2' },
      });

      const result = await controller.updateConfig(mockUser, updateDto);

      expect(mockLlmConfigService.updateConfig).toHaveBeenCalledWith(
        mockUser.userId,
        updateDto.primaryProvider,
        updateDto.fallbackProvider
      );
    });
  });

  describe('validateProvider', () => {
    it('should validate OpenRouter provider credentials', async () => {
      const validateDto = {
        type: LlmProviderType.OPENROUTER,
        apiKey: 'sk-or-test-key',
      };

      const validationResult = {
        valid: true,
        models: [
          { id: 'meta-llama/llama-3.1-70b', name: 'Llama 3.1 70B', costPer1kTokens: 0.0009 },
        ],
        resourceInfo: null,
      };
      mockLlmConfigService.validateProvider.mockResolvedValue(validationResult);

      const result = await controller.validateProvider(validateDto);

      expect(result.data).toEqual(validationResult);
      expect(mockLlmConfigService.validateProvider).toHaveBeenCalledWith(
        validateDto.type,
        validateDto.apiKey,
        undefined
      );
    });

    it('should validate Local Llama endpoint', async () => {
      const validateDto = {
        type: LlmProviderType.LOCAL_LLAMA,
        endpoint: 'http://localhost:11434',
      };

      const validationResult = {
        valid: true,
        models: [
          { id: 'llama3.1:8b', name: 'Llama 3.1 8B', costPer1kTokens: null },
        ],
        resourceInfo: {
          gpuRequired: true,
          gpuMemoryGb: 8,
          cpuCores: 4,
          ramGb: 16,
        },
      };
      mockLlmConfigService.validateProvider.mockResolvedValue(validationResult);

      const result = await controller.validateProvider(validateDto);

      expect(result.data).toEqual(validationResult);
      expect(result.data.resourceInfo).not.toBeNull();
    });

    it('should return invalid result for bad credentials', async () => {
      const validateDto = {
        type: LlmProviderType.OPENROUTER,
        apiKey: 'invalid-key',
      };

      const validationResult = {
        valid: false,
        models: [],
        resourceInfo: null,
        errorMessage: 'Invalid API key',
      };
      mockLlmConfigService.validateProvider.mockResolvedValue(validationResult);

      const result = await controller.validateProvider(validateDto);

      expect(result.data.valid).toBe(false);
      expect(result.data.errorMessage).toBe('Invalid API key');
    });
  });
});
