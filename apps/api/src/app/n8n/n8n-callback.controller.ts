import {
  Controller,
  Post,
  Param,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  Optional,
  Inject,
} from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { AppEventBus } from '../events/app-event-bus.service';
import { BRIDGE_EVENTS } from '../bridge/bridge.service';
import { ProcessDeduplicationService } from '../process/process-dedup.service';
import { FalImageService } from '../process/fal-image.service';

// ─── DTOs ────────────────────────────────────

interface StepCallbackBody {
  stepName: string;
  status: 'success' | 'error';
  data: any;
  executionId: string;
}

interface ApprovalNeededBody {
  stepName: string;
  question: string;
  options: string[];
  resumeUrl: string;
  output?: any; // Leads/content data for UI display
}

// ─── Controller ──────────────────────────────

@Controller('v1/n8n')
export class N8nCallbackController {
  private readonly logger = new Logger(N8nCallbackController.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly eventBus: AppEventBus,
    private readonly dedup: ProcessDeduplicationService,
    private readonly falImage: FalImageService,
    @Optional()
    @Inject('McpEvolutionService')
    private readonly mcpEvolution: { propagateCatalogChange: (toolSlug: string, operationId: string, change: Record<string, unknown>) => Promise<unknown> } | null,
  ) {}

  /**
   * n8n calls this when a workflow step completes (success or error).
   * URL: POST /api/v1/n8n/callback/:processRunId
   */
  @Post('callback/:processRunId')
  @HttpCode(HttpStatus.OK)
  async handleStepCallback(
    @Param('processRunId') processRunId: string,
    @Body() body: StepCallbackBody,
  ) {
    this.logger.log(
      `Step callback received: run=${processRunId} step=${body.stepName} status=${body.status}`,
    );

    this.validateStepCallback(body);

    // Builder test-run callback routing:
    // If the processRunId has the `ptest_` prefix, this is a builder
    // test run. Route to the ProcessTestRun update flow instead of
    // the normal ProcessRun storage.
    if (processRunId.startsWith('ptest_')) {
      return this.handleBuilderTestCallback(processRunId, body);
    }

    // Find the process run and its tenant
    const processRun = await this.prisma.processRun.findUnique({
      where: { id: processRunId },
      select: { id: true, tenantId: true, workflowId: true },
    });

    if (!processRun) {
      this.logger.warn(`Process run not found: ${processRunId}`);
      throw new NotFoundException(`Process run ${processRunId} not found`);
    }

    // Find the step by name, or fall back to APPROVAL step (n8n sends final results to approval step)
    let step = await this.prisma.processStep.findFirst({
      where: { workflowId: processRun.workflowId, name: body.stepName },
      select: { id: true, order: true },
    });

    if (!step) {
      // n8n final callback — find the APPROVAL step to store results for UI review
      step = await this.prisma.processStep.findFirst({
        where: { workflowId: processRun.workflowId, stepType: 'APPROVAL' },
        select: { id: true, order: true },
      });
    }

    if (!step) {
      // Last resort — use the last step
      step = await this.prisma.processStep.findFirst({
        where: { workflowId: processRun.workflowId },
        orderBy: { order: 'desc' },
        select: { id: true, order: true },
      });
    }

    if (!step) {
      this.logger.warn(`No step found for workflow ${processRun.workflowId}`);
      throw new NotFoundException('No step found in workflow');
    }

    // Mark as COMPLETED immediately to prevent polling from overwriting with FAILED.
    // Image generation may take 30s+ but polling checks our status before acting.
    const isSuccess = body.status === 'success';
    if (isSuccess) {
      await this.prisma.processRun.update({
        where: { id: processRunId },
        data: { status: 'COMPLETED' },
      });
    }

    await this.prisma.processStepResult.upsert({
      where: { runId_stepId: { runId: processRunId, stepId: step.id } },
      create: {
        id: `psres_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        runId: processRunId,
        stepId: step.id,
        status: isSuccess ? 'PENDING' : 'FAILED', // PENDING = waiting for human approval
        output: isSuccess ? body.data : undefined,
        error: isSuccess ? undefined : JSON.stringify(body.data),
      },
      update: {
        status: isSuccess ? 'PENDING' : 'FAILED',
        output: isSuccess ? body.data : undefined,
        error: isSuccess ? undefined : JSON.stringify(body.data),
      },
    });

    if (!isSuccess) {
      await this.prisma.processRun.update({
        where: { id: processRunId },
        data: { status: 'FAILED', error: body.stepName + ' failed', completedAt: new Date() },
      });
      this.eventBus.emit(BRIDGE_EVENTS.PROCESS_STEP_FAILED, {
        tenantId: processRun.tenantId, runId: processRunId,
        stepName: body.stepName, error: JSON.stringify(body.data),
      });
      return { received: true, processRunId, stepName: body.stepName };
    }

    // ── SUCCESS PATH ──
    // 1. Generate images FIRST (await) — mutates body.data.posts in-place
    try {
      await this.generateImages(body.data, processRunId, step.id);
    } catch (err) {
      this.logger.warn(`Image generation failed: ${(err as Error).message}`);
    }

    // 2. NOW set COMPLETED with images included in finalOutput
    await this.prisma.processRun.update({
      where: { id: processRunId },
      data: { status: 'COMPLETED', finalOutput: body.data as any, completedAt: new Date() },
    });

    // 3. Update step result with image URLs too
    await this.prisma.processStepResult.update({
      where: { runId_stepId: { runId: processRunId, stepId: step.id } },
      data: { output: body.data },
    }).catch(() => {});

    // 4. Emit events — UI sees posts WITH images
    this.eventBus.emit(BRIDGE_EVENTS.PROCESS_COMPLETE, {
      tenantId: processRun.tenantId, runId: processRunId,
      workflowName: body.stepName, success: true,
    });
    this.eventBus.emit(BRIDGE_EVENTS.PROCESS_STEP_OUTPUT, {
      tenantId: processRun.tenantId, runId: processRunId,
      stepName: body.stepName, stepOrder: step.order, output: body.data,
    });

    // 5. Extract and process _specDrift reports (fire-and-forget)
    this.extractSpecDrift(body.data, processRun.tenantId, processRunId).catch(
      (err) => this.logger.warn(`Spec drift extraction failed: ${(err as Error).message}`),
    );

    // 6. Dedup (fire-and-forget)
    this.dedupLeads(body.data, processRun.tenantId, processRunId).catch(
      (err) => this.logger.warn(`Dedup storage failed: ${(err as Error).message}`),
    );

    this.logger.log(`Step callback processed: run=${processRunId} step=${body.stepName}`);
    return { received: true, processRunId, stepName: body.stepName };
  }

  /**
   * n8n calls this when a workflow step requires human approval.
   * URL: POST /api/v1/n8n/approval-needed/:processRunId
   */
  @Post('approval-needed/:processRunId')
  @HttpCode(HttpStatus.OK)
  async handleApprovalNeeded(
    @Param('processRunId') processRunId: string,
    @Body() body: ApprovalNeededBody,
  ) {
    this.logger.log(
      `Approval needed: run=${processRunId} step=${body.stepName}`,
    );

    this.validateApprovalBody(body);

    // Find the process run
    const processRun = await this.prisma.processRun.findUnique({
      where: { id: processRunId },
      select: { id: true, tenantId: true, workflowId: true },
    });

    if (!processRun) {
      this.logger.warn(`Process run not found: ${processRunId}`);
      throw new NotFoundException(`Process run ${processRunId} not found`);
    }

    // Update run status to WAITING_APPROVAL
    await this.prisma.processRun.update({
      where: { id: processRunId },
      data: { status: 'WAITING_APPROVAL' },
    });

    // Find the step and store resumeUrl in step result metadata
    const step = await this.prisma.processStep.findFirst({
      where: {
        workflowId: processRun.workflowId,
        name: body.stepName,
      },
      select: { id: true, order: true },
    });

    if (step) {
      await this.prisma.processStepResult.upsert({
        where: {
          runId_stepId: {
            runId: processRunId,
            stepId: step.id,
          },
        },
        create: {
          id: `psres_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          runId: processRunId,
          stepId: step.id,
          status: 'PENDING',
          output: body.output ?? {
            _approvalMeta: {
              question: body.question,
              options: body.options,
              resumeUrl: body.resumeUrl,
            },
          },
        },
        update: {
          status: 'PENDING',
          output: body.output ?? {
            _approvalMeta: {
              question: body.question,
              options: body.options,
              resumeUrl: body.resumeUrl,
            },
          },
        },
      });
    }

    // Emit event for real-time UI (shows approval dialog with leads/content data)
    this.eventBus.emit(BRIDGE_EVENTS.PROCESS_APPROVAL_NEEDED, {
      tenantId: processRun.tenantId,
      runId: processRunId,
      stepName: body.stepName,
      question: body.question,
      options: body.options,
      resumeUrl: body.resumeUrl,
      output: body.output, // Leads data for UI rendering
    });

    this.logger.log(
      `Approval request stored: run=${processRunId} step=${body.stepName}`,
    );

    return { received: true, processRunId, stepName: body.stepName };
  }

  // ─── Validation Helpers ────────────────────

  private validateStepCallback(body: StepCallbackBody): void {
    if (!body.stepName) {
      throw new BadRequestException('stepName is required');
    }
    if (!body.status || !['success', 'error'].includes(body.status)) {
      throw new BadRequestException('status must be "success" or "error"');
    }
    if (!body.executionId) {
      throw new BadRequestException('executionId is required');
    }
  }

  /**
   * Store leads/content in Qdrant for deduplication in future n8n runs.
   * Prevents finding the same companies/contacts across runs.
   */
  private async dedupLeads(data: any, tenantId: string, runId: string): Promise<void> {
    if (!data) return;
    const leads = data.leads || data.scoredLeads || data.enrichedLeads || [];
    if (!Array.isArray(leads) || leads.length === 0) return;

    const records = leads.map((l: any) => ({
      name: String(l.name ?? ''),
      company: String(l.company ?? ''),
      email: l.email as string | null,
      website: l.website as string | undefined,
      location: l.location as string | undefined,
      score: l.score as number | undefined,
      tenantId,
      workflowSlug: 'lead-discovery',
      runId,
      createdAt: new Date().toISOString(),
    }));

    await this.dedup.storeLeads(records);
    this.logger.log(`Stored ${records.length} leads in Qdrant for dedup`);
  }

  /**
   * Generate images for content posts via FAL.ai.
   * Updates step result and run output with imageUrl when done.
   */
  private async generateImages(data: any, runId: string, stepId: string): Promise<void> {
    const posts = data.posts || data.contentIdeas || [];
    if (!Array.isArray(posts) || posts.length === 0) return;

    const photoMap: Record<string, string> = {
      'eterna harmonia': 'Eterna Harmonija Statua.png',
      'eterna harmonija': 'Eterna Harmonija Statua.png',
      'nebeski uzlazak': 'Nebeski Uzlazak Statua.png',
      'golden flux': 'Golden Flux Statue.png',
      'sertifikat': 'Sertifikat.png',
      'certificate': 'Sertifikat.png',
    };
    const defaultPhotos = ['Eterna Harmonija Statua.png', 'Nebeski Uzlazak Statua.png', 'Golden Flux Statue.png'];
    let changed = false;

    for (const post of posts) {
      if (post.imageUrl) continue; // already has image

      const refName = String(post.imageReference ?? '').toLowerCase();
      const photoFile = Object.entries(photoMap).find(([k]) => refName.includes(k))?.[1];
      const imageType = String(post.imageType ?? 'composite');

      if (imageType === 'real' && photoFile) {
        post.imageUrl = `http://91.98.231.87:8003/${photoFile.replace(/ /g, '%20')}`;
        changed = true;
      } else {
        // Composite or fallback
        const photo = photoFile ?? defaultPhotos[Math.floor(Math.random() * defaultPhotos.length)];
        const context = [
          post.imagePrompt ? `Image: ${post.imagePrompt}` : '',
          post.topic ? `Topic: ${post.topic}` : '',
          post.visualStyle ? `Style: ${post.visualStyle}` : '',
        ].filter(Boolean).join('\n');

        try {
          const result = await this.falImage.generateComposite(photo!, context);
          if (result.success && result.url) {
            post.imageUrl = result.url;
            changed = true;
          }
        } catch (e) {
          this.logger.warn(`FAL.ai failed for "${post.topic}": ${(e as Error).message}`);
        }
      }
    }

    if (changed) {
      // Update stored results with image URLs
      const updatedData = { ...data, posts };
      await this.prisma.processStepResult.update({
        where: { runId_stepId: { runId, stepId } },
        data: { output: updatedData },
      });
      await this.prisma.processRun.update({
        where: { id: runId },
        data: { finalOutput: updatedData as any },
      });
      this.logger.log(`Generated images for ${posts.filter((p: any) => p.imageUrl).length}/${posts.length} posts`);
    }
  }

  private validateApprovalBody(body: ApprovalNeededBody): void {
    if (!body.stepName) {
      throw new BadRequestException('stepName is required');
    }
    if (!body.question) {
      throw new BadRequestException('question is required');
    }
    if (!body.resumeUrl) {
      throw new BadRequestException('resumeUrl is required');
    }
    if (!Array.isArray(body.options) || body.options.length === 0) {
      throw new BadRequestException('options must be a non-empty array');
    }
  }

  /**
   * Handle a callback for a builder test run (processRunId has
   * ptest_ prefix). Extracts items from the body and stores them on
   * the ProcessTestRun row, marking it `awaiting-approval` so the UI
   * can pick up the preview.
   */
  private async handleBuilderTestCallback(
    testRunId: string,
    body: StepCallbackBody,
  ) {
    const run = await this.prisma.processTestRun.findUnique({
      where: { id: testRunId },
    });
    if (!run) {
      this.logger.warn(`Builder test run not found: ${testRunId}`);
      throw new NotFoundException(`Test run ${testRunId} not found`);
    }

    // Extract items from body.data — handles {items, leads, posts, ...}
    const data = (body.data ?? {}) as Record<string, unknown>;
    let items: unknown[] = [];
    if (Array.isArray(data.items)) items = data.items;
    else if (Array.isArray(data.leads)) items = data.leads;
    else if (Array.isArray(data.posts)) items = data.posts;
    else if (Array.isArray(data.results)) items = data.results;
    else if (Array.isArray(data.data)) items = data.data;

    const newStatus = body.status === 'success' ? 'awaiting-approval' : 'failed';
    const errorMsg =
      body.status === 'error'
        ? (data.error as string | undefined) ?? 'n8n reported error'
        : null;

    await this.prisma.processTestRun.update({
      where: { id: testRunId },
      data: {
        status: newStatus,
        output: items as unknown as object,
        stepEvents: [
          ...((run.stepEvents as unknown[]) ?? []),
          {
            at: new Date().toISOString(),
            event: 'callback-received',
            stepName: body.stepName,
            status: body.status,
            itemCount: items.length,
          },
        ] as unknown as object,
        error: errorMsg,
        completedAt: new Date(),
      },
    });

    this.logger.log({
      message: 'Builder test run callback stored',
      testRunId,
      itemCount: items.length,
      status: newStatus,
    });

    // Emit websocket event so the UI can refresh immediately
    this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
      tenantId: run.tenantId,
      taskId: testRunId,
      agent: 'process-builder:test',
      status: newStatus === 'awaiting-approval' ? 'completed' : 'failed',
      message: `Test run ${newStatus}: ${items.length} items`,
      timestamp: new Date().toISOString(),
    });

    return { ok: true, testRunId, itemCount: items.length, status: newStatus };
  }

  /**
   * Extract _specDrift objects from agent output and update MCP catalog.
   * When an agent discovers that an MCP API changed (field renamed,
   * endpoint deprecated), it appends _specDrift to its output. We
   * extract these, update the catalog, and log for audit.
   */
  private async extractSpecDrift(data: unknown, tenantId: string, runId: string): Promise<void> {
    if (!data || typeof data !== 'object') return;

    // Find _specDrift entries in the data
    const items = Array.isArray(data) ? data : (data as Record<string, unknown>).items;
    if (!Array.isArray(items)) return;

    const drifts = items.filter(
      (item: unknown) => item && typeof item === 'object' && '_specDrift' in (item as Record<string, unknown>),
    );

    if (drifts.length === 0) return;

    for (const driftItem of drifts) {
      const drift = (driftItem as Record<string, unknown>)['_specDrift'] as Record<string, unknown>;
      if (!drift) continue;

      const toolSlug = drift['tool'] as string;
      const operationId = drift['operation'] as string;
      const issue = drift['issue'] as string;

      if (!toolSlug || !operationId) continue;

      this.logger.log({
        message: 'MCP spec drift detected by agent',
        toolSlug,
        operationId,
        issue,
        runId,
        tenantId,
      });

      // Log to vault operation log for monitoring
      try {
        await this.prisma.vaultOperationLog.create({
          data: {
            id: `vlog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            tenantId,
            operationType: 'spec_drift',
            conceptsAffected: 0,
            status: 'completed',
            details: {
              toolSlug,
              operationId,
              issue,
              oldField: drift['oldField'] ?? null,
              newField: drift['newField'] ?? null,
              discoveredBy: `process-run-${runId}`,
              timestamp: drift['timestamp'] ?? new Date().toISOString(),
            },
          },
        });
      } catch (logErr) {
        this.logger.warn(`Failed to log spec drift: ${(logErr as Error).message}`);
      }

      // Update MCP catalog with corrected field info
      try {
        const tool = await this.prisma.mcpToolCatalog.findUnique({
          where: { slug: toolSlug },
        });

        if (tool) {
          const operations = (tool.operations as unknown as Array<Record<string, unknown>>) ?? [];
          const op = operations.find((o) => o['id'] === operationId);

          if (op && drift['oldField'] && drift['newField']) {
            // Update the operation's schema with the new field name
            const inputSchema = (op['inputSchema'] as Record<string, unknown>) ?? {};
            const props = (inputSchema['properties'] as Record<string, unknown>) ?? {};

            const oldField = drift['oldField'] as string;
            const newField = drift['newField'] as string;

            if (props[oldField]) {
              props[newField] = props[oldField];
              delete props[oldField];
              op['inputSchema'] = { ...inputSchema, properties: props };

              await this.prisma.mcpToolCatalog.update({
                where: { slug: toolSlug },
                data: { operations: operations as unknown as object },
              });

              this.logger.log({
                message: 'MCP catalog updated from spec drift',
                toolSlug,
                operationId,
                oldField,
                newField,
              });

              // Propagate to all existing processes (fire-and-forget)
              if (this.mcpEvolution) {
                this.mcpEvolution.propagateCatalogChange(toolSlug, operationId, {
                  oldField,
                  newField,
                  issue: issue ?? 'field renamed',
                }).catch((propErr) => {
                  this.logger.warn(`Spec drift propagation failed: ${(propErr as Error).message}`);
                });
              }
            }
          }
        }
      } catch (catalogErr) {
        this.logger.warn(`Failed to update MCP catalog from spec drift: ${(catalogErr as Error).message}`);
      }
    }

    // Strip _specDrift objects from the data so users don't see them
    if (Array.isArray(data)) {
      const cleanItems = items.filter(
        (item: unknown) => !(item && typeof item === 'object' && '_specDrift' in (item as Record<string, unknown>)),
      );
      // Mutate in place — the caller stores this data
      items.length = 0;
      items.push(...cleanItems);
    }
  }
}
