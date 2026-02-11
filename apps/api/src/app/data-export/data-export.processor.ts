import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DataExportService } from './data-export.service';

interface ExportJobData {
  exportId: string;
  userId: string;
  tenantId: string;
  format: string;
  dataTypes: string[];
}

@Processor('data-export')
export class DataExportProcessor extends WorkerHost {
  private readonly logger = new Logger(DataExportProcessor.name);

  constructor(private readonly dataExportService: DataExportService) {
    super();
  }

  async process(job: Job<ExportJobData>): Promise<void> {
    switch (job.name) {
      case 'generate-export':
        return this.handleGenerateExport(job);
      case 'cleanup-expired':
        return this.handleCleanupExpired();
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleGenerateExport(job: Job<ExportJobData>): Promise<void> {
    const { exportId, userId, tenantId, format, dataTypes } = job.data;

    this.logger.log(`Processing export ${exportId} (format: ${format})`);

    await this.dataExportService.processExport(
      exportId,
      userId,
      tenantId,
      format,
      dataTypes
    );

    this.logger.log(`Export ${exportId} completed`);
  }

  private async handleCleanupExpired(): Promise<void> {
    this.logger.log('Running expired export cleanup');
    const cleaned = await this.dataExportService.cleanupExpiredExports();
    this.logger.log(`Cleanup complete: ${cleaned} exports removed`);
  }
}
