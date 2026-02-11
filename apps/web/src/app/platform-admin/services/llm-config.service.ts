import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  ApiResponse,
  LlmConfigResponse,
  LlmConfigUpdateRequest,
  LlmProviderStatus,
  LlmProviderType,
  LlmValidateProviderRequest,
} from '@mentor-ai/shared/types';

@Injectable({
  providedIn: 'root',
})
export class LlmConfigService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/admin/llm-config';

  /**
   * Fetches the current LLM provider configuration.
   * API keys are masked in the response.
   */
  getConfig(): Observable<ApiResponse<LlmConfigResponse>> {
    return this.http.get<ApiResponse<LlmConfigResponse>>(this.baseUrl);
  }

  /**
   * Updates the LLM provider configuration.
   */
  updateConfig(
    config: LlmConfigUpdateRequest
  ): Observable<ApiResponse<LlmConfigResponse>> {
    return this.http.put<ApiResponse<LlmConfigResponse>>(this.baseUrl, config);
  }

  /**
   * Validates provider credentials before saving.
   * Returns available models on success.
   */
  validateProvider(
    type: LlmProviderType,
    apiKey?: string,
    endpoint?: string
  ): Observable<ApiResponse<LlmProviderStatus>> {
    const body: LlmValidateProviderRequest = { type };
    if (apiKey) body.apiKey = apiKey;
    if (endpoint) body.endpoint = endpoint;

    return this.http.post<ApiResponse<LlmProviderStatus>>(
      `${this.baseUrl}/validate`,
      body
    );
  }
}
