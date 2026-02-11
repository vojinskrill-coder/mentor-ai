import type { LlmModelInfo, LlmResourceInfo } from '@mentor-ai/shared/types';

/**
 * Interface for LLM provider implementations.
 * Each provider (OpenRouter, Local Llama, etc.) implements this interface
 * to enable provider-agnostic configuration and validation.
 */
export interface LlmProvider {
  /**
   * Validates the provider credentials (API key or endpoint connectivity).
   * @returns true if credentials are valid, false otherwise
   */
  validateCredentials(): Promise<boolean>;

  /**
   * Fetches available models from the provider.
   * @returns Array of available models with pricing information
   */
  fetchModels(): Promise<LlmModelInfo[]>;

  /**
   * Gets resource requirements for local providers.
   * Returns null for cloud providers.
   * @returns Resource info or null for cloud providers
   */
  getResourceInfo(): Promise<LlmResourceInfo | null>;
}

/**
 * Configuration options passed to provider constructors.
 */
export interface LlmProviderOptions {
  apiKey?: string;
  endpoint?: string;
}
