import { Injectable, Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { OpenClawTenantService } from '../openclaw-tenant/openclaw-tenant.service';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const LOCAL_DIR = 'uploads/product-images';
const REMOTE_DIR = '/root/.openclaw/workspace/product-images';

@Injectable()
export class ProductImagesService {
  private readonly logger = new Logger(ProductImagesService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly openclawTenant: OpenClawTenantService,
  ) {
    // Ensure local directory exists
    if (!fs.existsSync(LOCAL_DIR)) {
      fs.mkdirSync(LOCAL_DIR, { recursive: true });
    }
  }

  /**
   * Upload a product image: save locally, deploy to Hetzner, record in DB.
   */
  async upload(
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    tenantId: string,
    userId: string,
    label?: string,
  ) {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      throw new Error(`Nedozvoljen tip fajla: ${file.mimetype}. Dozvoljeni: JPG, PNG, WebP.`);
    }
    if (file.size > MAX_SIZE) {
      throw new Error('Fajl je prevelik. Maksimum je 10MB.');
    }

    const ext = file.originalname.split('.').pop() ?? 'jpg';
    const id = createId();
    const filename = `${id}.${ext}`;
    const localPath = path.join(LOCAL_DIR, filename);
    const remotePath = `${REMOTE_DIR}/${filename}`;

    // 1. Save locally
    fs.writeFileSync(localPath, file.buffer);

    // 2. Deploy to Hetzner OpenClaw workspace
    let deployed = false;
    try {
      // writeRemoteFile handles mkdir + base64 transfer.
      // It does Buffer.from(content).toString('base64') internally,
      // so passing the buffer as latin1 string preserves bytes correctly.
      await this.openclawTenant.writeRemoteFile(
        remotePath,
        file.buffer.toString('latin1'),
      );
      deployed = true;
      this.logger.log(`Deployed product image to Hetzner: ${remotePath}`);
    } catch (err: any) {
      this.logger.warn(`Failed to deploy image to Hetzner: ${err.message}`);
    }

    // 3. Save to DB
    const record = await this.prisma.productImage.create({
      data: {
        id,
        tenantId,
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath: localPath,
        remotePath: deployed ? remotePath : null,
        label: label ?? file.originalname.replace(/\.[^.]+$/, ''),
        uploadedBy: userId,
      },
    });

    return record;
  }

  /**
   * Get a single product image by id.
   */
  async getById(id: string, tenantId: string) {
    return this.prisma.productImage.findFirst({ where: { id, tenantId } });
  }

  /**
   * Update label/description for a product image.
   */
  async update(id: string, tenantId: string, data: { label?: string; description?: string }) {
    const image = await this.prisma.productImage.findFirst({ where: { id, tenantId } });
    if (!image) return null;
    return this.prisma.productImage.update({
      where: { id },
      data: { ...(data.label ? { label: data.label } : {}), ...(data.description !== undefined ? { description: data.description } : {}) },
    });
  }

  /**
   * List all product images for a tenant.
   */
  async list(tenantId: string) {
    return this.prisma.productImage.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Delete a product image (local + remote + DB).
   */
  async remove(id: string, tenantId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id, tenantId },
    });
    if (!image) return;

    // Remove local file
    try { fs.unlinkSync(image.storagePath); } catch { /* ok */ }

    // Remote file on Hetzner is left as orphan (harmless image file).
    // OpenClaw workspace cleanup can be done periodically.

    await this.prisma.productImage.delete({ where: { id } });
  }

  /**
   * Get product image references for OpenClaw context.
   * Returns a markdown-formatted list of available product images.
   */
  async getProductImageContext(tenantId: string): Promise<string> {
    const images = await this.prisma.productImage.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    if (images.length === 0) return '';

    const lines = images.map((img) =>
      `- **${img.label ?? img.originalName}** → \`${img.remotePath ?? img.filename}\` (${img.mimeType})`,
    );

    return `## Product Reference Images\n\nYou have ${images.length} product image(s) available in your workspace (\`${REMOTE_DIR}/\`):\n\n${lines.join('\n')}\n\nUse these as reference when creating content. Pass the file path to image generation tools (FAL.ai Kontext) for compositing.`;
  }
}
