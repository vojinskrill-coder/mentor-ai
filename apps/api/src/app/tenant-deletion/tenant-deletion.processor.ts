import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TenantDeletionService } from './tenant-deletion.service';

interface SendDeletionEmailsJob {
  type: 'initiated' | 'cancelled';
  tenantId: string;
  tenantName: string;
  requestedByUserId?: string;
  cancelledByUserId?: string;
  gracePeriodEndsAt?: string;
  members: Array<{ id: string; email: string; name: string | null }>;
}

interface ExecuteDeletionJob {
  tenantId: string;
  tenantName: string;
}

interface PurgeTenantDataJob {
  tenantId: string;
  tenantName: string;
  ownerEmail?: string;
  ownerName?: string;
}

type TenantDeletionJobData =
  | SendDeletionEmailsJob
  | ExecuteDeletionJob
  | PurgeTenantDataJob
  | Record<string, never>;

@Processor('tenant-deletion')
export class TenantDeletionProcessor extends WorkerHost {
  private readonly logger = new Logger(TenantDeletionProcessor.name);

  constructor(private readonly tenantDeletionService: TenantDeletionService) {
    super();
  }

  async process(job: Job<TenantDeletionJobData>): Promise<void> {
    this.logger.log(`Processing job ${job.name} (${job.id})`);

    switch (job.name) {
      case 'check-expired-grace-periods':
        await this.handleCheckExpiredGracePeriods();
        break;

      case 'send-deletion-emails':
        await this.handleSendDeletionEmails(job.data as SendDeletionEmailsJob);
        break;

      case 'execute-deletion':
        await this.handleExecuteDeletion(job.data as ExecuteDeletionJob);
        break;

      case 'purge-tenant-data':
        await this.handlePurgeTenantData(job.data as PurgeTenantDataJob);
        break;

      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
    }
  }

  private async handleCheckExpiredGracePeriods(): Promise<void> {
    const count = await this.tenantDeletionService.checkExpiredGracePeriods();
    this.logger.log(`Checked expired grace periods: ${count} tenants queued for deletion`);
  }

  private async handleSendDeletionEmails(data: SendDeletionEmailsJob): Promise<void> {
    if (data.type === 'initiated') {
      if (!data.requestedByUserId || !data.gracePeriodEndsAt) {
        this.logger.error('Missing required fields for initiated deletion email job');
        return;
      }
      await this.tenantDeletionService.sendDeletionInitiatedEmails(
        data.tenantName,
        data.requestedByUserId,
        data.gracePeriodEndsAt,
        data.members
      );
    } else if (data.type === 'cancelled') {
      await this.tenantDeletionService.sendDeletionCancelledEmails(
        data.tenantName,
        data.members
      );
    }
  }

  private async handleExecuteDeletion(data: ExecuteDeletionJob): Promise<void> {
    await this.tenantDeletionService.executeDeletion(data.tenantId, data.tenantName);
  }

  private async handlePurgeTenantData(data: PurgeTenantDataJob): Promise<void> {
    await this.tenantDeletionService.purgeTenantData(
      data.tenantId,
      data.tenantName,
      data.ownerEmail,
      data.ownerName
    );
  }
}
