import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { ProductImagesService } from './product-images.service';

@Controller('v1/product-images')
@UseGuards(JwtAuthGuard)
export class ProductImagesController {
  constructor(private readonly service: ProductImagesService) {}

  /** Upload a product image */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: any,
    @Body('label') label: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!file) {
      throw new BadRequestException('Fajl je obavezan');
    }

    try {
      const result = await this.service.upload(file, user.tenantId, user.userId, label);
      return { data: result };
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  /** List all product images for current tenant */
  @Get()
  async list(@CurrentUser() user: CurrentUserPayload) {
    const images = await this.service.list(user.tenantId);
    return { data: images };
  }

  /** Serve product image file */
  @Get(':id/file')
  async getFile(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ) {
    const image = await this.service.getById(id, user.tenantId);
    if (!image) throw new NotFoundException('Image not found');

    const fs = await import('fs');
    if (!fs.existsSync(image.storagePath)) throw new NotFoundException('File not found on disk');

    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(image.storagePath).pipe(res);
  }

  /** Update product image label/description */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { label?: string; description?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const result = await this.service.update(id, user.tenantId, body);
    return { data: result };
  }

  /** Delete a product image */
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.service.remove(id, user.tenantId);
    return { data: { deleted: true } };
  }
}
