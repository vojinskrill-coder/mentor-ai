/**
 * Server-side markdown rendering.
 * Mirrors the frontend renderMarkdown() from shared/ui/src/lib/pipes/markdown-config.ts
 * but uses isomorphic-dompurify for Node.js compatibility.
 */

import { marked, type Tokens } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import { applyCalloutTransforms, applyCitationTransforms } from './callout-transform';

const PURIFY_CONFIG = {
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

let initialized = false;

function ensureInitialized(): void {
  if (initialized) return;
  const renderer = new marked.Renderer();
  const originalLinkRenderer = renderer.link.bind(renderer);
  renderer.link = (token: Tokens.Link) => {
    const html = originalLinkRenderer(token);
    return html.replace('<a ', '<a target="_blank" rel="noopener noreferrer" ');
  };
  marked.setOptions({ gfm: true, breaks: true, renderer });
  initialized = true;
}

/**
 * Render markdown to sanitized HTML on the server (Node.js).
 * Applies callout transforms and citation inline styling.
 */
export function renderMarkdownServer(value: string): string {
  if (!value) return '';
  ensureInitialized();
  const rawHtml = marked.parse(value, { async: false }) as string;
  const withCallouts = applyCalloutTransforms(rawHtml);
  const withCitations = applyCitationTransforms(withCallouts);
  return DOMPurify.sanitize(withCitations, PURIFY_CONFIG) as string;
}
