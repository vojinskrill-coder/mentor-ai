import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import type {
  LlmProviderConfig,
  LlmConfigResponse,
  LlmProviderUpdatePayload,
  LlmProviderStatus,
  LlmProviderType,
} from '@mentor-ai/shared/types';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { LocalLlamaProvider } from './providers/local-llama.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { LmStudioProvider } from './providers/lm-studio.provider';
import { DeepSeekProvider } from './providers/deepseek.provider';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const API_KEY_MASK = '***masked***';

/**
 * Service for managing LLM provider configuration at the platform level.
 * Handles provider CRUD operations, API key encryption, validation, and audit logging.
 */
@Injectable()
export class LlmConfigService {
  private readonly logger = new Logger(LlmConfigService.name);
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly configService: ConfigService
  ) {
    const keyHex = this.configService.get<string>('LLM_CONFIG_ENCRYPTION_KEY');
    if (!keyHex) {
      this.logger.warn({
        message: 'LLM_CONFIG_ENCRYPTION_KEY not set, using default (not secure for production)',
      });
      // Generate a consistent default key for development (32 bytes = 64 hex chars)
      this.encryptionKey = Buffer.from('0'.repeat(64), 'hex');
    } else {
      this.encryptionKey = Buffer.from(keyHex, 'hex');
    }
  }

  /**
   * Retrieves the current LLM provider configuration.
   * API keys are masked in the response for security.
   * @returns Current primary and fallback provider configuration
   */
  async getConfig(): Promise<LlmConfigResponse> {
    const configs = await this.prisma.llmProviderConfig.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const primary = configs.find((c) => c.isPrimary) ?? null;
    const fallback = configs.find((c) => c.isFallback) ?? null;

    return {
      primaryProvider: primary ? this.mapToResponse(primary) : null,
      fallbackProvider: fallback ? this.mapToResponse(fallback) : null,
    };
  }

  /**
   * Updates the LLM provider configuration.
   * Encrypts API keys before storage and logs changes to audit trail.
   * @param userId - ID of the user making the change
   * @param primaryProvider - Primary provider configuration
   * @param fallbackProvider - Optional fallback provider configuration
   * @returns Updated configuration
   * @throws BadRequestException if primary provider validation fails
   */
  async updateConfig(
    userId: string,
    primaryProvider: LlmProviderUpdatePayload,
    fallbackProvider?: LlmProviderUpdatePayload | null
  ): Promise<LlmConfigResponse> {
    // Get current config for audit log
    const currentConfig = await this.getConfig();

    // Deactivate all existing configs
    await this.prisma.llmProviderConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // Create primary provider config
    const primaryConfig = await this.prisma.llmProviderConfig.create({
      data: {
        providerType: primaryProvider.type,
        apiKey: primaryProvider.apiKey ? this.encrypt(primaryProvider.apiKey) : null,
        endpoint: primaryProvider.endpoint,
        modelId: primaryProvider.modelId,
        isPrimary: true,
        isFallback: false,
        isActive: true,
      },
    });

    let fallbackConfig = null;
    if (fallbackProvider) {
      fallbackConfig = await this.prisma.llmProviderConfig.create({
        data: {
          providerType: fallbackProvider.type,
          apiKey: fallbackProvider.apiKey ? this.encrypt(fallbackProvider.apiKey) : null,
          endpoint: fallbackProvider.endpoint,
          modelId: fallbackProvider.modelId,
          isPrimary: false,
          isFallback: true,
          isActive: true,
        },
      });
    }

    // Log the configuration change to audit trail
    await this.createAuditLog(
      currentConfig.primaryProvider ? 'UPDATE' : 'CREATE',
      userId,
      currentConfig,
      {
        primaryProvider: this.mapToResponse(primaryConfig),
        fallbackProvider: fallbackConfig ? this.mapToResponse(fallbackConfig) : null,
      }
    );

    this.logger.log({
      message: 'LLM configuration updated',
      userId,
      primaryProvider: primaryProvider.type,
      fallbackProvider: fallbackProvider?.type ?? null,
    });

    return {
      primaryProvider: this.mapToResponse(primaryConfig),
      fallbackProvider: fallbackConfig ? this.mapToResponse(fallbackConfig) : null,
    };
  }

  /**
   * Validates provider credentials by testing connectivity.
   * For cloud providers, validates API key. For local providers, checks endpoint health.
   * @param type - Provider type to validate
   * @param apiKey - API key for cloud providers
   * @param endpoint - Endpoint URL for local providers
   * @returns Validation result with available models and resource info
   */
  async validateProvider(
    type: LlmProviderType,
    apiKey?: string,
    endpoint?: string
  ): Promise<LlmProviderStatus> {
    try {
      const provider = this.createProvider(type, apiKey, endpoint);
      const isValid = await provider.validateCredentials();

      if (!isValid) {
        return {
          valid: false,
          models: [],
          resourceInfo: null,
          errorMessage: 'Invalid credentials or endpoint unreachable',
        };
      }

      const models = await provider.fetchModels();
      const resourceInfo = await provider.getResourceInfo();

      this.logger.log({
        message: 'Provider validation successful',
        providerType: type,
        modelCount: models.length,
      });

      return {
        valid: true,
        models,
        resourceInfo,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';

      this.logger.warn({
        message: 'Provider validation failed',
        providerType: type,
        error: errorMessage,
      });

      return {
        valid: false,
        models: [],
        resourceInfo: null,
        errorMessage,
      };
    }
  }

  /**
   * Gets the decrypted API key for a provider (for internal use only).
   * @param providerType - Type of provider to get key for
   * @returns Decrypted API key or null if not found
   * @throws InternalServerErrorException if decryption fails
   */
  async getDecryptedApiKey(providerType: LlmProviderType): Promise<string | null> {
    const config = await this.prisma.llmProviderConfig.findFirst({
      where: {
        providerType,
        isActive: true,
      },
    });

    if (!config?.apiKey) {
      return null;
    }

    try {
      return this.decrypt(config.apiKey);
    } catch (error) {
      this.logger.error({
        message: 'Failed to decrypt API key',
        providerType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new InternalServerErrorException({
        type: 'decryption_failed',
        title: 'Configuration Error',
        status: 500,
        detail: 'Failed to retrieve provider credentials',
      });
    }
  }

  /**
   * Gets the configured endpoint for a provider.
   * @param providerType - Type of provider to get endpoint for
   * @returns Endpoint URL or null if not found
   */
  async getProviderEndpoint(providerType: LlmProviderType): Promise<string | null> {
    const config = await this.prisma.llmProviderConfig.findFirst({
      where: {
        providerType,
        isActive: true,
      },
    });
    return config?.endpoint ?? null;
  }

  private createProvider(type: LlmProviderType, apiKey?: string, endpoint?: string) {
    switch (type) {
      case 'OPENROUTER':
        if (!apiKey) {
          throw new BadRequestException({
            type: 'api_key_required',
            title: 'API Key Required',
            status: 400,
            detail: 'OpenRouter requires an API key',
          });
        }
        return new OpenRouterProvider({ apiKey });

      case 'LOCAL_LLAMA':
        return new LocalLlamaProvider({ endpoint });

      case 'OPENAI':
        if (!apiKey) {
          throw new BadRequestException({
            type: 'api_key_required',
            title: 'API Key Required',
            status: 400,
            detail: 'OpenAI requires an API key',
          });
        }
        return new OpenAIProvider({ apiKey });

      case 'LM_STUDIO':
        return new LmStudioProvider({ endpoint: endpoint ?? 'http://localhost:1234', apiKey });

      case 'DEEPSEEK':
        if (!apiKey) {
          throw new BadRequestException({
            type: 'api_key_required',
            title: 'API Key Required',
            status: 400,
            detail: 'DeepSeek requires an API key',
          });
        }
        return new DeepSeekProvider({ apiKey });

      case 'ANTHROPIC':
        throw new BadRequestException({
          type: 'provider_not_implemented',
          title: 'Provider Not Available',
          status: 400,
          detail: `${type} provider is not yet implemented`,
        });

      default:
        throw new BadRequestException({
          type: 'invalid_provider_type',
          title: 'Invalid Provider',
          status: 400,
          detail: 'Unknown provider type',
        });
    }
  }

  private mapToResponse(config: {
    id: string;
    providerType: string;
    apiKey: string | null;
    endpoint: string | null;
    modelId: string;
    isPrimary: boolean;
    isFallback: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): LlmProviderConfig {
    return {
      id: config.id,
      providerType: config.providerType as LlmProviderType,
      apiKey: config.apiKey ? API_KEY_MASK : undefined,
      endpoint: config.endpoint ?? undefined,
      modelId: config.modelId,
      isPrimary: config.isPrimary,
      isFallback: config.isFallback,
      isActive: config.isActive,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    };
  }

  private async createAuditLog(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    changedBy: string,
    previousVal: LlmConfigResponse | null,
    newVal: LlmConfigResponse
  ): Promise<void> {
    await this.prisma.llmConfigAuditLog.create({
      data: {
        action,
        changedBy,
        previousVal: previousVal ? JSON.parse(JSON.stringify(previousVal)) : undefined,
        newVal: JSON.parse(JSON.stringify(newVal)),
      },
    });

    this.logger.log({
      message: 'LLM config audit log created',
      action,
      changedBy,
    });
  }

  /**
   * Encrypts a string using AES-256-GCM.
   * Returns format: iv:authTag:encryptedData (all hex encoded)
   */
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts a string encrypted with the encrypt method.
   * @throws Error if encrypted string format is invalid
   */
  private decrypt(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted string format');
    }
    const [ivHex, authTagHex, encryptedText] = parts as [string, string, string];
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
