import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AuthModule } from '../auth/auth.module';
import { NotesModule } from '../notes/notes.module';
import { PdfExportController } from './pdf-export.controller';
import { PdfExportService } from './pdf-export.service';
import { PuppeteerProvider } from './puppeteer.provider';

@Module({
  imports: [TenantModule, AuthModule, NotesModule],
  controllers: [PdfExportController],
  providers: [PdfExportService, PuppeteerProvider],
})
export class PdfExportModule {}
