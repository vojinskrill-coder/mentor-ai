import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { OpenClawClientService } from '../agent-execution/openclaw-client.service';
import {
  APP_EVENTS,
  KnowledgeUpdateEvent,
  AgentJobStuckEvent,
  StageExecutionEvent,
} from './app-event-bus.service';

/**
 * Centralized Event Handlers
 *
 * React to application events with clean, isolated logic.
 * Each handler is independent and non-blocking unless explicitly async.
 */
@Injectable()
export class AppEventHandlers {
  private readonly logger = new Logger(AppEventHandlers.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly openClawClient: OpenClawClientService,
  ) {}

  // ─── Knowledge Updates (fire-and-forget, non-blocking) ───

  @OnEvent(APP_EVENTS.KNOWLEDGE_UPDATE_NEEDED, { async: true })
  async handleKnowledgeUpdate(event: KnowledgeUpdateEvent): Promise<void> {
    const { tenantId, conceptName, agentTypes, summary, companyName, personaType } = event;

    // Random stagger to avoid lock contention
    await new Promise((r) => setTimeout(r, Math.random() * 5_000));

    // Update domain masters
    for (const agentTypeStr of agentTypes) {
      try {
        const agentId = agentTypeStr.replace(/_/g, '-');
        await this.executeWithRetry(
          () => this.openClawClient.executeAgent(
            `KNOWLEDGE UPDATE za ${companyName} - Koncept: ${conceptName}. Zapamti ove nalaze:\n\n${summary}`,
            { agentId, timeoutSeconds: 180 }
          ),
          `knowledge-${agentId}`,
        );
        this.logger.log({ message: `Knowledge update: ${agentTypeStr} master`, conceptName });
      } catch (err) {
        this.logger.warn({ message: `Knowledge update failed: ${agentTypeStr}`, error: err instanceof Error ? err.message : 'Unknown' });
      }
    }

    // Update main agent
    try {
      await this.executeWithRetry(
        () => this.openClawClient.executeAgent(
          `KNOWLEDGE UPDATE za ${companyName}: Koncept "${conceptName}" (${personaType ?? 'UNKNOWN'}) zavrsen. Zapamti:\n${summary.substring(0, 3000)}`,
          { agentId: 'main', timeoutSeconds: 120 }
        ),
        'knowledge-main',
      );
      this.logger.log({ message: 'Knowledge update: main', conceptName });
    } catch (err) {
      this.logger.warn({ message: 'Knowledge update failed: main', error: err instanceof Error ? err.message : 'Unknown' });
    }
  }

  // ─── Stuck Job Recovery ───

  @OnEvent(APP_EVENTS.AGENT_JOB_STUCK, { async: true })
  async handleStuckJob(event: AgentJobStuckEvent): Promise<void> {
    const { tenantId, executionId, jobId, agentType } = event;

    this.logger.warn({ message: 'Handling stuck job', executionId, jobId, agentType });

    // Force-fail stuck execution
    await this.prisma.agentExecution.update({
      where: { id: executionId },
      data: {
        status: 'FAILED',
        error: `Stuck >20min — auto-recovered by event handler`,
        completedAt: new Date(),
      },
    });

    // Reset job to PLANNED for retry
    if (jobId) {
      await this.prisma.agentJob.update({
        where: { id: jobId },
        data: { status: 'PLANNED', executionId: null, error: null },
      });
      this.logger.log({ message: 'Stuck job reset to PLANNED', jobId });
    }
  }

  // ─── Stage Execution Continue ───

  @OnEvent(APP_EVENTS.STAGE_EXECUTION_CONTINUE)
  handleStageExecutionContinue(event: StageExecutionEvent): void {
    this.logger.log({
      message: 'Stage execution continue requested',
      tenantId: event.tenantId,
      stage: event.stage,
    });
    // The maturity engine listens for this event and re-triggers runStageExecution
  }

  // ─── Helpers ───

  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    label: string,
    maxRetries = 5,
    delayMs = 10_000,
  ): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isLock = msg.includes('session file locked') || msg.includes('.lock') || msg.includes('EBUSY');
        if (isLock && attempt < maxRetries) {
          this.logger.warn({ message: `Lock retry ${attempt + 1}/${maxRetries}: ${label}` });
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Retry exhausted: ${label}`);
  }
}
