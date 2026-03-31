import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import * as fs from 'fs';
import * as path from 'path';

interface PageSpec {
  pageNumber: number;
  layoutType: string;
  components: Array<{
    slotName: string;
    type: 'text' | 'image';
    x: number;
    y: number;
    w: number;
    h: number;
    fontRole?: string;
    content?: string;
    imageUrl?: string;
  }>;
}

interface BrandTokens {
  colors: Record<string, { hex: string }>;
  typography: Array<{ role: string; fontFamily: string; fontWeight: number; fontSize: number; lineHeight?: number; letterSpacing?: number; color?: string; italic?: boolean; textTransform?: string }>;
  tokensCss: string;
}

@Injectable()
export class BrochureRendererService {
  private readonly logger = new Logger(BrochureRendererService.name);

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Generate complete HTML document for a brochure from pages + brand profile
   */
  async renderHtml(
    pages: PageSpec[],
    brandProfileId: string,
  ): Promise<string> {
    const profile = await this.prisma.brandDesignProfile.findUnique({
      where: { id: brandProfileId },
    });

    if (!profile) throw new Error(`Brand profile not found: ${brandProfileId}`);

    const tokens = {
      colors: profile.colors as any,
      typography: profile.typography as any,
      tokensCss: profile.tokensCss ?? '',
    };

    const pagesHtml = pages.map(page => this.renderPage(page, tokens)).join('\n');

    return `<!DOCTYPE html>
<html lang="sr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&display=swap" rel="stylesheet">
  <style>
    ${tokens.tokensCss}

    @page { size: A4 landscape; margin: 0; }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-body, 'Montserrat', sans-serif);
      background: var(--color-background, #0D0D0D);
      color: var(--color-text-body, #B0B0B0);
    }

    .brochure-page {
      width: 297mm;
      height: 210mm;
      position: relative;
      overflow: hidden;
      background: var(--color-background, #0D0D0D);
      page-break-after: always;
    }

    .slot {
      position: absolute;
      overflow: hidden;
    }

    .slot-text {
      padding: 2mm;
    }

    .slot-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .slot-image {
      background: var(--color-surface-dark, #1A1A1A);
    }

    /* Typography roles */
    .font-h1 {
      font-family: var(--font-heading, 'Playfair Display', serif);
      font-size: var(--font-size-h1, 42px);
      font-weight: var(--font-weight-h1, 400);
      color: var(--color-primary, #C9A96E);
      font-style: italic;
      text-transform: uppercase;
      letter-spacing: 3px;
      line-height: 1.15;
    }

    .font-h2 {
      font-family: var(--font-heading, 'Playfair Display', serif);
      font-size: var(--font-size-h2, 28px);
      color: var(--color-text-primary, #FFFFFF);
      font-style: italic;
      line-height: 1.2;
    }

    .font-subtitle {
      font-family: var(--font-body, 'Montserrat', sans-serif);
      font-size: var(--font-size-subtitle, 16px);
      font-weight: 300;
      color: var(--color-text-primary, #FFFFFF);
      font-style: italic;
      line-height: 1.4;
    }

    .font-body {
      font-family: var(--font-body, 'Montserrat', sans-serif);
      font-size: var(--font-size-body, 11px);
      font-weight: 300;
      color: var(--color-text-body, #B0B0B0);
      line-height: 1.7;
    }

    .font-caption {
      font-family: var(--font-body, 'Montserrat', sans-serif);
      font-size: var(--font-size-caption, 9px);
      color: var(--color-text-muted, #808080);
      line-height: 1.5;
    }

    .font-quote {
      font-family: var(--font-body, 'Montserrat', sans-serif);
      font-size: 10px;
      font-weight: 300;
      color: var(--color-text-muted, #808080);
      font-style: italic;
      line-height: 1.6;
    }

    .font-numberedItem {
      font-family: var(--font-body, 'Montserrat', sans-serif);
      font-size: 12px;
      font-weight: 600;
      color: var(--color-primary, #C9A96E);
    }

    /* Print styles */
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .brochure-page { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
  }

  /**
   * Render a single page
   */
  private renderPage(page: PageSpec, tokens: BrandTokens): string {
    const components = page.components.map(comp => {
      const style = `left:${comp.x}%;top:${comp.y}%;width:${comp.w}%;height:${comp.h}%;`;

      if (comp.type === 'text') {
        const fontClass = comp.fontRole ? `font-${comp.fontRole}` : 'font-body';
        const content = comp.content ?? '';
        return `<div class="slot slot-text ${fontClass}" style="${style}">${this.escapeHtml(content)}</div>`;
      }

      if (comp.type === 'image' && comp.imageUrl) {
        return `<div class="slot slot-image" style="${style}"><img src="${comp.imageUrl}" alt="${comp.slotName}"></div>`;
      }

      // Empty image placeholder
      return `<div class="slot slot-image" style="${style};display:flex;align-items:center;justify-content:center;">
        <span style="color:#6B7280;font-size:10px;">${comp.slotName}</span>
      </div>`;
    }).join('\n      ');

    return `  <div class="brochure-page" data-page="${page.pageNumber}" data-layout="${page.layoutType}">
      ${components}
  </div>`;
  }

  /**
   * Generate PDF from HTML using Puppeteer
   */
  async renderPdf(html: string, outputPath: string): Promise<string> {
    let puppeteer: any;
    try {
      puppeteer = require('puppeteer');
    } catch {
      this.logger.error('Puppeteer not installed — cannot generate PDF');
      throw new Error('Puppeteer not available. Install with: npm install puppeteer');
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

      await page.pdf({
        path: outputPath,
        width: '297mm',
        height: '210mm',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });

      this.logger.log({ message: 'PDF generated', path: outputPath });
      return outputPath;
    } finally {
      await browser.close();
    }
  }

  /**
   * Full pipeline: brand profile + pages → HTML → PDF
   */
  async generateBrochure(
    brandProfileId: string,
    pages: PageSpec[],
    outputDir: string,
  ): Promise<{ htmlPath: string; pdfPath: string }> {
    const html = await this.renderHtml(pages, brandProfileId);

    const htmlPath = path.join(outputDir, `brochure-${Date.now()}.html`);
    const pdfPath = path.join(outputDir, `brochure-${Date.now()}.pdf`);

    fs.writeFileSync(htmlPath, html, 'utf-8');
    this.logger.log({ message: 'HTML generated', path: htmlPath });

    try {
      await this.renderPdf(html, pdfPath);
    } catch (err) {
      this.logger.warn(`PDF generation failed: ${err}. HTML is still available.`);
    }

    return { htmlPath, pdfPath };
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }
}
