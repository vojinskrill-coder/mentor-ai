import { LocalLlamaProvider } from './local-llama.provider';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('LocalLlamaProvider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('should use default endpoint if not provided', () => {
      const provider = new LocalLlamaProvider({});
      // The default endpoint is used internally
      expect(provider).toBeInstanceOf(LocalLlamaProvider);
    });

    it('should use custom endpoint if provided', () => {
      const provider = new LocalLlamaProvider({ endpoint: 'http://custom:8080' });
      expect(provider).toBeInstanceOf(LocalLlamaProvider);
    });
  });

  describe('validateCredentials', () => {
    it('should return true for reachable endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      });

      const provider = new LocalLlamaProvider({ endpoint: 'http://localhost:11434' });
      const result = await provider.validateCredentials();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should return false for unreachable endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const provider = new LocalLlamaProvider({ endpoint: 'http://localhost:11434' });
      const result = await provider.validateCredentials();

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const provider = new LocalLlamaProvider({ endpoint: 'http://localhost:11434' });
      const result = await provider.validateCredentials();

      expect(result).toBe(false);
    });
  });

  describe('fetchModels', () => {
    it('should return list of available models', async () => {
      const mockTagsResponse = {
        models: [
          {
            name: 'llama3.1:8b',
            model: 'llama3.1:8b',
            size: 4700000000,
            digest: 'abc123',
          },
          {
            name: 'mistral:7b',
            model: 'mistral:7b',
            size: 4100000000,
            digest: 'def456',
          },
        ],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTagsResponse),
      });

      const provider = new LocalLlamaProvider({ endpoint: 'http://localhost:11434' });
      const models = await provider.fetchModels();

      expect(models.length).toBe(2);
      expect(models[0]?.id).toBe('llama3.1:8b');
      expect(models[0]?.name).toBe('Llama 3.1 8b');
      expect(models[0]?.costPer1kTokens).toBeNull(); // Local models have no cost
    });

    it('should estimate context length based on model name', async () => {
      const mockTagsResponse = {
        models: [
          { name: 'llama3.1:70b', model: 'llama3.1:70b', size: 0, digest: '' },
          { name: 'llama3:8b', model: 'llama3:8b', size: 0, digest: '' },
          { name: 'mistral:7b', model: 'mistral:7b', size: 0, digest: '' },
        ],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTagsResponse),
      });

      const provider = new LocalLlamaProvider({ endpoint: 'http://localhost:11434' });
      const models = await provider.fetchModels();

      expect(models[0]?.contextLength).toBe(128000); // llama3.1
      expect(models[1]?.contextLength).toBe(8192);   // llama3
      expect(models[2]?.contextLength).toBe(32768);  // mistral
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Service Unavailable',
      });

      const provider = new LocalLlamaProvider({ endpoint: 'http://localhost:11434' });

      await expect(provider.fetchModels()).rejects.toThrow('Failed to fetch models');
    });
  });

  describe('getResourceInfo', () => {
    it('should return default resource info when no models available', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      });

      const provider = new LocalLlamaProvider({ endpoint: 'http://localhost:11434' });
      const result = await provider.getResourceInfo();

      expect(result).toEqual({
        gpuRequired: false,
        gpuMemoryGb: undefined,
        cpuCores: 4,
        ramGb: 8,
      });
    });

    it('should return resource requirements based on model', async () => {
      // First call for fetchModels
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [
            { name: 'llama3.1:70b', model: 'llama3.1:70b', size: 0, digest: '' },
          ],
        }),
      });
      // Second call for show endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          details: {
            parameter_size: '70B',
            quantization_level: 'Q4_K_M',
          },
        }),
      });

      const provider = new LocalLlamaProvider({ endpoint: 'http://localhost:11434' });
      const result = await provider.getResourceInfo();

      expect(result.gpuRequired).toBe(true);
      expect(result.gpuMemoryGb).toBeGreaterThan(0);
      expect(result.cpuCores).toBeGreaterThan(0);
      expect(result.ramGb).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const provider = new LocalLlamaProvider({ endpoint: 'http://localhost:11434' });
      const result = await provider.getResourceInfo();

      expect(result).toEqual({
        gpuRequired: false,
        gpuMemoryGb: undefined,
        cpuCores: 4,
        ramGb: 8,
      });
    });
  });
});
