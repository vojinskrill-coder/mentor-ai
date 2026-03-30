import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { AppEventBus } from '../events/app-event-bus.service';
import { OpenClawClientService } from '../agent-execution/openclaw-client.service';
import { SchemaValidatorService } from './schema-validator.service';
import { ProcessDeduplicationService } from './process-dedup.service';
import { FalImageService } from './fal-image.service';
import { BRIDGE_EVENTS } from '../bridge/bridge.service';

/** Default retry policy if none specified on the step */
const DEFAULT_RETRY_POLICY = { maxRetries: 2, backoffMs: 2000 };

/** Max age for cancelled run entries before cleanup (10 minutes) */
const CANCEL_CLEANUP_MS = 10 * 60 * 1000;

@Injectable()
export class ProcessExecutorService implements OnModuleDestroy {
  private readonly logger = new Logger(ProcessExecutorService.name);

  /** Track active run cancellation signals with timestamp for cleanup (F5) */
  private readonly cancelledRuns = new Map<string, number>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly eventBus: AppEventBus,
    private readonly openClawClient: OpenClawClientService,
    private readonly schemaValidator: SchemaValidatorService,
    private readonly dedup: ProcessDeduplicationService,
    private readonly falImage: FalImageService,
  ) {
    // Periodic cleanup of stale cancel entries (F5)
    this.cleanupInterval = setInterval(() => this.cleanupCancelledRuns(), CANCEL_CLEANUP_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
  }

  /**
   * Start a new process run for a given workflow
   */
  async startRun(
    workflowId: string,
    tenantId: string,
    input?: Record<string, unknown>,
    correlationId?: string,
  ): Promise<string> {
    const workflow = await this.prisma.processWorkflow.findUnique({
      where: { id: workflowId },
      include: { steps: { orderBy: { order: 'asc' } } },
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (workflow.tenantId !== tenantId) {
      throw new Error('Workflow does not belong to this tenant');
    }

    // Atomic dedup: try to create the run, catch unique constraint if concurrent (F6)
    // Use optimistic approach: create first, let DB enforce uniqueness via status check
    const runId = `prun_${createId()}`;
    try {
      // Check-and-create in a transaction for atomicity (F6)
      const run = await this.prisma.$transaction(async (tx) => {
        const activeRun = await tx.processRun.findFirst({
          where: {
            workflowId,
            status: { in: ['RUNNING', 'WAITING_APPROVAL'] },
          },
        });

        if (activeRun) {
          throw new Error(`Workflow already has an active run: ${activeRun.id}`);
        }

        return tx.processRun.create({
          data: {
            id: runId,
            workflowId,
            tenantId,
            status: 'RUNNING',
            currentStepOrder: 1,
            correlationId,
            input: (input ?? null) as any,
            startedAt: new Date(),
          },
        });
      });

      // Emit run started event
      this.eventBus.emit(BRIDGE_EVENTS.PROCESS_RUN_STARTED, {
        tenantId,
        runId: run.id,
        workflowName: workflow.name,
        totalSteps: workflow.steps.length,
        correlationId,
      });

      // Load tenant business context for enriched prompts (F15)
      const businessContext = await this.loadBusinessContext(tenantId);

      // Start executing steps asynchronously
      this.executeSteps(run.id, workflow.steps, tenantId, workflow.name, correlationId, businessContext).catch(
        (err) => this.logger.error(`Run ${runId} failed unexpectedly: ${err}`),
      );

      return runId;
    } catch (err: any) {
      // Re-throw application errors as-is
      throw err;
    }
  }

  /**
   * Load tenant business context (memories, company info) for prompt enrichment (F15)
   */
  private async loadBusinessContext(tenantId: string): Promise<string> {
    try {
      const [tenant, memories, concepts] = await Promise.all([
        this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, industry: true, description: true },
        }),
        this.prisma.memory.findMany({
          where: { tenantId, isDeleted: false },
          select: { content: true, type: true, subject: true },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        }),
        // Load relevant business concepts (marketing, sales, branding)
        this.prisma.concept.findMany({
          where: {
            OR: [{ tenantId: null }, { tenantId }],
            category: { contains: 'Marketing' },
          },
          select: { name: true, definition: true, category: true },
          take: 15,
        }).catch(() => [] as Array<{ name: string; definition: string; category: string }>),
      ]);

      const parts: string[] = [];
      if (tenant) {
        parts.push(`Company: ${tenant.name}`);
        parts.push(`Industry: ${tenant.industry}`);
        if (tenant.description) parts.push(`Description: ${tenant.description}`);
      }

      if (memories.length > 0) {
        parts.push('', 'Business Knowledge (from conversations and learning):');
        for (const mem of memories) {
          const prefix = mem.subject ? `[${mem.subject}] ` : '';
          parts.push(`- ${prefix}${mem.content.slice(0, 200)}`);
        }
      }

      if (concepts.length > 0) {
        parts.push('', 'Domain Expertise (key business concepts we know about):');
        for (const c of concepts) {
          parts.push(`- ${c.name}: ${c.definition.slice(0, 150)}`);
        }
      }

      // Brand visual identity guidelines (used for image generation and content)
      parts.push('', 'Brand Visual Identity:');
      parts.push('- Color palette: #0D0D0D (base black), #1A1A1A (dark surface), #C9A96E (gold accent), #FAFAFA (white text)');
      parts.push('- Photography style: Dark, dramatic, cinematic lighting. High contrast. Moody atmosphere.');
      parts.push('- Aesthetic: Luxury gallery, museum-quality. Clean lines. Architectural spaces.');
      parts.push('- Tone: Elegant, exclusive, understated luxury. Gallery-curator voice.');
      parts.push('- Typography: Minimal, serif for headlines, clean sans-serif for body.');
      parts.push('- Image style for FAL.ai: Always include "dramatic dark lighting, gold accent tones, luxury architectural interior, cinematic photography, 8k, photorealistic" in prompts.');

      return parts.join('\n');
    } catch (err) {
      this.logger.warn(`Failed to load business context for tenant ${tenantId}: ${err}`);
      return '';
    }
  }

  /**
   * Execute steps sequentially for a run
   */
  private async executeSteps(
    runId: string,
    steps: Array<{
      id: string;
      order: number;
      name: string;
      stepType: string;
      agentType: string;
      toolSkill: string;
      inputSchema: unknown;
      outputSchema: unknown;
      skillMdSection: string | null;
      retryPolicy: unknown;
      verifyRules: unknown;
    }>,
    tenantId: string,
    workflowName: string,
    correlationId?: string,
    businessContext?: string,
    /** Override total steps count (for correct progress after approval resume) */
    totalStepsOverride?: number,
  ): Promise<void> {
    const totalSteps = totalStepsOverride ?? steps.length;
    let lastStepOutput: unknown = null;

    for (const step of steps) {
      // Check for cancellation (F5: don't update status here, already set in cancelRun)
      if (this.isCancelled(runId)) {
        this.cancelledRuns.delete(runId);
        return; // Status already CANCELLED — just stop executing
      }

      // Update current step
      await this.prisma.processRun.update({
        where: { id: runId },
        data: { currentStepOrder: step.order },
      });

      // Create step result record (unique constraint prevents duplicates)
      let resultId: string;
      try {
        const result = await this.prisma.processStepResult.create({
          data: {
            id: `psres_${createId()}`,
            runId,
            stepId: step.id,
            status: 'RUNNING',
            input: lastStepOutput as any,
            startedAt: new Date(),
          },
        });
        resultId = result.id;
      } catch (err: any) {
        // Unique constraint violation → step already has a result (concurrent guard)
        if (err?.code === 'P2002') {
          this.logger.warn(`Duplicate step result prevented for run=${runId} step=${step.id}`);
          return;
        }
        throw err;
      }

      // Emit step started
      this.eventBus.emit(BRIDGE_EVENTS.PROCESS_STEP_STARTED, {
        tenantId,
        runId,
        stepName: step.name,
        stepOrder: step.order,
        totalSteps,
        agentType: step.agentType,
        status: 'started',
        correlationId,
      });

      // Handle step types (F4: explicitly handle MANUAL and APPROVAL)
      if (step.stepType === 'APPROVAL' || step.stepType === 'MANUAL') {
        // Both APPROVAL and MANUAL halt for human input
        // For APPROVAL: previous step output is presented for review
        // For MANUAL: human provides the data
        await this.prisma.processStepResult.update({
          where: { id: resultId },
          data: { output: lastStepOutput as any }, // (F7) store previous output for review
        });

        await this.prisma.processRun.update({
          where: { id: runId },
          data: { status: 'WAITING_APPROVAL' },
        });

        this.eventBus.emit(BRIDGE_EVENTS.PROCESS_APPROVAL_NEEDED, {
          tenantId,
          runId,
          stepResultId: resultId,
          stepName: step.name,
          stepOrder: step.order,
          totalSteps,
          output: lastStepOutput, // (F7) send previous output for display
          correlationId,
        });

        // Execution halts here — resumed via handleApproval()
        return;
      }

      // Execute AUTOMATIC step
      const stepOutput = await this.executeStep(
        runId, resultId, step, lastStepOutput, tenantId, steps.length, correlationId, businessContext,
      );

      if (stepOutput === null) {
        // Step failed after retries — check if already cancelled (F5)
        if (this.isCancelled(runId)) {
          this.cancelledRuns.delete(runId);
          return; // Already CANCELLED, don't overwrite to FAILED
        }

        await this.prisma.processRun.update({
          where: { id: runId },
          data: { status: 'FAILED', completedAt: new Date() },
        });

        this.eventBus.emit(BRIDGE_EVENTS.PROCESS_COMPLETE, {
          tenantId,
          runId,
          workflowName,
          success: false,
          correlationId,
        });
        return;
      }

      lastStepOutput = stepOutput;
    }

    // All steps complete
    await this.prisma.processRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        finalOutput: lastStepOutput as any,
        completedAt: new Date(),
      },
    });

    this.eventBus.emit(BRIDGE_EVENTS.PROCESS_COMPLETE, {
      tenantId,
      runId,
      workflowName,
      success: true,
      correlationId,
    });

    // Store leads in Qdrant for future deduplication
    this.storeLeadsForDedup(lastStepOutput, tenantId, workflowName, runId).catch(
      (err) => this.logger.warn(`Lead dedup storage failed: ${err}`),
    );
  }

  /**
   * Extract leads from final output and store in Qdrant for deduplication.
   */
  private async storeLeadsForDedup(
    finalOutput: unknown,
    tenantId: string,
    workflowName: string,
    runId: string,
  ): Promise<void> {
    if (!finalOutput || typeof finalOutput !== 'object') return;

    const output = finalOutput as Record<string, unknown>;

    // Store leads from lead discovery processes
    const leadArrays = ['approvedLeads', 'scoredLeads', 'enrichedLeads', 'outreachLeads', 'leads'];
    for (const key of leadArrays) {
      const arr = output[key];
      if (Array.isArray(arr) && arr.length > 0) {
        const records = arr.map((l: any) => ({
          name: String(l['name'] ?? ''),
          company: String(l['company'] ?? ''),
          email: l['email'] as string | null,
          website: l['website'] as string | undefined,
          location: l['location'] as string | undefined,
          score: l['score'] as number | undefined,
          tenantId,
          workflowSlug: workflowName,
          runId,
          createdAt: new Date().toISOString(),
        }));
        await this.dedup.storeLeads(records);
        return;
      }
    }

    // Store content topics from content processes
    const contentArrays = ['posts', 'contentIdeas', 'approvedPosts'];
    for (const key of contentArrays) {
      const arr = output[key];
      if (Array.isArray(arr) && arr.length > 0) {
        const records = arr.map((item: any) => ({
          name: String(item['topic'] ?? item['title'] ?? ''),
          company: workflowName, // use workflow name as "company" for content
          tenantId,
          workflowSlug: workflowName,
          runId,
          createdAt: new Date().toISOString(),
          contentType: 'instagram-post' as any,
        }));
        await this.dedup.storeLeads(records);
        return;
      }
    }
  }

  /**
   * Execute a single step: send to agent, validate, retry with correction
   */
  private async executeStep(
    runId: string,
    resultId: string,
    step: {
      id: string;
      order: number;
      name: string;
      agentType: string;
      toolSkill: string;
      inputSchema: unknown;
      outputSchema: unknown;
      skillMdSection: string | null;
      retryPolicy: unknown;
      verifyRules: unknown;
    },
    previousOutput: unknown,
    tenantId: string,
    totalSteps: number,
    correlationId?: string,
    businessContext?: string,
  ): Promise<unknown | null> {
    const retryPolicy = {
      ...DEFAULT_RETRY_POLICY,
      ...(typeof step.retryPolicy === 'object' && step.retryPolicy ? step.retryPolicy as Record<string, unknown> : {}),
    };
    const maxRetries = (retryPolicy.maxRetries as number) ?? 2;

    // Build original prompt once and keep for retries (F11)
    const originalPrompt = await this.buildStepPrompt(step, previousOutput, businessContext, tenantId);
    let prompt: string = originalPrompt;
    let lastError: string | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (this.isCancelled(runId)) return null;

      // Update retry count
      if (attempt > 0) {
        await this.prisma.processStepResult.update({
          where: { id: resultId },
          data: { retries: attempt },
        });
      }

      // Execute via OpenClaw (1 hour timeout — processes can be long-running)
      // Fresh random session every call — prevents context accumulation in OpenClaw
      const result = await this.openClawClient.executeAgent(prompt, {
        agentId: step.agentType,
        timeoutSeconds: 3600,
      });

      if (!result.success) {
        lastError = result.error ?? 'Agent execution failed';
        this.logger.warn(`Step ${step.name} attempt ${attempt + 1} failed: ${lastError}`);

        // Build correction prompt preserving original context (F11)
        prompt = originalPrompt + '\n\n' + this.schemaValidator.buildCorrectionPrompt(
          [lastError],
          result.output ?? '',
        );
        continue;
      }

      // Check for known error responses before JSON parse
      const output = result.output?.trim() ?? '';
      if (output.includes('rate limit') || output.includes('API rate limit') || output.startsWith('⚠️')) {
        lastError = `Agent returned error: ${output.slice(0, 200)}`;
        this.logger.warn(`Step ${step.name} attempt ${attempt + 1}: agent error response — ${lastError}`);
        // Wait before retry on rate limit
        await new Promise(r => setTimeout(r, 5000));
        prompt = originalPrompt; // Retry with original prompt, not correction
        continue;
      }

      // Try to parse JSON from agent output — extract JSON even if wrapped in text/markdown
      let parsedOutput: unknown;
      try {
        parsedOutput = JSON.parse(output);
      } catch {
        // Try to extract JSON from markdown code fences or surrounding text
        const extracted = this.extractJson(output);
        if (extracted) {
          try {
            parsedOutput = JSON.parse(extracted);
          } catch {
            // Still invalid
          }
        }
      }
      if (!parsedOutput) {
        lastError = `Agent output is not valid JSON (got ${output.length} chars: "${output.slice(0, 100)}...")`;
        this.logger.warn(`Step ${step.name} attempt ${attempt + 1}: invalid JSON — ${output.slice(0, 100)}`);

        prompt = originalPrompt + '\n\n' + this.schemaValidator.buildCorrectionPrompt(
          ['Output must be valid JSON. Your output could not be parsed.'],
          output,
        );
        continue;
      }

      // Level 1: Schema validation
      const outputSchema = step.outputSchema as Record<string, unknown>;
      if (outputSchema && Object.keys(outputSchema).length > 0) {
        const validation = this.schemaValidator.validateSchema(parsedOutput, outputSchema);
        if (!validation.valid) {
          lastError = `Schema validation failed: ${validation.errors.join('; ')}`;
          this.logger.warn(`Step ${step.name} attempt ${attempt + 1}: ${lastError}`);

          prompt = originalPrompt + '\n\n' + this.schemaValidator.buildCorrectionPrompt(validation.errors, result.output);
          continue;
        }
      }

      // Level 2: Data verification (if rules defined)
      const verifyRules = step.verifyRules as Array<{ field: string; type: string; value?: unknown }> | null;
      if (verifyRules && Array.isArray(verifyRules) && verifyRules.length > 0) {
        const verification = await this.schemaValidator.verifyData(
          parsedOutput,
          verifyRules as any,
        );
        if (!verification.valid) {
          // Verification failures are warnings — null out failing fields rather than retry
          this.logger.warn(
            `Step ${step.name}: verification issues: ${verification.failures.map(f => f.reason).join('; ')}`,
          );
          // Null out unverified fields to prevent hallucinated data
          for (const failure of verification.failures) {
            this.nullifyField(parsedOutput, failure.field);
          }
        }
      }

      // Post-process: generate images via FAL.ai if output contains imagePrompt fields
      parsedOutput = await this.generateImagesIfNeeded(parsedOutput);

      // Success — update step result
      await this.prisma.processStepResult.update({
        where: { id: resultId },
        data: {
          status: 'COMPLETED',
          output: parsedOutput as any,
          rawOutput: result.output,
          completedAt: new Date(),
        },
      });

      // Emit step output
      this.eventBus.emit(BRIDGE_EVENTS.PROCESS_STEP_OUTPUT, {
        tenantId,
        runId,
        stepName: step.name,
        stepOrder: step.order,
        totalSteps,
        agentType: step.agentType,
        status: 'output',
        output: parsedOutput,
        correlationId,
      });

      return parsedOutput;
    }

    // All retries exhausted
    await this.prisma.processStepResult.update({
      where: { id: resultId },
      data: {
        status: 'FAILED',
        error: lastError,
        completedAt: new Date(),
      },
    });

    this.eventBus.emit(BRIDGE_EVENTS.PROCESS_STEP_FAILED, {
      tenantId,
      runId,
      stepName: step.name,
      stepOrder: step.order,
      totalSteps,
      agentType: step.agentType,
      status: 'failed',
      error: lastError,
      correlationId,
    });

    return null;
  }

  /**
   * Handle approval or rejection for a WAITING_APPROVAL run
   */
  async handleApproval(
    resultId: string,
    approved: boolean,
    userId: string,
    tenantId: string,
    modifiedOutput?: Record<string, unknown>,
  ): Promise<void> {
    const stepResult = await this.prisma.processStepResult.findUnique({
      where: { id: resultId },
      include: {
        run: { include: { workflow: { include: { steps: { orderBy: { order: 'asc' } } } } } },
        step: true,
      },
    });

    if (!stepResult) throw new Error('Step result not found');
    if (stepResult.run.tenantId !== tenantId) throw new Error('Tenant mismatch');
    if (stepResult.run.status !== 'WAITING_APPROVAL') {
      throw new Error('Run is not waiting for approval');
    }

    // Use modifiedOutput if provided, otherwise fall back to stored output (F7: now populated)
    const finalStepOutput = modifiedOutput ?? (stepResult.output as Record<string, unknown>) ?? {};

    // Update step result
    await this.prisma.processStepResult.update({
      where: { id: resultId },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        output: finalStepOutput as any,
        approvedBy: userId,
        approvedAt: new Date(),
        completedAt: new Date(),
      },
    });

    // Save approved items to dedicated tables
    if (approved) {
      await this.saveApprovedItems(finalStepOutput, tenantId, stepResult.runId, stepResult.run.workflow.slug).catch(
        (err) => this.logger.warn(`Failed to save approved items: ${err}`),
      );
    }

    if (!approved) {
      // Rejection → fail the run
      await this.prisma.processRun.update({
        where: { id: stepResult.runId },
        data: { status: 'FAILED', completedAt: new Date(), error: 'Step rejected by user' },
      });

      this.eventBus.emit(BRIDGE_EVENTS.PROCESS_COMPLETE, {
        tenantId,
        runId: stepResult.runId,
        workflowName: stepResult.run.workflow.name,
        success: false,
        correlationId: stepResult.run.correlationId,
      });
      return;
    }

    // Approval → resume execution from next step
    const allSteps = stepResult.run.workflow.steps;
    const currentStepIndex = allSteps.findIndex(s => s.id === stepResult.stepId);
    const remainingSteps = allSteps.slice(currentStepIndex + 1);

    if (remainingSteps.length === 0) {
      // Last step was approved → complete run
      await this.prisma.processRun.update({
        where: { id: stepResult.runId },
        data: {
          status: 'COMPLETED',
          finalOutput: finalStepOutput as any,
          completedAt: new Date(),
        },
      });

      this.eventBus.emit(BRIDGE_EVENTS.PROCESS_COMPLETE, {
        tenantId,
        runId: stepResult.runId,
        workflowName: stepResult.run.workflow.name,
        success: true,
        correlationId: stepResult.run.correlationId,
      });
      return;
    }

    // Resume running
    await this.prisma.processRun.update({
      where: { id: stepResult.runId },
      data: { status: 'RUNNING' },
    });

    // Load business context for remaining steps
    const businessContext = await this.loadBusinessContext(tenantId);

    // Continue execution with remaining steps (pass original total for correct progress events)
    this.executeSteps(
      stepResult.runId,
      remainingSteps,
      tenantId,
      stepResult.run.workflow.name,
      stepResult.run.correlationId ?? undefined,
      businessContext,
      allSteps.length, // totalStepsOverride — preserve original count
    ).catch((err) => this.logger.error(`Resume after approval failed: ${err}`));
  }

  /**
   * Cancel a running process
   */
  async cancelRun(runId: string, tenantId: string): Promise<void> {
    const run = await this.prisma.processRun.findUnique({
      where: { id: runId },
      include: { workflow: true },
    });

    if (!run) throw new Error('Run not found');
    if (run.tenantId !== tenantId) throw new Error('Tenant mismatch');
    if (run.status !== 'RUNNING' && run.status !== 'WAITING_APPROVAL') {
      throw new Error('Run is not active');
    }

    // Signal cancellation with timestamp (F5)
    this.cancelledRuns.set(runId, Date.now());

    await this.prisma.processRun.update({
      where: { id: runId },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    this.eventBus.emit(BRIDGE_EVENTS.PROCESS_CANCELLED, {
      tenantId,
      runId,
      workflowName: run.workflow.name,
      correlationId: run.correlationId,
    });
  }

  /**
   * Check if a run has been cancelled (F5)
   */
  private isCancelled(runId: string): boolean {
    return this.cancelledRuns.has(runId);
  }

  /**
   * Cleanup stale cancel entries older than CANCEL_CLEANUP_MS (F5)
   */
  private cleanupCancelledRuns(): void {
    const now = Date.now();
    for (const [runId, timestamp] of this.cancelledRuns) {
      if (now - timestamp > CANCEL_CLEANUP_MS) {
        this.cancelledRuns.delete(runId);
      }
    }
  }

  /** Max chars for previous step output before triggering intelligent summary.
   *  OpenClaw agents have ~27K system prompt overhead, so keep our prompt compact.
   */
  private readonly MAX_RAW_INPUT_CHARS = 4000;

  /**
   * Build the prompt for an agent step execution.
   * If previous output is too large, summarizes it via LLM first.
   */
  private async buildStepPrompt(
    step: {
      name: string;
      toolSkill: string;
      skillMdSection: string | null;
      inputSchema: unknown;
      outputSchema: unknown;
      order?: number;
    },
    previousOutput: unknown,
    businessContext?: string,
    tenantId?: string,
  ): Promise<string> {
    const parts: string[] = [
      `# Step: ${step.name}`,
      `Tool/Skill: ${step.toolSkill}`,
    ];

    // Inject business context so agents know about the specific business (F15)
    if (businessContext) {
      parts.push('', '## Business Context', businessContext);
    }

    // Inject dedup context for first step to avoid repeating known contacts/content
    if (step.order === 1 && tenantId) {
      try {
        const [leadDedup, contentDedup] = await Promise.all([
          this.dedup.buildDeduplicationContext(tenantId),
          this.dedup.buildContentDeduplicationContext(tenantId),
        ]);
        if (leadDedup) parts.push('', leadDedup);
        if (contentDedup) parts.push('', contentDedup);
      } catch (err) {
        this.logger.warn(`Dedup context failed: ${err}`);
      }
    }

    if (step.skillMdSection) {
      parts.push('', '## Instructions', step.skillMdSection);
    }

    if (step.outputSchema && Object.keys(step.outputSchema as object).length > 0) {
      parts.push(
        '',
        '## Required Output Format (JSON Schema)',
        'You MUST return valid JSON matching this schema exactly:',
        '```json',
        JSON.stringify(step.outputSchema, null, 2),
        '```',
      );
    }

    if (previousOutput) {
      const rawJson = JSON.stringify(previousOutput, null, 2);

      if (rawJson.length > this.MAX_RAW_INPUT_CHARS) {
        // Summarize large output intelligently via LLM
        this.logger.log(`Previous output too large (${rawJson.length} chars), summarizing for step "${step.name}"`);
        const summary = await this.summarizePreviousOutput(rawJson, step.name);
        parts.push(
          '',
          '## Input from Previous Step (Intelligent Summary)',
          '(Full data was too large. Key details preserved below.)',
          '',
          summary,
        );
      } else {
        parts.push(
          '',
          '## Input from Previous Step',
          '```json',
          rawJson,
          '```',
        );
      }
    }

    parts.push(
      '',
      '## CRITICAL: Return ONLY valid JSON. No markdown, no commentary, no code fences.',
    );

    return parts.join('\n');
  }

  /**
   * Use LLM to create an intelligent summary of large previous step output.
   * Preserves key data (names, emails, scores, companies) but reduces volume.
   */
  private async summarizePreviousOutput(rawJson: string, nextStepName: string): Promise<string> {
    try {
      const summarizePrompt = [
        `Compress this data for the next step "${nextStepName}". Output MUST be under 3000 characters.`,
        '',
        'FORMAT: One line per item. Keep ONLY: name, company, role, email, linkedin, score, location.',
        'Example line: "Marko Petrovic | Lux Design Studio | CEO | marko@lux.rs | linkedin.com/in/marko | score:8 | Belgrade"',
        '',
        'Drop: verbose descriptions, reasoning, full URLs (shorten), source links, notes.',
        'Keep ALL items — just make each one a single compact line.',
        '',
        'Data:',
        rawJson.slice(0, 30000),
      ].join('\n');

      const result = await this.openClawClient.executeAgent(summarizePrompt, {
        agentId: 'main',
        timeoutSeconds: 120,
        sessionId: `summary-${Date.now()}`,
      });

      if (result.success && result.output) {
        this.logger.log(`Summary generated: ${result.output.length} chars (from ${rawJson.length})`);
        return result.output;
      }

      // Fallback: extract just the key fields
      this.logger.warn('Summary generation failed, using compact extraction');
      return this.compactExtract(rawJson);
    } catch (err) {
      this.logger.warn(`Summary failed: ${err}, using compact extraction`);
      return this.compactExtract(rawJson);
    }
  }

  /**
   * Fallback: extract compact key fields from JSON without LLM
   */
  private compactExtract(rawJson: string): string {
    try {
      const data = JSON.parse(rawJson);
      // Find arrays of leads/items and extract key fields only
      const arrays = this.findArrays(data);
      if (arrays.length === 0) return rawJson.slice(0, 3000);

      const compacted: string[] = [];
      for (const { key, items } of arrays) {
        compacted.push(`\n### ${key} (${items.length} items):`);
        for (const item of items) {
          const line = [
            item['name'] ?? item['company'] ?? '',
            item['company'] ? `@ ${item['company']}` : '',
            item['email'] ? `| ${item['email']}` : '',
            item['score'] !== undefined ? `| score:${item['score']}` : '',
            item['location'] ? `| ${item['location']}` : '',
            item['role'] ? `(${item['role']})` : '',
          ].filter(Boolean).join(' ');
          compacted.push(`- ${line}`);
        }
      }
      return compacted.join('\n');
    } catch {
      return rawJson.slice(0, this.MAX_RAW_INPUT_CHARS);
    }
  }

  /**
   * Find arrays in an object (top-level or one level deep)
   */
  private findArrays(obj: unknown): Array<{ key: string; items: any[] }> {
    const result: Array<{ key: string; items: any[] }> = [];
    if (!obj || typeof obj !== 'object') return result;
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
        result.push({ key, items: val });
      }
    }
    return result;
  }

  /**
   * Save approved items to dedicated database tables for easy querying.
   */
  private async saveApprovedItems(
    output: Record<string, unknown>,
    tenantId: string,
    runId: string,
    workflowSlug: string,
  ): Promise<void> {
    // Save approved leads
    const leadArrays = ['approvedLeads', 'scoredLeads', 'outreachLeads', 'enrichedLeads'];
    for (const key of leadArrays) {
      const arr = output[key];
      if (Array.isArray(arr) && arr.length > 0) {
        for (const lead of arr) {
          const l = lead as Record<string, unknown>;
          await this.prisma.approvedLead.create({
            data: {
              id: `alead_${createId()}`,
              tenantId,
              runId,
              name: String(l['name'] ?? ''),
              company: String(l['company'] ?? ''),
              role: l['role'] as string ?? null,
              email: l['email'] as string ?? null,
              emailSource: l['emailSource'] as string ?? null,
              linkedin: l['linkedin'] as string ?? null,
              phone: l['phone'] as string ?? null,
              website: l['website'] as string ?? null,
              location: l['location'] as string ?? null,
              companyDescription: l['companyDescription'] as string ?? null,
              whyGoodFit: l['whyGoodFit'] as string ?? null,
              score: typeof l['score'] === 'number' ? l['score'] : null,
              scoreBreakdown: l['scoreBreakdown'] as any ?? null,
              reasoning: l['reasoning'] as string ?? null,
              message: l['message'] as any ?? null,
              recentProjects: Array.isArray(l['recentProjects']) ? l['recentProjects'] as string[] : [],
            },
          });
        }
        this.logger.log(`Saved ${arr.length} approved leads`);
        return;
      }
    }

    // Save approved content/posts
    const contentArrays = ['approvedPosts', 'posts', 'contentIdeas'];
    for (const key of contentArrays) {
      const arr = output[key];
      if (Array.isArray(arr) && arr.length > 0) {
        for (const post of arr) {
          const p = post as Record<string, unknown>;
          await this.prisma.approvedContent.create({
            data: {
              id: `acont_${createId()}`,
              tenantId,
              runId,
              topic: String(p['topic'] ?? p['title'] ?? ''),
              caption: String(p['caption'] ?? p['body'] ?? ''),
              hookLine: p['hookLine'] as string ?? null,
              hashtags: Array.isArray(p['hashtags']) ? p['hashtags'] as string[] : [],
              imageType: p['imageType'] as string ?? null,
              imageUrl: p['imageUrl'] as string ?? null,
              imagePrompt: p['imagePrompt'] as string ?? null,
              imageReference: p['imageReference'] as string ?? null,
              callToAction: p['callToAction'] as string ?? null,
              score: typeof p['score'] === 'number' ? p['score'] : null,
              reasoning: p['reasoning'] as string ?? null,
              whyItWorks: p['whyItWorks'] as string ?? null,
            },
          });
        }
        this.logger.log(`Saved ${arr.length} approved content items`);
        return;
      }
    }
  }

  /**
   * Post-process step output: if any items have imagePrompt but no imageUrl,
   * generate images via FAL.ai automatically.
   */
  private async generateImagesIfNeeded(output: unknown): Promise<unknown> {
    if (!output || typeof output !== 'object') return output;

    const obj = output as Record<string, unknown>;

    // Find arrays with items that have imagePrompt
    for (const [key, val] of Object.entries(obj)) {
      if (!Array.isArray(val)) continue;

      let changed = false;
      for (const item of val) {
        if (typeof item !== 'object' || !item) continue;
        const record = item as Record<string, unknown>;

        if (!record['imageUrl']) {
          const imageType = String(record['imageType'] ?? 'generated');

          const refName = String(record['imageReference'] ?? '').toLowerCase();
          const photoMap: Record<string, string> = {
            'eterna harmonia': 'Eterna Harmonija Statua.png',
            'eterna harmonija': 'Eterna Harmonija Statua.png',
            'nebeski uzlazak': 'Nebeski Uzlazak Statua.png',
            'golden flux': 'Golden Flux Statue.png',
            'sertifikat': 'Sertifikat.png',
            'certificate': 'Sertifikat.png',
          };
          const photoFile = Object.entries(photoMap).find(([k]) => refName.includes(k))?.[1];

          if (imageType === 'real' && photoFile) {
            // Mode A: Use actual sculpture photograph
            record['imageUrl'] = `http://91.98.231.87:8003/${photoFile.replace(/ /g, '%20')}`;
            this.logger.log(`Using real photo: ${photoFile}`);
            changed = true;

          } else if (imageType === 'composite' && photoFile) {
            // Mode B: Kontext — real sculpture placed in AI scene
            // Pass ALL context to optimizer, not just imagePrompt
            const fullContext = [
              record['imagePrompt'] ? `Image direction: ${record['imagePrompt']}` : '',
              record['topic'] ? `Post topic: ${record['topic']}` : '',
              record['reasoning'] ? `Why: ${record['reasoning']}` : '',
              record['whyItWorks'] ? `Goal: ${record['whyItWorks']}` : '',
              record['visualStyle'] ? `Visual style: ${record['visualStyle']}` : '',
            ].filter(Boolean).join('\n');

            this.logger.log(`Composite: ${photoFile} + context ${fullContext.length} chars`);
            const result = await this.falImage.generateComposite(
              photoFile,
              fullContext,
            );
            if (result.success) {
              record['imageUrl'] = result.url;
              changed = true;
            } else {
              this.logger.warn(`Composite failed: ${result.error}`);
              record['imageError'] = result.error;
            }

          } else if (record['imagePrompt'] || record['reasoning'] || record['topic']) {
            // Mode C: Also Kontext — our sculpture must always be in the image
            const defaultPhotos = ['Eterna Harmonija Statua.png', 'Nebeski Uzlazak Statua.png', 'Golden Flux Statue.png'];
            const randomPhoto = photoFile ?? defaultPhotos[Math.floor(Math.random() * defaultPhotos.length)] ?? defaultPhotos[0]!;
            const fullContext = [
              record['imagePrompt'] ? `Image direction: ${record['imagePrompt']}` : '',
              record['topic'] ? `Post topic: ${record['topic']}` : '',
              record['reasoning'] ? `Why: ${record['reasoning']}` : '',
              record['whyItWorks'] ? `Goal: ${record['whyItWorks']}` : '',
              record['visualStyle'] ? `Visual style: ${record['visualStyle']}` : '',
            ].filter(Boolean).join('\n');

            this.logger.log(`Composite scene: ${randomPhoto} + context ${fullContext.length} chars`);
            const result = await this.falImage.generateComposite(
              randomPhoto,
              fullContext,
            );
            if (result.success) {
              record['imageUrl'] = result.url;
              changed = true;
            } else {
              this.logger.warn(`Scene generation failed: ${result.error}`);
              record['imageError'] = result.error;
            }
          }
        }
      }

      if (changed) {
        obj[key] = val;
      }
    }

    return obj;
  }

  /**
   * Extract JSON from agent output that may contain markdown fences or surrounding text.
   * Tries: raw parse → strip code fences → find outermost { } brackets
   */
  private extractJson(output: string): string | null {
    // 1. Strip markdown code fences: ```json ... ``` or ``` ... ```
    const fenceMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
      try {
        JSON.parse(fenceMatch[1].trim());
        return fenceMatch[1].trim();
      } catch { /* continue */ }
    }

    // 2. Find the outermost { ... } or [ ... ]
    const firstBrace = output.indexOf('{');
    const firstBracket = output.indexOf('[');
    let start = -1;
    let openChar = '{';
    let closeChar = '}';

    if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
      start = firstBrace;
    } else if (firstBracket >= 0) {
      start = firstBracket;
      openChar = '[';
      closeChar = ']';
    }

    if (start < 0) return null;

    // Find matching closing bracket
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < output.length; i++) {
      const ch = output[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"' && !escape) { inString = !inString; continue; }
      if (inString) continue;
      if (ch === openChar) depth++;
      if (ch === closeChar) depth--;
      if (depth === 0) {
        return output.slice(start, i + 1);
      }
    }

    // Unbalanced — truncated JSON. Try to repair by closing open brackets.
    return this.repairTruncatedJson(output.slice(start));
  }

  /**
   * Attempt to repair truncated JSON by closing open brackets/braces.
   * Handles the common case where LLM output gets cut off mid-JSON.
   */
  private repairTruncatedJson(json: string): string | null {
    // Remove any trailing incomplete string (cut mid-value)
    let trimmed = json.replace(/,\s*"[^"]*$/, ''); // trailing incomplete key
    trimmed = trimmed.replace(/,\s*$/, ''); // trailing comma
    trimmed = trimmed.replace(/:\s*"[^"]*$/, ': ""'); // incomplete string value
    trimmed = trimmed.replace(/:\s*$/, ': null'); // incomplete value

    // Count open brackets/braces and close them
    let inString = false;
    let escape = false;
    const stack: string[] = [];

    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') stack.push('}');
      if (ch === '[') stack.push(']');
      if (ch === '}' || ch === ']') stack.pop();
    }

    if (stack.length === 0) return trimmed; // Already balanced

    // Close all open brackets
    const repaired = trimmed + stack.reverse().join('');

    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      return null;
    }
  }

  /**
   * Null out a field in an object by dot-path (for unverified data)
   */
  private nullifyField(obj: unknown, path: string): void {
    const parts = path.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current = obj as any;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (current == null || typeof current !== 'object' || !key) return;
      current = current[key];
    }
    const lastKey = parts[parts.length - 1];
    if (current != null && typeof current === 'object' && lastKey) {
      current[lastKey] = null;
    }
  }
}
