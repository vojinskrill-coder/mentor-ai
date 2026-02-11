import { Injectable, Logger } from '@nestjs/common';
import { ModelPricing, CostCalculation } from '@mentor-ai/shared/types';

// Re-export shared types for backward compatibility
export type { ModelPricing, CostCalculation };

/**
 * Default pricing for unknown models (conservative estimate).
 */
const DEFAULT_PRICING: ModelPricing = {
  input: 0.002, // $0.002 per 1K tokens
  output: 0.004, // $0.004 per 1K tokens
};

/**
 * Known model pricing (per 1000 tokens in USD).
 * Updated periodically based on provider pricing pages.
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenRouter models
  'openrouter/auto': { input: 0.001, output: 0.002 },

  // Meta Llama models
  'meta-llama/llama-3.1-70b-instruct': { input: 0.0008, output: 0.0008 },
  'meta-llama/llama-3.1-8b-instruct': { input: 0.0001, output: 0.0001 },
  'meta-llama/llama-3-70b-instruct': { input: 0.0008, output: 0.0008 },
  'meta-llama/llama-3-8b-instruct': { input: 0.0001, output: 0.0001 },

  // Anthropic Claude models
  'anthropic/claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'anthropic/claude-3.5-sonnet-20240620': { input: 0.003, output: 0.015 },
  'anthropic/claude-3-opus': { input: 0.015, output: 0.075 },
  'anthropic/claude-3-sonnet': { input: 0.003, output: 0.015 },
  'anthropic/claude-3-haiku': { input: 0.00025, output: 0.00125 },

  // OpenAI models
  'openai/gpt-4-turbo': { input: 0.01, output: 0.03 },
  'openai/gpt-4': { input: 0.03, output: 0.06 },
  'openai/gpt-4o': { input: 0.005, output: 0.015 },
  'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'openai/gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },

  // Mistral models
  'mistralai/mistral-large': { input: 0.004, output: 0.012 },
  'mistralai/mistral-medium': { input: 0.0027, output: 0.0081 },
  'mistralai/mistral-small': { input: 0.001, output: 0.003 },
  'mistralai/mixtral-8x7b-instruct': { input: 0.0006, output: 0.0006 },
  'mistralai/mistral-7b-instruct': { input: 0.0002, output: 0.0002 },

  // Google models
  'google/gemini-pro': { input: 0.00025, output: 0.0005 },
  'google/gemini-pro-1.5': { input: 0.00125, output: 0.005 },

  // Local models (free)
  'local/llama': { input: 0, output: 0 },
  'local/mistral': { input: 0, output: 0 },
  'ollama/llama3': { input: 0, output: 0 },
  'ollama/mistral': { input: 0, output: 0 },
};

/**
 * Service for calculating AI request costs based on token usage.
 * Provides accurate cost tracking for billing and quota management.
 */
@Injectable()
export class CostCalculatorService {
  private readonly logger = new Logger(CostCalculatorService.name);

  constructor() {
    this.logger.log({
      message: 'Cost calculator initialized',
      knownModels: Object.keys(MODEL_PRICING).length,
    });
  }

  /**
   * Calculates the cost for a request based on token usage.
   *
   * @param modelId - The model identifier
   * @param inputTokens - Number of input tokens
   * @param outputTokens - Number of output tokens
   * @returns Cost calculation breakdown
   */
  calculateCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number
  ): CostCalculation {
    const pricing = this.getPricing(modelId);
    const pricingFound = MODEL_PRICING[modelId] !== undefined;

    // Calculate costs (pricing is per 1000 tokens)
    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    const totalCost = inputCost + outputCost;

    // Round to 6 decimal places for precision
    return {
      inputCost: Number(inputCost.toFixed(6)),
      outputCost: Number(outputCost.toFixed(6)),
      totalCost: Number(totalCost.toFixed(6)),
      modelId,
      pricingFound,
    };
  }

  /**
   * Gets the pricing for a model.
   *
   * @param modelId - The model identifier
   * @returns Pricing structure for the model
   */
  getPricing(modelId: string): ModelPricing {
    // Exact match
    if (MODEL_PRICING[modelId]) {
      return MODEL_PRICING[modelId];
    }

    // Try to find a partial match (e.g., 'gpt-4' matches 'gpt-4-turbo')
    const normalizedId = modelId.toLowerCase();
    for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
      if (normalizedId.includes(key.toLowerCase().replace(/^[^/]+\//, ''))) {
        return pricing;
      }
    }

    // Check for local/free models
    if (
      normalizedId.includes('local') ||
      normalizedId.includes('ollama') ||
      normalizedId.startsWith('llama:')
    ) {
      return { input: 0, output: 0 };
    }

    this.logger.warn({
      message: 'Unknown model pricing, using default',
      modelId,
      defaultPricing: DEFAULT_PRICING,
    });

    return DEFAULT_PRICING;
  }

  /**
   * Estimates the cost for a request before sending to the LLM.
   * Uses average output token count for estimation.
   *
   * @param modelId - The model identifier
   * @param inputTokens - Number of input tokens
   * @param estimatedOutputRatio - Ratio of output to input tokens (default 1.5)
   * @returns Estimated cost
   */
  estimateCost(
    modelId: string,
    inputTokens: number,
    estimatedOutputRatio = 1.5
  ): number {
    const estimatedOutput = Math.ceil(inputTokens * estimatedOutputRatio);
    const calculation = this.calculateCost(modelId, inputTokens, estimatedOutput);
    return calculation.totalCost;
  }

  /**
   * Checks if a model is a local/free model.
   *
   * @param modelId - The model identifier
   * @returns True if the model is free (local deployment)
   */
  isLocalModel(modelId: string): boolean {
    const pricing = this.getPricing(modelId);
    return pricing.input === 0 && pricing.output === 0;
  }

  /**
   * Adds or updates pricing for a model.
   * Useful for adding custom pricing at runtime.
   *
   * @param modelId - The model identifier
   * @param pricing - The pricing structure
   */
  addPricing(modelId: string, pricing: ModelPricing): void {
    MODEL_PRICING[modelId] = pricing;

    this.logger.log({
      message: 'Model pricing added',
      modelId,
      pricing,
    });
  }

  /**
   * Gets all known model pricing.
   *
   * @returns Map of model IDs to their pricing
   */
  getAllPricing(): Record<string, ModelPricing> {
    return { ...MODEL_PRICING };
  }
}
