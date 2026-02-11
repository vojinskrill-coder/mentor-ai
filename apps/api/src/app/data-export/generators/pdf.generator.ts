import { Injectable } from '@nestjs/common';
import type { ExportDataSection } from '@mentor-ai/shared/types';
import type { FormatGenerator, ExportMetadata } from './format-generator.interface';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake');

@Injectable()
export class PdfGenerator implements FormatGenerator {
  readonly formatKey = 'PDF';
  readonly mimeType = 'application/pdf';
  readonly fileExtension = '.pdf';

  async generate(
    sections: ExportDataSection[],
    metadata: ExportMetadata
  ): Promise<Buffer> {
    const content: Record<string, unknown>[] = [
      {
        text: `Data Export — ${metadata.tenantName}`,
        style: 'title',
        tocItem: true,
      },
      {
        text: `Exported by: ${metadata.userName} (${metadata.userEmail})\nDate: ${metadata.exportDate}`,
        style: 'subtitle',
        margin: [0, 0, 0, 20],
      },
      {
        toc: { title: { text: 'Table of Contents', style: 'tocHeader' } },
      },
    ];

    for (const section of sections) {
      content.push({
        text: section.title,
        style: 'sectionHeader',
        tocItem: true,
        pageBreak: 'before',
      });

      if (section.itemCount === 0) {
        content.push({
          text: 'No data available.',
          style: 'body',
          italics: true,
        });
        continue;
      }

      if (section.items.length > 0) {
        const headers = Object.keys(section.items[0]!);
        const tableBody = [
          headers.map((h) => ({ text: h, bold: true, fillColor: '#f0f0f0' })),
          ...section.items.map((item) =>
            headers.map((h) => String(item[h] ?? ''))
          ),
        ];

        content.push({
          table: {
            headerRows: 1,
            widths: headers.map(() => '*'),
            body: tableBody,
          },
          layout: 'lightHorizontalLines',
          margin: [0, 10, 0, 10],
        });
      }
    }

    return this.renderPdf(content);
  }

  private renderPdf(content: Record<string, unknown>[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        // Use built-in standard fonts (no external font files needed)
        const printer = new PdfPrinter({
          Roboto: {
            normal: 'Helvetica',
            bold: 'Helvetica-Bold',
            italics: 'Helvetica-Oblique',
            bolditalics: 'Helvetica-BoldOblique',
          },
        });

        const docDefinition = {
          content,
          defaultStyle: { font: 'Roboto', fontSize: 10 },
          styles: {
            title: { fontSize: 20, bold: true, margin: [0, 0, 0, 10] },
            subtitle: { fontSize: 12, color: '#666666' },
            tocHeader: { fontSize: 16, bold: true, margin: [0, 20, 0, 10] },
            sectionHeader: { fontSize: 16, bold: true, margin: [0, 10, 0, 10] },
            body: { fontSize: 10, margin: [0, 5, 0, 5] },
          },
          footer: (currentPage: number, pageCount: number) => ({
            text: `Page ${currentPage} of ${pageCount} — Mentor AI Data Export`,
            alignment: 'center',
            fontSize: 8,
            color: '#999999',
            margin: [0, 10, 0, 0],
          }),
        };

        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        const chunks: Buffer[] = [];

        pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
        pdfDoc.on('error', (err: Error) => reject(err));
        pdfDoc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
