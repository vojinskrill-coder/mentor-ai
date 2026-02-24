import { Pipe, PipeTransform } from '@angular/core';
import { initMarked, renderMarkdown } from './markdown-config';

// Initialize marked with shared config at module load
initMarked();

/**
 * Shared Markdown rendering pipe.
 * Converts Markdown text to sanitized HTML using `marked` + `DOMPurify`.
 * Use with [innerHTML]: `<div [innerHTML]="text | markdown"></div>`
 *
 * Parent component must include Obsidian-style CSS for rendered elements.
 */
@Pipe({
  name: 'markdown',
  standalone: true,
  pure: true,
})
export class MarkdownPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    return renderMarkdown(value);
  }
}
