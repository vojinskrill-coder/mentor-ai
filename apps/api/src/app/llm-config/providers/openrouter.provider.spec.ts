import { OpenRouterProvider } from './openrouter.provider';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('OpenRouterProvider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('should throw error if API key is not provided', () => {
      expect(() => new OpenRouterProvider({})).toThrow('OpenRouter requires an API key');
    });

    it('should create instance with valid API key', () => {
      const provider = new OpenRouterProvider({ apiKey: 'sk-or-test' });
      expect(provider).toBeInstanceOf(OpenRouterProvider);
    });
  });

  describe('validateCredentials', () => {
    it('should return true for valid API key', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const provider = new OpenRouterProvider({ apiKey: 'sk-or-valid' });
      const result = await provider.validateCredentials();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-or-valid',
          }),
        })
      );
    });

    it('should return false for invalid API key', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const provider = new OpenRouterProvider({ apiKey: 'sk-or-invalid' });
      const result = await provider.validateCredentials();

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const provider = new OpenRouterProvider({ apiKey: 'sk-or-test' });
      const result = await provider.validateCredentials();

      expect(result).toBe(false);
    });
  });

  describe('fetchModels', () => {
    it('should return filtered list of models', async () => {
      const mockModelsResponse = {
        data: [
          {
            id: 'meta-llama/llama-3.1-70b-instruct',
            name: 'Llama 3.1 70B Instruct',
            pricing: { prompt: '0.0000009', completion: '0.0000009' },
            context_length: 128000,
          },
          {
            id: 'anthropic/claude-3-opus',
            name: 'Claude 3 Opus',
            pricing: { prompt: '0.000015', completion: '0.000075' },
            context_length: 200000,
          },
          {
            id: 'some-random/model',
            name: 'Random Model',
            pricing: { prompt: '0.0001', completion: '0.0001' },
          },
        ],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockModelsResponse),
      });

      const provider = new OpenRouterProvider({ apiKey: 'sk-or-test' });
      const models = await provider.fetchModels();

      // Should only include models from popular prefixes
      expect(models.length).toBe(2);
      expect(models[0]?.id).toBe('meta-llama/llama-3.1-70b-instruct');
      expect(models[1]?.id).toBe('anthropic/claude-3-opus');
    });

    it('should calculate cost per 1K tokens', async () => {
      const mockModelsResponse = {
        data: [
          {
            id: 'meta-llama/llama-3.1-70b-instruct',
            name: 'Llama 3.1 70B Instruct',
            pricing: { prompt: '0.0000009', completion: '0.0000009' },
          },
        ],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockModelsResponse),
      });

      const provider = new OpenRouterProvider({ apiKey: 'sk-or-test' });
      const models = await provider.fetchModels();

      // 0.0000009 * 1000 = 0.0009
      expect(models[0]?.costPer1kTokens).toBe(0.0009);
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
      });

      const provider = new OpenRouterProvider({ apiKey: 'sk-or-invalid' });

      await expect(provider.fetchModels()).rejects.toThrow('Failed to fetch models');
    });
  });

  describe('getResourceInfo', () => {
    it('should return null for cloud provider', async () => {
      const provider = new OpenRouterProvider({ apiKey: 'sk-or-test' });
      const result = await provider.getResourceInfo();

      expect(result).toBeNull();
    });
  });
});
