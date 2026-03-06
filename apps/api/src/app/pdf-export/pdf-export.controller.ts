import {
  Controller,
  Post,
  Body,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { IsArray, ArrayNotEmpty, ArrayMaxSize, IsString } from 'class-validator';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { PdfExportService } from './pdf-export.service';

export class ExportReportsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  noteIds!: string[];
}

@Controller('v1/pdf-export')
@UseGuards(JwtAuthGuard)
export class PdfExportController {
  private readonly logger = new Logger(PdfExportController.name);

  constructor(private readonly pdfExportService: PdfExportService) {}

  @Post('reports')
  @HttpCode(HttpStatus.OK)
  async exportReports(
    @Body() dto: ExportReportsDto,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response
  ) {
    try {
      const pdfBuffer = await this.pdfExportService.generateReportPdf(
        dto.noteIds,
        user.userId,
        user.tenantId
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="izvestaj.pdf"');
      res.send(pdfBuffer);
    } catch (error) {
      this.logger.error({ message: 'PDF generation failed', error });
      const status = (error as { status?: number }).status ?? 500;
      const message = (error as { message?: string }).message ?? 'PDF generation failed';
      res.status(status).json({ statusCode: status, message });
    }
  }
}
