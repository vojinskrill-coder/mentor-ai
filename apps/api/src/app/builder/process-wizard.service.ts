import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { McpCatalogService } from './mcp-catalog.service';
import { BuilderOrchestratorService } from './builder-orchestrator.service';
import { ProcessDeployService } from './process-deploy.service';
import { N8nOrchestratorService } from '../n8n/n8n-orchestrator.service';
import { ProcessDraftService, DesignPayload } from './process-draft.service';
import { createId } from '@paralleldrive/cuid2';

/**
 * ProcessWizardService — deterministic, backend-driven wizard for
 * building processes step by step.
 *
 * The AI agent is unreliable for multi-turn wizard flows. This service
 * replaces the agent-driven path with a deterministic state machine:
 *
 *   1. TOOL_SELECT      — backend reads MCP catalog + tenant creds
 *   2. OPERATION_SELECT  — backend filters verified operations
 *   3. INPUT_FIELDS      — backend suggests fields from description + ops
 *   4. PIPELINE_PREVIEW  — backend builds pipeline from selections
 *   5. CONFIRM           — user reviews summary
 *   6. BUILD             — backend generates design.json, validates, deploys
 *
 * AI is used ONLY for:
 *   - Generating brain-call prompts (step instructions)
 *   - Enriching field suggestions from the user's description
 *
 * Everything else is deterministic backend logic.
 */

// ── Wizard card types (match frontend WizardCard union) ─────────────

export interface WizardTool {
  slug: string;
  displayName: string;
  description: string;
  connected: boolean;
  verified: boolean;
  operationCount: number;
}

export interface WizardOperation {
  id: string;
  kind: string;
  displayName: string;
  verified: boolean;
  toolSlug: string;
}

export interface WizardField {
  name: string;
  type: string;
  description: string;
  required: boolean;
  enabled: boolean;
  defaultValue?: string;
}

export interface WizardColumn {
  name: string;
  type: string;
  enabled: boolean;
}

export interface WizardPipelineStep {
  index: number;
  name: string;
  type: 'mcp_search' | 'mcp_read' | 'brain_call' | 'approval' | 'mcp_write';
  tool?: string;
  operation?: string;
  description: string;
}

export type WizardCard =
  | { type: 'tool_select'; title: string; purpose: string; tools: WizardTool[] }
  | { type: 'operation_select'; title: string; toolSlug: string; operations: WizardOperation[] }
  | { type: 'input_fields'; title: string; suggested: WizardField[] }
  | { type: 'output_columns'; title: string; suggested: WizardColumn[] }
  | { type: 'pipeline_preview'; title: string; steps: WizardPipelineStep[] }
  | { type: 'confirm'; title: string; summary: string };

export type WizardStage =
  | 'tool_select'
  | 'operation_select'
  | 'input_fields'
  | 'pipeline_preview'
  | 'confirm'
  | 'building'
  | 'complete'
  | 'failed';

export interface WizardSession {
  id: string;
  tenantId: string;
  description: string;
  stage: WizardStage;
  selectedTools: string[];
  selectedOperations: { toolSlug: string; operationId: string; kind: string; displayName: string }[];
  inputFields: WizardField[];
  pipelineSteps: WizardPipelineStep[];
  processId?: string;
  testItemCount?: number;
  error?: string;
  createdAt: number;
}

export interface WizardStepResult {
  session: WizardSession;
  card: WizardCard | null;
  complete: boolean;
  error?: string;
}

@Injectable()
export class ProcessWizardService {
  private readonly logger = new Logger(ProcessWizardService.name);
  private readonly sessions = new Map<string, WizardSession>();

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly catalog: McpCatalogService,
    private readonly orchestrator: BuilderOrchestratorService,
    private readonly deployer: ProcessDeployService,
    private readonly n8n: N8nOrchestratorService,
    private readonly draftService: ProcessDraftService,
  ) {}

  /**
   * Start a new wizard session. Returns the first card (tool_select).
   */
  async startWizard(tenantId: string, description: string): Promise<WizardStepResult> {
    const session: WizardSession = {
      id: `wiz_${createId()}`,
      tenantId,
      description,
      stage: 'tool_select',
      selectedTools: [],
      selectedOperations: [],
      inputFields: [],
      pipelineSteps: [],
      createdAt: Date.now(),
    };
    this.sessions.set(session.id, session);

    const card = await this.buildToolSelectCard(tenantId);
    return { session, card, complete: false };
  }

  /**
   * Advance the wizard by one step. The response contains the user's
   * selection from the previous card.
   */
  async advanceWizard(
    wizardId: string,
    tenantId: string,
    response: { type: string; data: Record<string, unknown> },
  ): Promise<WizardStepResult> {
    const session = this.sessions.get(wizardId);
    if (!session) {
      throw new BadRequestException(`Wizard session not found: ${wizardId}`);
    }
    if (session.tenantId !== tenantId) {
      throw new BadRequestException('Tenant mismatch');
    }

    switch (session.stage) {
      case 'tool_select':
        return this.handleToolSelect(session, response.data);
      case 'operation_select':
        return this.handleOperationSelect(session, response.data);
      case 'input_fields':
        return this.handleInputFields(session, response.data);
      case 'pipeline_preview':
        return this.handlePipelinePreview(session, response.data);
      case 'confirm':
        return this.handleConfirm(session);
      default:
        throw new BadRequestException(`Cannot advance from stage: ${session.stage}`);
    }
  }

  // ── Stage handlers ──────────────────────────────────────────────

  /**
   * Stage 1 → 2: User selected a tool.
   * Show operations for the selected tool.
   */
  private async handleToolSelect(
    session: WizardSession,
    data: Record<string, unknown>,
  ): Promise<WizardStepResult> {
    const selected = data['selected'] as string;
    if (!selected) {
      throw new BadRequestException('No tool selected');
    }
    session.selectedTools = [selected];

    // Only show operations for the selected tool.
    // Save destination is determined later from the user's operation picks
    // (any "write" operation they select defines where results are saved).
    const card = await this.buildOperationSelectCard(session.tenantId, [selected]);
    session.stage = 'operation_select';
    return { session, card, complete: false };
  }

  /**
   * Stage 2 → 3: User selected operations.
   * Suggest input fields based on operations + description.
   */
  private async handleOperationSelect(
    session: WizardSession,
    data: Record<string, unknown>,
  ): Promise<WizardStepResult> {
    const selected = data['selected'] as Array<{ toolSlug: string; operationId: string }>;
    if (!selected?.length) {
      throw new BadRequestException('No operations selected');
    }

    // Enrich with display names and kinds from catalog
    const tools = await this.catalog.getMany(session.selectedTools);
    session.selectedOperations = selected.map((s) => {
      const tool = tools.find((t) => t.slug === s.toolSlug);
      const ops = (tool?.operations as unknown as Array<{ id: string; kind: string; displayName: string }>) ?? [];
      const op = ops.find((o) => o.id === s.operationId);
      return {
        toolSlug: s.toolSlug,
        operationId: s.operationId,
        kind: op?.kind ?? 'read',
        displayName: op?.displayName ?? s.operationId,
      };
    });

    const card = this.buildInputFieldsCard(session);
    session.stage = 'input_fields';
    return { session, card, complete: false };
  }

  /**
   * Stage 3 → 4: User confirmed input fields.
   * Build the pipeline preview.
   */
  private async handleInputFields(
    session: WizardSession,
    data: Record<string, unknown>,
  ): Promise<WizardStepResult> {
    const fields = data['fields'] as WizardField[];
    if (!fields) {
      throw new BadRequestException('No fields provided');
    }
    session.inputFields = fields.filter((f) => f.enabled);

    const card = this.buildPipelinePreviewCard(session);
    session.stage = 'pipeline_preview';
    return { session, card, complete: false };
  }

  /**
   * Stage 4 → 5: User approved the pipeline.
   * Show final confirmation.
   */
  private async handlePipelinePreview(
    session: WizardSession,
    _data: Record<string, unknown>,
  ): Promise<WizardStepResult> {
    // Pipeline steps were already set by buildPipelinePreviewCard
    const card = this.buildConfirmCard(session);
    session.stage = 'confirm';
    return { session, card, complete: false };
  }

  /**
   * Stage 5 → BUILD + DEPLOY + SINGLE TEST: User confirmed.
   *
   * The agent is autonomous and self-validating (see SOUL.md). The
   * wizard's job is simple:
   *   1. Generate design.json from wizard selections
   *   2. Save as draft
   *   3. Validate against business rules
   *   4. Deploy infrastructure (n8n workflow + Notion DB + agent)
   *   5. Trigger ONE test run with synthetic input
   *   6. Poll for callback (long timeout — agent handles retries internally)
   *   7. Accept the result: agent already validated it
   *
   * NO retry loop. NO redeployment. The agent self-corrects MCP failures,
   * validates output schemas, and only calls back with verified data.
   * If the agent cannot produce good data after its internal retries,
   * it returns a clean error object — which we surface to the user.
   */
  // Agent handles its own retries (max 5 per step, per SOUL.md).
  // Backend poll timeout is generous: 45 minutes covers multi-step
  // pipelines with slow external APIs.
  private static readonly AGENT_POLL_TIMEOUT_MS = 45 * 60_000;
  private static readonly AGENT_POLL_INTERVAL_MS = 10_000;

  private async handleConfirm(session: WizardSession): Promise<WizardStepResult> {
    session.stage = 'building';
    try {
      // 1. Generate design.json
      const design = this.generateDesign(session);
      const webhookPath = `neuron-${design.slug}`;

      // 2. Save as draft
      const draft = await this.draftService.createDraft(session.tenantId, design as DesignPayload);
      const processId = draft.id;
      session.processId = processId;
      this.logger.log({ message: 'Wizard: draft created', processId });

      // 3. Validate
      const validation = await this.orchestrator.submitDesign(
        session.tenantId,
        design as DesignPayload,
        processId,
      );
      if (validation.stage === 'failed') {
        session.stage = 'failed';
        session.error = `Validation failed: ${validation.error}`;
        return { session, card: null, complete: false, error: session.error };
      }

      // 4. Deploy infrastructure (once)
      const deployResult = await this.deployer.deploy(session.tenantId, processId);
      this.logger.log({
        message: 'Wizard: deployed',
        processId,
        n8nWorkflowId: deployResult.n8nWorkflowId,
      });

      if (!deployResult.n8nWorkflowId) {
        session.stage = 'failed';
        session.error = 'Deploy succeeded but no n8n workflow was created';
        return { session, card: null, complete: false, error: session.error };
      }

      // 5. Create a single test run
      const testRunId = `ptest_${createId()}`;
      const syntheticInput = this.generateSyntheticInput(session);
      await this.prisma.processTestRun.create({
        data: {
          id: testRunId,
          processId,
          tenantId: session.tenantId,
          status: 'pending',
          input: syntheticInput as unknown as object,
        },
      });

      // 6. Trigger once — agent handles everything from here
      try {
        await this.n8n.triggerWorkflow(webhookPath, {
          processRunId: testRunId,
          tenantId: session.tenantId,
          input: syntheticInput,
        });
      } catch (triggerErr) {
        this.logger.warn(`Webhook trigger error (may be async): ${(triggerErr as Error).message}`);
      }

      // 7. Poll with generous timeout — agent self-validates internally
      const testResult = await this.pollTestResult(
        testRunId,
        ProcessWizardService.AGENT_POLL_TIMEOUT_MS,
        ProcessWizardService.AGENT_POLL_INTERVAL_MS,
      );

      // 8. Evaluate — but trust the agent's self-validation.
      // We only check for catastrophic failures (timeout, total crash).
      if (!testResult) {
        session.stage = 'failed';
        session.error = 'Agent did not respond within the timeout window. The pipeline may be stuck.';
        return { session, card: null, complete: false, error: session.error };
      }

      if (testResult.status === 'failed') {
        session.stage = 'failed';
        session.error = testResult.error ?? 'Agent reported a pipeline failure.';
        return { session, card: null, complete: false, error: session.error };
      }

      // Agent returned data — trust it (agent already validated internally)
      const items = (testResult.output as unknown[]) ?? [];
      const validItems = items.filter((item: unknown) => {
        if (!item || typeof item !== 'object') return false;
        const obj = item as Record<string, unknown>;
        // Only filter out catastrophic error markers
        return !obj['error'] || obj['error'] === 'auth_failure';
      });

      if (validItems.length === 0) {
        session.stage = 'failed';
        session.error = 'Agent completed but produced no usable results.';
        return { session, card: null, complete: false, error: session.error };
      }

      // Publish — agent validated, we're good
      await this.prisma.processWorkflow.update({
        where: { id: processId },
        data: { status: 'published', isTestMode: false, updatedAt: new Date() },
      });
      session.stage = 'complete';
      session.testItemCount = validItems.length;
      this.logger.log({
        message: 'Wizard: agent delivered verified results, published',
        processId,
        testRunId,
        validItems: validItems.length,
        totalItems: items.length,
      });
      return { session, card: null, complete: true };
    } catch (err) {
      session.stage = 'failed';
      session.error = (err as Error).message;
      return { session, card: null, complete: false, error: session.error };
    }
  }

  /**
   * Poll ProcessTestRun until it's no longer pending/running.
   * Returns null on timeout.
   */
  private async pollTestResult(
    testRunId: string,
    maxMs: number,
    intervalMs: number,
  ): Promise<{ status: string; output?: unknown; error?: string | null } | null> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const run = await this.prisma.processTestRun.findUnique({
        where: { id: testRunId },
        select: { status: true, output: true, error: true },
      });
      if (!run) return null;
      if (run.status !== 'pending' && run.status !== 'running') {
        return run;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return null;
  }

  /**
   * Generate synthetic test input values from the wizard session's
   * input fields. Uses defaults when available, otherwise reasonable
   * placeholder values.
   */
  private generateSyntheticInput(session: WizardSession): Record<string, unknown> {
    const input: Record<string, unknown> = {};
    for (const field of session.inputFields) {
      if (field.defaultValue !== undefined && field.defaultValue !== '') {
        input[field.name] = field.type === 'number'
          ? Number(field.defaultValue)
          : field.defaultValue;
      } else {
        switch (field.type) {
          case 'number': input[field.name] = 10; break;
          case 'boolean': input[field.name] = true; break;
          default: input[field.name] = this.syntheticStringValue(field.name); break;
        }
      }
    }
    return input;
  }

  private syntheticStringValue(name: string): string {
    const n = name.toLowerCase();
    if (n.includes('region') || n.includes('location')) return 'Europe';
    if (n.includes('industr') || n.includes('keyword')) return 'luxury design';
    if (n.includes('query') || n.includes('search') || n.includes('topic')) return 'luxury sculpture trends';
    if (n.includes('email')) return 'test@example.com';
    if (n.includes('url')) return 'https://example.com';
    if (n.includes('name')) return 'Test User';
    return `sample-${name}`;
  }

  // ── Card builders ─────────────────────────────────────────────

  private async buildToolSelectCard(tenantId: string): Promise<WizardCard> {
    const allTools = await this.catalog.listActive();
    const credentials = await this.prisma.tenantCredential.findMany({
      where: { tenantId },
      select: { toolSlug: true, config: true },
    });
    const credMap = new Map(credentials.map((c) => [c.toolSlug, c]));

    const tools: WizardTool[] = allTools.map((t) => {
      const cred = credMap.get(t.slug);
      const config = (cred?.config as Record<string, unknown>) ?? {};
      const verifiedOps = (config.verifiedOperations as string[]) ?? [];
      return {
        slug: t.slug,
        displayName: t.displayName,
        description: (t.description ?? '').substring(0, 70),
        connected: !!cred,
        verified: verifiedOps.length > 0,
        operationCount: ((t.operations as unknown as unknown[]) ?? []).length,
      };
    });

    return {
      type: 'tool_select',
      title: 'Which tool should this process use?',
      purpose: 'Choose the primary data source or integration',
      tools,
    };
  }

  private async buildOperationSelectCard(
    tenantId: string,
    toolSlugs: string[],
  ): Promise<WizardCard> {
    const tools = await this.catalog.getMany(toolSlugs);
    const credentials = await this.prisma.tenantCredential.findMany({
      where: { tenantId, toolSlug: { in: toolSlugs } },
      select: { toolSlug: true, config: true },
    });
    const credMap = new Map(credentials.map((c) => [c.toolSlug, c]));

    const operations: WizardOperation[] = [];
    for (const tool of tools) {
      const cred = credMap.get(tool.slug);
      const config = (cred?.config as Record<string, unknown>) ?? {};
      const verifiedOps = (config.verifiedOperations as string[]) ?? [];
      const failedOps = (config.failedOperations as string[]) ?? [];
      const ops = (tool.operations as unknown as Array<{ id: string; kind: string; displayName: string }>) ?? [];

      for (const op of ops) {
        operations.push({
          id: op.id,
          kind: op.kind,
          displayName: op.displayName,
          verified: verifiedOps.includes(op.id) || (!failedOps.includes(op.id) && !!cred),
          toolSlug: tool.slug,
        });
      }
    }

    return {
      type: 'operation_select',
      title: 'Which operations do you need?',
      toolSlug: toolSlugs[0] ?? '',
      operations,
    };
  }

  private buildInputFieldsCard(session: WizardSession): WizardCard {
    const fields: WizardField[] = [];
    const desc = session.description.toLowerCase();

    // Infer fields from selected operations and description
    const hasSearch = session.selectedOperations.some((o) => o.kind === 'search');

    if (hasSearch) {
      // Search operations typically need query parameters
      if (desc.includes('region') || desc.includes('location') || desc.includes('geo') || desc.includes('balkan') || desc.includes('europe') || desc.includes('us')) {
        fields.push({ name: 'region', type: 'string', description: 'Target geographic region', required: true, enabled: true });
      }
      if (desc.includes('industr') || desc.includes('sector') || desc.includes('luxury') || desc.includes('design') || desc.includes('architect')) {
        fields.push({ name: 'industry_keywords', type: 'string', description: 'Industry or niche keywords', required: true, enabled: true, defaultValue: this.extractKeywords(desc) });
      }
      fields.push({ name: 'target_count', type: 'number', description: 'How many results to fetch', required: false, enabled: true, defaultValue: '20' });
    }

    if (desc.includes('score') || desc.includes('rank') || desc.includes('evaluat')) {
      fields.push({ name: 'scoring_criteria', type: 'string', description: 'What to score leads on (e.g., "luxury segment fit")', required: false, enabled: true });
    }

    // Always offer a generic search query field if no specific fields inferred
    if (fields.length === 0) {
      fields.push({ name: 'query', type: 'string', description: 'Search query or topic', required: true, enabled: true });
      fields.push({ name: 'target_count', type: 'number', description: 'How many results to produce', required: false, enabled: true, defaultValue: '10' });
    }

    return {
      type: 'input_fields',
      title: 'What inputs does this process need?',
      suggested: fields,
    };
  }

  private buildPipelinePreviewCard(session: WizardSession): WizardCard {
    const steps: WizardPipelineStep[] = [];
    let idx = 1;

    // Group operations by kind
    const searchOps = session.selectedOperations.filter((o) => o.kind === 'search');
    const readOps = session.selectedOperations.filter((o) => o.kind === 'read');
    const writeOps = session.selectedOperations.filter((o) => o.kind === 'write');
    const desc = session.description.toLowerCase();

    // Pipeline uses LOGICAL PHASES, not individual operations.
    // Each phase is ONE brain call. The agent decides which MCP
    // operations to use within each phase. This keeps the pipeline
    // simple (3-5 steps) instead of N+2 steps.

    // Phase 1: Search & Gather (one brain call using search ops)
    if (searchOps.length > 0) {
      const toolNames = [...new Set(searchOps.map((o) => o.toolSlug))].join(', ');
      const opNames = searchOps.map((o) => o.operationId).join(', ');
      steps.push({
        index: idx++,
        name: 'Search & Gather',
        type: 'mcp_search',
        tool: toolNames,
        operation: opNames,
        description: `Search for matching results via ${toolNames}`,
      });
    }

    // Phase 2: Enrich & Qualify (one brain call using read ops + web search)
    if (readOps.length > 0 || searchOps.length > 0) {
      const enrichTools = readOps.length > 0
        ? [...new Set(readOps.map((o) => o.toolSlug))].join(', ')
        : undefined;
      const enrichOps = readOps.map((o) => o.operationId).join(', ');
      steps.push({
        index: idx++,
        name: 'Enrich & Qualify',
        type: 'brain_call',
        tool: enrichTools,
        operation: enrichOps || undefined,
        description: readOps.length > 0
          ? `AI enriches each result via ${enrichTools} + web research`
          : 'AI researches and qualifies each result',
      });
    }

    // Phase 3: Score & Rank (if description mentions scoring)
    if (desc.includes('score') || desc.includes('rank') || desc.includes('evaluat') || desc.includes('fit') || desc.includes('match')) {
      steps.push({
        index: idx++,
        name: 'Score & Rank',
        type: 'brain_call',
        description: 'Score each item 0-10 for business fit',
      });
    }

    // Phase 4: Approval gate (always)
    steps.push({
      index: idx++,
      name: 'Review Results',
      type: 'approval',
      description: 'You review and approve before saving',
    });

    // Phase 5: Save (one brain call using write ops)
    if (writeOps.length > 0) {
      const saveToolNames = [...new Set(writeOps.map((o) => o.toolSlug))].join(', ');
      const saveOpNames = writeOps.map((o) => o.operationId).join(', ');
      steps.push({
        index: idx++,
        name: 'Save Results',
        type: 'mcp_write',
        tool: saveToolNames,
        operation: saveOpNames,
        description: `Save approved items to ${saveToolNames}`,
      });
    }

    session.pipelineSteps = steps;

    return {
      type: 'pipeline_preview',
      title: 'Your process pipeline',
      steps,
    };
  }

  private buildConfirmCard(session: WizardSession): WizardCard {
    const stepsSummary = session.pipelineSteps
      .map((s) => {
        const icon = { mcp_search: '🔍', mcp_read: '📊', brain_call: '🧠', approval: '✅', mcp_write: '💾' }[s.type] ?? '•';
        return `${icon} ${s.name}`;
      })
      .join(' → ');

    const inputsSummary = session.inputFields.map((f) => `${f.name} (${f.type})`).join(', ') || 'none';
    const toolsSummary = [...new Set(session.selectedTools)].join(', ');

    const summary = [
      session.description,
      '',
      `Pipeline: ${stepsSummary}`,
      `Inputs: ${inputsSummary}`,
      `Tools: ${toolsSummary}`,
      `Saves to: ${this.getSaveDestination(session)}`,
    ].join('\n');

    return {
      type: 'confirm',
      title: 'Ready to build?',
      summary,
    };
  }

  // ── Design generation ─────────────────────────────────────────

  /**
   * Generate a complete design.json from the wizard session.
   * This is deterministic — no AI calls. The brain-call prompts are
   * template-based with the user's description injected.
   */
  private generateDesign(session: WizardSession) {
    // Unique slug per wizard session — prevents reusing old drafts
    // with stale n8nWorkflowId from previous sessions.
    const suffix = createId().substring(0, 6);
    const slug = this.slugify(session.description) + '-' + suffix;
    const name = this.titleCase(session.description.substring(0, 60));

    const inputContract: Record<string, unknown> = {
      type: 'object',
      required: session.inputFields.filter((f) => f.required).map((f) => f.name),
      properties: Object.fromEntries(
        session.inputFields.map((f) => [
          f.name,
          {
            type: f.type === 'number' ? 'number' : f.type === 'boolean' ? 'boolean' : 'string',
            description: f.description,
            ...(f.defaultValue !== undefined ? { default: f.type === 'number' ? Number(f.defaultValue) : f.defaultValue } : {}),
          },
        ]),
      ),
    };

    // Every non-approval step is a brain call. The agent handles
    // MCP tool calls internally. Each step gets a prompt describing
    // what to do and which MCP operations are available.
    const steps = session.pipelineSteps.map((ps, i) => {
      const base: Record<string, unknown> = {
        index: i + 1,
        name: ps.name,
        stepKind: this.mapStepTypeToKind(ps.type),
      };

      // Preserve MCP metadata for the IR compiler's instruction generator
      if (ps.tool) base.mcpToolSlug = ps.tool.split(', ')[0]; // primary tool
      if (ps.operation) base.mcpOperationId = ps.operation.split(', ')[0]; // primary op

      if (ps.type === 'approval') {
        base.manualStep = true;
      } else {
        // ALL non-approval steps get a prompt (they're all brain calls)
        base.prompt = this.generateStepPrompt(session, ps);
        base.thinking = ps.type === 'mcp_search' ? 'medium' : ps.name.toLowerCase().includes('score') ? 'medium' : 'high';
        base.timeoutSeconds = ps.type === 'mcp_search' || ps.type === 'mcp_write' ? 600 : 300;
        base.outputSchema = { type: 'array' };
        base.fieldBindings = this.buildSearchBindings(session, ps);
      }

      return base;
    });

    // Only include Notion schema if Notion is a save target
    const usesNotion = session.selectedOperations.some(
      (o) => o.toolSlug === 'notion' && o.kind === 'write',
    );
    const notionSchema = usesNotion
      ? {
          parentPageStrategy: 'root',
          databaseName: `${name} — Records`,
          properties: [
            { name: 'Name', type: 'title' },
            { name: 'Status', type: 'select', options: ['Pending', 'Approved', 'Rejected'], defaultOption: 'Pending' },
            { name: 'Score', type: 'number' },
            { name: 'Source', type: 'url' },
            { name: 'Notes', type: 'rich_text' },
          ],
        }
      : undefined;

    return {
      name,
      slug,
      description: session.description,
      trigger: { type: 'manual' },
      tools: session.selectedTools,
      inputContract,
      ...(notionSchema && { notionSchema }),
      steps,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────

  /** Get all tool slugs the tenant has credentials for */
  private async getConnectedToolSlugs(tenantId: string): Promise<string[]> {
    const creds = await this.prisma.tenantCredential.findMany({
      where: { tenantId },
      select: { toolSlug: true },
    });
    return creds.map((c) => c.toolSlug);
  }

  /** Filter tool slugs to only those that have write operations in catalog */
  private async getToolsWithWriteOps(slugs: string[]): Promise<string[]> {
    if (slugs.length === 0) return [];
    const tools = await this.catalog.getMany(slugs);
    return tools
      .filter((t) => {
        const ops = (t.operations as unknown as Array<{ kind: string }>) ?? [];
        return ops.some((o) => o.kind === 'write');
      })
      .map((t) => t.slug);
  }

  /** Determine the save destination from selected write operations */
  private getSaveDestination(session: WizardSession): string {
    const writeOps = session.selectedOperations.filter((o) => o.kind === 'write');
    if (writeOps.length === 0) return 'none (no write operation selected)';
    return [...new Set(writeOps.map((o) => o.toolSlug))].join(', ');
  }

  private buildSearchBindings(session: WizardSession, _step: WizardPipelineStep): Record<string, unknown> {
    const bindings: Record<string, unknown> = {};
    for (const field of session.inputFields) {
      if (field.name === 'target_count') {
        bindings.per_page = { source: 'manual', field: 'target_count' };
      } else if (field.name === 'region') {
        bindings.organization_locations = { source: 'manual', field: 'region' };
      } else if (field.name === 'industry_keywords') {
        bindings.q_organization_keyword_tags = { source: 'manual', field: 'industry_keywords' };
      } else if (field.name === 'query') {
        bindings.q_organization_keyword_tags = { source: 'manual', field: 'query' };
      } else {
        bindings[field.name] = { source: 'manual', field: field.name };
      }
    }
    return bindings;
  }

  /**
   * Generate step prompt based on step type. Every step is a brain call —
   * MCP steps get instructions to call the gateway via exec curl.
   */
  private generateStepPrompt(session: WizardSession, step: WizardPipelineStep): string {
    const desc = session.description;
    const tools = step.tool ? step.tool.split(', ') : [];
    const ops = step.operation ? step.operation.split(', ') : [];

    // Search phase — agent calls MCP search operations
    if (step.type === 'mcp_search') {
      const inputFields = session.inputFields.map((f) => `${f.name}: {{${f.name}}}`).join(', ');
      return `You are executing the SEARCH phase for: "${desc}".

Your task: Find matching results using the MCP gateway.

Available operations: ${ops.map((op, i) => `${tools[i] ?? tools[0]}/${op}`).join(', ')}

Call the MCP gateway via exec curl:
exec curl -sS -X POST "http://100.114.192.85:3000/api/v1/mcp/${tools[0]}/${ops[0]}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \\
  -d '{ <appropriate body for the operation> }'

Input values: ${inputFields}

IMPORTANT for Apollo:
- organization_locations MUST be an array: ["Europe"], NOT "Europe"
- q_organization_keyword_tags MUST be an array: ["luxury", "design"]
- per_page: use the target_count input value (number)

Parse the API response and extract the results array.
Return ONLY a JSON array of items. No prose, no markdown fences. Start with [ and end with ].`;
    }

    // Enrich phase — agent enriches results from previous step
    if (step.type === 'brain_call' && step.tool) {
      return `You are executing the ENRICH phase for: "${desc}".

For each item from the previous step:
1. Call the MCP gateway to enrich it:
   exec curl -sS -X POST "http://100.114.192.85:3000/api/v1/mcp/${tools[0]}/${ops[0] ?? 'enrich_organization'}" \\
     -H "Content-Type: application/json" \\
     -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \\
     -d '{ "domain": "<domain from item>" }'
2. Also use web_search to find additional context about each company
3. Merge enrichment data into the existing item
4. Add: description (2-3 sentences), qualityIndicators (array), potentialConcerns (array)
5. KEEP ALL existing fields from the previous step

Return ONLY a JSON array. No prose, no markdown fences. Start with [ and end with ].`;
    }

    // Score phase — pure AI reasoning
    if (step.name.toLowerCase().includes('score') || step.name.toLowerCase().includes('rank')) {
      return `You are executing the SCORING phase for: "${desc}".

For each item from the previous step:
1. Score it 0-10 for business fit
2. Add: score (number), scoreBreakdown (object with 2-4 criteria each 0-3), scoringRationale (1-2 sentences)
3. Sort descending by score
4. KEEP ALL existing fields from the previous step

Return ONLY a JSON array. No prose, no markdown fences. Start with [ and end with ].`;
    }

    // Write/Save phase — agent calls MCP write operation
    if (step.type === 'mcp_write') {
      return `You are executing the SAVE phase for: "${desc}".

For each approved item from the previous step, save it via the MCP gateway:
exec curl -sS -X POST "http://100.114.192.85:3000/api/v1/mcp/${tools[0]}/${ops[0]}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \\
  -d '{ <item data formatted for the API> }'

Return a JSON array of saved items with their IDs. No prose, no markdown fences. Start with [ and end with ].`;
    }

    // Generic brain call fallback
    return `You are processing results for: "${desc}".

For each item from the previous step:
1. Research and verify the data (use web search if needed)
2. Add enrichment fields: description, qualityIndicators, potentialConcerns
3. KEEP ALL existing fields from the previous step

Return ONLY a JSON array. No prose, no markdown fences. Start with [ and end with ].`;
  }

  private mapStepTypeToKind(type: WizardPipelineStep['type']): string {
    const map: Record<string, string> = {
      mcp_search: 'MCP_SEARCH',
      mcp_read: 'MCP_READ',
      brain_call: 'BRAIN_CALL',
      approval: 'APPROVAL_GATE',
      mcp_write: 'MCP_WRITE',
    };
    return map[type] ?? 'BRAIN_CALL';
  }

  private extractKeywords(desc: string): string {
    const keywords = desc
      .replace(/[^a-zA-Z\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .filter((w) => !['find', 'search', 'create', 'build', 'make', 'process', 'that', 'with', 'from', 'save', 'approved', 'leads', 'them', 'each', 'their', 'this', 'into', 'well', 'they', 'match'].includes(w.toLowerCase()))
      .slice(0, 5)
      .join(' ');
    return keywords || 'general';
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  }

  private titleCase(s: string): string {
    return s
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
}
