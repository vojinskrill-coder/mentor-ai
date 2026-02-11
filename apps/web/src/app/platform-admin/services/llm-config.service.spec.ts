import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { LlmConfigService } from './llm-config.service';
import { LlmProviderType } from '@mentor-ai/shared/types';

describe('LlmConfigService', () => {
  let service: LlmConfigService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [LlmConfigService],
    });

    service = TestBed.inject(LlmConfigService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getConfig', () => {
    it('should fetch current LLM configuration', () => {
      const mockResponse = {
        data: {
          primaryProvider: {
            id: 'cfg_1',
            providerType: LlmProviderType.OPENROUTER,
            apiKey: '***masked***',
            modelId: 'meta-llama/llama-3.1-70b',
            isPrimary: true,
            isFallback: false,
            isActive: true,
            createdAt: '2026-02-04T00:00:00.000Z',
            updatedAt: '2026-02-04T00:00:00.000Z',
          },
          fallbackProvider: null,
        },
      };

      service.getConfig().subscribe((response) => {
        expect(response.data.primaryProvider).toBeTruthy();
        expect(response.data.primaryProvider?.providerType).toBe(LlmProviderType.OPENROUTER);
      });

      const req = httpMock.expectOne('/api/v1/admin/llm-config');
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });
  });

  describe('updateConfig', () => {
    it('should update LLM configuration', () => {
      const updatePayload = {
        primaryProvider: {
          type: LlmProviderType.OPENROUTER,
          apiKey: 'sk-or-new-key',
          modelId: 'meta-llama/llama-3.1-70b',
        },
        fallbackProvider: null,
      };

      const mockResponse = {
        data: {
          primaryProvider: {
            id: 'cfg_new',
            providerType: LlmProviderType.OPENROUTER,
            apiKey: '***masked***',
            modelId: 'meta-llama/llama-3.1-70b',
            isPrimary: true,
            isFallback: false,
            isActive: true,
            createdAt: '2026-02-04T00:00:00.000Z',
            updatedAt: '2026-02-04T00:00:00.000Z',
          },
          fallbackProvider: null,
        },
        message: 'LLM configuration updated successfully',
      };

      service.updateConfig(updatePayload).subscribe((response) => {
        expect(response.data.primaryProvider).toBeTruthy();
      });

      const req = httpMock.expectOne('/api/v1/admin/llm-config');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(updatePayload);
      req.flush(mockResponse);
    });

    it('should update with both primary and fallback providers', () => {
      const updatePayload = {
        primaryProvider: {
          type: LlmProviderType.OPENROUTER,
          apiKey: 'sk-or-key',
          modelId: 'meta-llama/llama-3.1-70b',
        },
        fallbackProvider: {
          type: LlmProviderType.LOCAL_LLAMA,
          endpoint: 'http://localhost:11434',
          modelId: 'llama3.1:8b',
        },
      };

      service.updateConfig(updatePayload).subscribe();

      const req = httpMock.expectOne('/api/v1/admin/llm-config');
      expect(req.request.body.fallbackProvider).toBeTruthy();
      expect(req.request.body.fallbackProvider.type).toBe(LlmProviderType.LOCAL_LLAMA);
      req.flush({ data: {} });
    });
  });

  describe('validateProvider', () => {
    it('should validate OpenRouter provider with API key', () => {
      const mockResponse = {
        data: {
          valid: true,
          models: [
            { id: 'meta-llama/llama-3.1-70b', name: 'Llama 3.1 70B', costPer1kTokens: 0.0009 },
          ],
          resourceInfo: null,
        },
      };

      service.validateProvider(
        LlmProviderType.OPENROUTER,
        'sk-or-test-key'
      ).subscribe((response) => {
        expect(response.data.valid).toBe(true);
        expect(response.data.models.length).toBeGreaterThan(0);
      });

      const req = httpMock.expectOne('/api/v1/admin/llm-config/validate');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        type: LlmProviderType.OPENROUTER,
        apiKey: 'sk-or-test-key',
      });
      req.flush(mockResponse);
    });

    it('should validate Local Llama provider with endpoint', () => {
      const mockResponse = {
        data: {
          valid: true,
          models: [
            { id: 'llama3.1:8b', name: 'Llama 3.1 8B', costPer1kTokens: null },
          ],
          resourceInfo: {
            gpuRequired: true,
            gpuMemoryGb: 8,
            cpuCores: 4,
            ramGb: 16,
          },
        },
      };

      service.validateProvider(
        LlmProviderType.LOCAL_LLAMA,
        undefined,
        'http://localhost:11434'
      ).subscribe((response) => {
        expect(response.data.valid).toBe(true);
        expect(response.data.resourceInfo).toBeTruthy();
      });

      const req = httpMock.expectOne('/api/v1/admin/llm-config/validate');
      expect(req.request.body).toEqual({
        type: LlmProviderType.LOCAL_LLAMA,
        endpoint: 'http://localhost:11434',
      });
      req.flush(mockResponse);
    });

    it('should not include undefined apiKey or endpoint in request', () => {
      service.validateProvider(LlmProviderType.LOCAL_LLAMA).subscribe();

      const req = httpMock.expectOne('/api/v1/admin/llm-config/validate');
      expect(req.request.body).toEqual({
        type: LlmProviderType.LOCAL_LLAMA,
      });
      expect(req.request.body.apiKey).toBeUndefined();
      expect(req.request.body.endpoint).toBeUndefined();
      req.flush({ data: { valid: false, models: [], resourceInfo: null } });
    });
  });
});
