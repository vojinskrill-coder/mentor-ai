import { WizardCardStreamParser } from './wizard-card-stream-parser';

describe('WizardCardStreamParser', () => {
  let onText: jest.Mock;
  let onCard: jest.Mock;
  let parser: WizardCardStreamParser;

  beforeEach(() => {
    onText = jest.fn();
    onCard = jest.fn();
    parser = new WizardCardStreamParser(onText, onCard);
  });

  /** Collect all text deltas into one string */
  const allText = () => onText.mock.calls.map((c) => c[0]).join('');

  // ── Happy path ──────────────────────────────────────────────────

  describe('happy path', () => {
    it('1.1 — single card in one chunk', () => {
      parser.push('Here are tools:\nWIZARD_CARD: {"type":"tool_select","title":"Pick"}\nDone.');
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(1);
      expect(onCard).toHaveBeenCalledWith({ type: 'tool_select', title: 'Pick' });
      expect(allText()).toContain('Here are tools:');
      expect(allText()).toContain('Done.');
      expect(allText()).not.toContain('WIZARD_CARD');
    });

    it('1.8 — pure text passthrough (no cards)', () => {
      parser.push('Hello ');
      parser.push('world! This is a longer text to exceed the marker length threshold.');
      parser.flush();

      expect(onCard).not.toHaveBeenCalled();
      expect(allText()).toContain('Hello');
      expect(allText()).toContain('world!');
    });

    it('1.9 — empty chunks are harmless', () => {
      parser.push('');
      parser.push('');
      parser.push('hi');
      parser.flush();

      expect(onCard).not.toHaveBeenCalled();
      expect(allText()).toBe('hi');
    });

    it('1.10 — card at very start of stream', () => {
      parser.push('WIZARD_CARD: {"type":"confirm","title":"Go"}\nText after');
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(1);
      expect(onCard).toHaveBeenCalledWith({ type: 'confirm', title: 'Go' });
      expect(allText()).toContain('Text after');
      expect(allText()).not.toContain('WIZARD_CARD');
    });

    it('1.11 — card at very end of stream', () => {
      parser.push('Some text\nWIZARD_CARD: {"type":"confirm","title":"End"}');
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(1);
      expect(allText()).toContain('Some text');
    });
  });

  // ── Chunked delivery ───────────────────────────────────────────

  describe('chunked delivery', () => {
    it('1.2 — marker split across chunks', () => {
      // "WIZARD_" is a partial marker prefix — held by couldBePartialMarker
      parser.push('WIZARD_');
      expect(onText).not.toHaveBeenCalled(); // held

      parser.push('CARD: {"type":"confirm","title":"OK"}\n');
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(1);
      expect(onCard).toHaveBeenCalledWith({ type: 'confirm', title: 'OK' });
    });

    it('1.3 — JSON split across chunks', () => {
      parser.push('WIZARD_CARD: {"type":"tool_se');
      parser.push('lect","title":"Pick"}\n');
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(1);
      expect(onCard).toHaveBeenCalledWith({ type: 'tool_select', title: 'Pick' });
    });

    it('marker arriving one character at a time', () => {
      // When delivered char-by-char, each partial prefix of "WIZARD_CARD:"
      // is held by couldBePartialMarker. Once the full marker + JSON arrives
      // and braces balance, the card is emitted.
      const full = 'WIZARD_CARD: {"type":"confirm","title":"X"}\nDone';
      for (const ch of full) {
        parser.push(ch);
      }
      parser.flush();

      // The card should have been extracted at some point
      expect(onCard).toHaveBeenCalledTimes(1);
      expect(onCard).toHaveBeenCalledWith({ type: 'confirm', title: 'X' });
    });
  });

  // ── Multiple cards ─────────────────────────────────────────────

  describe('multiple cards', () => {
    it('1.4 — two cards in one push', () => {
      parser.push(
        'WIZARD_CARD: {"type":"a"}\nWIZARD_CARD: {"type":"b"}\n',
      );
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(2);
      expect(onCard).toHaveBeenNthCalledWith(1, { type: 'a' });
      expect(onCard).toHaveBeenNthCalledWith(2, { type: 'b' });
    });

    it('three cards with text between', () => {
      parser.push('Intro\nWIZARD_CARD: {"type":"a"}\nMiddle\nWIZARD_CARD: {"type":"b"}\nEnd\nWIZARD_CARD: {"type":"c"}\nDone');
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(3);
      expect(allText()).toContain('Intro');
      expect(allText()).toContain('Middle');
      expect(allText()).toContain('End');
      expect(allText()).toContain('Done');
    });
  });

  // ── Complex JSON ───────────────────────────────────────────────

  describe('complex JSON', () => {
    it('1.5 — nested objects and arrays', () => {
      const card = {
        type: 'tool_select',
        tools: [{ slug: 'apollo', meta: { verified: true, ops: [1, 2] } }],
      };
      parser.push(`WIZARD_CARD: ${JSON.stringify(card)}\n`);
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(1);
      expect(onCard).toHaveBeenCalledWith(card);
    });

    it('1.6 — escaped quotes in strings', () => {
      const json = '{"title":"He said \\"hello\\"","type":"confirm"}';
      parser.push(`WIZARD_CARD: ${json}\n`);
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(1);
      expect(onCard.mock.calls[0][0].title).toBe('He said "hello"');
    });

    it('1.14 — large card JSON (100 tools)', () => {
      const tools = Array.from({ length: 100 }, (_, i) => ({
        slug: `tool-${i}`,
        displayName: 'A'.repeat(50),
      }));
      const card = { type: 'tool_select', tools };
      parser.push(`WIZARD_CARD: ${JSON.stringify(card)}\n`);
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(1);
      expect((onCard.mock.calls[0][0] as { tools: unknown[] }).tools).toHaveLength(100);
    });

    it('JSON with braces inside string values', () => {
      const json = '{"type":"confirm","summary":"Use {braces} and {more}"}';
      parser.push(`WIZARD_CARD: ${json}\n`);
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(1);
      expect(onCard.mock.calls[0][0].summary).toBe('Use {braces} and {more}');
    });
  });

  // ── Error handling ─────────────────────────────────────────────

  describe('error handling', () => {
    it('1.7 — malformed JSON after marker degrades gracefully', () => {
      parser.push('WIZARD_CARD: {not valid json}\nMore text');
      parser.flush();

      expect(onCard).not.toHaveBeenCalled();
      // Malformed content should flow through as text, not hang
      expect(allText()).toContain('More text');
    });

    it('1.15 — buffer cap prevents unbounded growth', () => {
      // Push a marker with an opening brace but no closing brace,
      // followed by >64KB of data
      parser.push('WIZARD_CARD: {' + 'x'.repeat(70_000));
      parser.flush();

      // Parser should have force-flushed — no card emitted
      expect(onCard).not.toHaveBeenCalled();
      // All text should have been emitted (not stuck in buffer)
      expect(allText().length).toBeGreaterThan(60_000);
    });

    it('flush strips partial card markers', () => {
      // Simulate: text arrives, then a marker with incomplete JSON, then stream dies
      parser.push('Some text before the card\nWIZARD_CARD: {"type":"tool_');
      // Stream ends abruptly — flush remaining buffer
      parser.flush();

      expect(onCard).not.toHaveBeenCalled();
      // The text before the marker should be emitted
      expect(allText()).toContain('Some text before the card');
    });
  });

  // ── Legacy markers ─────────────────────────────────────────────

  describe('legacy markers', () => {
    it('1.12 — TOOL_SELECT normalization', () => {
      parser.push(
        'TOOL_SELECT: {"title":"Pick a tool","tools":[{"slug":"apollo"}]}\n',
      );
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(1);
      expect(onCard).toHaveBeenCalledWith({
        type: 'tool_select',
        title: 'Pick a tool',
        purpose: '',
        tools: [{ slug: 'apollo' }],
      });
    });

    it('1.13 — OPERATION_SELECT normalization', () => {
      parser.push(
        'OPERATION_SELECT: {"toolSlug":"apollo","operations":[{"id":"search"}]}\n',
      );
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(1);
      expect(onCard).toHaveBeenCalledWith({
        type: 'operation_select',
        title: 'Select operations',
        toolSlug: 'apollo',
        operations: [{ id: 'search' }],
        selected: [],
      });
    });

    it('mixed legacy and unified markers', () => {
      parser.push('TOOL_SELECT: {"title":"Pick","tools":[{"slug":"x"}]}\n');
      parser.push('WIZARD_CARD: {"type":"confirm","title":"Go"}\n');
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(2);
      expect(onCard.mock.calls[0][0].type).toBe('tool_select');
      expect(onCard.mock.calls[1][0].type).toBe('confirm');
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────

  describe('edge cases', () => {
    it('3.6 — WIZARD_CARD: inside a JSON string value is safe', () => {
      const json = '{"type":"confirm","summary":"Use WIZARD_CARD: format for cards"}';
      parser.push(`WIZARD_CARD: ${json}\n`);
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(1);
      expect(onCard.mock.calls[0][0].summary).toBe(
        'Use WIZARD_CARD: format for cards',
      );
    });

    it('whitespace between marker and JSON', () => {
      parser.push('WIZARD_CARD:   {"type":"confirm","title":"Go"}\n');
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(1);
    });

    it('small non-marker text flushes immediately (no stuttering)', () => {
      parser.push('Hello');
      // "Hello" cannot be a partial marker prefix — should flush
      expect(onText).toHaveBeenCalledWith('Hello');
    });

    it('partial marker prefix is held', () => {
      parser.push('WIZARD_');
      // "WIZARD_" is a prefix of "WIZARD_CARD:" — should be held
      expect(onText).not.toHaveBeenCalled();
      expect(onCard).not.toHaveBeenCalled();

      // Complete with non-marker text
      parser.push('stuff that is not a card marker');
      parser.flush();
      // Should have flushed everything as text
      expect(onCard).not.toHaveBeenCalled();
      expect(allText()).toContain('WIZARD_stuff');
    });

    it('only one trailing newline consumed after card', () => {
      parser.push('WIZARD_CARD: {"type":"a"}\n\nNext paragraph');
      parser.flush();

      expect(onCard).toHaveBeenCalledTimes(1);
      // One \n consumed by the parser, second \n preserved in text
      expect(allText()).toContain('\nNext paragraph');
    });
  });
});
