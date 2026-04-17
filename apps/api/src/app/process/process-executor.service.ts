import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { AppEventBus } from '../events/app-event-bus.service';
import { OpenClawClientService } from '../agent-execution/openclaw-client.service';
import { SchemaValidatorService } from './schema-validator.service';
import { ProcessDeduplicationService } from './process-dedup.service';
import { FalImageService } from './fal-image.service';
import { N8nOrchestratorService } from '../n8n/n8n-orchestrator.service';
import { ProductImagesService } from '../product-images/product-images.service';
import { BRIDGE_EVENTS } from '../bridge/bridge.service';

/** Default retry policy if none specified on the step */
const DEFAULT_RETRY_POLICY = { maxRetries: 2, backoffMs: 2000 };

/**
 * Categorized error taxonomy (claude-code pattern: categorizeRetryableAPIError)
 * Each type has a defined recovery strategy — no more string matching.
 */
enum StepErrorType {
  TRANSIENT_API = 'transient_api',
  RATE_LIMITED = 'rate_limited',
  OVERLOADED = 'overloaded',
  CONTEXT_OVERFLOW = 'context_overflow',
  BUDGET_EXCEEDED = 'budget_exceeded',
  SCHEMA_INVALID = 'schema_invalid',
  JSON_PARSE = 'json_parse',
  TOOL_FAILURE = 'tool_failure',
  CIRCUIT_BREAKER = 'circuit_breaker',
  FATAL = 'fatal',
}

/** Map error strings to categories */
function categorizeStepError(error: string): StepErrorType {
  const lower = error.toLowerCase();
  if (lower.includes('circuit breaker')) return StepErrorType.CIRCUIT_BREAKER;
  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('api rate')) return StepErrorType.RATE_LIMITED;
  if (lower.includes('overloaded') || lower.includes('529') || lower.includes('capacity')) return StepErrorType.OVERLOADED;
  if (lower.includes('prompt too long') || lower.includes('context length') || lower.includes('token limit')) return StepErrorType.CONTEXT_OVERFLOW;
  if (lower.includes('budget') || lower.includes('spending limit')) return StepErrorType.BUDGET_EXCEEDED;
  if (lower.includes('schema') || lower.includes('validation failed')) return StepErrorType.SCHEMA_INVALID;
  if (lower.includes('json') || lower.includes('parse')) return StepErrorType.JSON_PARSE;
  if (/econnrefused|econnreset|etimedout|fetch failed|socket hang up|http 50[234]/.test(lower)) return StepErrorType.TRANSIENT_API;
  if (lower.includes('auth') || lower.includes('forbidden') || lower.includes('401') || lower.includes('403')) return StepErrorType.FATAL;
  return StepErrorType.FATAL; // Default: unknown errors are not retried (safe — matches shared/resilience.ts)
}

/** Recovery strategy per error type (claude-code: getErrorRecovery pattern) */
function getRecovery(type: StepErrorType): { retryable: boolean; backoffMs: number; useCorrectionPrompt: boolean } {
  switch (type) {
    case StepErrorType.TRANSIENT_API: return { retryable: true, backoffMs: 2000, useCorrectionPrompt: false };
    case StepErrorType.RATE_LIMITED: return { retryable: true, backoffMs: 5000, useCorrectionPrompt: false };
    case StepErrorType.OVERLOADED: return { retryable: true, backoffMs: 10000, useCorrectionPrompt: false };
    case StepErrorType.CONTEXT_OVERFLOW: return { retryable: true, backoffMs: 1000, useCorrectionPrompt: false };
    case StepErrorType.SCHEMA_INVALID: return { retryable: true, backoffMs: 0, useCorrectionPrompt: true };
    case StepErrorType.JSON_PARSE: return { retryable: true, backoffMs: 0, useCorrectionPrompt: true };
    case StepErrorType.TOOL_FAILURE: return { retryable: false, backoffMs: 0, useCorrectionPrompt: false };
    case StepErrorType.CIRCUIT_BREAKER: return { retryable: true, backoffMs: 30000, useCorrectionPrompt: false };
    case StepErrorType.BUDGET_EXCEEDED: return { retryable: false, backoffMs: 0, useCorrectionPrompt: false };
    case StepErrorType.FATAL: return { retryable: false, backoffMs: 0, useCorrectionPrompt: false };
  }
}

/** Max age for cancelled run entries before cleanup (10 minutes) */
const CANCEL_CLEANUP_MS = 10 * 60 * 1000;

@Injectable()
export class ProcessExecutorService implements OnModuleDestroy {
  private readonly logger = new Logger(ProcessExecutorService.name);

  /** Track active run cancellation signals with timestamp for cleanup (F5) */
  private readonly cancelledRuns = new Map<string, number>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  /**
   * Memoized context cache per tenant (claude-code pattern: memoize + invalidate on change).
   * TTL 5 minutes — business context rarely changes mid-run.
   */
  private readonly contextCache = new Map<string, { context: string; expiresAt: number }>();
  private readonly CONTEXT_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly eventBus: AppEventBus,
    private readonly openClawClient: OpenClawClientService,
    private readonly schemaValidator: SchemaValidatorService,
    private readonly dedup: ProcessDeduplicationService,
    private readonly falImage: FalImageService,
    private readonly n8n: N8nOrchestratorService,
    private readonly productImages: ProductImagesService,
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
      include: {
        steps: { orderBy: { order: 'asc' } },
        n8nWorkflows: { where: { isActive: true }, take: 1 },
      },
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
            departmentTags: [], // Default empty = visible to all; can be set from workflow category
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

      // Check if this workflow has an n8n execution path
      const n8nMapping = (workflow as any).n8nWorkflows?.[0];

      if (n8nMapping?.webhookPath) {
        // ═══ n8n EXECUTION PATH ═══
        // n8n handles the entire workflow — we just trigger and listen for callbacks
        this.logger.log({
          message: 'Triggering n8n workflow',
          runId, n8nWorkflowId: n8nMapping.n8nWorkflowId, webhookPath: n8nMapping.webhookPath,
        });

        // Build dedup context for first step.
        // For builder-generated processes, query the per-process
        // Notion database to get a list of items already saved.
        // For legacy processes (lead-discovery), use the NocoDB
        // dedup service.
        let dedupContext = '';
        try {
          if ((workflow as any).createdByAgentId === 'process-builder') {
            dedupContext = await this.buildBuilderDedupContext(
              tenantId,
              (workflow as any).invocationConfig?.notionDatabaseId,
            );
          } else {
            dedupContext = await this.dedup.buildDeduplicationContext(tenantId) ?? '';
          }
        } catch (e) {
          this.logger.warn(`dedup failed (non-fatal): ${(e as Error).message}`);
        }

        // Trigger n8n via webhook (fire-and-forget — n8n returns immediately with onReceived mode)
        // n8n executes async and calls back to /api/v1/n8n/callback/:runId on completion
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, industry: true, description: true },
        });

        // Build product images context for content processes
        let productImageContext = '';
        try {
          productImageContext = await this.productImages.getProductImageContext(tenantId);
        } catch { /* non-fatal */ }

        try {
          const triggerResult = await this.n8n.triggerWorkflow(n8nMapping.webhookPath, {
            processRunId: run.id,
            tenantId,
            workflowName: workflow.name,
            input: input ?? {},
            deduplicationContext: dedupContext,
            searchCriteria: (input as any)?.searchCriteria ?? {
              industry: tenant?.industry ?? 'luxury architecture',
              region: 'Balkans, DACH',
              targetCount: 5,
            },
            businessContext: {
              company: tenant ?? {},
              icp: (tenant as any)?.icp ?? (tenant as any)?.targetCustomers ?? '',
              mcpTools: (workflow.designArtifact as any)?.tools?.join(', ') ?? '',
            },
            productImages: productImageContext || undefined,
          });
          this.logger.log({ message: 'n8n workflow triggered', runId, triggerResult });

          // Poll n8n execution status in background (no callback needed)
          this.pollN8nExecution(run.id, n8nMapping.n8nWorkflowId, tenantId, workflow.name, correlationId).catch(
            (e) => this.logger.error(`n8n polling failed for ${runId}: ${e}`),
          );
        } catch (err) {
          this.logger.error({ message: 'n8n trigger failed, falling back to OpenClaw', runId, error: (err as Error).message });
          const ctx = await this.loadBusinessContext(tenantId);
          this.executeSteps(run.id, workflow.steps, tenantId, workflow.name, correlationId, ctx).catch(
            (e) => this.logger.error(`Fallback run ${runId} failed: ${e}`),
          );
        }

        // Update run with n8n IDs
        await this.prisma.processRun.update({
          where: { id: run.id },
          data: { n8nWorkflowId: n8nMapping.n8nWorkflowId },
        });
      } else {
        // ═══ OPENCLAW EXECUTION PATH (original) ═══
        const businessContext = await this.loadBusinessContext(tenantId);

        // Start executing steps asynchronously via OpenClaw agents
        this.executeSteps(run.id, workflow.steps, tenantId, workflow.name, correlationId, businessContext).catch(
          (err) => this.logger.error(`Run ${runId} failed unexpectedly: ${err}`),
        );
      }

      return runId;
    } catch (err: any) {
      // Re-throw application errors as-is
      throw err;
    }
  }

  /**
   * Build a deduplication context for a builder-generated process
   * by querying its per-process Notion database. Returns a compact
   * string the brain call can read as a "skip these" blacklist.
   *
   * This is the universal dedup mechanism for all builder processes
   * — every process automatically gets dedup against its own Notion
   * DB, no design-time setup needed.
   */
  private async buildBuilderDedupContext(
    tenantId: string,
    notionDatabaseId: string | undefined,
  ): Promise<string> {
    if (!notionDatabaseId) return '';

    // Look up the tenant's Notion API token
    const cred = await this.prisma.tenantCredential.findUnique({
      where: { tenantId_toolSlug: { tenantId, toolSlug: 'notion' } },
    });
    const apiToken = (cred?.credentials as { apiToken?: string } | null)
      ?.apiToken;
    if (!apiToken) return '';

    try {
      // Query up to 200 most recent records from the per-process DB
      const res = await fetch(
        `https://api.notion.com/v1/databases/${notionDatabaseId}/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            page_size: 200,
            sorts: [
              { timestamp: 'created_time', direction: 'descending' },
            ],
          }),
        },
      );
      if (!res.ok) return '';
      const data = (await res.json()) as {
        results: Array<{ properties: Record<string, unknown> }>;
      };

      // Extract Title + URL fields for the blacklist
      const blacklist: string[] = [];
      for (const page of data.results ?? []) {
        let title = '';
        let url = '';
        for (const [propName, propValue] of Object.entries(
          page.properties,
        )) {
          const v = propValue as { type?: string; [key: string]: unknown };
          if (v.type === 'title') {
            const arr = v.title as Array<{ plain_text?: string }>;
            title = arr?.map((t) => t.plain_text ?? '').join('') ?? '';
          } else if (v.type === 'url' && /url|source|link/i.test(propName)) {
            url = (v.url as string) ?? '';
          }
        }
        if (title || url) {
          blacklist.push(`${title}${url ? ' (' + url + ')' : ''}`);
        }
      }

      if (blacklist.length === 0) return '';
      this.logger.log(
        `Builder dedup: ${blacklist.length} items in blacklist for db ${notionDatabaseId}`,
      );
      return blacklist.join('\n');
    } catch (e) {
      this.logger.warn(
        `Builder dedup query failed: ${(e as Error).message}`,
      );
      return '';
    }
  }

  /**
   * Load tenant business context with TTL caching (claude-code pattern: memoize + .cache.clear()).
   * Avoids redundant DB queries for same tenant within 5 minutes.
   */
  private async loadBusinessContext(tenantId: string): Promise<string> {
    // Check cache first
    const cached = this.contextCache.get(tenantId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.context;
    }

    const context = await this._loadBusinessContextImpl(tenantId);
    this.contextCache.set(tenantId, { context, expiresAt: Date.now() + this.CONTEXT_TTL_MS });
    return context;
  }

  /** Invalidate context cache (call when memories or tenant info changes) */
  invalidateContextCache(tenantId?: string): void {
    if (tenantId) this.contextCache.delete(tenantId);
    else this.contextCache.clear();
  }

  private async _loadBusinessContextImpl(tenantId: string): Promise<string> {
    try {
      // Process context = only tenant identity. No memories, no concepts.
      // Processes have clear input/output contracts — memories are noise that
      // dilutes the prompt and wastes tokens. Dedup context is injected separately.
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, industry: true, description: true },
      });

      if (!tenant) return '';

      const parts: string[] = [
        `Company: ${tenant.name}`,
        `Industry: ${tenant.industry}`,
      ];
      if (tenant.description) parts.push(`Description: ${tenant.description}`);

      // Inject product image references for content processes
      try {
        const imageCtx = await this.productImages.getProductImageContext(tenantId);
        if (imageCtx) parts.push('', imageCtx);
      } catch { /* non-fatal */ }

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

      // FIX: Do NOT update currentStepOrder here — update AFTER step succeeds.
      // Pattern: claude-code compound setter — never update related fields independently.
      // Previous bug: if step crashes before OpenClaw call, DB says we're on step N
      // but we never ran it. Now we only advance on success.

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
        runId, resultId, step, lastStepOutput, tenantId, totalSteps, correlationId, businessContext,
      );

      if (stepOutput !== null) {
        // Success: atomically update currentStepOrder (compound setter pattern)
        await this.prisma.processRun.update({
          where: { id: runId },
          data: { currentStepOrder: step.order },
        });
      }

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

      // Execute via OpenClaw with streaming callbacks wired to bridge events.
      // Pattern: claude-code's query() yields events; we emit them via EventBus.
      // Explicit per-step session — keeps process work fully isolated from
      // chat conversations and from other process steps.
      const result = await this.openClawClient.executeAgent(prompt, {
        agentId: step.agentType,
        sessionId: `proc-${runId}-step${step.order}`,
        timeoutSeconds: 3600,
        // Wire streaming callbacks (previously undefined — now active!)
        onText: (text) => this.eventBus.emit(BRIDGE_EVENTS.PROCESS_STEP_PROGRESS, {
          tenantId, runId, stepName: step.name, stepOrder: step.order,
          type: 'text', data: text, correlationId,
        }),
        onTool: (tool, status, query) => this.eventBus.emit(BRIDGE_EVENTS.PROCESS_STEP_PROGRESS, {
          tenantId, runId, stepName: step.name, stepOrder: step.order,
          type: 'tool', tool, status, query, correlationId,
        }),
        onStatus: (phase) => this.eventBus.emit(BRIDGE_EVENTS.PROCESS_STEP_PROGRESS, {
          tenantId, runId, stepName: step.name, stepOrder: step.order,
          type: 'status', phase, correlationId,
        }),
      });

      if (!result.success) {
        lastError = result.error ?? 'Agent execution failed';
        const errorType = categorizeStepError(lastError);
        const recovery = getRecovery(errorType);

        this.logger.warn({
          message: `Step ${step.name} attempt ${attempt + 1} failed`,
          error: lastError,
          errorType,
          retryable: recovery.retryable,
        });

        // Emit error event for UI visibility (claude-code: withRetry yields error messages)
        this.eventBus.emit(BRIDGE_EVENTS.PROCESS_STEP_PROGRESS, {
          tenantId, runId, stepName: step.name, stepOrder: step.order,
          type: 'error', data: `${errorType}: ${lastError.substring(0, 100)}`,
          retryable: recovery.retryable, attempt: attempt + 1, maxRetries, correlationId,
        });

        if (!recovery.retryable) break; // Don't retry non-retryable errors

        if (recovery.backoffMs > 0) {
          await new Promise(r => setTimeout(r, recovery.backoffMs));
        }

        // Build correction prompt only for schema/json errors (claude-code: correction on parse failure)
        prompt = recovery.useCorrectionPrompt
          ? originalPrompt + '\n\n' + this.schemaValidator.buildCorrectionPrompt([lastError], result.output ?? '')
          : originalPrompt;
        continue;
      }

      // Check for known error responses before JSON parse
      const output = result.output?.trim() ?? '';
      if (output.includes('rate limit') || output.includes('API rate limit') || output.startsWith('⚠️')) {
        lastError = `Agent returned error: ${output.slice(0, 200)}`;
        const errorType = categorizeStepError(lastError);
        const recovery = getRecovery(errorType);

        this.logger.warn(`Step ${step.name} attempt ${attempt + 1}: ${errorType} — ${lastError.substring(0, 100)}`);
        await new Promise(r => setTimeout(r, recovery.backoffMs || 5000));
        prompt = originalPrompt;
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
    // Allow approval for WAITING_APPROVAL (old flow) and COMPLETED (n8n flow — approval is just saving to DB)
    if (stepResult.run.status !== 'WAITING_APPROVAL' && stepResult.run.status !== 'COMPLETED') {
      throw new Error('Run is not in an approvable state');
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

    // n8n flow: run was already COMPLETED by callback — approval just saves to DB, no resumption
    const wasN8nFlow = stepResult.run.status === 'COMPLETED';
    if (wasN8nFlow) {
      this.logger.log({ message: 'n8n flow approval — run already completed, skipping step resumption', runId: stepResult.runId });
      return;
    }

    // Approval → resume execution from next step (OpenClaw direct flow)
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

  /**
   * Poll n8n execution status and sync results back to our DB + UI.
   * This eliminates the need for n8n to callback our API (which requires Railway deploy).
   * Polls every 10s, updates ProcessRun status and emits bridge events.
   */
  private async pollN8nExecution(
    runId: string,
    n8nWorkflowId: string,
    tenantId: string,
    workflowName: string,
    correlationId?: string,
  ): Promise<void> {
    const MAX_POLL_MS = 60 * 60 * 1000; // 60 min max — agents run long operations
    const POLL_INTERVAL_MS = 10_000; // 10s between polls
    const deadline = Date.now() + MAX_POLL_MS;

    this.logger.log({ message: 'Starting n8n execution polling', runId, n8nWorkflowId });

    while (Date.now() < deadline) {
      if (this.isCancelled(runId)) {
        this.logger.log({ message: 'Run cancelled during n8n polling', runId });
        return;
      }

      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      try {
        // Find the latest execution for this workflow
        // Check all active statuses — n8n default listing excludes running/waiting
        const [running, waiting, finished] = await Promise.all([
          this.n8n.listExecutions(n8nWorkflowId, 'running'),
          this.n8n.listExecutions(n8nWorkflowId, 'waiting'),
          this.n8n.listExecutions(n8nWorkflowId, 'success'),
        ]);
        const errored = await this.n8n.listExecutions(n8nWorkflowId, 'error');
        const all = [...running, ...waiting, ...finished, ...errored].sort(
          (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        );
        const latest = all[0];
        if (!latest) continue;

        // Update n8n execution ID in our DB
        await this.prisma.processRun.update({
          where: { id: runId },
          data: { n8nExecutionId: latest.id },
        }).catch(() => {}); // Ignore if already set

        if (latest.status === 'running') {
          // Emit progress event so UI shows activity
          this.eventBus.emit(BRIDGE_EVENTS.PROCESS_STEP_PROGRESS, {
            tenantId, runId, type: 'status',
            phase: 'n8n pipeline executing...', correlationId,
          });
          continue;
        }

        if (latest.status === 'waiting') {
          // Pipeline hit the approval Wait node
          this.logger.log({ message: 'n8n execution waiting for approval', runId, executionId: latest.id });

          await this.prisma.processRun.update({
            where: { id: runId },
            data: { status: 'WAITING_APPROVAL' },
          });

          // Get execution data to extract leads
          const execData = await this.n8n.getExecution(latest.id, true);
          const runData = (execData as any).data?.resultData?.runData ?? {};

          // Find the last completed step's output (leads data)
          let leadsData: unknown = null;
          const stepNames = ['Step 4 - Personalized Outreach', 'Step 3 - Lead Scoring', 'Step 2 - Lead Enrichment', 'Step 1 - Market Research'];
          for (const stepName of stepNames) {
            const stepResult = runData[stepName]?.[0]?.data?.main?.[0]?.[0]?.json;
            if (stepResult?.leads) {
              leadsData = stepResult;
              break;
            }
          }

          this.eventBus.emit(BRIDGE_EVENTS.PROCESS_APPROVAL_NEEDED, {
            tenantId, runId, stepName: 'Human Review',
            output: leadsData, correlationId,
            totalSteps: 6, stepOrder: 5,
          });

          // Store leads output in a step result for UI to read
          if (leadsData) {
            await this.prisma.processStepResult.create({
              data: {
                id: `psres_n8n_${Date.now()}`,
                runId,
                stepId: (await this.prisma.processStep.findFirst({
                  where: { workflow: { slug: 'lead-discovery' }, stepType: 'APPROVAL' },
                  select: { id: true },
                }))?.id ?? 'unknown',
                status: 'PENDING',
                output: leadsData as any,
              },
            }).catch(() => {}); // Ignore if step not found
          }

          return; // Stop polling — approval will be handled by handleApproval()
        }

        if (latest.status === 'success') {
          // n8n execution completed — DON'T set COMPLETED here.
          // Callback handler sets WAITING_APPROVAL so user can approve leads.
          // Polling only logs — callback is the authority for status changes.
          this.logger.log({ message: 'n8n execution completed — waiting for callback to update status', runId, executionId: latest.id });
          return;
        }

        if (latest.status === 'error' || latest.status === 'canceled') {
          // Check if callback already set COMPLETED — if so, callback is authoritative
          const currentRun = await this.prisma.processRun.findUnique({
            where: { id: runId },
            select: { status: true },
          });
          if (currentRun?.status === 'COMPLETED') {
            this.logger.log({ message: 'n8n reports error but callback already COMPLETED — ignoring', runId });
            return;
          }

          this.logger.error({ message: 'n8n execution failed', runId, status: latest.status });

          await this.prisma.processRun.update({
            where: { id: runId },
            data: { status: 'FAILED', completedAt: new Date(), error: `n8n execution ${latest.status}` },
          });

          this.eventBus.emit(BRIDGE_EVENTS.PROCESS_COMPLETE, {
            tenantId, runId, workflowName, success: false, correlationId,
          });

          return;
        }
      } catch (err) {
        this.logger.warn({ message: 'n8n poll error (will retry)', runId, error: (err as Error).message });
      }
    }

    // Before marking as failed, check if callback already updated status
    // (callback may have set WAITING_APPROVAL or COMPLETED while we were polling)
    const currentRun = await this.prisma.processRun.findUnique({ where: { id: runId }, select: { status: true } });
    if (currentRun && currentRun.status !== 'RUNNING') {
      this.logger.log({ message: 'Polling ended — status already changed by callback', runId, status: currentRun.status });
      return; // Callback handled it, don't overwrite
    }

    this.logger.error({ message: 'n8n polling timed out', runId });
    await this.prisma.processRun.update({
      where: { id: runId },
      data: { status: 'FAILED', completedAt: new Date(), error: 'n8n execution timed out' },
    });
  }

  /** Max chars for previous step output before triggering intelligent summary. */
  private readonly MAX_RAW_INPUT_CHARS = 4000;

  /**
   * Auto-refresh skillMdSection for all steps before a run starts.
   * Uses the same AI generation as the manual autoGenerateSkills endpoint,
   * but runs automatically when business context may have changed.
   *
   * Pattern: like fal-image's optimizePrompt — AI reasons about what makes
   * the best instructions for THIS specific step, THIS specific business.
   */
  private async ensureSkillsOptimized(
    steps: Array<{ id: string; name: string; order: number; stepType: string; agentType: string; toolSkill: string; description?: string | null; skillMdSection: string | null; outputSchema: unknown }>,
    workflowName: string,
    businessContext: string,
    tenantId: string,
  ): Promise<void> {
    for (const step of steps) {
      if (step.stepType === 'APPROVAL') continue; // Approval steps don't need AI instructions

      // Skip if skillMdSection exists and is substantial (>100 chars = not a stub)
      if (step.skillMdSection && step.skillMdSection.length > 100) continue;

      this.logger.log({ message: `Auto-generating skill instructions for step "${step.name}"`, tenantId });

      const optimizerPrompt = `You are a senior prompt engineer designing instructions for an AI agent.
Your goal: write the PERFECT step instructions that will produce excellent results for this specific business.

## Business Context
${businessContext}

## This Step
- Workflow: "${workflowName}"
- Step ${step.order}: "${step.name}"
- Agent type: ${step.agentType}
- Tool/skill: ${step.toolSkill}
- Description: ${step.description ?? 'None'}
${step.order > 1 ? `- Receives input from step ${step.order - 1}` : '- First step — no input from previous steps'}

## Output Schema (what the agent MUST produce)
\`\`\`json
${JSON.stringify(step.outputSchema, null, 2).slice(0, 2000)}
\`\`\`

## Your Task
Write detailed, actionable instructions for the AI agent. Think step by step:

1. ANALYZE: What exactly does this step need to accomplish for THIS business?
2. STRATEGY: What's the best approach? What tools should the agent use and how?
3. QUALITY: What makes a GOOD result vs a BAD result for this specific business?
4. GUARDRAILS: What should the agent NEVER do? (hallucinate data, invent emails, etc.)
5. FORMAT: How should the output be structured to match the schema?

Be specific to the business above — reference their industry, target audience, and brand.
Keep it under 500 words. Be direct.
Return ONLY the instruction text.`;

      try {
        // Isolated background session — must not pollute main agent context.
        const result = await this.openClawClient.executeAgent(optimizerPrompt, {
          agentId: 'main',
          sessionId: `bg-skill-opt-${step.id}-${Date.now()}`,
          timeoutSeconds: 3600,
        });

        if (result.success && result.output && result.output.length > 50) {
          await this.prisma.processStep.update({
            where: { id: step.id },
            data: { skillMdSection: result.output.trim() },
          });
          step.skillMdSection = result.output.trim(); // Update in-memory too
          this.logger.log({ message: `Skill optimized for "${step.name}" (${result.output.length} chars)`, tenantId });
        }
      } catch (err) {
        this.logger.warn({ message: `Skill optimization failed for "${step.name}", using existing`, error: (err as Error).message });
      }
    }
  }

  /**
   * Optimize a step prompt before sending to the LLM.
   * Same chain-of-thought pattern as fal-image's optimizePrompt —
   * AI reasons about how to best frame the request for maximum quality.
   */
  private async optimizeStepPrompt(
    rawPrompt: string,
    step: { name: string; toolSkill: string; agentType: string },
    tenantId: string,
  ): Promise<string> {
    // Only optimize for non-tool steps (scoring, content writing, compilation)
    // Tool-heavy steps (brave-search) need the raw prompt with search instructions
    const toolSteps = ['brave-search', 'web-search', 'web_search'];
    if (toolSteps.includes(step.toolSkill)) return rawPrompt;

    try {
      const optimizerPrompt = `You are a prompt optimizer. Improve this prompt to get the best possible output.

ORIGINAL PROMPT:
---
${rawPrompt.slice(0, 6000)}
---

OPTIMIZE by:
1. Making instructions more specific and actionable
2. Adding quality criteria the agent should aim for
3. Clarifying any ambiguous requirements
4. Ensuring the output format is crystal clear
5. Adding "think step by step" where complex reasoning is needed

KEEP: All business context, schemas, and data. Don't remove anything.
ADD: Clarity, specificity, quality signals.
RETURN: The improved prompt. Nothing else.`;

      // Isolated background session — must not pollute main agent context.
      const result = await this.openClawClient.executeAgent(optimizerPrompt, {
        agentId: 'main',
        sessionId: `bg-prompt-opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timeoutSeconds: 3600,
      });

      if (result.success && result.output && result.output.length > rawPrompt.length * 0.5) {
        this.logger.log({ message: `Prompt optimized for "${step.name}"`, originalLen: rawPrompt.length, optimizedLen: result.output.length });
        return result.output.trim();
      }
    } catch (err) {
      this.logger.warn({ message: `Prompt optimization failed for "${step.name}", using raw`, error: (err as Error).message });
    }

    return rawPrompt; // Fallback: use unoptimized
  }

  /**
   * Build the prompt for an agent step execution.
   * If previous output is too large, summarizes it via LLM first.
   */
  private async buildStepPrompt(
    step: {
      name: string;
      toolSkill: string;
      agentType: string;
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
        timeoutSeconds: 3600,
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
    const leadArrays = ['approvedLeads', 'scoredLeads', 'outreachLeads', 'enrichedLeads', 'leads'];
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
              email: (l['email'] && l['email'] !== 'not found') ? String(l['email']) : null,
              emailSource: l['emailSource'] as string ?? null,
              linkedin: (l['linkedin'] && l['linkedin'] !== 'not found') ? String(l['linkedin']) : null,
              phone: (l['phone'] && l['phone'] !== 'not found') ? String(l['phone']) : null,
              website: l['website'] as string ?? null,
              location: l['location'] as string ?? null,
              companyDescription: l['companyDescription'] as string ?? null,
              whyGoodFit: l['whyGoodFit'] as string ?? null,
              score: typeof l['score'] === 'number' ? l['score'] : null,
              scoreBreakdown: l['scoreBreakdown'] as any ?? null,
              reasoning: l['reasoning'] as string ?? l['scoringRationale'] as string ?? null,
              message: l['message'] as any ?? l['outreach'] as any ?? null,
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
