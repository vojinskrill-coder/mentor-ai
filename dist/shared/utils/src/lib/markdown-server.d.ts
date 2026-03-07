/**
 * Server-side markdown rendering.
 * Mirrors the frontend renderMarkdown() from shared/ui/src/lib/pipes/markdown-config.ts
 * but uses isomorphic-dompurify for Node.js compatibility.
 */
/**
 * Render markdown to sanitized HTML on the server (Node.js).
 * Applies callout transforms and citation inline styling.
 */
export declare function renderMarkdownServer(value: string): string;
