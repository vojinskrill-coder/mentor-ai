import {
  Controller,
  Post,
  Get,
  Param,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { AttachmentsService, UploadedFile as UploadedFileType } from './attachments.service';

@Controller('v1/attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(@CurrentUser() user: CurrentUserPayload, @UploadedFile() file: UploadedFileType) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    return this.attachmentsService.uploadAndExtract(file, user.userId, user.tenantId);
  }

  @Get(':id/file')
  async getFile(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response
  ) {
    const result = await this.attachmentsService.getAttachmentById(id, user.tenantId);
    if (!result) {
      res.status(404).json({ message: 'Attachment not found' });
      return;
    }

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(result.originalName)}"`
    );
    res.sendFile(result.filePath);
  }
}
