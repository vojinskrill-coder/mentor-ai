import { Injectable, BadRequestException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import * as fs from 'fs';
import * as path from 'path';

/** Type for uploaded files from multer */
export interface UploadedFileType {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface FileUploadResult {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface FileValidationOptions {
  maxSizeBytes: number;
  allowedMimeTypes: string[];
}

const DEFAULT_OPTIONS: FileValidationOptions = {
  maxSizeBytes: 2 * 1024 * 1024, // 2MB
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg'],
};

@Injectable()
export class FileUploadService {
  private readonly uploadDir: string;

  constructor() {
    // Use uploads directory in project root for development
    this.uploadDir = path.join(process.cwd(), 'uploads', 'icons');
    this.ensureUploadDirExists();
  }

  private ensureUploadDirExists(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  validateFile(
    file: UploadedFileType,
    options: FileValidationOptions = DEFAULT_OPTIONS
  ): void {
    // Check file size
    if (file.size > options.maxSizeBytes) {
      const maxSizeMB = options.maxSizeBytes / (1024 * 1024);
      throw new BadRequestException({
        type: 'validation_error',
        title: 'File Too Large',
        status: 400,
        detail: `Please upload a PNG or JPG image under ${maxSizeMB}MB`,
      });
    }

    // Check file type
    if (!options.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException({
        type: 'validation_error',
        title: 'Invalid File Type',
        status: 400,
        detail: 'Please upload a PNG or JPG image under 2MB',
      });
    }
  }

  generateUniqueFilename(tenantId: string, originalName: string): string {
    // Sanitize extension to prevent path traversal attacks
    const rawExt = path.extname(originalName).toLowerCase();
    const sanitizedExt = rawExt.replace(/[^a-z0-9.]/gi, '');
    const ext = sanitizedExt.startsWith('.') ? sanitizedExt : `.${sanitizedExt}`;
    const uniqueId = createId();
    return `${tenantId}_${uniqueId}${ext}`;
  }

  async saveFile(
    file: UploadedFileType,
    tenantId: string,
    skipValidation = false
  ): Promise<FileUploadResult> {
    // Validate file first (unless already validated)
    if (!skipValidation) {
      this.validateFile(file);
    }

    // Generate unique filename
    const filename = this.generateUniqueFilename(tenantId, file.originalname);
    const filePath = path.join(this.uploadDir, filename);

    // Save file to disk
    await fs.promises.writeFile(filePath, file.buffer);

    return {
      filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: `/uploads/icons/${filename}`,
    };
  }

  async deleteFile(filename: string): Promise<void> {
    const filePath = path.join(this.uploadDir, filename);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  getFilePath(filename: string): string {
    return path.join(this.uploadDir, filename);
  }
}
