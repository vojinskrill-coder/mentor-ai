import { MarkdownPipe } from './markdown.pipe';

describe('MarkdownPipe', () => {
  let pipe: MarkdownPipe;

  beforeEach(() => {
    pipe = new MarkdownPipe();
  });

  describe('transform', () => {
    it('should return empty string for null input', () => {
      expect(pipe.transform(null)).toBe('');
    });

    it('should return empty string for undefined input', () => {
      expect(pipe.transform(undefined)).toBe('');
    });

    it('should return empty string for empty string input', () => {
      expect(pipe.transform('')).toBe('');
    });

    it('should render bold text', () => {
      const result = pipe.transform('**bold text**');
      expect(result).toContain('<strong>bold text</strong>');
    });

    it('should render italic text', () => {
      const result = pipe.transform('*italic text*');
      expect(result).toContain('<em>italic text</em>');
    });

    it('should render headings', () => {
      const result = pipe.transform('# Heading 1');
      expect(result).toContain('<h1>Heading 1</h1>');
    });

    it('should render nested bold and italic', () => {
      const result = pipe.transform('**bold _and italic_**');
      expect(result).toContain('<strong>');
      expect(result).toContain('<em>');
    });

    it('should render unordered lists', () => {
      const result = pipe.transform('- item 1\n- item 2');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>');
    });

    it('should render ordered lists', () => {
      const result = pipe.transform('1. first\n2. second');
      expect(result).toContain('<ol>');
      expect(result).toContain('<li>');
    });

    it('should render inline code', () => {
      const result = pipe.transform('use `console.log()`');
      expect(result).toContain('<code>console.log()</code>');
    });

    it('should render fenced code blocks', () => {
      const result = pipe.transform('```\nconst x = 1;\n```');
      expect(result).toContain('<pre>');
      expect(result).toContain('<code>');
    });

    it('should render blockquotes', () => {
      const result = pipe.transform('> This is a quote');
      expect(result).toContain('<blockquote>');
    });

    it('should render strikethrough', () => {
      const result = pipe.transform('~~deleted~~');
      expect(result).toContain('<del>deleted</del>');
    });

    it('should render links with target="_blank"', () => {
      const result = pipe.transform('[Google](https://google.com)');
      expect(result).toContain('target="_blank"');
      expect(result).toContain('rel="noopener noreferrer"');
      expect(result).toContain('href="https://google.com"');
    });

    it('should sanitize XSS in script tags', () => {
      const result = pipe.transform('<script>alert("xss")</script>');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
    });

    it('should sanitize XSS in event handlers', () => {
      const result = pipe.transform('<img src=x onerror=alert(1)>');
      expect(result).not.toContain('onerror');
    });

    it('should sanitize javascript: URLs in links', () => {
      const result = pipe.transform('[click](javascript:alert(1))');
      expect(result).not.toContain('javascript:');
    });

    it('should render tables', () => {
      const md = '| Col 1 | Col 2 |\n|-------|-------|\n| A | B |';
      const result = pipe.transform(md);
      expect(result).toContain('<table>');
      expect(result).toContain('<th>');
      expect(result).toContain('<td>');
    });

    it('should render horizontal rules', () => {
      const result = pipe.transform('---');
      expect(result).toContain('<hr');
    });
  });
});
