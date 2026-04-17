/**
 * WizardCardStreamParser — detects and extracts structured wizard card
 * JSON from the AI agent's streamed text output in real-time.
 *
 * The process-builder agent outputs text like:
 *   "Here are the tools:\nWIZARD_CARD: {"type":"tool_select",...}\n"
 *
 * This parser buffers incoming text chunks, detects card markers,
 * extracts valid JSON, and emits:
 *   - onText(delta)  for regular text (forwarded immediately)
 *   - onCard(card)   for parsed wizard card objects
 *
 * Text before/after cards is forwarded normally. Card JSON is
 * swallowed (not forwarded as text) and emitted as structured data.
 */

/** All marker strings the parser recognises */
const CARD_MARKERS = ['WIZARD_CARD:', 'TOOL_SELECT:', 'OPERATION_SELECT:'] as const;

/** Longest marker length — used to decide how much trailing buffer to hold */
const MAX_MARKER_LEN = Math.max(...CARD_MARKERS.map((m) => m.length));

/** Hard cap on buffer size to prevent unbounded memory growth */
const MAX_BUFFER_SIZE = 64 * 1024;

export class WizardCardStreamParser {
  private buffer = '';
  private readonly onText: (delta: string) => void;
  private readonly onCard: (card: Record<string, unknown>) => void;

  constructor(
    onText: (delta: string) => void,
    onCard: (card: Record<string, unknown>) => void,
  ) {
    this.onText = onText;
    this.onCard = onCard;
  }

  /** Feed a new text chunk from the AI stream */
  push(chunk: string): void {
    this.buffer += chunk;
    this.drain();

    // Safety valve: if buffer exceeds max size (e.g. incomplete JSON
    // after a marker that never closes), force-flush to prevent DoS.
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.onText(this.buffer);
      this.buffer = '';
    }
  }

  /** Flush any remaining buffer as text (call on stream end) */
  flush(): void {
    if (!this.buffer) return;
    // Strip any partial card markers so they don't appear as garbage
    // in the chat (e.g. "WIZARD_CARD: {incomplete..." from a cut-off stream)
    const cleaned = this.buffer
      .replace(/(?:WIZARD_CARD|TOOL_SELECT|OPERATION_SELECT):\s*\{[^]*$/g, '')
      .replace(/(?:WIZARD_CARD|TOOL_SELECT|OPERATION_SELECT):\s*$/g, '');
    if (cleaned) {
      this.onText(cleaned);
    }
    this.buffer = '';
  }

  // ── Internal ──────────────────────────────────────────────────────

  private drain(): void {
    // Keep draining until no more complete cards are found
    while (true) {
      const found = this.tryExtractNextCard();
      if (!found) break;
    }

    // No complete card in buffer. Check if we should hold the tail.
    // Hold if:
    //   (a) buffer could be a partial marker prefix ("WIZARD_")
    //   (b) buffer contains a complete marker waiting for JSON to arrive
    if (this.shouldHoldBuffer()) {
      return;
    }

    // Small buffer that isn't marker-related — flush immediately
    if (this.buffer.length <= MAX_MARKER_LEN) {
      this.onText(this.buffer);
      this.buffer = '';
      return;
    }

    // Flush the safe prefix (everything except the last MAX_MARKER_LEN
    // chars which could be a partial marker start).
    const safeEnd = this.findSafeFlushEnd();
    if (safeEnd > 0) {
      this.onText(this.buffer.substring(0, safeEnd));
      this.buffer = this.buffer.substring(safeEnd);
    }
  }

  /**
   * Try to find and extract the first complete wizard card in the
   * buffer. Returns true if a card was extracted (buffer is mutated).
   */
  private tryExtractNextCard(): boolean {
    for (const marker of CARD_MARKERS) {
      const idx = this.buffer.indexOf(marker);
      if (idx === -1) continue;

      const afterMarker = this.buffer.substring(idx + marker.length);
      const jsonStart = afterMarker.indexOf('{');
      if (jsonStart === -1) continue; // No opening brace yet — keep buffering

      const jsonStr = this.extractBalancedJson(
        afterMarker.substring(jsonStart),
      );
      if (!jsonStr) continue; // Incomplete JSON — keep buffering

      try {
        const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
        const card = this.normalizeCard(marker, parsed);

        // Emit text that came before the marker (preserve whitespace
        // like newlines between cards — only skip truly empty strings)
        const textBefore = this.buffer.substring(0, idx);
        if (textBefore.length > 0) {
          this.onText(textBefore);
        }

        // Emit the card
        this.onCard(card);

        // Advance buffer past the consumed card + any trailing newline
        const consumedLen =
          idx + marker.length + jsonStart + jsonStr.length;
        this.buffer = this.buffer.substring(consumedLen).replace(/^\n/, '');
        return true;
      } catch {
        // JSON.parse failed despite balanced braces — malformed.
        // Flush everything up to and including the marker as text
        // so we don't get stuck in an infinite loop.
        const flushEnd = idx + marker.length;
        this.onText(this.buffer.substring(0, flushEnd));
        this.buffer = this.buffer.substring(flushEnd);
        return true; // buffer mutated, re-drain
      }
    }
    return false;
  }

  /**
   * Extract a balanced JSON object string starting at position 0.
   * Returns null if braces aren't balanced yet (incomplete stream).
   */
  private extractBalancedJson(str: string): string | null {
    if (str[0] !== '{') return null;
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) return str.substring(0, i + 1);
      }
    }
    return null; // Unbalanced — need more data
  }

  /**
   * Normalize legacy card formats to the unified WizardCard shape.
   */
  private normalizeCard(
    marker: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    if (marker === 'WIZARD_CARD:') {
      return data; // Already in unified format
    }

    if (marker === 'TOOL_SELECT:') {
      return {
        type: 'tool_select',
        title: (data.title as string) || 'Select a tool',
        purpose: (data.purpose as string) || '',
        tools: data.tools || [],
      };
    }

    if (marker === 'OPERATION_SELECT:') {
      return {
        type: 'operation_select',
        title: (data.title as string) || 'Select operations',
        toolSlug: (data.toolSlug as string) || '',
        operations: data.operations || [],
        selected: [],
      };
    }

    return data;
  }

  /**
   * Determine if the buffer should be held (not flushed) because it
   * contains a marker or partial marker waiting for more data.
   *
   * Cases:
   *  - Buffer is a partial marker prefix: "WIZARD_" → hold
   *  - Buffer contains a full marker but JSON hasn't started: "WIZARD_CARD: " → hold
   *  - Buffer contains a marker + incomplete JSON: "WIZARD_CARD: {..." → hold
   */
  private shouldHoldBuffer(): boolean {
    // (a) Could be a partial marker prefix
    if (CARD_MARKERS.some((m) => m.startsWith(this.buffer))) {
      return true;
    }
    // (b) Contains a full marker — waiting for JSON to arrive or complete
    if (CARD_MARKERS.some((m) => this.buffer.includes(m))) {
      return true;
    }
    return false;
  }

  /**
   * Find the safe end index to flush as text — everything before a
   * potential partial marker at the tail of the buffer.
   */
  private findSafeFlushEnd(): number {
    let safe = this.buffer.length;
    for (const marker of CARD_MARKERS) {
      // Check if the buffer ends with any prefix of this marker
      for (let prefixLen = 1; prefixLen < marker.length; prefixLen++) {
        const prefix = marker.substring(0, prefixLen);
        if (this.buffer.endsWith(prefix)) {
          safe = Math.min(safe, this.buffer.length - prefixLen);
        }
      }
    }
    return safe;
  }
}
