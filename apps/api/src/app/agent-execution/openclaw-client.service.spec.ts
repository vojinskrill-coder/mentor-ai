import { ConfigService } from '@nestjs/config';
import { OpenClawClientService, OpenClawStreamEvent } from './openclaw-client.service';

describe('OpenClawClientService', () => {
  let service: OpenClawClientService;
  let mockConfigService: { get: jest.Mock };

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'OPENCLAW_RELAY_URL':
            return 'http://localhost:3100/execute';
          case 'OPENCLAW_AUTH_TOKEN':
            return 'test-token';
          case 'OPENCLAW_TIMEOUT_SECONDS':
            return '60';
          default:
            return undefined;
        }
      }),
    };
    service = new OpenClawClientService(mockConfigService as unknown as ConfigService);
  });

  describe('isConfigured()', () => {
    it('should return true when both URL and token are set', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when URL is missing', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENCLAW_RELAY_URL') return '';
        if (key === 'OPENCLAW_AUTH_TOKEN') return 'token';
        return undefined;
      });
      const svc = new OpenClawClientService(mockConfigService as unknown as ConfigService);
      expect(svc.isConfigured()).toBe(false);
    });

    it('should return false when token is missing', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENCLAW_RELAY_URL') return 'http://localhost/execute';
        if (key === 'OPENCLAW_AUTH_TOKEN') return '';
        return undefined;
      });
      const svc = new OpenClawClientService(mockConfigService as unknown as ConfigService);
      expect(svc.isConfigured()).toBe(false);
    });
  });

  describe('getStreamUrl()', () => {
    it('should replace /execute with /stream', () => {
      const url = (service as any).getStreamUrl();
      expect(url).toBe('http://localhost:3100/stream');
    });

    it('should handle trailing slash on /execute/', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENCLAW_RELAY_URL') return 'http://localhost:3100/execute/';
        return 'token';
      });
      const svc = new OpenClawClientService(mockConfigService as unknown as ConfigService);
      expect((svc as any).getStreamUrl()).toBe('http://localhost:3100/stream');
    });

    it('should not modify URL without /execute suffix', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENCLAW_RELAY_URL') return 'http://localhost:3100/api/run';
        return 'token';
      });
      const svc = new OpenClawClientService(mockConfigService as unknown as ConfigService);
      // No /execute to replace, so it remains unchanged
      expect((svc as any).getStreamUrl()).toBe('http://localhost:3100/api/run');
    });
  });

  describe('parseSSEMessage()', () => {
    function parse(raw: string): OpenClawStreamEvent | null {
      return (service as any).parseSSEMessage(raw);
    }

    it('should parse a valid stdout event', () => {
      const raw = 'event: stdout\ndata: {"text":"Hello world\\n"}';
      const result = parse(raw);
      expect(result).toEqual({
        type: 'stdout',
        data: { text: 'Hello world\n' },
      });
    });

    it('should parse a valid status event', () => {
      const raw = 'event: status\ndata: {"phase":"running","runId":"abc-123"}';
      const result = parse(raw);
      expect(result).toEqual({
        type: 'status',
        data: { phase: 'running', runId: 'abc-123' },
      });
    });

    it('should parse a valid tool event', () => {
      const raw = 'event: tool\ndata: {"tool":"web_search","status":"start","query":"test query"}';
      const result = parse(raw);
      expect(result).toEqual({
        type: 'tool',
        data: { tool: 'web_search', status: 'start', query: 'test query' },
      });
    });

    it('should parse a valid result event', () => {
      const raw = 'event: result\ndata: {"success":true,"output":"Agent output","durationMs":5000,"runId":"r1"}';
      const result = parse(raw);
      expect(result).toEqual({
        type: 'result',
        data: { success: true, output: 'Agent output', durationMs: 5000, runId: 'r1' },
      });
    });

    it('should parse an error event', () => {
      const raw = 'event: error\ndata: {"error":"Timeout exceeded"}';
      const result = parse(raw);
      expect(result).toEqual({
        type: 'error',
        data: { error: 'Timeout exceeded' },
      });
    });

    it('should return null for missing event type', () => {
      const raw = 'data: {"text":"hello"}';
      expect(parse(raw)).toBeNull();
    });

    it('should return null for missing data', () => {
      const raw = 'event: stdout';
      expect(parse(raw)).toBeNull();
    });

    it('should return null for invalid JSON in data', () => {
      const raw = 'event: stdout\ndata: not valid json';
      expect(parse(raw)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parse('')).toBeNull();
    });

    it('should handle event and data in any order', () => {
      const raw = 'data: {"text":"first"}\nevent: stdout';
      const result = parse(raw);
      expect(result).toEqual({
        type: 'stdout',
        data: { text: 'first' },
      });
    });

    it('should ignore comment lines (lines starting with :)', () => {
      const raw = ': keepalive\nevent: stdout\ndata: {"text":"hello"}';
      const result = parse(raw);
      expect(result).toEqual({
        type: 'stdout',
        data: { text: 'hello' },
      });
    });
  });

  describe('executeAgent() with no streaming callbacks', () => {
    it('should fall through to blocking request when no callbacks provided', async () => {
      // Mock the blocking method to return a result
      const mockResult = {
        success: true,
        output: 'test output',
        durationMs: 100,
      };
      (service as any).executeAgentBlocking = jest.fn().mockResolvedValue(mockResult);

      const result = await service.executeAgent('test message');
      expect(result).toEqual(mockResult);
      expect((service as any).executeAgentBlocking).toHaveBeenCalledWith('test message', 'main', 60);
    });
  });

  describe('executeAgent() streaming fallback', () => {
    it('should fall back to blocking when streaming throws', async () => {
      const mockBlockingResult = {
        success: true,
        output: 'blocking result',
        durationMs: 200,
      };

      (service as any).executeAgentStreaming = jest.fn().mockRejectedValue(new Error('SSE failed'));
      (service as any).executeAgentBlocking = jest.fn().mockResolvedValue(mockBlockingResult);

      const result = await service.executeAgent('test', {
        onText: () => {},
      });

      expect(result).toEqual(mockBlockingResult);
      expect((service as any).executeAgentStreaming).toHaveBeenCalled();
      expect((service as any).executeAgentBlocking).toHaveBeenCalled();
    });
  });
});
