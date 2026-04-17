import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import * as fs from 'fs';
import * as path from 'path';

interface TypographyRole {
  role: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: string;
  color?: string;
  italic?: boolean;
}

interface BrandColors {
  background?: { hex: string };
  primary?: { hex: string };
  textPrimary?: { hex: string };
  textBody?: { hex: string };
  textMuted?: { hex: string };
  surfaceDark?: { hex: string };
  surfaceLight?: { hex: string };
  accentLine?: { hex: string };
  [key: string]: { hex: string; usage?: string[] } | undefined;
}

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

@Injectable()
export class BrochureRendererService {
  private readonly logger = new Logger(BrochureRendererService.name);

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Build Google Fonts import URL from typography roles
   */
  /** System fonts that don't need Google Fonts import */
  private static readonly SYSTEM_FONTS = new Set([
    'helvetica', 'helvetica neue', 'arial', 'times new roman', 'georgia', 'verdana', 'tahoma', 'courier new',
  ]);

  private buildFontImportUrl(typography: TypographyRole[]): string {
    const fontMap = new Map<string, Set<string>>();
    for (const t of typography) {
      // Skip system fonts — they don't need Google Fonts import
      if (BrochureRendererService.SYSTEM_FONTS.has(t.fontFamily.toLowerCase())) continue;
      if (!fontMap.has(t.fontFamily)) fontMap.set(t.fontFamily, new Set());
      const specs = fontMap.get(t.fontFamily)!;
      specs.add(`0,${t.fontWeight}`);
      if (t.italic) specs.add(`1,${t.fontWeight}`);
    }
    const families: string[] = [];
    for (const [family, specs] of fontMap) {
      const sorted = [...specs].sort();
      const encoded = family.replace(/ /g, '+');
      families.push(`family=${encoded}:ital,wght@${sorted.join(';')}`);
    }
    return families.length
      ? `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`
      : '';
  }

  /**
   * Generate CSS classes from typography roles dynamically
   */
  /**
   * Build CSS for typography roles.
   * Profile font sizes are in Figma points (same as CSS pt for print).
   * We use pt units to match the original Figma design exactly.
   */
  private buildTypographyCss(typography: TypographyRole[], colors: BrandColors): string {
    return typography.map(t => {
      const lines: string[] = [];
      // Detect serif vs sans-serif fallback based on font family name
      const isSerif = /playfair|georgia|times|garamond|baskerville/i.test(t.fontFamily);
      const fallback = isSerif ? 'serif' : 'sans-serif';
      lines.push(`  font-family: '${t.fontFamily}', ${fallback};`);
      lines.push(`  font-size: ${t.fontSize}pt;`);
      lines.push(`  font-weight: ${t.fontWeight};`);
      if (t.italic) lines.push(`  font-style: italic;`);
      if (t.color) lines.push(`  color: ${t.color};`);
      if (t.lineHeight) lines.push(`  line-height: ${t.lineHeight};`);
      if (t.letterSpacing) lines.push(`  letter-spacing: ${t.letterSpacing}pt;`);
      if (t.textTransform) lines.push(`  text-transform: ${t.textTransform};`);
      lines.push(`  word-wrap: break-word;`);
      lines.push(`  overflow-wrap: break-word;`);
      if (t.role === 'quote') {
        const accentColor = colors.accentLine?.hex || colors.primary?.hex || '#C9A96E';
        lines.push(`  border-left: 2pt solid ${accentColor};`);
        lines.push(`  padding-left: 10pt;`);
      }
      return `.font-${t.role} {\n${lines.join('\n')}\n}`;
    }).join('\n\n');
  }

  /**
   * Generate complete HTML document for a brochure — fully dynamic from brand profile
   */
  async renderHtml(pages: PageSpec[], brandProfileId: string): Promise<string> {
    const profile = await this.prisma.brandDesignProfile.findUnique({
      where: { id: brandProfileId },
    });
    if (!profile) throw new Error(`Brand profile not found: ${brandProfileId}`);

    const colors = (profile.colors ?? {}) as unknown as BrandColors;
    const typography = (profile.typography ?? []) as unknown as TypographyRole[];
    const tokensCss = profile.tokensCss ?? '';

    // Derive dynamic values from profile
    const bgColor = colors.background?.hex || '#0D0D0D';
    const surfaceColor = colors.surfaceDark?.hex || '#1A1A1A';
    const accentColor = colors.accentLine?.hex || colors.primary?.hex || '#C9A96E';
    const primaryColor = colors.primary?.hex || '#C9A96E';
    const bodyFont = typography.find(t => t.role === 'body')?.fontFamily || 'sans-serif';

    const fontImportUrl = this.buildFontImportUrl(typography);
    const typographyCss = this.buildTypographyCss(typography, colors);

    // Extract logo URL from first logo component to avoid repeating large base64
    let logoUrl: string | undefined;
    for (const page of pages) {
      for (const comp of page.components) {
        if (comp.slotName.includes('logo') && comp.imageUrl) {
          logoUrl = comp.imageUrl;
          break;
        }
      }
      if (logoUrl) break;
    }

    const pagesHtml = pages.map(page => this.renderPage(page, colors, logoUrl)).join('\n');

    return `<!DOCTYPE html>
<html lang="sr">
<head>
<meta charset="utf-8">
<style>
${fontImportUrl ? `@import url('${fontImportUrl}');` : ''}

${tokensCss}

* { box-sizing: border-box; margin: 0; padding: 0; }

@page {
  size: 594mm 420mm;
  margin: 0;
}

html, body {
  background: ${bgColor};
  margin: 0;
  padding: 0;
}

/* ═══ PAGE SPREAD ═══ */
.brochure-page {
  width: 594mm;
  height: 420mm;
  position: relative;
  overflow: hidden;
  background: ${bgColor};
  page-break-after: always;
  margin: 0 auto 20px;
  box-shadow: 0 4px 60px rgba(0,0,0,0.8);
}

/* ═══ SLOTS ═══ */
.slot {
  position: absolute;
  overflow: hidden;
}

.slot-text {
  padding: 6mm 8mm;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  overflow: hidden;
}

.slot-image {
  background: ${surfaceColor};
}
.slot-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* ═══ TYPOGRAPHY (generated from brand profile) ═══ */
${typographyCss}

/* ═══ ACCENT ELEMENTS ═══ */
.accent-line {
  position: absolute;
  background: ${accentColor};
}

/* ═══ LOGO ═══ */
.logo-slot {
  display: flex;
  align-items: center;
  padding: 2mm;
}
.logo-slot img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
}
.logo-slot .logo-text {
  font-family: '${bodyFont}', sans-serif;
  font-size: 8pt;
  font-weight: 500;
  color: ${primaryColor};
  letter-spacing: 2pt;
  text-transform: uppercase;
}

/* ═══ IMAGE PLACEHOLDER ═══ */
.img-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, ${surfaceColor} 0%, ${bgColor} 100%);
  color: #3a3a3a;
  font-size: 12px;
  font-family: '${bodyFont}', sans-serif;
}

/* ═══ PRINT ═══ */
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .brochure-page { box-shadow: none; margin: 0; page-break-inside: avoid; }
}
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
  }

  private renderPage(page: PageSpec, colors: BrandColors, logoUrl?: string): string {
    const components = page.components.map(comp => {
      const style = `left:${comp.x}%; top:${comp.y}%; width:${comp.w}%; height:${comp.h}%;`;

      // Logo slots — use shared logoUrl to avoid repeating base64
      if (comp.slotName.includes('logo')) {
        const url = comp.imageUrl || logoUrl;
        if (url) {
          return `<div class="slot logo-slot" style="${style}"><img src="${url}" alt="Logo"></div>`;
        }
        return `<div class="slot logo-slot" style="${style}"><span class="logo-text">LOGO</span></div>`;
      }

      // Text slots
      if (comp.type === 'text') {
        const fontClass = comp.fontRole ? `font-${comp.fontRole}` : 'font-body';
        const content = comp.content ?? '';
        return `<div class="slot slot-text ${fontClass}" style="${style}">${this.formatText(content)}</div>`;
      }

      // Image slots with actual images
      if (comp.type === 'image' && comp.imageUrl) {
        return `<div class="slot slot-image" style="${style}"><img src="${comp.imageUrl}" alt="${comp.slotName}" loading="lazy"></div>`;
      }

      // Empty image placeholder
      return `<div class="slot slot-image" style="${style}"><div class="img-placeholder">${this.escapeHtml(comp.slotName)}</div></div>`;
    }).join('\n      ');

    return `  <div class="brochure-page" data-page="${page.pageNumber}">
      ${components}
  </div>`;
  }

  private formatText(text: string): string {
    return this.escapeHtml(text).replace(/\n/g, '<br>');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Generate PDF buffer from HTML using Puppeteer
   */
  async renderPdfBuffer(html: string): Promise<Buffer> {
    let puppeteer: any;
    try {
      puppeteer = require('puppeteer');
    } catch {
      throw new Error('Puppeteer not available — install puppeteer to enable PDF export');
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    let page: any;
    try {
      page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
      const pdfBuffer = await page.pdf({
        width: '594mm',
        height: '420mm',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      if (page) await page.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }

  /**
   * Generate PDF to file (legacy)
   */
  async renderPdf(html: string, outputPath: string): Promise<string> {
    const buffer = await this.renderPdfBuffer(html);
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  }

  async generateBrochure(brandProfileId: string, pages: PageSpec[], outputDir: string) {
    const html = await this.renderHtml(pages, brandProfileId);
    const htmlPath = path.join(outputDir, `brochure-${Date.now()}.html`);
    const pdfPath = path.join(outputDir, `brochure-${Date.now()}.pdf`);
    fs.writeFileSync(htmlPath, html, 'utf-8');
    try { await this.renderPdf(html, pdfPath); } catch (e) { this.logger.warn(`PDF failed: ${e}`); }
    return { htmlPath, pdfPath };
  }
}
