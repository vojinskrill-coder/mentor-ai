import type { NoteItem } from '@mentor-ai/shared/types';
import { renderMarkdownServer } from '@mentor-ai/shared/utils/server';
import { PDF_LIGHT_THEME_CSS } from './pdf-light-theme';

export interface PdfBuildOptions {
  notes: NoteItem[];
  tenantName?: string;
  userName?: string;
  exportDate: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getScoreClass(score: number): string {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

export function buildPdfHtml(options: PdfBuildOptions): string {
  const { notes, tenantName, userName, exportDate } = options;

  // Cover page
  const coverHtml = `
    <div class="cover-page">
      <div class="cover-title">${escapeHtml(tenantName ?? 'Mentor AI')}</div>
      <div class="cover-subtitle">Izveštaj o obavljenim zadacima</div>
      ${userName ? `<div class="cover-subtitle">${escapeHtml(userName)}</div>` : ''}
      <div class="cover-date">${escapeHtml(exportDate)}</div>
    </div>
  `;

  // Table of contents (only for multi-report PDFs)
  let tocHtml = '';
  if (notes.length > 1) {
    const tocItems = notes
      .map((note, i) => `<div class="toc-item">${i + 1}. ${escapeHtml(note.title)}</div>`)
      .join('\n');
    tocHtml = `
      <div class="toc">
        <h2>Sadržaj</h2>
        ${tocItems}
      </div>
    `;
  }

  // Report sections
  const reportsHtml = notes
    .map((note) => {
      const scoreHtml =
        note.aiScore != null
          ? `<span class="report-score ${getScoreClass(note.aiScore)}">${note.aiScore}/100</span>`
          : '';

      const reportContent = note.userReport ?? note.content ?? '';
      const renderedHtml = renderMarkdownServer(reportContent);

      // Workflow step children
      let childrenHtml = '';
      if (note.children && note.children.length > 0) {
        childrenHtml = note.children
          .map((child, idx) => {
            const childContent = child.userReport ?? child.content ?? '';
            if (!childContent) return '';
            return `
              <div class="step-section">
                <h3>Step ${idx + 1}: ${escapeHtml(child.title)}</h3>
                <div class="report-content">${renderMarkdownServer(childContent)}</div>
              </div>
            `;
          })
          .join('\n');
      }

      // AI Feedback
      const feedbackHtml = note.aiFeedback
        ? `<div class="feedback-box">
             <div class="feedback-label">AI Povratna informacija:</div>
             <div class="report-content">${renderMarkdownServer(note.aiFeedback)}</div>
           </div>`
        : '';

      const dateStr = new Date(note.createdAt).toLocaleDateString('en-US');
      const metaParts = [`Date: ${dateStr}`];
      if (note.expectedOutcome) {
        metaParts.push(`Expected outcome: ${escapeHtml(note.expectedOutcome)}`);
      }

      return `
        <div class="report-section">
          <div class="report-header">
            <div class="report-title">${escapeHtml(note.title)} ${scoreHtml}</div>
            <div class="report-meta">${metaParts.join(' | ')}</div>
          </div>
          <div class="report-content">
            ${renderedHtml}
          </div>
          ${childrenHtml}
          ${feedbackHtml}
        </div>
      `;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="sr">
<head>
  <meta charset="UTF-8">
  <style>${PDF_LIGHT_THEME_CSS}</style>
</head>
<body>
  ${coverHtml}
  ${tocHtml}
  ${reportsHtml}
</body>
</html>`;
}
