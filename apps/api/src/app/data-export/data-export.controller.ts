import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaRequiredGuard } from '../auth/guards/mfa-required.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { DataExportService } from './data-export.service';
import { RequestExportDto } from './dto/request-export.dto';
import { UserThrottlerGuard } from './guards/user-throttler.guard';

@Controller('data-export')
@UseGuards(JwtAuthGuard, MfaRequiredGuard)
export class DataExportController {
  constructor(private readonly dataExportService: DataExportService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 86400000 } })
  async requestExport(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RequestExportDto
  ) {
    const exportResponse = await this.dataExportService.requestExport(
      user.userId,
      user.tenantId,
      dto.format,
      dto.dataTypes
    );

    return {
      data: exportResponse,
      message: 'Export queued successfully',
    };
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  async getExportStatus(@CurrentUser() user: CurrentUserPayload) {
    const exports = await this.dataExportService.getUserExports(
      user.userId,
      user.tenantId
    );

    return { data: exports };
  }

  @Get(':id/download')
  @HttpCode(HttpStatus.OK)
  async downloadExport(
    @Param('id') exportId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const { buffer, mimeType, filename } =
      await this.dataExportService.downloadExport(exportId, user.userId);

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    return new StreamableFile(buffer);
  }
}
