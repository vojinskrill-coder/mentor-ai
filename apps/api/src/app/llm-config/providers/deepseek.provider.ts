import type { LlmModelInfo, LlmResourceInfo } from '@mentor-ai/shared/types';
import type { LlmProvider, LlmProviderOptions } from './llm-provider.interface';

const DEEPSEEK_API_BASE = 'https://api.deepseek.com/v1';

interface DeepSeekModel {
  id: string;
  object: string;
  owned_by?: string;
}

interface DeepSeekModelsResponse {
  data: DeepSeekModel[];
}

/**
 * DeepSeek provider implementation.
 * Uses the OpenAI-compatible API at https://api.deepseek.com/v1.
 */
export class DeepSeekProvider implements LlmProvider {
  private readonly apiKey: string;

  constructor(options: LlmProviderOptions) {
    if (!options.apiKey) {
      throw new Error('DeepSeek requires an API key');
    }
    this.apiKey = options.apiKey;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const response = await fetch(`${DEEPSEEK_API_BASE}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  async fetchModels(): Promise<LlmModelInfo[]> {
    const response = await fetch(`${DEEPSEEK_API_BASE}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = (await response.json()) as DeepSeekModelsResponse;

    return data.data.map((model) => ({
      id: model.id,
      name: model.id,
      costPer1kTokens: null,
      contextLength: undefined,
    }));
  }

  async getResourceInfo(): Promise<LlmResourceInfo | null> {
    return null;
  }
}
