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
 * LM Studio / OpenAI-compatible provider implementation.
 * Uses the OpenAI-compatible API at a configurable endpoint.
 * Supports optional API key authentication (needed for RunPod, vLLM, etc.).
 * No API key required by default (local LM Studio).
 */
export class LmStudioProvider implements LlmProvider {
  private readonly endpoint: string;
  private readonly apiKey?: string;

  constructor(options: LlmProviderOptions) {
    this.endpoint = options.endpoint ?? DEFAULT_LM_STUDIO_ENDPOINT;
    this.apiKey = options.apiKey;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/v1/models`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  async fetchModels(): Promise<LlmModelInfo[]> {
    const response = await fetch(`${this.endpoint}/v1/models`, {
      method: 'GET',
      headers: this.getHeaders(),
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
