import type { LlmModelInfo, LlmResourceInfo } from '@mentor-ai/shared/types';
import type { LlmProvider, LlmProviderOptions } from './llm-provider.interface';

const DEFAULT_LM_STUDIO_ENDPOINT = 'http://localhost:1234';

interface LmStudioModel {
  id: string;
  object: string;
  owned_by?: string;
}

interface LmStudioModelsResponse {
  data: LmStudioModel[];
}

/**
 * LM Studio provider implementation.
 * Uses the OpenAI-compatible API exposed by LM Studio at a configurable local endpoint.
 * No API key required by default.
 */
export class LmStudioProvider implements LlmProvider {
  private readonly endpoint: string;

  constructor(options: LlmProviderOptions) {
    this.endpoint = options.endpoint ?? DEFAULT_LM_STUDIO_ENDPOINT;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/v1/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  async fetchModels(): Promise<LlmModelInfo[]> {
    const response = await fetch(`${this.endpoint}/v1/models`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = (await response.json()) as LmStudioModelsResponse;

    return data.data.map((model) => ({
      id: model.id,
      name: model.id,
      costPer1kTokens: null,
      contextLength: undefined,
    }));
  }

  async getResourceInfo(): Promise<LlmResourceInfo | null> {
    return {
      gpuRequired: false,
      gpuMemoryGb: undefined,
      cpuCores: undefined,
      ramGb: undefined,
    };
  }
}
