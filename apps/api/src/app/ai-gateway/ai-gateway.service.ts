import {
  Injectable,
  Logger,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmConfigService } from '../llm-config/llm-config.service';
import {
  LlmProviderType,
  ChatMessage,
  RateLimitInfo,
  PersonaType,
  ConfidenceScore,
  type ConfidenceContext,
} from '@mentor-ai/shared/types';
import { ConfidenceService } from './confidence/confidence.service';
import { generateSystemPrompt } from '../personas/templates/persona-prompts';
import { RateLimiterService } from './rate-limiter.service';
import { QuotaService } from './quota.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { TokenTrackerService } from './token-tracker.service';
import { CostCalculatorService } from './cost-calculator.service';
import { createId } from '@paralleldrive/cuid2';

/**
 * Internal type for OpenRouter API streaming response.
 * Not shared because it's provider-specific implementation detail.
 */
interface OpenRouterResponse {
  id: string;
  choices: Array<{
    delta?: {
      content?: string;
    };
    message?: {
      content: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Options for streaming completions with full context.
 */
export interface StreamCompletionOptions {
  /** Tenant identifier for rate limiting and quota */
  tenantId: string;
  /** User identifier for rate limiting */
  userId: string;
  /** Conversation identifier for tracking */
  conversationId?: string;
  /** Skip rate limiting (for internal use) */
  skipRateLimit?: boolean;
  /** Skip quota check (for internal use) */
  skipQuotaCheck?: boolean;
  /** Optional persona type for department-specific responses */
  personaType?: PersonaType;
  /** Message count in conversation for confidence calculation */
  messageCount?: number;
  /** Whether client context is available for confidence calculation */
  hasClientContext?: boolean;
  /** Whether specific data is available for confidence calculation */
  hasSpecificData?: boolean;
  /** User's original question for confidence context */
  userQuestion?: string;
  /** Pre-built business context string to prepend to system prompt */
  businessContext?: string;
}

/**
 * Result of a completion including usage metrics.
 */
export interface CompletionResult {
  /** Correlation ID for tracing */
  correlationId: string;
  /** Whether the completion was successful */
  success: boolean;
  /** Input tokens used */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Total cost in USD */
  cost: number;
  /** Rate limit information */
  rateLimit?: RateLimitInfo;
  /** Persona type used (if any) */
  personaType?: PersonaType;
  /** Confidence score for the response (Story 2.5) */
  confidence?: ConfidenceScore;
  /** Full response content for confidence calculation */
  responseContent?: string;
}

/**
 * Service for streaming AI completions from configured LLM providers.
 * Includes rate limiting, quota enforcement, circuit breaker, and cost tracking.
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  /** Request timeout in milliseconds (120 seconds — GPT-5.2 needs longer for complex prompts) */
  private readonly requestTimeoutMs = 120 * 1000;

  constructor(
    private readonly llmConfigService: LlmConfigService,
    private readonly configService: ConfigService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly quotaService: QuotaService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly tokenTrackerService: TokenTrackerService,
    private readonly costCalculatorService: CostCalculatorService,
    private readonly confidenceService: ConfidenceService
  ) {}

  /**
   * Streams a completion with full context including rate limiting, quota, and tracking.
   *
   * @param messages - Conversation history in chat format
   * @param options - Stream options including tenant/user context
   * @param onChunk - Callback for each streamed chunk
   * @returns Completion result with usage metrics
   * @throws HttpException for rate limits, quotas, or provider errors
   */
  async streamCompletionWithContext(
    messages: ChatMessage[],
    options: StreamCompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResult> {
    const correlationId = `cor_${createId()}`;
    const { tenantId, userId, conversationId, personaType } = options;

    this.logger.log({
      message: 'Starting AI completion',
      correlationId,
      tenantId,
      userId,
      conversationId,
      personaType: personaType ?? 'none',
      messageCount: messages.length,
    });

    // Build combined system prompt: business context + persona
    let messagesWithPersona = messages;
    let systemPrompt = '';

    if (options.businessContext) {
      systemPrompt = options.businessContext;
      this.logger.log({
        message: 'Business context added to system prompt',
        correlationId,
        contextLength: options.businessContext.length,
      });
    }

    if (personaType) {
      const personaSystemPrompt = generateSystemPrompt(personaType);
      if (personaSystemPrompt) {
        systemPrompt = systemPrompt
          ? `${systemPrompt}\n\n${personaSystemPrompt}`
          : personaSystemPrompt;
        this.logger.log({
          message: 'Persona system prompt added',
          correlationId,
          personaType,
          promptLength: personaSystemPrompt.length,
        });
      }
    }

    if (systemPrompt) {
      messagesWithPersona = [
        { role: 'system', content: systemPrompt },
        ...messages,
      ];
    }

    // Check rate limits
    let rateLimit: RateLimitInfo | undefined;
    if (!options.skipRateLimit) {
      const rateLimitResult = await this.rateLimiterService.checkLimits(
        tenantId,
        userId
      );
      rateLimit = rateLimitResult;

      if (!rateLimitResult.allowed) {
        const headers = this.rateLimiterService.getHeaders(rateLimitResult);
        throw new HttpException(
          {
            type: 'rate_limit_exceeded',
            title: 'Rate Limit Exceeded',
            status: 429,
            detail: `Rate limit exceeded for ${rateLimitResult.limitType}. Try again in ${rateLimitResult.retryAfter} seconds.`,
            headers,
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    }

    // Check quota
    if (!options.skipQuotaCheck) {
      const quotaResult = await this.quotaService.checkQuota(tenantId);

      if (!quotaResult.allowed) {
        throw new HttpException(
          {
            type: 'quota_exceeded',
            title: 'Token Quota Exceeded',
            status: 402,
            detail: `Monthly token quota exceeded. Used ${quotaResult.used} of ${quotaResult.limit} tokens.`,
            upgrade_url: '/settings/billing',
          },
          HttpStatus.PAYMENT_REQUIRED
        );
      }
    }

    // Get provider config
    const config = await this.llmConfigService.getConfig();

    if (!config.primaryProvider) {
      throw new InternalServerErrorException({
        type: 'no_provider_configured',
        title: 'AI Provider Not Configured',
        status: 500,
        detail: 'No AI provider has been configured. Please configure an LLM provider.',
      });
    }

    const providerType = config.primaryProvider.providerType as LlmProviderType;
    const modelId = config.primaryProvider.modelId;
    const providerId = `${providerType}:${modelId}`;

    // Check circuit breaker
    const isAllowed = await this.circuitBreakerService.isAllowed(providerId);
    if (!isAllowed && !config.fallbackProvider) {
      throw new HttpException(
        {
          type: 'circuit_open',
          title: 'Service Temporarily Unavailable',
          status: 503,
          detail: 'AI service is temporarily unavailable due to recent failures. Please try again later.',
          correlationId,
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let outputContent = '';

    try {
      // Estimate input tokens (rough approximation: 1 token ≈ 4 chars)
      inputTokens = Math.ceil(
        messagesWithPersona.reduce((acc, m) => acc + m.content.length, 0) / 4
      );

      // Stream with tracking
      const wrappedOnChunk = (chunk: string) => {
        outputContent += chunk;
        onChunk(chunk);
      };

      // Use circuit breaker status to decide provider
      if (!isAllowed && config.fallbackProvider) {
        this.logger.warn({
          message: 'Primary provider circuit open, using fallback',
          correlationId,
          primaryProvider: providerId,
          fallbackProvider: config.fallbackProvider.providerType,
        });
        await this.streamWithFallbackAndTimeout(
          config.fallbackProvider,
          messagesWithPersona,
          wrappedOnChunk,
          correlationId
        );
      } else {
        await this.streamWithTimeout(
          messagesWithPersona,
          providerType,
          modelId,
          config.primaryProvider.endpoint,
          wrappedOnChunk,
          correlationId
        );
      }

      // Record success with circuit breaker
      await this.circuitBreakerService.recordSuccess(providerId, correlationId);

      // Estimate output tokens
      outputTokens = Math.ceil(outputContent.length / 4);

      // Calculate cost
      const costResult = this.costCalculatorService.calculateCost(
        modelId,
        inputTokens,
        outputTokens
      );

      // Track token usage
      await this.tokenTrackerService.trackUsage(
        tenantId,
        userId,
        inputTokens,
        outputTokens,
        costResult.totalCost,
        modelId,
        conversationId,
        providerId
      );

      // Calculate confidence score (Story 2.5)
      const confidenceContext: ConfidenceContext = {
        messageCount: options.messageCount ?? messages.length,
        hasClientContext: options.hasClientContext ?? false,
        hasSpecificData: options.hasSpecificData ?? false,
        personaType,
        userQuestion: options.userQuestion ?? '',
      };

      const confidence = this.confidenceService.calculateConfidence(
        outputContent,
        confidenceContext
      );

      this.logger.log({
        message: 'AI completion successful',
        correlationId,
        inputTokens,
        outputTokens,
        cost: costResult.totalCost,
        modelId,
        personaType: personaType ?? 'none',
        confidenceScore: confidence.score,
        confidenceLevel: confidence.level,
      });

      return {
        correlationId,
        success: true,
        inputTokens,
        outputTokens,
        cost: costResult.totalCost,
        rateLimit,
        personaType,
        confidence,
        responseContent: outputContent,
      };
    } catch (error) {
      // Record failure with circuit breaker
      await this.circuitBreakerService.recordFailure(providerId, correlationId);

      this.logger.error({
        message: 'AI completion failed',
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        providerId,
      });

      // Try fallback if available
      if (config.fallbackProvider) {
        this.logger.warn({
          message: 'Trying fallback provider',
          correlationId,
          fallbackProvider: config.fallbackProvider.providerType,
        });

        try {
          outputContent = '';
          const wrappedOnChunk = (chunk: string) => {
            outputContent += chunk;
            onChunk(chunk);
          };

          await this.streamWithFallbackAndTimeout(
            config.fallbackProvider,
            messagesWithPersona,
            wrappedOnChunk,
            correlationId
          );

          outputTokens = Math.ceil(outputContent.length / 4);
          const fallbackModelId = config.fallbackProvider.modelId;
          const costResult = this.costCalculatorService.calculateCost(
            fallbackModelId,
            inputTokens,
            outputTokens
          );

          await this.tokenTrackerService.trackUsage(
            tenantId,
            userId,
            inputTokens,
            outputTokens,
            costResult.totalCost,
            fallbackModelId,
            conversationId,
            `${config.fallbackProvider.providerType}:${fallbackModelId}`
          );

          // Calculate confidence score for fallback response (Story 2.5)
          const fallbackConfidenceContext: ConfidenceContext = {
            messageCount: options.messageCount ?? messages.length,
            hasClientContext: options.hasClientContext ?? false,
            hasSpecificData: options.hasSpecificData ?? false,
            personaType,
            userQuestion: options.userQuestion ?? '',
          };

          const fallbackConfidence = this.confidenceService.calculateConfidence(
            outputContent,
            fallbackConfidenceContext
          );

          this.logger.log({
            message: 'Fallback AI completion successful',
            correlationId,
            inputTokens,
            outputTokens,
            cost: costResult.totalCost,
            modelId: fallbackModelId,
            personaType: personaType ?? 'none',
            confidenceScore: fallbackConfidence.score,
            confidenceLevel: fallbackConfidence.level,
          });

          return {
            correlationId,
            success: true,
            inputTokens,
            outputTokens,
            cost: costResult.totalCost,
            rateLimit,
            personaType,
            confidence: fallbackConfidence,
            responseContent: outputContent,
          };
        } catch (fallbackError) {
          const fallbackProviderId = `${config.fallbackProvider.providerType}:${config.fallbackProvider.modelId}`;
          await this.circuitBreakerService.recordFailure(
            fallbackProviderId,
            correlationId
          );

          this.logger.error({
            message: 'Fallback provider also failed',
            correlationId,
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : 'Unknown error',
          });
        }
      }

      throw error;
    }
  }

  /**
   * Streams a completion from the configured AI provider.
   * Legacy method for backward compatibility.
   *
   * @param messages - Conversation history in chat format
   * @param onChunk - Callback for each streamed chunk
   * @throws InternalServerErrorException if no provider is configured or streaming fails
   */
  async streamCompletion(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const config = await this.llmConfigService.getConfig();

    if (!config.primaryProvider) {
      throw new InternalServerErrorException({
        type: 'no_provider_configured',
        title: 'AI Provider Not Configured',
        status: 500,
        detail: 'No AI provider has been configured. Please configure an LLM provider.',
      });
    }

    const providerType = config.primaryProvider.providerType as LlmProviderType;
    const modelId = config.primaryProvider.modelId;

    try {
      switch (providerType) {
        case 'OPENROUTER':
          await this.streamFromOpenRouter(messages, modelId, onChunk);
          break;
        case 'OPENAI':
          await this.streamFromOpenAI(messages, modelId, onChunk);
          break;
        case 'LOCAL_LLAMA':
          await this.streamFromLocalLlama(
            messages,
            modelId,
            config.primaryProvider.endpoint ?? '',
            onChunk
          );
          break;
        case 'ANTHROPIC':
          throw new InternalServerErrorException({
            type: 'provider_not_implemented',
            title: 'Provider Not Available',
            status: 500,
            detail: `${providerType} provider is not yet implemented`,
          });
        default:
          throw new InternalServerErrorException({
            type: 'unknown_provider',
            title: 'Unknown Provider',
            status: 500,
            detail: `Unknown provider type: ${providerType}`,
          });
      }

      this.logger.log({
        message: 'AI completion streamed successfully',
        providerType,
        modelId,
        messageCount: messages.length,
      });
    } catch (error) {
      if (config.fallbackProvider) {
        this.logger.warn({
          message: 'Primary provider failed, trying fallback',
          primaryProvider: providerType,
          fallbackProvider: config.fallbackProvider.providerType,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        try {
          await this.streamWithFallback(config.fallbackProvider, messages, onChunk);
          return;
        } catch (fallbackError) {
          this.logger.error({
            message: 'Fallback provider also failed',
            error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
          });
        }
      }

      throw error;
    }
  }

  /**
   * Streams with timeout support.
   */
  private async streamWithTimeout(
    messages: ChatMessage[],
    providerType: LlmProviderType,
    modelId: string,
    endpoint: string | undefined,
    onChunk: (chunk: string) => void,
    correlationId: string
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.requestTimeoutMs);

    try {
      switch (providerType) {
        case 'OPENROUTER':
          await this.streamFromOpenRouter(
            messages,
            modelId,
            onChunk,
            controller.signal
          );
          break;
        case 'OPENAI':
          await this.streamFromOpenAI(
            messages,
            modelId,
            onChunk,
            controller.signal
          );
          break;
        case 'LOCAL_LLAMA':
          await this.streamFromLocalLlama(
            messages,
            modelId,
            endpoint ?? '',
            onChunk,
            controller.signal
          );
          break;
        case 'ANTHROPIC':
          throw new InternalServerErrorException({
            type: 'provider_not_implemented',
            title: 'Provider Not Available',
            status: 500,
            detail: `${providerType} provider is not yet implemented`,
            correlationId,
          });
        default:
          throw new InternalServerErrorException({
            type: 'unknown_provider',
            title: 'Unknown Provider',
            status: 500,
            detail: `Unknown provider type: ${providerType}`,
            correlationId,
          });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new InternalServerErrorException({
          type: 'request_timeout',
          title: 'Request Timeout',
          status: 504,
          detail: `Request timed out after ${this.requestTimeoutMs / 1000} seconds`,
          correlationId,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Streams from fallback provider with timeout.
   */
  private async streamWithFallbackAndTimeout(
    fallbackProvider: {
      providerType: string;
      modelId: string;
      endpoint?: string;
    },
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    correlationId: string
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.requestTimeoutMs);

    try {
      switch (fallbackProvider.providerType) {
        case 'OPENROUTER':
          await this.streamFromOpenRouter(
            messages,
            fallbackProvider.modelId,
            onChunk,
            controller.signal
          );
          break;
        case 'OPENAI':
          await this.streamFromOpenAI(
            messages,
            fallbackProvider.modelId,
            onChunk,
            controller.signal
          );
          break;
        case 'LOCAL_LLAMA':
          await this.streamFromLocalLlama(
            messages,
            fallbackProvider.modelId,
            fallbackProvider.endpoint ?? '',
            onChunk,
            controller.signal
          );
          break;
        default:
          throw new InternalServerErrorException({
            type: 'fallback_not_supported',
            title: 'Fallback Not Supported',
            status: 500,
            detail: `Fallback provider ${fallbackProvider.providerType} is not supported`,
            correlationId,
          });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new InternalServerErrorException({
          type: 'request_timeout',
          title: 'Request Timeout',
          status: 504,
          detail: `Fallback request timed out after ${this.requestTimeoutMs / 1000} seconds`,
          correlationId,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async streamFromOpenRouter(
    messages: ChatMessage[],
    modelId: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const apiKey = await this.llmConfigService.getDecryptedApiKey(
      LlmProviderType.OPENROUTER
    );

    if (!apiKey) {
      throw new InternalServerErrorException({
        type: 'api_key_not_found',
        title: 'API Key Not Found',
        status: 500,
        detail: 'OpenRouter API key is not configured',
      });
    }

    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer':
            this.configService.get<string>('APP_URL') ?? 'http://localhost:4200',
          'X-Title': 'Mentor AI',
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          stream: true,
        }),
        signal,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new InternalServerErrorException({
        type: 'openrouter_error',
        title: 'OpenRouter API Error',
        status: 500,
        detail: `OpenRouter returned ${response.status}: ${errorText}`,
      });
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new InternalServerErrorException({
        type: 'stream_error',
        title: 'Stream Error',
        status: 500,
        detail: 'Failed to get response stream',
      });
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data) as OpenRouterResponse;
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async streamFromOpenAI(
    messages: ChatMessage[],
    modelId: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const apiKey = await this.llmConfigService.getDecryptedApiKey(
      LlmProviderType.OPENAI
    );

    if (!apiKey) {
      throw new InternalServerErrorException({
        type: 'api_key_not_found',
        title: 'API Key Not Found',
        status: 500,
        detail: 'OpenAI API key is not configured',
      });
    }

    const response = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          stream: true,
        }),
        signal,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new InternalServerErrorException({
        type: 'openai_error',
        title: 'OpenAI API Error',
        status: 500,
        detail: `OpenAI returned ${response.status}: ${errorText}`,
      });
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new InternalServerErrorException({
        type: 'stream_error',
        title: 'Stream Error',
        status: 500,
        detail: 'Failed to get response stream',
      });
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data) as OpenRouterResponse;
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async streamFromLocalLlama(
    messages: ChatMessage[],
    modelId: string,
    endpoint: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const baseUrl = endpoint || 'http://localhost:11434';

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new InternalServerErrorException({
        type: 'local_llama_error',
        title: 'Local Llama Error',
        status: 500,
        detail: `Local Llama returned ${response.status}: ${errorText}`,
      });
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new InternalServerErrorException({
        type: 'stream_error',
        title: 'Stream Error',
        status: 500,
        detail: 'Failed to get response stream',
      });
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line) as {
                message?: { content?: string };
              };
              const content = parsed.message?.content;
              if (content) {
                onChunk(content);
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async streamWithFallback(
    fallbackProvider: {
      providerType: string;
      modelId: string;
      endpoint?: string;
    },
    messages: ChatMessage[],
    onChunk: (chunk: string) => void
  ): Promise<void> {
    switch (fallbackProvider.providerType) {
      case 'OPENROUTER':
        await this.streamFromOpenRouter(
          messages,
          fallbackProvider.modelId,
          onChunk
        );
        break;
      case 'OPENAI':
        await this.streamFromOpenAI(
          messages,
          fallbackProvider.modelId,
          onChunk
        );
        break;
      case 'LOCAL_LLAMA':
        await this.streamFromLocalLlama(
          messages,
          fallbackProvider.modelId,
          fallbackProvider.endpoint ?? '',
          onChunk
        );
        break;
      default:
        throw new InternalServerErrorException({
          type: 'fallback_not_supported',
          title: 'Fallback Not Supported',
          status: 500,
          detail: `Fallback provider ${fallbackProvider.providerType} is not supported`,
        });
    }
  }
}
