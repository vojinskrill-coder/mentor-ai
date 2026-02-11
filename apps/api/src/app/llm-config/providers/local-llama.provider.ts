import type { LlmModelInfo, LlmResourceInfo } from '@mentor-ai/shared/types';
import type { LlmProvider, LlmProviderOptions } from './llm-provider.interface';

const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';

interface OllamaModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface OllamaTagsResponse {
  models: OllamaModel[];
}

interface OllamaShowResponse {
  details?: {
    parameter_size?: string;
    quantization_level?: string;
  };
  model_info?: {
    'general.parameter_count'?: number;
  };
}

/**
 * Local Llama (Ollama) provider implementation.
 * Validates endpoint connectivity and fetches available models from local Ollama server.
 */
export class LocalLlamaProvider implements LlmProvider {
  private readonly endpoint: string;

  constructor(options: LlmProviderOptions) {
    this.endpoint = options.endpoint ?? DEFAULT_OLLAMA_ENDPOINT;
  }

  /**
   * Validates connectivity to the Ollama server by fetching the tags endpoint.
   * @returns true if the endpoint is reachable and responds correctly
   */
  async validateCredentials(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetches available models from the local Ollama server.
   * @returns Array of available models (cost is null for local models)
   */
  async fetchModels(): Promise<LlmModelInfo[]> {
    const response = await fetch(`${this.endpoint}/api/tags`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = (await response.json()) as OllamaTagsResponse;

    return data.models.map((model) => ({
      id: model.name,
      name: this.formatModelName(model.name),
      costPer1kTokens: null, // Local models have no per-token cost
      contextLength: this.estimateContextLength(model.name),
    }));
  }

  /**
   * Gets resource information from the local Ollama server.
   * Attempts to determine GPU/CPU requirements based on available models.
   * @returns Resource requirements for running local models
   */
  async getResourceInfo(): Promise<LlmResourceInfo> {
    try {
      // Get the first available model to check resource requirements
      const models = await this.fetchModels();
      const firstModel = models[0];
      if (!firstModel) {
        return this.getDefaultResourceInfo();
      }

      const showResponse = await fetch(
        `${this.endpoint}/api/show`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: firstModel.id }),
        }
      );

      if (!showResponse.ok) {
        return this.getDefaultResourceInfo();
      }

      const showData = (await showResponse.json()) as OllamaShowResponse;
      return this.parseResourceRequirements(showData, firstModel.id);
    } catch {
      return this.getDefaultResourceInfo();
    }
  }

  private formatModelName(modelId: string): string {
    // Convert "llama3.1:8b" to "Llama 3.1 8B"
    return modelId
      .replace(/([a-z])(\d)/gi, '$1 $2')
      .replace(/:/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private estimateContextLength(modelId: string): number | undefined {
    // Estimate context length based on model name patterns
    const lowerModel = modelId.toLowerCase();

    if (lowerModel.includes('llama3.1') || lowerModel.includes('llama-3.1')) {
      return 128000;
    }
    if (lowerModel.includes('llama3') || lowerModel.includes('llama-3')) {
      return 8192;
    }
    if (lowerModel.includes('mistral')) {
      return 32768;
    }
    if (lowerModel.includes('mixtral')) {
      return 32768;
    }

    return 4096; // Default context length
  }

  private getDefaultResourceInfo(): LlmResourceInfo {
    return {
      gpuRequired: false,
      gpuMemoryGb: undefined,
      cpuCores: 4,
      ramGb: 8,
    };
  }

  private parseResourceRequirements(
    showData: OllamaShowResponse,
    modelId: string
  ): LlmResourceInfo {
    const paramSize = showData.details?.parameter_size ?? '';
    const quantLevel = showData.details?.quantization_level ?? '';

    // Estimate GPU memory based on parameter count and quantization
    const gpuMemoryGb = this.estimateGpuMemory(paramSize, quantLevel, modelId);

    return {
      gpuRequired: gpuMemoryGb > 4,
      gpuMemoryGb: gpuMemoryGb > 0 ? gpuMemoryGb : undefined,
      cpuCores: gpuMemoryGb > 8 ? 8 : 4,
      ramGb: Math.max(8, gpuMemoryGb * 1.5),
    };
  }

  private estimateGpuMemory(
    paramSize: string,
    quantLevel: string,
    modelId: string
  ): number {
    // Parse parameter size (e.g., "8B", "70B")
    const paramMatch = paramSize.match(/(\d+(?:\.\d+)?)\s*[Bb]/);
    let params = paramMatch?.[1] ? parseFloat(paramMatch[1]) : 0;

    // If not in paramSize, try to extract from model name
    if (params === 0) {
      const modelMatch = modelId.match(/(\d+)[Bb]/);
      params = modelMatch?.[1] ? parseFloat(modelMatch[1]) : 7; // Default to 7B
    }

    // Quantization factor (lower bits = less memory)
    let quantFactor = 2; // Default FP16
    if (quantLevel.includes('Q4') || quantLevel.includes('q4')) {
      quantFactor = 0.5;
    } else if (quantLevel.includes('Q8') || quantLevel.includes('q8')) {
      quantFactor = 1;
    }

    // Rough estimate: params in billions * bytes per param
    return Math.ceil(params * quantFactor);
  }
}
