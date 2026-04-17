import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { McpCatalogService } from './mcp-catalog.service';
import { ProcessDraftService, DesignPayload } from './process-draft.service';
import { ProcessDeployService } from './process-deploy.service';
import {
  NotionDatabaseCreatorService,
  NotionSchema,
} from './notion-database-creator.service';
import { OpenClawClientService } from '../agent-execution/openclaw-client.service';
import { AppEventBus } from '../events/app-event-bus.service';
import { BRIDGE_EVENTS } from '../bridge/bridge.service';
import { ProcessArtifactsService } from './process-artifacts.service';
import { BuilderOrchestratorService } from './builder-orchestrator.service';
import { ProcessWizardService } from './process-wizard.service';
import { WizardCardStreamParser } from './wizard-card-stream-parser';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { createId } from '@paralleldrive/cuid2';

/**
 * Neuron Process Builder — public endpoints.
 *
 * Phase 1 shipped the catalog reads. Phase 3A adds draft CRUD so the
 * neuron-process-builder skill can persist design.json files as draft
 * ProcessWorkflow rows during the GENERATE phase. The rest (test runs,
 * publish flow, n8n deploy, Notion database creation) come in Phases
 * 3B–5.
 */
@Controller('v1/builder')
export class BuilderController {
  constructor(
    private readonly catalog: McpCatalogService,
    private readonly drafts: ProcessDraftService,
    private readonly deployer: ProcessDeployService,
    private readonly notionCreator: NotionDatabaseCreatorService,
    private readonly openclaw: OpenClawClientService,
    private readonly eventBus: AppEventBus,
    private readonly artifacts: ProcessArtifactsService,
    private readonly orchestrator: BuilderOrchestratorService,
    private readonly wizard: ProcessWizardService,
    private readonly prisma: PlatformPrismaService,
  ) {}

  // ── Orchestrator endpoints (Stage Machine) ──────────────────────
  // These are the ONLY endpoints the AI agent should call.
  // deploy/test/publish are handled by the backend stage machine.

  /**
   * POST /api/v1/builder/orchestrator/submit-design
   * AI submits a designArtifact → backend validates → returns proposal.
   * This is the ONLY entry point for creating/editing processes.
   */
  @Post('orchestrator/submit-design')
  async submitDesign(
    @Body() body: { tenantId: string; design: DesignPayload; existingProcessId?: string },
  ) {
    if (!body.design) {
      throw new BadRequestException('design is required');
    }
    const state = await this.orchestrator.submitDesign(
      body.tenantId,
      body.design,
      body.existingProcessId,
    );
    return { data: state };
  }

  /**
   * POST /api/v1/builder/orchestrator/confirm
   * User confirmed the proposal → backend deploys infrastructure.
   */
  @Post('orchestrator/confirm')
  async confirmDesign(
    @Body() body: { tenantId: string; processId: string },
  ) {
    const state = await this.orchestrator.confirmAndDeploy(
      body.tenantId,
      body.processId,
    );
    return { data: state };
  }

  /**
   * POST /api/v1/builder/orchestrator/publish
   * User approved test results → backend publishes.
   */
  @Post('orchestrator/publish')
  async publishProcess(
    @Body() body: { tenantId: string; processId: string },
  ) {
    const state = await this.orchestrator.approveAndPublish(
      body.tenantId,
      body.processId,
    );
    return { data: state };
  }

  // ── Deterministic wizard (backend-driven, no AI agent) ────────

  /**
   * POST /api/v1/builder/wizard/start
   * Body: { tenantId, description }
   * Starts a new wizard session and returns the first card (tool_select).
   */
  @Post('wizard/start')
  async wizardStart(
    @Body() body: { tenantId: string; description: string },
  ) {
    if (!body.tenantId || !body.description) {
      throw new BadRequestException('tenantId and description are required');
    }
    return { data: await this.wizard.startWizard(body.tenantId, body.description) };
  }

  /**
   * POST /api/v1/builder/wizard/:id/step
   * Body: { tenantId, response: { type, data } }
   * Advances the wizard by one step. Returns the next card.
   */
  @Post('wizard/:id/step')
  async wizardStep(
    @Param('id') id: string,
    @Body() body: { tenantId: string; response: { type: string; data: Record<string, unknown> } },
  ) {
    if (!body.tenantId || !body.response) {
      throw new BadRequestException('tenantId and response are required');
    }
    return { data: await this.wizard.advanceWizard(id, body.tenantId, body.response) };
  }

  // ── MCP catalog ────────────────────────────────────────────────

  @Get('mcp-catalog')
  async listCatalog() {
    return { data: await this.catalog.listActive() };
  }

  @Get('mcp-catalog/:slug')
  async getTool(@Param('slug') slug: string) {
    return { data: await this.catalog.getBySlug(slug) };
  }

  // ── Draft CRUD ─────────────────────────────────────────────────

  /**
   * POST /api/v1/builder/drafts
   * Body: { tenantId, design }
   * Called by create_process_db_records.sh from the builder skill at
   * the end of the GENERATE phase. Idempotent on (tenantId, slug).
   */
  @Post('drafts')
  async createDraft(
    @Body() body: { tenantId: string; design: DesignPayload },
  ) {
    const draft = await this.drafts.createDraft(body.tenantId, body.design);
    return { data: draft };
  }

  /**
   * GET /api/v1/builder/drafts?tenantId=<id>
   */
  @Get('drafts')
  async listDrafts(@Query('tenantId') tenantId: string) {
    return { data: await this.drafts.listDrafts(tenantId) };
  }

  /**
   * GET /api/v1/builder/drafts/:id?tenantId=<id>
   */
  @Get('drafts/:id')
  async getDraft(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
  ) {
    return { data: await this.drafts.fetchDraft(tenantId, id) };
  }

  /**
   * DELETE /api/v1/builder/drafts/:id?tenantId=<id>
   */
  @Delete('drafts/:id')
  async deleteDraft(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
  ) {
    return { data: await this.drafts.deleteDraft(tenantId, id) };
  }

  // ── Phase 3B: real deploy ─────────────────────────────────────

  /**
   * POST /api/v1/builder/drafts/:id/deploy
   * Body: { tenantId }
   * Creates the Notion database (if notionSchema exists) and the n8n
   * workflow, then persists the IDs on the draft's invocationConfig.
   * The draft stays in status='draft' — publish (Phase 5) is separate.
   */
  /**
   * POST /api/v1/builder/drafts/:id/validate
   * Validates a design against business rules BEFORE deploy is allowed.
   * Rules are generic — driven by MCP catalog, not hardcoded tool knowledge.
   *
   * The Orchestrator Pattern: AI proposes → backend validates → user approves
   */
  @Post('drafts/:id/validate')
  async validateDesign(
    @Param('id') id: string,
    @Body() body: { tenantId: string },
  ) {
    const draft = await this.prisma.processWorkflow.findFirst({
      where: { id, tenantId: body.tenantId },
    });
    if (!draft) return { valid: false, errors: ['Draft not found'] };

    const design = (draft.designArtifact ?? {}) as unknown as DesignPayload;
    const errors: string[] = [];

    // Rule 1: Must have steps
    if (!design.steps?.length) {
      errors.push('Process has no steps');
      return { valid: false, errors };
    }

    // Rule 2: At least 1 brain-call step with a prompt (AI reasoning required)
    const brainSteps = (design.steps ?? []).filter(
      (s) =>
        s.stepKind !== 'APPROVAL_GATE' &&
        !s.manualStep &&
        s.stepKind !== 'MCP_WRITE' &&
        s.stepKind !== 'MCP_SEARCH' &&
        s.stepKind !== 'MCP_READ',
    );
    if (brainSteps.length === 0) {
      errors.push(
        'Process must have at least one AI reasoning step (brain call with prompt). ' +
        'Pure MCP pipelines without AI enrichment/scoring produce low-quality results.',
      );
    }
    for (const s of brainSteps) {
      const prompt = (s as Record<string, unknown>).prompt as string | undefined;
      if (!prompt || prompt.length < 20) {
        errors.push(
          `Step "${s.name}" is a brain-call but has no prompt or prompt is too short (${prompt?.length ?? 0} chars). ` +
          'Each brain-call needs a detailed instruction (min 20 chars).',
        );
      }
    }

    // Rule 3: Exactly 1 APPROVAL_GATE
    const gates = (design.steps ?? []).filter(
      (s) => s.stepKind === 'APPROVAL_GATE' || s.manualStep,
    );
    if (gates.length === 0) {
      errors.push('Process must have an approval gate so users can review results before saving.');
    } else if (gates.length > 1) {
      errors.push(`Process has ${gates.length} approval gates — should be exactly 1.`);
    }

    // Rule 4: MCP steps reference tools that exist in catalog AND are connected
    const [catalogTools, connectedCreds] = await Promise.all([
      this.prisma.mcpToolCatalog.findMany({
        where: { isActive: true },
        select: { slug: true, operations: true },
      }),
      this.prisma.tenantCredential.findMany({
        where: { tenantId: body.tenantId },
        select: { toolSlug: true },
      }),
    ]);
    const catalogSlugs = new Set(catalogTools.map((t) => t.slug));
    const connectedSlugs = new Set(connectedCreds.map((c) => c.toolSlug));

    for (const s of design.steps ?? []) {
      if (s.mcpToolSlug) {
        if (!catalogSlugs.has(s.mcpToolSlug)) {
          errors.push(
            `Step "${s.name}" references tool "${s.mcpToolSlug}" which is not in the MCP catalog.`,
          );
        } else if (!connectedSlugs.has(s.mcpToolSlug)) {
          errors.push(
            `Step "${s.name}" uses "${s.mcpToolSlug}" which is not connected for this tenant. ` +
            'Go to Settings → Integrations to connect it.',
          );
        }
        // Verify operation exists on the tool
        if (s.mcpOperationId) {
          const tool = catalogTools.find((t) => t.slug === s.mcpToolSlug);
          const ops = (tool?.operations as unknown as Array<{ id: string }>) ?? [];
          if (!ops.some((op) => op.id === s.mcpOperationId)) {
            errors.push(
              `Step "${s.name}" references operation "${s.mcpOperationId}" on "${s.mcpToolSlug}" ` +
              `which doesn't exist. Available: ${ops.map((o) => o.id).join(', ')}`,
            );
          }
        }
      }
    }

    // Rule 5: MCP_WRITE must come after APPROVAL_GATE
    let sawApproval = false;
    for (const s of design.steps ?? []) {
      if (s.stepKind === 'APPROVAL_GATE' || s.manualStep) sawApproval = true;
      if (s.stepKind === 'MCP_WRITE' && !sawApproval) {
        errors.push(
          `Step "${s.name}" (MCP_WRITE) must come after the approval gate. ` +
          'Users must review results before saving to external tools.',
        );
      }
    }

    // If valid, stamp the draft
    if (errors.length === 0) {
      await this.prisma.processWorkflow.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
    }

    return { valid: errors.length === 0, errors };
  }

  @Post('drafts/:id/deploy')
  async deployDraft(
    @Param('id') id: string,
    @Body() body: { tenantId: string },
  ) {
    // Auto-validate before deploy
    const validation = await this.validateDesign(id, body);
    if (!validation.valid) {
      return {
        data: null,
        error: 'Design validation failed',
        validationErrors: (validation as { errors: string[] }).errors,
      };
    }
    return { data: await this.deployer.deploy(body.tenantId, id) };
  }

  /**
   * POST /api/v1/builder/notion/create-database
   * Body: { tenantId, schema }
   * Standalone endpoint for creating a Notion database without
   * touching a draft. Used by the builder skill when it wants to
   * verify the schema is valid before persisting the draft.
   */
  @Post('notion/create-database')
  async createNotionDatabase(
    @Body() body: { tenantId: string; schema: NotionSchema },
  ) {
    return {
      data: await this.notionCreator.createDatabase(body.tenantId, body.schema),
    };
  }

  // ── Phase 3C: chat dispatch to process-builder agent ────────────

  /**
   * POST /api/v1/builder/chat
   * Body: { tenantId, message, sessionId? }
   * Dispatches the user's message to the dedicated `process-builder`
   * OpenClaw agent. Used by the ProcessDesignComponent in the web UI
   * to walk users through DISCOVER → DESIGN → GENERATE → DEPLOY in a
   * conversational flow.
   *
   * The agent reads the neuron-process-builder skill and produces
   * draft rows via the builder API. Session is kept per-tenant so a
   * user can resume a conversation without losing context.
   */
  @Post('chat')
  async dispatchChat(
    @Body()
    body: {
      tenantId: string;
      message: string;
      sessionId?: string;
    },
  ) {
    if (!body.tenantId || !body.message) {
      throw new Error('tenantId and message are required');
    }
    const result = await this.openclaw.executeAgent(body.message, {
      agentId: 'process-builder',
      sessionId: body.sessionId ?? `builder-${body.tenantId}`,
      tenantProfile: body.tenantId,
      timeoutSeconds: 3600,
      thinking: 'medium',
    });
    return {
      data: {
        success: result.success,
        output: result.output,
        durationMs: result.durationMs,
        error: result.error ?? null,
      },
    };
  }

  /**
   * SSE: GET /api/v1/builder/chat/stream?tenantId=…&message=…&sessionId=…
   *
   * Streaming variant of /chat. Emits server-sent events as the
   * process-builder agent works:
   *   - status: phase/activity changes (e.g. "reading catalog", "validating")
   *   - text: incremental output tokens
   *   - tool: MCP tool usage (start/end)
   *   - done: final result with success + duration
   *
   * Used by the ProcessDesignComponent in the web UI so the user
   * sees real-time progress instead of a blocking spinner.
   *
   * Uses GET + query params because EventSource only supports GET.
   */
  @Sse('chat/stream')
  chatStream(
    @Query('tenantId') tenantId: string,
    @Query('message') message: string,
    @Query('sessionId') sessionId?: string,
  ): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    if (!tenantId || !message) {
      subject.next({
        type: 'error',
        data: { error: 'tenantId and message are required' },
      });
      subject.complete();
      return subject.asObservable();
    }

    const sid = sessionId ?? `builder-${tenantId}`;
    const emit = (type: string, data: Record<string, unknown>) => {
      subject.next({ type, data });
    };

    // Push to app event bus so the existing Activity Status panel
    // (driven by websocket) picks up builder progress
    const emitBridge = (agent: string, status: string, msg: string) => {
      this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
        tenantId,
        taskId: sid,
        agent,
        status,
        message: msg,
        timestamp: new Date().toISOString(),
      });
    };

    emit('status', { label: 'Sending to process-builder agent…' });
    emitBridge('process-builder', 'running', 'Starting…');

    // Wizard card parser intercepts WIZARD_CARD:/TOOL_SELECT:/
    // OPERATION_SELECT: patterns from the agent's text stream and
    // emits them as structured `wizard_card` SSE events in real-time.
    // Regular text passes through as `text` deltas.
    const cardParser = new WizardCardStreamParser(
      (text) => emit('text', { delta: text }),
      (card) => emit('wizard_card', card),
    );

    this.openclaw
      .executeAgent(message, {
        agentId: 'process-builder',
        sessionId: sid,
        tenantProfile: tenantId,
        timeoutSeconds: 3600,
        thinking: 'high',
        onText: (text) => {
          cardParser.push(text);
        },
        onTool: (tool, status, query) => {
          emit('tool', {
            tool,
            status,
            query: query?.substring(0, 200) ?? null,
          });
          emitBridge(
            `builder:${tool}`,
            status === 'start' ? 'running' : 'completed',
            `${tool}${query ? ': ' + query.substring(0, 100) : ''}`,
          );
        },
        onStatus: (phase) => {
          emit('status', { label: phase });
          emitBridge('process-builder', 'running', phase);
        },
      })
      .then((result) => {
        // Flush any remaining buffered text from the card parser
        cardParser.flush();

        emit('done', {
          success: result.success,
          output: result.output,
          durationMs: result.durationMs,
          error: result.error ?? null,
        });
        emitBridge(
          'process-builder',
          result.success ? 'completed' : 'failed',
          result.success
            ? `Finished in ${Math.round(result.durationMs / 1000)}s`
            : `Error: ${result.error ?? 'unknown'}`,
        );
        subject.complete();
      })
      .catch((err) => {
        cardParser.flush();
        emit('error', { error: (err as Error).message });
        emitBridge(
          'process-builder',
          'failed',
          `Error: ${(err as Error).message}`,
        );
        subject.complete();
      });

    return subject.asObservable();
  }

  // ── Phase 2: per-process agent artifacts + test run + approval ──

  /**
   * POST /api/v1/builder/drafts/:id/render-artifacts
   * Body: { tenantId }
   *
   * Compiles the draft's design.json to the ProcessIR and emits all
   * 4 artifacts needed to create the per-process agent.
   */
  @Post('drafts/:id/render-artifacts')
  async renderArtifacts(
    @Param('id') id: string,
    @Body() body: { tenantId: string },
  ) {
    const result = await this.artifacts.renderForDraft(body.tenantId, id);
    return { data: result };
  }

  /**
   * POST /api/v1/builder/drafts/:id/test-runs
   * Body: { tenantId, input }
   * Creates a ProcessTestRun in `pending` state.
   */
  @Post('drafts/:id/test-runs')
  async createTestRun(
    @Param('id') id: string,
    @Body() body: { tenantId: string; input: Record<string, unknown> },
  ) {
    const draft = await this.prisma.processWorkflow.findFirst({
      where: { id, tenantId: body.tenantId },
      select: { id: true },
    });
    if (!draft) {
      return { data: null, error: `draft not found: ${id}` };
    }
    const run = await this.prisma.processTestRun.create({
      data: {
        id: `ptest_${createId()}`,
        processId: id,
        tenantId: body.tenantId,
        status: 'pending',
        input: body.input as unknown as object,
      },
    });
    return { data: run };
  }

  /**
   * POST /api/v1/builder/drafts/:id/test-runs/:runId/update
   * Body: { tenantId, status?, stepEvents?, output?, error? }
   * Called by the agent to update a test run as it progresses.
   */
  @Post('drafts/:id/test-runs/:runId/update')
  async updateTestRun(
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Body()
    body: {
      tenantId: string;
      status?: string;
      stepEvents?: unknown[];
      output?: unknown;
      error?: string | null;
    },
  ) {
    const run = await this.prisma.processTestRun.findFirst({
      where: { id: runId, processId: id, tenantId: body.tenantId },
    });
    if (!run) return { data: null, error: 'test run not found' };
    const updated = await this.prisma.processTestRun.update({
      where: { id: runId },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.stepEvents && {
          stepEvents: body.stepEvents as unknown as object,
        }),
        ...(body.output !== undefined && {
          output: body.output as unknown as object,
        }),
        ...(body.error !== undefined && { error: body.error }),
        ...(body.status === 'awaiting-approval' ||
        body.status === 'passed' ||
        body.status === 'failed'
          ? { completedAt: new Date() }
          : {}),
      },
    });
    return { data: updated };
  }

  /**
   * GET /api/v1/builder/drafts/:id/latest-test-run?tenantId=…
   * UI polls this to pick up preview data.
   */
  @Get('drafts/:id/latest-test-run')
  async getLatestTestRun(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
  ) {
    const run = await this.prisma.processTestRun.findFirst({
      where: { processId: id, tenantId },
      orderBy: { startedAt: 'desc' },
    });
    return { data: run };
  }

  /**
   * POST /api/v1/builder/drafts/:id/confirm
   * Body: { tenantId, testRunId }
   * User approved the preview. Marks run approved + redeploys (idempotent)
   * which auto-promotes to published + registers in CatalogItem.
   */
  @Post('drafts/:id/confirm')
  async confirmDraft(
    @Param('id') id: string,
    @Body() body: { tenantId: string; testRunId: string },
  ) {
    const draft = await this.prisma.processWorkflow.findFirst({
      where: { id, tenantId: body.tenantId },
    });
    if (!draft) return { data: null, error: 'draft not found' };

    const run = await this.prisma.processTestRun.findFirst({
      where: { id: body.testRunId, processId: id, tenantId: body.tenantId },
    });
    if (!run) return { data: null, error: 'test run not found' };
    if (run.status !== 'awaiting-approval') {
      return {
        data: null,
        error: `test run is "${run.status}" — expected "awaiting-approval"`,
      };
    }

    await this.prisma.processTestRun.update({
      where: { id: body.testRunId },
      data: { status: 'approved', completedAt: new Date() },
    });

    // Redeploy (idempotent — updates existing n8n workflow + agent)
    const deployed = await this.deployer.deploy(body.tenantId, id);

    // THIS is the only place that promotes draft → published.
    // The user explicitly clicked Approve in the UI — that's the gate.
    await this.prisma.processWorkflow.update({
      where: { id },
      data: { status: 'published', isTestMode: false, updatedAt: new Date() },
    });

    return {
      data: {
        confirmed: true,
        published: true,
        testRunId: body.testRunId,
        draftId: id,
        n8nWorkflowId: deployed.n8nWorkflowId,
        notionDatabaseId: deployed.notionDatabaseId,
        notionDatabaseUrl: deployed.notionDatabaseUrl,
      },
    };
  }

  /**
   * GET /api/v1/builder/processes/:id/notion-records?tenantId=…
   *
   * Reads all rows from the per-process Notion database and returns
   * them as flat items. Used by the Processes page Saved tab to show
   * what's actually persisted in Notion.
   */
  @Get('processes/:id/notion-records')
  async getNotionRecords(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
  ) {
    const proc = await this.prisma.processWorkflow.findFirst({
      where: { id, tenantId },
      select: { id: true, invocationConfig: true },
    });
    if (!proc) return { data: { items: [], total: 0 } };
    const config = (proc.invocationConfig ?? {}) as Record<string, unknown>;
    const databaseId = config.notionDatabaseId as string | undefined;
    if (!databaseId) {
      return { data: { items: [], total: 0 } };
    }
    try {
      const result = await this.notionCreator.queryDatabaseRecords(
        tenantId,
        databaseId,
      );
      return { data: result };
    } catch (e) {
      return {
        data: { items: [], total: 0 },
        error: (e as Error).message,
      };
    }
  }

  /**
   * POST /api/v1/builder/processes/:id/approve-items
   * Body: { tenantId, items }
   *
   * User approved a subset of items from a Process Results run. We
   * write them to the per-process Notion database using the
   * NotionDatabaseCreatorService.
   */
  @Post('processes/:id/approve-items')
  async approveProcessItems(
    @Param('id') id: string,
    @Body()
    body: { tenantId: string; items: Record<string, unknown>[] },
  ) {
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return { data: null, error: 'items must be a non-empty array' };
    }
    const proc = await this.prisma.processWorkflow.findFirst({
      where: { id, tenantId: body.tenantId },
      select: { id: true, invocationConfig: true, slug: true },
    });
    if (!proc) return { data: null, error: 'process not found' };
    const config = (proc.invocationConfig ?? {}) as Record<string, unknown>;
    const databaseId = config.notionDatabaseId as string | undefined;
    if (!databaseId) {
      return {
        data: null,
        error: 'process has no notionDatabaseId — cannot save items',
      };
    }
    const result = await this.notionCreator.writeItemsToDatabase(
      body.tenantId,
      databaseId,
      body.items,
    );
    return {
      data: {
        notionDatabaseId: databaseId,
        written: result.pageIds.length,
        skipped: result.skipped,
        pageIds: result.pageIds,
      },
    };
  }

  /**
   * POST /api/v1/builder/drafts/:id/request-changes
   * Body: { tenantId, testRunId, feedback }
   * User wants changes. Stores feedback; the UI also sends feedback
   * as a chat message to the agent for iteration.
   */
  /**
   * PATCH /api/v1/builder/drafts/:id/design
   * Update an existing process's design in-place (EDIT mode).
   * Preserves the process ID, Notion DB, and historical runs.
   * Re-compiles IR, re-generates n8n workflow (PUT to n8n API),
   * and re-registers the per-process agent.
   */
  @Patch('drafts/:id/design')
  async updateDesign(
    @Param('id') id: string,
    @Body() body: { tenantId: string; designArtifact: DesignPayload },
  ) {
    const existing = await this.prisma.processWorkflow.findFirst({
      where: { id, tenantId: body.tenantId },
    });
    if (!existing) return { data: null, error: 'process not found' };

    const existingConfig = (existing.invocationConfig ?? {}) as Record<string, unknown>;

    // Update design but preserve slug and existing config
    const design = {
      ...body.designArtifact,
      slug: existing.slug, // keep original slug
    };

    await this.prisma.processWorkflow.update({
      where: { id },
      data: {
        name: design.name ?? existing.name,
        designArtifact: design as unknown as object,
        inputContract: design.inputContract as unknown as object ?? existing.inputContract,
        updatedAt: new Date(),
      },
    });

    // Re-deploy: IR → n8n workflow update → agent re-register
    try {
      const deployResult = await this.deployer.deploy(body.tenantId, id);
      return {
        data: {
          processId: id,
          updated: true,
          n8nWorkflowId: deployResult.n8nWorkflowId,
          notionDatabaseId: deployResult.notionDatabaseId,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { data: { processId: id, updated: true, deployError: msg } };
    }
  }

  @Post('drafts/:id/request-changes')
  async requestChanges(
    @Param('id') id: string,
    @Body() body: { tenantId: string; testRunId: string; feedback: string },
  ) {
    const run = await this.prisma.processTestRun.findFirst({
      where: { id: body.testRunId, processId: id, tenantId: body.tenantId },
    });
    if (!run) return { data: null, error: 'test run not found' };

    await this.prisma.processTestRun.update({
      where: { id: body.testRunId },
      data: {
        status: 'failed',
        feedback: body.feedback,
        completedAt: new Date(),
      },
    });

    return {
      data: {
        testRunId: body.testRunId,
        feedbackStored: true,
      },
    };
  }
}
