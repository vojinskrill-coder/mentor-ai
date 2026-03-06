/**
 * Light-theme CSS for PDF rendering.
 * Derived from the dark-theme .ai-content CSS in conversation-notes.component.ts.
 */
export const PDF_LIGHT_THEME_CSS = `
  @page {
    size: A4;
    margin: 25mm 20mm 25mm 20mm;
  }

  * { box-sizing: border-box; }

  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #343a40;
    background: #ffffff;
    margin: 0;
    padding: 0;
  }

  /* ── Cover Page ── */
  .cover-page {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    text-align: center;
    page-break-after: always;
  }
  .cover-title {
    font-size: 28pt;
    font-weight: 700;
    color: #212529;
    margin-bottom: 16px;
  }
  .cover-subtitle {
    font-size: 14pt;
    color: #6c757d;
    margin-bottom: 8px;
  }
  .cover-date {
    font-size: 11pt;
    color: #adb5bd;
    margin-top: 32px;
  }

  /* ── Table of Contents ── */
  .toc {
    page-break-after: always;
  }
  .toc h2 {
    font-size: 18pt;
    font-weight: 700;
    color: #212529;
    margin-bottom: 20px;
    border-bottom: 2px solid #dee2e6;
    padding-bottom: 8px;
  }
  .toc-item {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px dotted #dee2e6;
    font-size: 11pt;
    color: #212529;
  }

  /* ── Report Section ── */
  .report-section + .report-section {
    page-break-before: always;
  }
  .report-header {
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 2px solid #dee2e6;
  }
  .report-title {
    font-size: 16pt;
    font-weight: 700;
    color: #212529;
    margin: 0 0 4px 0;
  }
  .report-meta {
    font-size: 9pt;
    color: #6c757d;
  }
  .report-score {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 10pt;
    font-weight: 600;
    margin-left: 8px;
  }
  .report-score.high   { background: #d4edda; color: #155724; }
  .report-score.medium { background: #fff3cd; color: #856404; }
  .report-score.low    { background: #f8d7da; color: #721c24; }

  /* ── Markdown Content (light theme) ── */
  .report-content {
    font-size: 11pt;
    line-height: 1.65;
    color: #343a40;
    word-break: break-word;
  }
  .report-content > :first-child { margin-top: 0 !important; }
  .report-content > :last-child  { margin-bottom: 0 !important; }

  .report-content h1 {
    font-size: 1.35em; font-weight: 700; color: #212529;
    margin: 16px 0 6px; padding-bottom: 4px;
    border-bottom: 1px solid #dee2e6;
  }
  .report-content h2 {
    font-size: 1.2em; font-weight: 600; color: #212529;
    margin: 14px 0 5px; padding-bottom: 3px;
    border-bottom: 1px solid rgba(222,226,230,0.5);
  }
  .report-content h3 {
    font-size: 1.1em; font-weight: 600; color: #343a40;
    margin: 12px 0 4px;
  }
  .report-content h4,
  .report-content h5,
  .report-content h6 {
    font-size: 1em; font-weight: 600; color: #495057;
    margin: 10px 0 3px;
  }

  .report-content p { margin: 8px 0; line-height: 1.65; }
  .report-content strong { color: #212529; font-weight: 600; }
  .report-content em { color: #495057; font-style: italic; }

  .report-content ul, .report-content ol {
    margin: 6px 0; padding-left: 1.5em; list-style-position: outside;
  }
  .report-content ul { list-style-type: disc; }
  .report-content ol { list-style-type: decimal; }
  .report-content li { margin: 3px 0; line-height: 1.65; color: #343a40; }
  .report-content li::marker { color: #6c757d; }
  .report-content li > ul,
  .report-content li > ol { margin: 3px 0; }
  .report-content li > p { margin: 3px 0; }
  .report-content ul ul { list-style-type: circle; }
  .report-content ul ul ul { list-style-type: square; }

  .report-content table {
    width: 100%; border-collapse: collapse; margin: 10px 0;
    font-size: 0.9em; border: 1px solid #dee2e6;
    page-break-inside: avoid;
  }
  .report-content thead th {
    background: #f8f9fa; color: #212529; font-weight: 600;
    text-align: left; padding: 7px 10px;
    border-bottom: 2px solid #adb5bd;
  }
  .report-content tbody td {
    padding: 7px 10px; border-bottom: 1px solid #e9ecef; color: #495057;
  }
  .report-content tbody tr:nth-child(even) { background: #f8f9fa; }

  .report-content code {
    background: rgba(0,0,0,0.06); color: #495057;
    padding: 0.1em 0.35em; border-radius: 3px;
    font-family: 'Consolas', 'Fira Code', monospace;
    font-size: 0.875em;
  }
  .report-content pre {
    background: #f1f3f5; border: 1px solid #dee2e6;
    border-radius: 6px; padding: 10px 14px;
    overflow-x: auto; margin: 10px 0;
    page-break-inside: avoid;
  }
  .report-content pre code {
    background: none; padding: 0; font-size: 0.85em; line-height: 1.5;
  }

  .report-content blockquote {
    border-left: 3px solid #2563eb; margin: 10px 0; padding: 6px 12px;
    color: #6c757d; background: rgba(37,99,235,0.04);
    border-radius: 0 6px 6px 0;
  }
  .report-content blockquote p { margin: 3px 0; }

  /* Callout boxes */
  .report-content blockquote.callout { padding: 12px 16px; }
  .report-content .callout-insight {
    border-left-color: #2563eb; background: rgba(37,99,235,0.06);
  }
  .report-content .callout-insight strong { color: #2563eb; }
  .report-content .callout-warning {
    border-left-color: #d97706; background: rgba(217,119,6,0.06);
  }
  .report-content .callout-warning strong { color: #d97706; }
  .report-content .callout-metric {
    border-left-color: #059669; background: rgba(5,150,105,0.06);
  }
  .report-content .callout-metric strong { color: #059669; }
  .report-content .callout-summary {
    border-left-color: #7c3aed; background: rgba(124,58,237,0.06);
  }
  .report-content .callout-summary strong { color: #7c3aed; }

  /* Citation inline badges */
  .citation-inline {
    display: inline;
    padding: 1px 6px;
    font-size: 0.85em;
    font-weight: 500;
    border-radius: 3px;
    background: rgba(37,99,235,0.08);
    border: 1px solid rgba(37,99,235,0.2);
    color: #2563eb;
  }

  .report-content a { color: #2563eb; text-decoration: none; }
  .report-content hr { border: none; border-top: 1px solid #dee2e6; margin: 14px 0; }
  .report-content del { color: #6c757d; text-decoration: line-through; }

  /* Workflow step sub-section */
  .step-section {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px dashed #dee2e6;
  }
  .step-section h3 {
    font-size: 1.05em;
    font-weight: 600;
    color: #495057;
    margin: 0 0 8px 0;
  }

  /* AI Feedback box */
  .feedback-box {
    margin-top: 12px;
    padding: 10px 14px;
    background: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #dee2e6;
  }
  .feedback-box .feedback-label {
    font-size: 0.9em;
    font-weight: 600;
    color: #6c757d;
    margin-bottom: 6px;
  }
`;
