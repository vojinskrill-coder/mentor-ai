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
  type: 'status' | 'stdout' | 'tool' | 'result' | 'error' | 'jsonl_event';
  data: Record<string, unknown>;
  sequenceNum?: number;
}

/**
 * A raw event captured from the executor's session jsonl file and
 * forwarded by the relay. These are the MiniMax / OpenClaw structured
 * events (messages, thinking, tool calls, tool results, sessions_spawn).
 * See relay/index.mjs `startJsonlTailer` for the emission format.
 */
export interface JsonlEvent {
  runId: string;
  event: {
    type: string;            // session | model_change | message | thinking_level_change | custom | ...
    id?: string;
    parentId?: string;
    timestamp?: string;
    message?: {
      role?: 'user' | 'assistant';
      content?: Array<{
        type: string;        // text | thinking | toolCall | toolResult | ...
        text?: string;
        thinking?: string;
        name?: string;       // tool name for toolCall
        arguments?: unknown;
        id?: string;
        [k: string]: unknown;
      }>;
      model?: string;
      provider?: string;
      stopReason?: string;
      usage?: Record<string, unknown>;
    };
    [k: string]: unknown;
  };
}

export interface OpenClawStreamCallbacks {
  onText?: (text: string) => void;
  onTool?: (tool: string, status: 'start' | 'end', query?: string) => void;
  onStatus?: (phase: string) => void;
  /**
   * Fired for every structured event the CLI writes to its session jsonl.
   * This is the raw event pipe for observability — the dashboard + graph
   * + activity monitor all feed from this. Use it instead of `onTool` /
   * `onStatus` when you need thinking blocks, tool arguments, tool
   * results, or sub-agent spawns.
   */
  onJsonlEvent?: (e: JsonlEvent) => void;
}

/**
 * Yielded by executeAgentStream() async generator.
 * Pattern: claude-code's query() yields StreamEvent | Message | ToolUseSummaryMessage
 */
export interface AgentStreamEvent {
  type: 'text' | 'tool_start' | 'tool_end' | 'status' | 'error' | 'complete';
  data: string;
  tool?: string;
  query?: string;
  result?: OpenClawResult;
  timestamp: number;
}

@Injectable()
export class OpenClawClientService {
  private readonly logger = new Logger(OpenClawClientService.name);
  private readonly relayUrl: string;
  private readonly authToken: string;
  private readonly timeoutSeconds: number;
  private readonly dispatcher: Agent;
  private readonly supportsStreaming: boolean;

  // Circuit breaker state
  private circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private readonly FAILURE_THRESHOLD = 3;
  private readonly RECOVERY_TIMEOUT_MS = 30_000;

  // Retry config
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  private static readonly RETRYABLE_PATTERNS = [
    'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'fetch failed',
    'Empty response', 'Invalid JSON', 'socket hang up',
    'HTTP 502', 'HTTP 503', 'HTTP 504',
    'No result received', 'circuit breaker',
    'LLM request timed out', 'Unexpected end of JSON',
  ];

  constructor(private readonly configService: ConfigService) {
    this.relayUrl = this.configService.get<string>('OPENCLAW_RELAY_URL') ?? '';
    this.authToken = this.configService.get<string>('OPENCLAW_AUTH_TOKEN') ?? '';
    this.timeoutSeconds = parseInt(
      this.configService.get<string>('OPENCLAW_TIMEOUT_SECONDS') ?? '3600',
      10
    );
    this.maxRetries = parseInt(
      this.configService.get<string>('OPENCLAW_MAX_RETRIES') ?? '2', 10,
    );
    this.retryDelayMs = parseInt(
      this.configService.get<string>('OPENCLAW_RETRY_DELAY_MS') ?? '5000', 10,
    );
    // SSE streaming enabled for real-time chat output
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

  /** Check if the circuit breaker is currently open (rejecting requests) */
  isCircuitOpen(): boolean {
    if (this.circuitState === 'CLOSED') return false;
    if (this.circuitState === 'OPEN') {
      // Check if recovery timeout has passed → transition to HALF_OPEN
      if (Date.now() - this.lastFailureTime >= this.RECOVERY_TIMEOUT_MS) {
        this.circuitState = 'HALF_OPEN';
        this.logger.log({ message: 'Circuit breaker → HALF_OPEN (recovery window)' });
        return false;
      }
      return true;
    }
    // HALF_OPEN: allow one request through
    return false;
  }

  private recordSuccess(): void {
    if (this.circuitState !== 'CLOSED') {
      this.logger.log({ message: `Circuit breaker → CLOSED (success after ${this.circuitState})` });
    }
    this.circuitState = 'CLOSED';
    this.consecutiveFailures = 0;
  }

  private recordFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    if (this.consecutiveFailures >= this.FAILURE_THRESHOLD && this.circuitState !== 'OPEN') {
      this.circuitState = 'OPEN';
      this.logger.warn({
        message: `Circuit breaker → OPEN after ${this.consecutiveFailures} consecutive failures. Will recover in ${this.RECOVERY_TIMEOUT_MS / 1000}s`,
      });
    } else if (this.circuitState === 'HALF_OPEN') {
      this.circuitState = 'OPEN';
      this.logger.warn({ message: 'Circuit breaker → OPEN (HALF_OPEN probe failed)' });
    }
  }

  /** Check if an error message indicates a transient/retryable failure */
  isRetryableError(error?: string | null): boolean {
    if (!error) return false;
    return OpenClawClientService.RETRYABLE_PATTERNS.some((p) => error.includes(p));
  }

  private getStreamUrl(): string {
    // Replace /execute with /stream in the relay URL
    return this.relayUrl.replace(/\/execute\/?$/, '/stream');
  }

  /**
   * Execute agent with retry + circuit breaker.
   * Retries up to OPENCLAW_MAX_RETRIES on transient failures with exponential backoff.
   */
  async executeAgent(
    message: string,
    options?: {
      agentId?: string;
      sessionId?: string;
      tenantProfile?: string;
      timeoutSeconds?: number;
      onText?: (text: string) => void;
      onTool?: (tool: string, status: 'start' | 'end', query?: string) => void;
      onStatus?: (phase: string) => void;
      onJsonlEvent?: (e: JsonlEvent) => void;
      // MiniMax M2.7 native body params — forwarded to relay → CLI
      thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
      parallelToolCalls?: boolean;
      toolChoice?: 'auto' | 'required' | 'none';
      reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
      // When set, the relay tails ALL agent session jsonl files and
      // forwards only events whose line text contains this noteId.
      // Critical for sub-session activity tracking — sub-agents spawned
      // by the main agent write to different jsonl files which would
      // otherwise be invisible to the backend.
      noteId?: string;
    }
  ): Promise<OpenClawResult> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Circuit breaker check
      if (this.isCircuitOpen()) {
        const error = `Circuit breaker OPEN — rejecting request (will recover in ${Math.ceil((this.RECOVERY_TIMEOUT_MS - (Date.now() - this.lastFailureTime)) / 1000)}s)`;
        this.logger.warn({ message: error, agentId: options?.agentId });
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          this.logger.log({ message: `Retry ${attempt + 1}/${this.maxRetries} in ${delay}ms (circuit breaker)`, agentId: options?.agentId });
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        return { success: false, output: '', durationMs: 0, error };
      }

      // On retry attempts, suppress streaming callbacks to prevent duplicate partial text
      const effectiveOptions = attempt > 0
        ? { ...options, onText: undefined, onTool: undefined, onStatus: undefined, onJsonlEvent: undefined }
        : options;

      const result = await this._executeAgentOnce(message, effectiveOptions);

      if (result.success) {
        this.recordSuccess();
        return result;
      }

      // Check if error is retryable
      if (this.isRetryableError(result.error) && attempt < this.maxRetries) {
        this.recordFailure();
        const delay = this.retryDelayMs * Math.pow(2, attempt);
        this.logger.warn({
          message: `Retryable failure, attempt ${attempt + 1}/${this.maxRetries}`,
          error: result.error?.substring(0, 150),
          agentId: options?.agentId,
          nextRetryMs: delay,
        });
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Non-retryable failure or exhausted retries
      if (this.isRetryableError(result.error)) {
        this.recordFailure();
      }
      return result;
    }

    // Should not reach here, but safety net
    return { success: false, output: '', durationMs: 0, error: 'Exhausted all retry attempts' };
  }

  /**
   * Single execution attempt — tries SSE streaming first, falls back to blocking.
   */
  private async _executeAgentOnce(
    message: string,
    options?: {
      agentId?: string;
      sessionId?: string;
      tenantProfile?: string;
      timeoutSeconds?: number;
      onText?: (text: string) => void;
      onTool?: (tool: string, status: 'start' | 'end', query?: string) => void;
      onStatus?: (phase: string) => void;
      onJsonlEvent?: (e: JsonlEvent) => void;
      thinking?: string;
      parallelToolCalls?: boolean;
      toolChoice?: string;
      reasoningEffort?: string;
      noteId?: string;
    }
  ): Promise<OpenClawResult> {
    const agentId = options?.agentId ?? 'main';
    const sessionId = options?.sessionId;
    const tenantProfile = options?.tenantProfile;
    const timeout = options?.timeoutSeconds ?? this.timeoutSeconds;
    const hasCallbacks = !!(options?.onText || options?.onTool || options?.onStatus || options?.onJsonlEvent);
    const extraBody = {
      thinking: options?.thinking,
      parallelToolCalls: options?.parallelToolCalls,
      toolChoice: options?.toolChoice,
      reasoningEffort: options?.reasoningEffort,
      noteId: options?.noteId,
    };

    // Try SSE streaming first when callbacks are provided
    if (hasCallbacks && this.supportsStreaming) {
      try {
        return await this.executeAgentStreaming(message, agentId, timeout, {
          onText: options?.onText,
          onTool: options?.onTool,
          onStatus: options?.onStatus,
          onJsonlEvent: options?.onJsonlEvent,
        }, sessionId, tenantProfile, extraBody);
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

    return this.executeAgentBlocking(message, agentId, timeout, sessionId, tenantProfile, extraBody);
  }

  /**
   * SSE streaming execution — connects to /stream endpoint,
   * parses Server-Sent Events, and invokes callbacks in real-time.
   */
  private async executeAgentStreaming(
    message: string,
    agentId: string,
    timeout: number,
    callbacks: OpenClawStreamCallbacks,
    sessionId?: string,
    tenantProfile?: string,
    extraBody?: { thinking?: string; parallelToolCalls?: boolean; toolChoice?: string; reasoningEffort?: string; noteId?: string }
  ): Promise<OpenClawResult> {
    const streamUrl = this.getStreamUrl();

    this.logger.log({
      message: 'SSE streaming to OpenClaw relay',
      url: streamUrl,
      agentId,
      sessionId: sessionId || 'default',
      noteId: extraBody?.noteId || 'none',
      msgLength: message.length,
    });

    // Multi-session tailer keeps the SSE alive for ~30 min after the main
    // turn ends, so timeout must accommodate the grace period.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (timeout + 60 + 1800) * 1000);

    try {
      const requestBody: Record<string, unknown> = { message, agentId, timeoutSeconds: timeout };
      if (sessionId) requestBody.sessionId = sessionId;
      if (tenantProfile) requestBody.tenantProfile = tenantProfile;
      if (extraBody?.thinking) requestBody.thinking = extraBody.thinking;
      if (extraBody?.parallelToolCalls !== undefined) requestBody.parallelToolCalls = extraBody.parallelToolCalls;
      if (extraBody?.toolChoice) requestBody.toolChoice = extraBody.toolChoice;
      if (extraBody?.reasoningEffort) requestBody.reasoningEffort = extraBody.reasoningEffort;
      if (extraBody?.noteId) requestBody.noteId = extraBody.noteId;

      const response = await undiciFetch(streamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(requestBody),
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

    // Liveness detection: 90s idle timeout.
    // Relay sends keepalive comments every 30s, so 90s = 3 missed keepalives = dead connection.
    // Any SSE frame (including keepalive comments `: keepalive ...`) resets the timer.
    const IDLE_TIMEOUT_MS = 90_000;

    try {
      while (true) {
        // Race between next chunk and idle timeout
        const readPromise = reader.read();
        const timeoutPromise = new Promise<{ done: true; value: undefined }>((_, reject) =>
          setTimeout(() => reject(new Error('SSE idle timeout: 3 missed keepalives (90s)')), IDLE_TIMEOUT_MS)
        );

        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await Promise.race([readPromise, timeoutPromise]) as ReadableStreamReadResult<Uint8Array>;
        } catch (idleErr) {
          this.logger.warn({ message: 'SSE stream idle timeout', error: (idleErr as Error).message });
          break;
        }

        const { done, value } = result;
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

            case 'jsonl_event':
              // Structured event captured from the CLI's session jsonl
              // by the relay's jsonl tailer. This is the rich pipe:
              // thinking blocks, tool calls with full arguments, tool
              // results, sub-agent spawns. The bridge service subscribes
              // via onJsonlEvent and emits agent:status / graph updates.
              safeCallback(() => callbacks.onJsonlEvent?.(event.data as unknown as JsonlEvent));
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

            default:
              // Handles relay-specific events like 'late_events_done'
              // from the multi-session tailer (grace period elapsed,
              // all sub-session events streamed).
              if (event.type === 'late_events_done') {
                this.logger.log({
                  message: 'Late events done',
                  runId: event.data['runId'],
                  totalEvents: event.data['totalEvents'],
                });
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
  /**
   * Parse a single SSE message block.
   * Supports optional `id:` field for sequence tracking (claude-code SSE resumption pattern).
   */
  private parseSSEMessage(raw: string): OpenClawStreamEvent | null {
    let eventType = '';
    let dataStr = '';
    let sequenceNum: number | undefined;

    for (const line of raw.split('\n')) {
      if (line.startsWith('event: ')) {
        eventType = line.substring(7).trim();
      } else if (line.startsWith('data: ')) {
        dataStr = line.substring(6);
      } else if (line.startsWith('id: ')) {
        const parsed = parseInt(line.substring(4).trim(), 10);
        if (!isNaN(parsed)) sequenceNum = parsed;
      }
    }

    if (!eventType || !dataStr) return null;

    try {
      const data = JSON.parse(dataStr) as Record<string, unknown>;
      return { type: eventType as OpenClawStreamEvent['type'], data, sequenceNum };
    } catch {
      return null;
    }
  }

  /**
   * Async generator for agent execution — yields streaming events as they arrive.
   * Pattern: claude-code's query() async generator + withRetry yielding error events.
   *
   * Usage:
   *   for await (const event of client.executeAgentStream(prompt, opts)) {
   *     if (event.type === 'text') emitProgress(event.data);
   *     if (event.type === 'complete') handleResult(event.result);
   *   }
   */
  async *executeAgentStream(
    message: string,
    options?: {
      agentId?: string;
      sessionId?: string;
      tenantProfile?: string;
      timeoutSeconds?: number;
    }
  ): AsyncGenerator<AgentStreamEvent, OpenClawResult, undefined> {
    const startTime = Date.now();

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Circuit breaker check — yield error event on rejection
      if (this.isCircuitOpen()) {
        const error = `Circuit breaker OPEN — rejecting request`;
        yield { type: 'error', data: error, timestamp: Date.now() };

        if (attempt < this.maxRetries) {
          const delay = this.backoff(attempt);
          yield { type: 'status', data: `Retrying in ${Math.round(delay / 1000)}s (circuit breaker)...`, timestamp: Date.now() };
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return { success: false, output: '', durationMs: Date.now() - startTime, error };
      }

      yield { type: 'status', data: attempt > 0 ? `Retry attempt ${attempt}/${this.maxRetries}...` : 'Connecting to agent...', timestamp: Date.now() };

      // Wire streaming callbacks that yield events
      const events: AgentStreamEvent[] = [];
      const result = await this._executeAgentOnce(message, {
        ...options,
        // Only wire callbacks on first attempt to prevent duplicate text (claude-code pattern)
        onText: attempt === 0 ? (text) => {
          const evt: AgentStreamEvent = { type: 'text', data: text, timestamp: Date.now() };
          events.push(evt);
        } : undefined,
        onTool: attempt === 0 ? (tool, status, query) => {
          const evt: AgentStreamEvent = {
            type: status === 'start' ? 'tool_start' : 'tool_end',
            data: tool, tool, query, timestamp: Date.now(),
          };
          events.push(evt);
        } : undefined,
        onStatus: attempt === 0 ? (phase) => {
          const evt: AgentStreamEvent = { type: 'status', data: phase, timestamp: Date.now() };
          events.push(evt);
        } : undefined,
      });

      // Yield all buffered events from this attempt
      for (const evt of events) {
        yield evt;
      }

      if (result.success) {
        this.recordSuccess();
        const completeEvt: AgentStreamEvent = {
          type: 'complete', data: 'Agent execution completed',
          result, timestamp: Date.now(),
        };
        yield completeEvt;
        return result;
      }

      // Retryable check
      if (this.isRetryableError(result.error) && attempt < this.maxRetries) {
        this.recordFailure();
        const delay = this.backoff(attempt);
        yield {
          type: 'error',
          data: `Retryable failure: ${result.error?.substring(0, 100)}. Retrying in ${Math.round(delay / 1000)}s...`,
          timestamp: Date.now(),
        };
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // Non-retryable or exhausted
      if (this.isRetryableError(result.error)) this.recordFailure();
      yield { type: 'error', data: result.error ?? 'Agent execution failed', timestamp: Date.now() };
      return result;
    }

    return { success: false, output: '', durationMs: Date.now() - startTime, error: 'Exhausted all retry attempts' };
  }

  /**
   * Exponential backoff with jitter (claude-code standard: base * 2^n, ±25% jitter, max 30s)
   */
  private backoff(attempt: number): number {
    const exponential = Math.min(this.retryDelayMs * Math.pow(2, attempt), 30_000);
    const jitter = exponential * 0.25 * (Math.random() * 2 - 1);
    return Math.round(exponential + jitter);
  }

  /** Health check: ping the gateway base URL */
  async checkHealth(): Promise<boolean> {
    try {
      const baseUrl = this.relayUrl.replace(/\/execute\/?$/, '/health');
      const response = await undiciFetch(baseUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.authToken}` },
        signal: AbortSignal.timeout(5_000),
        dispatcher: this.dispatcher,
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Blocking HTTP POST execution (original approach, used as fallback).
   */
  private async executeAgentBlocking(
    message: string,
    agentId: string,
    timeout: number,
    sessionId?: string,
    tenantProfile?: string,
    extraBody?: { thinking?: string; parallelToolCalls?: boolean; toolChoice?: string; reasoningEffort?: string }
  ): Promise<OpenClawResult> {
    this.logger.log({
      message: 'Blocking request to OpenClaw relay',
      agentId,
      sessionId: sessionId || 'default',
      msgLength: message.length,
      timeoutSeconds: timeout,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (timeout + 60) * 1000);

    const requestBody: Record<string, unknown> = { message, agentId, timeoutSeconds: timeout };
    if (sessionId) requestBody.sessionId = sessionId;
    if (tenantProfile) requestBody.tenantProfile = tenantProfile;
    if (extraBody?.thinking) requestBody.thinking = extraBody.thinking;
    if (extraBody?.parallelToolCalls !== undefined) requestBody.parallelToolCalls = extraBody.parallelToolCalls;
    if (extraBody?.toolChoice) requestBody.toolChoice = extraBody.toolChoice;
    if (extraBody?.reasoningEffort) requestBody.reasoningEffort = extraBody.reasoningEffort;

    try {
      const response = await undiciFetch(this.relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify(requestBody),
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
