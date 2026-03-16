import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent, fetch as undiciFetch } from 'undici';

export interface OpenClawResult {
  success: boolean;
  output: string;
  durationMs: number;
  usage?: { input?: number; output?: number; total?: number };
  runId?: string;
  error?: string;
}

export interface OpenClawStreamEvent {
  type: 'status' | 'stdout' | 'tool' | 'result' | 'error';
  data: Record<string, unknown>;
}

export interface OpenClawStreamCallbacks {
  onText?: (text: string) => void;
  onTool?: (tool: string, status: 'start' | 'end', query?: string) => void;
  onStatus?: (phase: string) => void;
}

@Injectable()
export class OpenClawClientService {
  private readonly logger = new Logger(OpenClawClientService.name);
  private readonly relayUrl: string;
  private readonly authToken: string;
  private readonly timeoutSeconds: number;
  private readonly dispatcher: Agent;
  private readonly supportsStreaming: boolean;

  constructor(private readonly configService: ConfigService) {
    this.relayUrl = this.configService.get<string>('OPENCLAW_RELAY_URL') ?? '';
    this.authToken = this.configService.get<string>('OPENCLAW_AUTH_TOKEN') ?? '';
    this.timeoutSeconds = parseInt(
      this.configService.get<string>('OPENCLAW_TIMEOUT_SECONDS') ?? '600',
      10
    );
    // Derive streaming URL: /execute → /stream
    this.supportsStreaming = true;

    // undici Agent with extended timeouts
    const timeoutMs = (this.timeoutSeconds + 60) * 1000;
    this.dispatcher = new Agent({
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      connectTimeout: 30_000,
      keepAliveTimeout: timeoutMs,
    });
  }

  isConfigured(): boolean {
    return !!this.authToken && !!this.relayUrl;
  }

  private getStreamUrl(): string {
    // Replace /execute with /stream in the relay URL
    return this.relayUrl.replace(/\/execute\/?$/, '/stream');
  }

  /**
   * Execute agent with real-time SSE streaming.
   * Falls back to blocking HTTP POST if streaming fails.
   */
  async executeAgent(
    message: string,
    options?: {
      agentId?: string;
      timeoutSeconds?: number;
      onText?: (text: string) => void;
      onTool?: (tool: string, status: 'start' | 'end', query?: string) => void;
      onStatus?: (phase: string) => void;
    }
  ): Promise<OpenClawResult> {
    const agentId = options?.agentId ?? 'main';
    const timeout = options?.timeoutSeconds ?? this.timeoutSeconds;
    const hasCallbacks = !!(options?.onText || options?.onTool || options?.onStatus);

    // Try SSE streaming first when callbacks are provided
    if (hasCallbacks && this.supportsStreaming) {
      try {
        return await this.executeAgentStreaming(message, agentId, timeout, {
          onText: options?.onText,
          onTool: options?.onTool,
          onStatus: options?.onStatus,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.warn({
          message: 'SSE streaming failed, falling back to blocking request',
          error: errorMsg,
          agentId,
        });
        // Fall through to blocking request
      }
    }

    return this.executeAgentBlocking(message, agentId, timeout);
  }

  /**
   * SSE streaming execution — connects to /stream endpoint,
   * parses Server-Sent Events, and invokes callbacks in real-time.
   */
  private async executeAgentStreaming(
    message: string,
    agentId: string,
    timeout: number,
    callbacks: OpenClawStreamCallbacks
  ): Promise<OpenClawResult> {
    const streamUrl = this.getStreamUrl();

    this.logger.log({
      message: 'SSE streaming to OpenClaw relay',
      url: streamUrl,
      agentId,
      msgLength: message.length,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (timeout + 60) * 1000);

    try {
      const response = await undiciFetch(streamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ message, agentId, timeoutSeconds: timeout }),
        signal: controller.signal,
        dispatcher: this.dispatcher,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream')) {
        // Server doesn't support streaming — parse as JSON and return
        const text = await response.text();
        if (!text) {
          throw new Error('Empty response body from stream endpoint');
        }
        const data = JSON.parse(text) as Record<string, unknown>;
        return data as unknown as OpenClawResult;
      }

      // Parse SSE stream — cast needed: undici Response uses stream/web types
      return await this.parseSSEStream(response as any, callbacks);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parse SSE event stream from the relay and invoke callbacks.
   * Returns the final result when the stream completes.
   */
  private async parseSSEStream(
    response: Response,
    callbacks: OpenClawStreamCallbacks
  ): Promise<OpenClawResult> {
    if (!response.body) {
      return { success: false, output: '', durationMs: 0, error: 'Empty response body' };
    }

    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult: OpenClawResult | null = null;

    const safeCallback = (fn: () => void): void => {
      try { fn(); } catch (err) {
        this.logger.warn({
          message: 'SSE callback threw',
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (delimited by double newlines)
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const rawMessage = buffer.substring(0, boundary);
          buffer = buffer.substring(boundary + 2);

          const event = this.parseSSEMessage(rawMessage);
          if (!event) continue;

          switch (event.type) {
            case 'stdout':
              safeCallback(() => callbacks.onText?.(event.data['text'] as string));
              break;

            case 'tool':
              safeCallback(() => callbacks.onTool?.(
                event.data['tool'] as string,
                event.data['status'] as 'start' | 'end',
                event.data['query'] as string | undefined
              ));
              break;

            case 'status':
              safeCallback(() => callbacks.onStatus?.(event.data['phase'] as string));
              break;

            case 'result':
              finalResult = {
                success: event.data['success'] as boolean,
                output: event.data['output'] as string,
                durationMs: event.data['durationMs'] as number,
                usage: event.data['usage'] as OpenClawResult['usage'],
                runId: event.data['runId'] as string,
                error: event.data['error'] as string | undefined,
              };
              break;

            case 'error':
              if (!finalResult) {
                finalResult = {
                  success: false,
                  output: '',
                  durationMs: 0,
                  error: event.data['error'] as string,
                };
              }
              break;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!finalResult) {
      return { success: false, output: '', durationMs: 0, error: 'No result received from stream' };
    }

    this.logger.log({
      message: 'SSE streaming completed',
      success: finalResult.success,
      outputLength: finalResult.output.length,
      durationMs: finalResult.durationMs,
    });

    return finalResult;
  }

  /**
   * Parse a single SSE message block into an event.
   * Format: "event: <type>\ndata: <json>"
   */
  private parseSSEMessage(raw: string): OpenClawStreamEvent | null {
    let eventType = '';
    let dataStr = '';

    for (const line of raw.split('\n')) {
      if (line.startsWith('event: ')) {
        eventType = line.substring(7).trim();
      } else if (line.startsWith('data: ')) {
        dataStr = line.substring(6);
      }
    }

    if (!eventType || !dataStr) return null;

    try {
      const data = JSON.parse(dataStr) as Record<string, unknown>;
      return { type: eventType as OpenClawStreamEvent['type'], data };
    } catch {
      return null;
    }
  }

  /**
   * Blocking HTTP POST execution (original approach, used as fallback).
   */
  private async executeAgentBlocking(
    message: string,
    agentId: string,
    timeout: number
  ): Promise<OpenClawResult> {
    this.logger.log({
      message: 'Blocking request to OpenClaw relay',
      agentId,
      msgLength: message.length,
      timeoutSeconds: timeout,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (timeout + 60) * 1000);

    try {
      const response = await undiciFetch(this.relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({ message, agentId, timeoutSeconds: timeout }),
        signal: controller.signal,
        dispatcher: this.dispatcher,
      });

      const text = await response.text();
      if (!text) {
        this.logger.error({
          message: 'OpenClaw relay returned empty body',
          status: response.status,
          agentId,
        });
        return {
          success: false,
          output: '',
          durationMs: 0,
          error: `Empty response (HTTP ${response.status})`,
        };
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        this.logger.error({
          message: 'OpenClaw relay returned invalid JSON',
          status: response.status,
          bodyPreview: text.substring(0, 200),
        });
        return {
          success: false,
          output: '',
          durationMs: 0,
          error: `Invalid JSON response (HTTP ${response.status})`,
        };
      }

      if (!response.ok) {
        this.logger.error({
          message: 'OpenClaw relay error',
          status: response.status,
          error: data['error'],
        });
        return {
          success: false,
          output: '',
          durationMs: (data['durationMs'] as number) ?? 0,
          error: (data['error'] as string) ?? `HTTP ${response.status}`,
        };
      }

      this.logger.log({
        message: 'OpenClaw relay success',
        durationMs: data['durationMs'],
        outputLength: (data['output'] as string)?.length ?? 0,
        runId: data['runId'],
      });

      return data as unknown as OpenClawResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const cause = err instanceof Error && (err as any).cause ? String((err as any).cause) : undefined;
      this.logger.error({
        message: 'OpenClaw relay call failed',
        error: errorMessage,
        cause,
        agentId,
        timeoutSeconds: timeout,
      });
      return {
        success: false,
        output: '',
        durationMs: 0,
        error: cause ? `${errorMessage}: ${cause}` : errorMessage,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
