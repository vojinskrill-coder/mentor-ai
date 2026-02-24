/**
 * Shared Markdown + DOMPurify configuration (Story 3.3).
 *
 * Single source of truth for:
 * - marked renderer options (GFM, breaks, target="_blank" links)
 * - DOMPurify sanitization whitelist
 *
 * Used by both MarkdownPipe and ConceptCitationComponent.
 */

import { marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked renderer: all links open in new tab
const renderer = new marked.Renderer();
const originalLinkRenderer = renderer.link.bind(renderer);
renderer.link = (token: Tokens.Link) => {
  const html = originalLinkRenderer(token);
  return html.replace('<a ', '<a target="_blank" rel="noopener noreferrer" ');
};

/** Shared marked options — GFM + line breaks + target="_blank" links */
export const MARKED_OPTIONS = {
  gfm: true,
  breaks: true,
  renderer,
} as const;

/** Strict DOMPurify config — explicit tag whitelist + target/rel on links */
export const PURIFY_CONFIG = {
  ADD_ATTR: ['target', 'rel', 'class'],
  ALLOWED_TAGS: [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'br',
    'hr',
    'strong',
    'em',
    'del',
    's',
    'ul',
    'ol',
    'li',
    'a',
    'code',
    'pre',
    'blockquote',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'span',
    'div',
    'img',
  ],
};

/**
 * Initialize marked with shared options.
 * Call once at module load time.
 */
export function initMarked(): void {
  marked.setOptions(MARKED_OPTIONS);
}

/**
 * Render markdown to sanitized HTML.
 * Convenience function wrapping marked.parse + DOMPurify.sanitize.
 */
export function renderMarkdown(value: string): string {
  const html = marked.parse(value, { async: false }) as string;
  return DOMPurify.sanitize(html, PURIFY_CONFIG) as string;
}
