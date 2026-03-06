import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { NotesService } from '../notes/notes.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { PuppeteerProvider } from './puppeteer.provider';
import { buildPdfHtml } from './pdf-html-builder';
import type { NoteItem } from '@mentor-ai/shared/types';

@Injectable()
export class PdfExportService {
  private readonly logger = new Logger(PdfExportService.name);

  constructor(
    private readonly notesService: NotesService,
    private readonly puppeteer: PuppeteerProvider,
    private readonly prisma: PlatformPrismaService
  ) {}

  async generateReportPdf(noteIds: string[], userId: string, tenantId: string): Promise<Buffer> {
    // 1. Fetch notes with children, preserving requested order
    const notes = await this.notesService.getByIdsWithChildren(noteIds, userId, tenantId);

    if (notes.length === 0) {
      throw new NotFoundException('No completed notes found for the given IDs');
    }

    // Preserve the requested order
    const noteMap = new Map(notes.map((n) => [n.id, n]));
    const orderedNotes = noteIds
      .map((id) => noteMap.get(id))
      .filter((n): n is NoteItem => n != null);

    // 2. Load tenant info for cover page
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    // 3. Build HTML document
    const html = buildPdfHtml({
      notes: orderedNotes,
      tenantName: tenant?.name ?? undefined,
      userName: user?.name ?? undefined,
      exportDate: new Date().toLocaleDateString('sr-Latn', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    });

    this.logger.log({
      message: 'Generating PDF',
      noteCount: orderedNotes.length,
      userId,
      tenantId,
    });

    // 4. Render PDF via Puppeteer
    return this.renderPdf(html);
  }

  private async renderPdf(html: string): Promise<Buffer> {
    const browser = this.puppeteer.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '25mm', right: '20mm', bottom: '25mm', left: '20mm' },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `
          <div style="width: 100%; text-align: center; font-size: 8pt; color: #adb5bd; font-family: system-ui, sans-serif;">
            <span class="pageNumber"></span> / <span class="totalPages"></span>
          </div>
        `,
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await page.close();
    }
  }
}
