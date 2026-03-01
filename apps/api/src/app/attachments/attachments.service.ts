import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { TenantPrismaService } from '@mentor-ai/shared/tenant-context';
import { createId } from '@paralleldrive/cuid2';
import * as fs from 'fs';
import * as path from 'path';
import type { AttachmentItem } from '@mentor-ai/shared/types';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_EXTRACTED_TEXT = 50_000; // chars

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly uploadDir: string;

  constructor(private readonly prisma: TenantPrismaService) {
    this.uploadDir = path.join(process.cwd(), 'uploads', 'attachments');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadAndExtract(
    file: UploadedFile,
    userId: string,
    tenantId: string
  ): Promise<AttachmentItem> {
    // Validate
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed: PDF, TXT, CSV, XLSX, DOCX, JPG, PNG`
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File too large. Maximum size: 10MB`);
    }

    // Save to disk
    const ext =
      path
        .extname(file.originalname)
        .toLowerCase()
        .replace(/[^a-z0-9.]/gi, '') || '.bin';
    const filename = `${createId()}${ext.startsWith('.') ? ext : `.${ext}`}`;
    const filePath = path.join(this.uploadDir, filename);
    await fs.promises.writeFile(filePath, file.buffer);

    // Extract text
    let extractedText: string | null = null;
    try {
      extractedText = await this.extractText(file.buffer, file.mimetype);
    } catch (err) {
      this.logger.warn(`Text extraction failed for ${file.originalname}: ${err}`);
    }

    // Save to DB
    const client = await this.prisma.getClient(tenantId);
    const attachment = await client.attachment.create({
      data: {
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath: `uploads/attachments/${filename}`,
        extractedText,
        userId,
        tenantId,
      },
    });

    return {
      id: attachment.id,
      filename: attachment.filename,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      createdAt: attachment.createdAt.toISOString(),
    };
  }

  async linkToMessage(attachmentId: string, messageId: string, tenantId: string): Promise<void> {
    const client = await this.prisma.getClient(tenantId);
    const updated = await client.attachment.updateMany({
      where: { id: attachmentId, tenantId },
      data: { messageId },
    });
    if (updated.count === 0) {
      this.logger.warn(`Attachment ${attachmentId} not found for tenant ${tenantId}`);
    }
  }

  async linkToNote(attachmentId: string, noteId: string, tenantId: string): Promise<void> {
    const client = await this.prisma.getClient(tenantId);
    const updated = await client.attachment.updateMany({
      where: { id: attachmentId, tenantId },
      data: { noteId },
    });
    if (updated.count === 0) {
      this.logger.warn(`Attachment ${attachmentId} not found for tenant ${tenantId}`);
    }
  }

  async getExtractedText(attachmentIds: string[], tenantId: string): Promise<string> {
    if (!attachmentIds.length) return '';

    const client = await this.prisma.getClient(tenantId);
    const attachments = await client.attachment.findMany({
      where: { id: { in: attachmentIds }, tenantId },
      select: { originalName: true, extractedText: true },
    });

    return attachments
      .filter((a) => a.extractedText)
      .map(
        (a) => `--- PRILOŽENI FAJL: ${a.originalName} ---\n${a.extractedText}\n--- KRAJ FAJLA ---`
      )
      .join('\n\n');
  }

  async getAttachmentById(
    attachmentId: string,
    tenantId: string
  ): Promise<{ filePath: string; mimeType: string; originalName: string } | null> {
    const client = await this.prisma.getClient(tenantId);
    const attachment = await client.attachment.findUnique({
      where: { id: attachmentId },
      select: { storagePath: true, mimeType: true, originalName: true, tenantId: true },
    });

    if (!attachment || attachment.tenantId !== tenantId) return null;

    const filePath = path.join(process.cwd(), attachment.storagePath);
    if (!fs.existsSync(filePath)) return null;

    return {
      filePath,
      mimeType: attachment.mimeType,
      originalName: attachment.originalName,
    };
  }

  async getAttachmentsByMessageId(messageId: string, tenantId: string): Promise<AttachmentItem[]> {
    const client = await this.prisma.getClient(tenantId);
    const attachments = await client.attachment.findMany({
      where: { messageId },
      select: {
        id: true,
        filename: true,
        originalName: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    });

    return attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      originalName: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  private async extractText(buffer: Buffer, mimeType: string): Promise<string | null> {
    let text: string | null = null;

    switch (mimeType) {
      case 'application/pdf': {
        const pdfParse = require('pdf-parse');
        const result = await pdfParse(buffer);
        text = result.text;
        break;
      }
      case 'text/plain':
      case 'text/csv': {
        text = buffer.toString('utf-8');
        break;
      }
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        const XLSX = require('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheets: string[] = [];
        for (const name of workbook.SheetNames) {
          const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
          sheets.push(`[Sheet: ${name}]\n${csv}`);
        }
        text = sheets.join('\n\n');
        break;
      }
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
        break;
      }
      case 'image/jpeg':
      case 'image/png':
        // No text extraction for images
        return null;
      default:
        return null;
    }

    if (text && text.length > MAX_EXTRACTED_TEXT) {
      text = text.substring(0, MAX_EXTRACTED_TEXT);
    }

    return text;
  }
}
