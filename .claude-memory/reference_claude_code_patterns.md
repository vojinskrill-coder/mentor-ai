---
name: Claude Code Architecture Patterns for Neuron OS
description: Production patterns from Anthropic's Claude Code CLI applicable to OpenClaw agent orchestration, streaming, error recovery, and n8n integration
type: reference
---

## Source: github.com/tanbiralam/claude-code (Anthropic Claude Code CLI source)

## Key Patterns to Implement

### 1. Async Generator Agentic Loop (query.ts)
- `while(true)` loop with `state = next; continue` pattern (NOT recursion)
- Each iteration: pre-process → LLM call → tool execution → error recovery → continuation decision
- `submitMessage()` is AsyncGenerator<SDKMessage> — yields events as they happen
- Budget gates checked AFTER each yield (maxTurns, maxBudgetUsd)
- StreamingToolExecutor starts tools in parallel WHILE LLM still streams

### 2. 5-Layer Error Recovery (query.ts)
1. Context Collapse Drain (commit staged collapses, retry)
2. Reactive Compact (full message summarization)
3. Max Output Tokens Escalation (8k → 64k on first hit)
4. Max Output Tokens Recovery (3 retries with "Resume directly" nudge)
5. Stop Hook Blocking (append hook errors as messages for next turn)

### 3. withRetry as Async Generator (withRetry.ts)
- `async function* withRetry<T>()` — yields error messages for UI while retrying
- 529 (overloaded): MAX_529_RETRIES = 3, background operations bail immediately
- Persistent retry mode: 5min max backoff, 6hr reset cap, 30s heartbeat yields
- Server-driven backoff via `Retry-After` header parsing

### 4. SSE Resumption (SSETransport.ts)
- `lastSequenceNum` sent as `from_sequence_num` on reconnect
- `seenSequenceNums` Set (pruned >1000, keeps within 200 of high-water)
- Liveness: 45s timeout, server keepalive every 15s
- Reconnect: exponential backoff (1s base, 30s max, ±25% jitter, 10min budget)
- Permanent failures: 401/403/404 → immediate close

### 5. Split Read/Write Transport (HybridTransport.ts)
- WebSocket for reads (low latency), HTTP POST for writes (guaranteed ordering)
- SerialBatchEventUploader: max 1 POST in-flight, coalescing pending slot
- 100ms stream event buffer before POST
- Backpressure: callers await when queue >100K items

### 6. WorkerStateUploader Coalescing
- 1 inflight + 1 pending slot (never grows beyond)
- Top-level keys: last value wins
- Metadata: RFC 7396 merge one level deep, null preserved for server-side delete
- Failed batches re-queued at front

### 7. Context Assembly (context.ts)
- `memoize()` + `.cache.clear()` on compaction (no TTL — lifetime is conversation)
- Layered: system context (git) + user context (CLAUDE.md) + tools + conversation
- `--bare` mode skips auto-discovery but honors explicit `--add-dir`

### 8. 3-Tier Compaction (compact.ts)
- Tier 1: Session memory compaction (cheapest)
- Tier 2: Reactive compact (feature-gated)
- Tier 3: Microcompaction pre-pass + LLM summarization
- PTL retry loop: drop 20% oldest messages, retry up to 3x
- Post-compact: re-inject plan, re-read 5 files, re-inject skills (25K budget)

### 9. State Management (bootstrap/state.ts)
- Module singleton `let STATE = getInitialState()` + 100+ getter/setter exports
- Compound setters (switchSession) + createSignal pub/sub
- Sticky-on latches for prompt cache preservation
- Turn-level accumulators reset between turns

### 10. FlushGate (flushGate.ts)
- Binary state machine: active (queue) vs inactive (passthrough)
- Gates writes during initial session flush / transport rebuild
- Methods: start(), end() → returns buffered items, enqueue(), drop(), deactivate()

### 11. Token Budget Tracking (tokenBudget.ts)
- Continue if under 90% budget AND not diminishing
- Diminishing = 3+ continuations with <500 token deltas
- Sub-agents always stop immediately (budgets main thread only)

## Mapping to Our Code
- openclaw-client.service.ts: Has streaming callbacks (onText, onTool, onStatus) but ProcessExecutor passes undefined — QUICK WIN
- process-executor.service.ts: Sequential blocking, no generator pattern
- loadBusinessContext(): Called fresh every run, no caching
- Error handling: String-based, no structured taxonomy
- No conversation compaction exists
- State drift risk: currentStepOrder updated BEFORE step execution
