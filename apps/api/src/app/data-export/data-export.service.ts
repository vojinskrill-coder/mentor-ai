import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  GoneException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createId } from '@paralleldrive/cuid2';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { EmailService } from '@mentor-ai/shared/email';
import type { DataExportResponse, ExportDataSection } from '@mentor-ai/shared/types';
import { UserProfileCollector } from './collectors/user-profile.collector';
import { InvitationsCollector } from './collectors/invitations.collector';
import type { BaseCollector } from './collectors/base.collector';
import { JsonGenerator } from './generators/json.generator';
import { MarkdownGenerator } from './generators/markdown.generator';
import { PdfGenerator } from './generators/pdf.generator';
import type { FormatGenerator, ExportMetadata } from './generators/format-generator.interface';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const EXPORT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LARGE_EXPORT_THRESHOLD = 100;

@Injectable()
export class DataExportService implements OnModuleInit {
  private readonly logger = new Logger(DataExportService.name);
  private readonly uploadsDir: string;
  private readonly collectors: BaseCollector[];
  private readonly generators: Map<string, FormatGenerator>;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    @InjectQueue('data-export') private readonly exportQueue: Queue,
    private readonly userProfileCollector: UserProfileCollector,
    private readonly invitationsCollector: InvitationsCollector,
    private readonly jsonGenerator: JsonGenerator,
    private readonly markdownGenerator: MarkdownGenerator,
    private readonly pdfGenerator: PdfGenerator
  ) {
    this.uploadsDir = path.join(process.cwd(), 'uploads', 'exports');
    this.ensureUploadDirExists();

    this.collectors = [userProfileCollector, invitationsCollector];

    this.generators = new Map<string, FormatGenerator>();
    this.generators.set('JSON', jsonGenerator);
    this.generators.set('MARKDOWN', markdownGenerator);
    this.generators.set('PDF', pdfGenerator);
  }

  async onModuleInit(): Promise<void> {
    // Register repeatable cleanup job (every hour)
    await this.exportQueue.add(
      'cleanup-expired',
      {},
      {
        repeat: { every: 3600000 },
        jobId: 'cleanup-expired-exports',
      }
    );
    this.logger.log('Registered repeatable cleanup-expired job (every hour)');
  }

  private ensureUploadDirExists(): void {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async requestExport(
    userId: string,
    tenantId: string,
    format: string,
    dataTypes: string[]
  ): Promise<DataExportResponse> {
    const exportId = `exp_${createId()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EXPORT_TTL_MS);

    const record = await this.prisma.dataExport.create({
      data: {
        id: exportId,
        userId,
        tenantId,
        format: format as any,
        dataTypes,
        status: 'PENDING',
        requestedAt: now,
        expiresAt,
      },
    });

    // Queue the export job
    await this.exportQueue.add('generate-export', {
      exportId: record.id,
      userId,
      tenantId,
      format,
      dataTypes,
    });

    this.logger.log(
      `Export ${exportId} queued for user ${userId} (format: ${format})`
    );

    return this.toResponse(record);
  }

  async getUserExports(
    userId: string,
    tenantId: string
  ): Promise<DataExportResponse[]> {
    const exports = await this.prisma.dataExport.findMany({
      where: { userId, tenantId },
      orderBy: { requestedAt: 'desc' },
      take: 20,
    });

    return exports.map((exp) => this.toResponse(exp));
  }

  async downloadExport(
    exportId: string,
    userId: string
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const record = await this.prisma.dataExport.findUnique({
      where: { id: exportId },
    });

    if (!record) {
      throw new NotFoundException({
        type: 'export_not_found',
        title: 'Export Not Found',
        status: 404,
        detail: `Export ${exportId} does not exist`,
      });
    }

    if (record.userId !== userId) {
      throw new ForbiddenException({
        type: 'export_access_denied',
        title: 'Access Denied',
        status: 403,
        detail: 'You do not have permission to access this export',
      });
    }

    if (record.status !== 'COMPLETED' || !record.filePath) {
      throw new NotFoundException({
        type: 'export_not_ready',
        title: 'Export Not Ready',
        status: 404,
        detail: 'This export is not yet complete or has no file',
      });
    }

    if (record.expiresAt && record.expiresAt < new Date()) {
      throw new GoneException({
        type: 'export_expired',
        title: 'Export Expired',
        status: 410,
        detail: 'This export has expired. Please request a new export.',
      });
    }

    // Decrypt the file
    const buffer = this.decryptFile(
      record.filePath,
      record.encryptionIv!,
      record.encryptionTag!
    );

    // Increment download count
    await this.prisma.dataExport.update({
      where: { id: exportId },
      data: { downloadCount: { increment: 1 } },
    });

    const generator = this.generators.get(record.format);
    const ext = generator?.fileExtension ?? '.bin';
    const mimeType = generator?.mimeType ?? 'application/octet-stream';

    return {
      buffer,
      mimeType,
      filename: `mentor-ai-export-${exportId}${ext}`,
    };
  }

  async processExport(
    exportId: string,
    userId: string,
    tenantId: string,
    format: string,
    dataTypes: string[]
  ): Promise<void> {
    await this.prisma.dataExport.update({
      where: { id: exportId },
      data: { status: 'PROCESSING' },
    });

    try {
      // Collect data from all matching collectors
      const sections = await this.collectData(userId, tenantId, dataTypes);

      // Get user metadata for export header
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });

      const metadata: ExportMetadata = {
        userName: user?.name ?? 'Unknown',
        userEmail: user?.email ?? '',
        tenantName: tenant?.name ?? 'Unknown',
        exportDate: new Date().toISOString(),
      };

      // Generate file in requested format
      const generator = this.generators.get(format);
      if (!generator) {
        throw new Error(`Unsupported export format: ${format}`);
      }

      const fileBuffer = await generator.generate(sections, metadata);

      // Encrypt and save
      const { filePath, iv, authTag } = this.encryptAndSave(
        fileBuffer,
        exportId
      );

      await this.prisma.dataExport.update({
        where: { id: exportId },
        data: {
          status: 'COMPLETED',
          filePath,
          fileSize: fileBuffer.length,
          encryptionIv: iv,
          encryptionTag: authTag,
          completedAt: new Date(),
        },
      });

      this.logger.log(
        `Export ${exportId} completed (${fileBuffer.length} bytes)`
      );

      // Send email notification for large exports (>= 100 items)
      const totalItems = sections.reduce((sum, s) => sum + s.itemCount, 0);
      if (totalItems >= LARGE_EXPORT_THRESHOLD && user?.email) {
        const downloadUrl = `/api/v1/data-export/${exportId}/download`;
        const expiresAt = new Date(
          Date.now() + EXPORT_TTL_MS
        ).toISOString();
        const fileSizeStr = this.formatFileSize(fileBuffer.length);

        await this.emailService.sendDataExportCompleteEmail({
          to: user.email,
          userName: user.name ?? 'User',
          format,
          fileSize: fileSizeStr,
          downloadUrl,
          expiresAt,
        });
      }
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Export ${exportId} failed: ${errMsg}`);

      await this.prisma.dataExport.update({
        where: { id: exportId },
        data: {
          status: 'FAILED',
          errorMessage: errMsg,
        },
      });

      throw error;
    }
  }

  async collectData(
    userId: string,
    tenantId: string,
    dataTypes: string[]
  ): Promise<ExportDataSection[]> {
    const isAll = dataTypes.includes('all');
    const activeCollectors = this.collectors.filter(
      (c) => isAll || dataTypes.includes(c.key)
    );

    const sections: ExportDataSection[] = [];
    for (const collector of activeCollectors) {
      const section = await collector.collect(this.prisma, userId, tenantId);
      sections.push(section);
    }

    return sections;
  }

  async cleanupExpiredExports(): Promise<number> {
    const now = new Date();

    const expired = await this.prisma.dataExport.findMany({
      where: {
        status: 'COMPLETED',
        expiresAt: { lt: now },
      },
    });

    let cleaned = 0;
    for (const exp of expired) {
      if (exp.filePath && fs.existsSync(exp.filePath)) {
        fs.unlinkSync(exp.filePath);
      }

      await this.prisma.dataExport.update({
        where: { id: exp.id },
        data: { status: 'EXPIRED', filePath: null },
      });
      cleaned++;
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired exports`);
    }

    return cleaned;
  }

  private encryptAndSave(
    data: Buffer,
    exportId: string
  ): { filePath: string; iv: string; authTag: string } {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const filename = `${exportId}.enc`;
    const filePath = path.join(this.uploadsDir, filename);
    fs.writeFileSync(filePath, encrypted, { mode: 0o600 });

    return {
      filePath,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  private decryptFile(
    filePath: string,
    ivHex: string,
    authTagHex: string
  ): Buffer {
    const key = this.getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = fs.readFileSync(filePath);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  private getEncryptionKey(): Buffer {
    const keyHex = this.configService.get<string>('EXPORT_ENCRYPTION_KEY');
    if (!keyHex || keyHex.length !== 64) {
      // Generate a deterministic key from a fallback (dev only)
      return crypto
        .createHash('sha256')
        .update('mentor-ai-dev-export-key')
        .digest();
    }
    return Buffer.from(keyHex, 'hex');
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private toResponse(
    record: {
      id: string;
      status: string;
      format: string;
      dataTypes: string[];
      fileSize: number | null;
      requestedAt: Date;
      completedAt: Date | null;
      expiresAt: Date | null;
    }
  ): DataExportResponse {
    return {
      exportId: record.id,
      status: record.status as DataExportResponse['status'],
      format: record.format as DataExportResponse['format'],
      dataTypes: record.dataTypes,
      fileSize: record.fileSize,
      requestedAt: record.requestedAt.toISOString(),
      completedAt: record.completedAt?.toISOString() ?? null,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      downloadUrl:
        record.status === 'COMPLETED'
          ? `/api/v1/data-export/${record.id}/download`
          : null,
    };
  }
}
