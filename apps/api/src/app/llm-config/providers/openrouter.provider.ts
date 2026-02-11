import type { LlmModelInfo, LlmResourceInfo } from '@mentor-ai/shared/types';
import type { LlmProvider, LlmProviderOptions } from './llm-provider.interface';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

interface OpenRouterModel {
  id: string;
  name: string;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  context_length?: number;
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

/**
 * OpenRouter provider implementation.
 * Validates API keys and fetches available models from OpenRouter API.
 */
export class OpenRouterProvider implements LlmProvider {
  private readonly apiKey: string;

  constructor(options: LlmProviderOptions) {
    if (!options.apiKey) {
      throw new Error('OpenRouter requires an API key');
    }
    this.apiKey = options.apiKey;
  }

  /**
   * Validates the API key by making a test request to the models endpoint.
   * @returns true if the API key is valid
   */
  async validateCredentials(): Promise<boolean> {
    try {
      const response = await fetch(`${OPENROUTER_API_BASE}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetches available models from OpenRouter API.
   * Filters to include primarily Llama and other popular models.
   * @returns Array of available models with pricing
   */
  async fetchModels(): Promise<LlmModelInfo[]> {
    const response = await fetch(`${OPENROUTER_API_BASE}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = (await response.json()) as OpenRouterModelsResponse;

    // Filter and map models - focus on popular Llama and other models
    const popularPrefixes = [
      'meta-llama/',
      'anthropic/',
      'openai/',
      'mistralai/',
      'google/',
    ];

    return data.data
      .filter((model) =>
        popularPrefixes.some((prefix) => model.id.startsWith(prefix))
      )
      .map((model) => ({
        id: model.id,
        name: model.name,
        costPer1kTokens: this.calculateCostPer1k(model.pricing),
        contextLength: model.context_length,
      }))
      .slice(0, 50); // Limit to 50 models for UI performance
  }

  /**
   * Returns null as OpenRouter is a cloud provider.
   */
  async getResourceInfo(): Promise<LlmResourceInfo | null> {
    return null;
  }

  private calculateCostPer1k(pricing?: {
    prompt?: string;
    completion?: string;
  }): number | null {
    if (!pricing?.prompt) {
      return null;
    }

    // OpenRouter pricing is per token, convert to per 1K tokens
    const promptCost = parseFloat(pricing.prompt) * 1000;
    return Math.round(promptCost * 10000) / 10000; // Round to 4 decimal places
  }
}
