import type { LlmModelInfo, LlmResourceInfo } from '@mentor-ai/shared/types';
import type { LlmProvider, LlmProviderOptions } from './llm-provider.interface';

const OPENAI_API_BASE = 'https://api.openai.com/v1';

interface OpenAIModel {
  id: string;
  object: string;
  owned_by: string;
}

interface OpenAIModelsResponse {
  data: OpenAIModel[];
}

/**
 * OpenAI provider implementation.
 * Validates API keys and fetches available models from OpenAI API.
 */
export class OpenAIProvider implements LlmProvider {
  private readonly apiKey: string;

  constructor(options: LlmProviderOptions) {
    if (!options.apiKey) {
      throw new Error('OpenAI requires an API key');
    }
    this.apiKey = options.apiKey;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const response = await fetch(`${OPENAI_API_BASE}/models`, {
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
    const response = await fetch(`${OPENAI_API_BASE}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = (await response.json()) as OpenAIModelsResponse;

    // Filter to chat-capable models
    const chatModelPrefixes = ['gpt-5', 'gpt-4', 'gpt-3.5', 'chatgpt', 'o1', 'o3'];

    // Preferred models shown first
    const preferredOrder = [
      'gpt-5.2-chat-latest',
      'gpt-5.2',
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o3',
      'o3-mini',
      'o1',
      'o1-mini',
    ];

    return data.data
      .filter((model) => chatModelPrefixes.some((prefix) => model.id.startsWith(prefix)))
      .map((model) => ({
        id: model.id,
        name: model.id,
        costPer1kTokens: null,
        contextLength: undefined,
      }))
      .sort((a, b) => {
        const aIdx = preferredOrder.findIndex((p) => a.id.startsWith(p));
        const bIdx = preferredOrder.findIndex((p) => b.id.startsWith(p));
        const aPriority = aIdx >= 0 ? aIdx : 100;
        const bPriority = bIdx >= 0 ? bIdx : 100;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 30);
  }

  async getResourceInfo(): Promise<LlmResourceInfo | null> {
    return null;
  }
}
