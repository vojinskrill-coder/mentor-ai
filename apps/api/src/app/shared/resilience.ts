/**
 * resilience.ts — Production-grade resilience utilities
 *
 * Patterns inspired by Anthropic's Claude Code CLI architecture:
 * serial batch uploaders, binary state gates, ring buffers,
 * categorized error recovery, and exponential backoff.
 */

// ---------------------------------------------------------------------------
// 1. Exponential Backoff
// ---------------------------------------------------------------------------

export interface BackoffOptions {
  /** Base delay in milliseconds (default 1000) */
  baseMs?: number;
  /** Maximum delay cap in milliseconds (default 30000) */
  maxMs?: number;
  /** Jitter as a percentage 0-100 (default 25) */
  jitterPercent?: number;
}

/**
 * Compute an exponential backoff delay with jitter.
 *
 * Formula: `min(baseMs * 2^attempt, maxMs) ± jitterPercent`
 *
 * Claude-code reference: retry loops across tool invocations use this
 * pattern to avoid thundering-herd on transient API failures.
 *
 * @param attempt Zero-based attempt index (0 = first retry)
 * @param opts    Optional tuning knobs
 * @returns Delay in milliseconds
 */
export function exponentialBackoff(attempt: number, opts?: BackoffOptions): number {
  const baseMs = opts?.baseMs ?? 1000;
  const maxMs = opts?.maxMs ?? 30000;
  const jitterPercent = opts?.jitterPercent ?? 25;

  const raw = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitterRange = raw * (jitterPercent / 100);
  const jitter = (Math.random() * 2 - 1) * jitterRange; // ± jitterRange

  return Math.max(0, Math.round(raw + jitter));
}

// ---------------------------------------------------------------------------
// 2. StepErrorType Enum
// ---------------------------------------------------------------------------

/**
 * Categorized error taxonomy for process-step failures.
 *
 * Claude-code reference: the CLI classifies every tool/API error into a
 * finite set of categories so the retry & recovery logic is deterministic
 * rather than pattern-matching on free-text messages at each call-site.
 */
export enum StepErrorType {
  /** Network-level transient failure (ECONNREFUSED, ECONNRESET, ETIMEDOUT, 5xx) */
  TRANSIENT_API = 'TRANSIENT_API',
  /** Upstream rate-limit hit (HTTP 429 or explicit "rate limit" message) */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Provider overloaded (HTTP 529, "overloaded" message) */
  OVERLOADED = 'OVERLOADED',
  /** Prompt or context window exceeded provider limits */
  CONTEXT_OVERFLOW = 'CONTEXT_OVERFLOW',
  /** Token / cost budget exhausted for this run */
  BUDGET_EXCEEDED = 'BUDGET_EXCEEDED',
  /** Response did not match expected JSON schema */
  SCHEMA_INVALID = 'SCHEMA_INVALID',
  /** Raw JSON parse failure on LLM output */
  JSON_PARSE = 'JSON_PARSE',
  /** A tool call returned an error or threw */
  TOOL_FAILURE = 'TOOL_FAILURE',
  /** Circuit breaker tripped for this dependency */
  CIRCUIT_BREAKER = 'CIRCUIT_BREAKER',
  /** Unrecoverable / unknown error — do not retry */
  FATAL = 'FATAL',
}

// ---------------------------------------------------------------------------
// 3. categorizeError
// ---------------------------------------------------------------------------

/**
 * Inspect an error message or Error instance and return a StepErrorType.
 *
 * Claude-code reference: centralised error classification avoids duplicated
 * regex checks scattered across service files.
 *
 * @param error A string message or Error object
 */
export function categorizeError(error: string | Error): StepErrorType {
  const msg =
    typeof error === 'string'
      ? error.toLowerCase()
      : (error.message ?? '').toLowerCase();

  const code: string | undefined =
    typeof error !== 'string' ? (error as any).code?.toLowerCase?.() : undefined;
  const status: number | undefined =
    typeof error !== 'string' ? (error as any).status ?? (error as any).statusCode : undefined;

  // --- Network / transient ---
  if (
    code === 'econnrefused' ||
    code === 'econnreset' ||
    code === 'etimedout' ||
    code === 'enotfound' ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    (status !== undefined && status >= 500 && status < 600 && status !== 529)
  ) {
    return StepErrorType.TRANSIENT_API;
  }

  // --- Rate limited ---
  if (status === 429 || msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('too many requests')) {
    return StepErrorType.RATE_LIMITED;
  }

  // --- Overloaded ---
  if (status === 529 || msg.includes('overloaded') || msg.includes('capacity')) {
    return StepErrorType.OVERLOADED;
  }

  // --- Context overflow ---
  if (
    msg.includes('context length') ||
    msg.includes('prompt too long') ||
    msg.includes('token limit') ||
    msg.includes('maximum context') ||
    msg.includes('context_length_exceeded') ||
    msg.includes('max_tokens')
  ) {
    return StepErrorType.CONTEXT_OVERFLOW;
  }

  // --- Budget exceeded ---
  if (msg.includes('budget') || msg.includes('quota exceeded') || msg.includes('insufficient_quota')) {
    return StepErrorType.BUDGET_EXCEEDED;
  }

  // --- Circuit breaker ---
  if (msg.includes('circuit breaker') || msg.includes('circuit_breaker')) {
    return StepErrorType.CIRCUIT_BREAKER;
  }

  // --- JSON parse ---
  if (
    msg.includes('json parse') ||
    msg.includes('json.parse') ||
    msg.includes('unexpected token') ||
    msg.includes('unexpected end of json') ||
    msg.includes('not valid json')
  ) {
    return StepErrorType.JSON_PARSE;
  }

  // --- Schema validation ---
  if (msg.includes('schema') || msg.includes('validation failed') || msg.includes('invalid response format')) {
    return StepErrorType.SCHEMA_INVALID;
  }

  // --- Tool failure ---
  if (msg.includes('tool') && (msg.includes('fail') || msg.includes('error'))) {
    return StepErrorType.TOOL_FAILURE;
  }

  return StepErrorType.FATAL;
}

// ---------------------------------------------------------------------------
// 4. getErrorRecovery
// ---------------------------------------------------------------------------

export interface ErrorRecovery {
  /** Whether the error type is worth retrying at all */
  retryable: boolean;
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Multiplier applied to the base backoff (stacks with exponential) */
  backoffMultiplier: number;
  /** If true, background/async tasks should bail immediately rather than retry */
  bailBackground: boolean;
}

/**
 * Return a deterministic recovery strategy for a given error category.
 *
 * Claude-code reference: the CLI pre-computes retry budgets per error class
 * so that hot-path retry loops contain zero branching logic.
 */
export function getErrorRecovery(type: StepErrorType): ErrorRecovery {
  switch (type) {
    case StepErrorType.TRANSIENT_API:
      return { retryable: true, maxRetries: 3, backoffMultiplier: 1, bailBackground: false };
    case StepErrorType.RATE_LIMITED:
      return { retryable: true, maxRetries: 5, backoffMultiplier: 2, bailBackground: false };
    case StepErrorType.OVERLOADED:
      return { retryable: true, maxRetries: 3, backoffMultiplier: 3, bailBackground: true };
    case StepErrorType.CONTEXT_OVERFLOW:
      return { retryable: true, maxRetries: 1, backoffMultiplier: 1, bailBackground: false };
    case StepErrorType.BUDGET_EXCEEDED:
      return { retryable: false, maxRetries: 0, backoffMultiplier: 1, bailBackground: true };
    case StepErrorType.SCHEMA_INVALID:
      return { retryable: true, maxRetries: 2, backoffMultiplier: 1, bailBackground: false };
    case StepErrorType.JSON_PARSE:
      return { retryable: true, maxRetries: 2, backoffMultiplier: 1, bailBackground: false };
    case StepErrorType.TOOL_FAILURE:
      return { retryable: true, maxRetries: 2, backoffMultiplier: 1, bailBackground: false };
    case StepErrorType.CIRCUIT_BREAKER:
      return { retryable: true, maxRetries: 1, backoffMultiplier: 4, bailBackground: true };
    case StepErrorType.FATAL:
      return { retryable: false, maxRetries: 0, backoffMultiplier: 1, bailBackground: true };
  }
}

// ---------------------------------------------------------------------------
// 5. EventBatcher<T>
// ---------------------------------------------------------------------------

export interface EventBatcherOptions {
  /** Coalescing window in milliseconds (default 100) */
  windowMs?: number;
  /** Maximum events per batch before auto-flush (default 10) */
  maxBatchSize?: number;
}

/**
 * Batched event uploader with coalescing window and max-batch-size trigger.
 *
 * Claude-code reference: modelled after SerialBatchEventUploader — events
 * are enqueued individually but flushed in batches to reduce I/O overhead.
 * Only one flush is in-flight at a time; events arriving during a flush
 * accumulate into the next batch.
 *
 * @typeParam T Shape of a single event
 */
export class EventBatcher<T> {
  private pending: T[] = [];
  private flushing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushFn: (batch: T[]) => void;
  private readonly windowMs: number;
  private readonly maxBatchSize: number;
  private destroyed = false;

  constructor(flushFn: (batch: T[]) => void, opts?: EventBatcherOptions) {
    this.flushFn = flushFn;
    this.windowMs = opts?.windowMs ?? 100;
    this.maxBatchSize = opts?.maxBatchSize ?? 10;
  }

  /** Add an event to the current pending batch. */
  enqueue(event: T): void {
    if (this.destroyed) return;
    this.pending.push(event);

    if (this.pending.length >= this.maxBatchSize) {
      this.flush();
      return;
    }

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, this.windowMs);
    }
  }

  /** Immediately flush the current pending batch. */
  flush(): void {
    if (this.destroyed) return;

    this.clearTimer();

    if (this.pending.length === 0) return;

    // If a flush is already in-flight, skip — the pending array keeps
    // accumulating and will be picked up by the next flush.
    if (this.flushing) return;

    const batch = this.pending;
    this.pending = [];
    this.flushing = true;

    try {
      this.flushFn(batch);
    } finally {
      this.flushing = false;
    }

    // If new events arrived during flushFn execution, schedule another flush.
    if (this.pending.length > 0 && !this.destroyed) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, 0);
    }
  }

  /** Tear down — clears timers and discards pending events. */
  destroy(): void {
    this.destroyed = true;
    this.clearTimer();
    this.pending = [];
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// 6. FlushGate<T>
// ---------------------------------------------------------------------------

/**
 * Binary state gate for buffering items during a critical section.
 *
 * Claude-code reference: the CLI uses this pattern to queue user keystrokes
 * while a tool is executing, then replay them once control returns.
 *
 * - **Active** (started): `enqueue()` buffers items and returns `true`.
 * - **Inactive** (ended / not started): `enqueue()` returns `false` so the
 *   caller knows to handle the item immediately.
 *
 * @typeParam T Shape of a buffered item
 */
export class FlushGate<T> {
  private active = false;
  private buffer: T[] = [];

  /** Activate the gate — begin buffering. */
  start(): void {
    this.active = true;
    this.buffer = [];
  }

  /**
   * Deactivate the gate and return all buffered items.
   * The buffer is cleared after this call.
   */
  end(): T[] {
    this.active = false;
    const items = this.buffer;
    this.buffer = [];
    return items;
  }

  /**
   * Attempt to enqueue an item.
   * @returns `true` if the gate is active and the item was buffered,
   *          `false` if the gate is inactive (caller should handle immediately).
   */
  enqueue(item: T): boolean {
    if (!this.active) return false;
    this.buffer.push(item);
    return true;
  }

  /** Whether the gate is currently active (buffering). */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Discard all buffered items without deactivating the gate.
   * @returns The number of items discarded.
   */
  drop(): number {
    const count = this.buffer.length;
    this.buffer = [];
    return count;
  }
}

// ---------------------------------------------------------------------------
// 7. ActivityRingBuffer<T>
// ---------------------------------------------------------------------------

/**
 * Fixed-size circular buffer that evicts the oldest entry on overflow.
 *
 * Claude-code reference: the CLI keeps the last N tool results / activity
 * entries in a ring buffer to feed into the next prompt without unbounded
 * memory growth.
 *
 * @typeParam T Shape of a single activity entry
 */
export class ActivityRingBuffer<T> {
  private readonly capacity: number;
  private buf: T[];
  private head = 0;   // next write position
  private size = 0;

  constructor(capacity = 10) {
    this.capacity = Math.max(1, capacity);
    this.buf = new Array(this.capacity);
  }

  /** Add an item, evicting the oldest if at capacity. */
  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  /** Return all items in insertion order (oldest first). */
  items(): T[] {
    if (this.size === 0) return [];
    if (this.size < this.capacity) {
      return this.buf.slice(0, this.size);
    }
    // Buffer is full — head points to the oldest item
    return [...this.buf.slice(this.head), ...this.buf.slice(0, this.head)];
  }

  /** Remove all items. */
  clear(): void {
    this.buf = new Array(this.capacity);
    this.head = 0;
    this.size = 0;
  }

  /** Current number of items in the buffer. */
  get length(): number {
    return this.size;
  }
}

// ---------------------------------------------------------------------------
// 8. ContextCache<T>
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple TTL-based memoization cache.
 *
 * Claude-code reference: the CLI caches tool metadata, file contents, and
 * permission checks with a short TTL to avoid redundant I/O within a single
 * conversation turn while still respecting staleness.
 *
 * @typeParam T Type of cached values
 */
export class ContextCache<T> {
  private readonly ttlMs: number;
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  /** Retrieve a cached value, or `undefined` if missing / expired. */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /** Store a value with the configured TTL. */
  set(key: string, value: T): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Invalidate a specific key, or all keys if no argument is provided.
   */
  invalidate(key?: string): void {
    if (key !== undefined) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }
}
