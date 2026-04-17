import { Injectable, Logger, NotFoundException, BadRequestException, Optional, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { createId } from '@paralleldrive/cuid2';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { AppEventBus } from '../events/app-event-bus.service';
import { OpenClawClientService } from '../agent-execution/openclaw-client.service';
import { OpenClawTenantService } from '../openclaw-tenant/openclaw-tenant.service';
import { BrainStateService } from './brain-state.service';
import { EmbeddingService } from '../knowledge/services/embedding.service';
import {
  CreateProposalDto,
  UpdateProposalDto,
  CreateConceptDto,
  CreateTaskDto,
  TaskContributionDto,
  TaskProgressDto,
  TaskCompleteDto,
  AgentStatusDto,
  CreateMemoryDto,
  UpdateBrainStateDto,
  CreateConversationDto,
  ALLOWED_DELIVERABLE_TYPES,
} from './dto/bridge.dto';

// True if a filename ends with one of the whitelisted deliverable extensions.
// Used to filter out junk files (.md, .py, .js, .ts, .txt, etc) when a Note
// has an expectedDeliverables manifest. See bridge.dto.ts for the whitelist.
function isAllowedDeliverableFile(name: string): boolean {
  const ext = name.toLowerCase().split('.').pop();
  if (!ext) return false;
  return (ALLOWED_DELIVERABLE_TYPES as readonly string[]).includes(ext);
}

// Bridge-specific event names (gateway subscribes to these)
export const BRIDGE_EVENTS = {
  PROPOSAL_NEW: 'bridge.proposal.new',
  PROPOSAL_APPROVED: 'bridge.proposal.approved',
  TASK_CREATED: 'bridge.task.created',
  TASK_CONTRIBUTION: 'bridge.task.contribution',
  TASK_PROGRESS: 'bridge.task.progress',
  TASK_COMPLETE: 'bridge.task.complete',
  AGENT_STATUS: 'bridge.agent.status',
  TREE_UPDATED: 'bridge.tree.updated',
  CONVERSATION_CREATED: 'bridge.conversation.created',
  ACTION_EXECUTING: 'bridge.action.executing',
  ACTION_COMPLETE: 'bridge.action.complete',
  PROCESS_RUN_STARTED: 'bridge.process.run-started',
  PROCESS_STEP_STARTED: 'bridge.process.step-started',
  PROCESS_STEP_PROGRESS: 'bridge.process.step-progress',  // Real-time streaming: text chunks, tool use, status
  PROCESS_STEP_OUTPUT: 'bridge.process.step-output',
  PROCESS_STEP_FAILED: 'bridge.process.step-failed',
  PROCESS_COMPLETE: 'bridge.process.complete',
  PROCESS_APPROVAL_NEEDED: 'bridge.process.approval-needed',
  PROCESS_CANCELLED: 'bridge.process.cancelled',
  BATCH: 'bridge.batch',  // Batched events (claude-code SerialBatchEventUploader pattern)
} as const;

@Injectable()
export class BridgeService {
  private readonly logger = new Logger(BridgeService.name);

  /**
   * In-memory set of currently-executing task noteIds (per tenant).
   * Populated when a proposal is approved and the OpenClaw execute call is
   * fired; cleared on completeTask. The frontend Task Hub fetches this on
   * load via GET /api/v1/bridge/running-tasks so the running spinner
   * survives page reloads — previously the running state lived only in the
   * frontend WebSocket Set and was lost on refresh / navigation.
   *
   * Tradeoff: in-memory only, so a server restart clears it. The auto-
   * complete fallback (10/30 min) catches stuck tasks anyway, so a brief
   * loss-of-state on restart is acceptable.
   */
  private readonly runningTaskIds = new Map<string, Set<string>>(); // tenantId -> Set<noteId>

  markTaskRunning(tenantId: string, noteId: string): void {
    let set = this.runningTaskIds.get(tenantId);
    if (!set) {
      set = new Set();
      this.runningTaskIds.set(tenantId, set);
    }
    set.add(noteId);
  }

  unmarkTaskRunning(tenantId: string, noteId: string): void {
    const set = this.runningTaskIds.get(tenantId);
    if (set) set.delete(noteId);
  }

  getRunningTaskIds(tenantId: string): string[] {
    const set = this.runningTaskIds.get(tenantId);
    return set ? Array.from(set) : [];
  }

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly eventBus: AppEventBus,
    private readonly brainState: BrainStateService,
    @Inject(forwardRef(() => OpenClawClientService))
    private readonly openClawClient: OpenClawClientService,
    private readonly openClawTenant: OpenClawTenantService,
    private readonly embeddingService: EmbeddingService,
    private readonly configService: ConfigService,
  ) {}

  // ════════════════════════════════════════════
  //  READ Operations
  // ════════════════════════════════════════════

  async searchConcepts(tenantId: string, query: string, limit = 10) {
    const conceptSelect = {
      id: true, name: true, category: true, definition: true,
      canvasBlock: true, departmentTags: true,
      relatedTo: {
        select: { relationshipType: true, targetConcept: { select: { id: true, name: true, category: true } } },
        take: 5,
      },
      relatedFrom: {
        select: { relationshipType: true, sourceConcept: { select: { id: true, name: true, category: true } } },
        take: 5,
      },
    };

    // 1. Semantic search via Qdrant — scoped to tenant
    const semanticMatches = await this.embeddingService.search(query, limit * 2, { tenantId });
    let conceptIds = semanticMatches
      .filter(m => m.score >= 0.3)
      .map(m => m.conceptId);

    // 2. Text search fallback
    const textResults = await this.prisma.concept.findMany({
      where: {
        AND: [
          { OR: [{ tenantId: null }, { tenantId }] },
          { OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { definition: { contains: query, mode: 'insensitive' } },
          ] },
        ],
      },
      select: { id: true },
      take: limit,
    });
    for (const t of textResults) {
      if (!conceptIds.includes(t.id)) conceptIds.push(t.id);
    }

    // 3. Deduplicate and limit
    conceptIds = [...new Set(conceptIds)].slice(0, limit);
    if (conceptIds.length === 0) return [];

    // 4. Load full concept data
    const concepts = await this.prisma.concept.findMany({
      where: { id: { in: conceptIds } },
      select: conceptSelect,
    });

    // Sort by semantic relevance order
    const orderMap = new Map(conceptIds.map((id, i) => [id, i]));
    concepts.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));

    this.logger.log({ message: 'Concept search', query, semantic: semanticMatches.length, text: textResults.length, returned: concepts.length });
    return concepts;
  }

  async getConceptDetails(conceptId: string) {
    const concept = await this.prisma.concept.findUnique({
      where: { id: conceptId },
      include: {
        relatedTo: {
          include: { targetConcept: { select: { id: true, name: true, category: true } } },
        },
        relatedFrom: {
          include: { sourceConcept: { select: { id: true, name: true, category: true } } },
        },
        workflow: true,
      },
    });

    if (!concept) throw new NotFoundException(`Concept ${conceptId} not found`);
    return concept;
  }

  async getPendingConcepts(tenantId: string) {
    return this.prisma.note.findMany({
      where: {
        tenantId,
        noteType: 'TASK',
        status: 'PENDING',
        parentNoteId: null,
        conceptId: { not: null },
      },
      select: {
        id: true,
        title: true,
        conceptId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
  }

  async getCategories() {
    const categories = await this.prisma.concept.groupBy({
      by: ['category'],
      _count: { _all: true },
      where: { tenantId: null }, // Platform concepts only
      orderBy: { category: 'asc' },
    });

    return categories.map((c) => ({
      category: c.category,
      conceptCount: c._count._all,
    }));
  }

  async getBusinessContext(tenantId: string) {
    const [tenant, memories] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, industry: true, description: true, maturityStage: true },
      }),
      this.prisma.memory.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, type: true, content: true, subject: true },
      }),
    ]);

    return { tenant, memories };
  }

  async getBudget(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const budget = await this.prisma.agentDailyBudget.findUnique({
      where: { tenantId_date: { tenantId, date: today } },
    });
    const spent = budget?.spentEur?.toNumber() ?? 0;
    const dailyLimitEur = parseInt(process.env['AGENT_DAILY_BUDGET_EUR'] ?? '200', 10);
    return { dailyLimitEur, spentEur: spent, remainingEur: Math.max(0, dailyLimitEur - spent) };
  }

  async getProposals(tenantId: string, status?: string) {
    return this.prisma.brainProposal.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ════════════════════════════════════════════
  //  WRITE Operations: Proposals
  // ════════════════════════════════════════════

  async createProposal(dto: CreateProposalDto) {
    const id = `prop_${createId()}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14); // 14 day expiry

    const proposal = await this.prisma.brainProposal.create({
      data: {
        id,
        tenantId: dto.tenantId,
        canvasBlock: dto.canvasBlock,
        type: dto.type,
        title: dto.title,
        reasoning: dto.reasoning,
        proposedAction: dto.proposedAction,
        estimatedCost: dto.estimatedCost,
        priority: dto.priority ?? 'medium',
        relatedConcepts: dto.relatedConcepts ?? [],
        // Initial manifest at birth — optional. Brain may provide a best
        // guess; the discussion + "Confirm plan and run" step is the
        // canonical place to lock the final manifest.
        expectedDeliverables: (dto.expectedDeliverables ?? []) as unknown as object,
        expiresAt,
      },
    });

    this.eventBus.emit(BRIDGE_EVENTS.PROPOSAL_NEW, {
      tenantId: dto.tenantId,
      proposal: {
        id: proposal.id,
        title: proposal.title,
        type: proposal.type,
        priority: proposal.priority,
        canvasBlock: proposal.canvasBlock,
        estimatedCost: proposal.estimatedCost,
      },
    });

    this.logger.log({ message: 'Brain proposal created', id, title: dto.title, tenantId: dto.tenantId });
    return proposal;
  }

  async updateProposal(id: string, dto: UpdateProposalDto) {
    const proposal = await this.prisma.brainProposal.findUnique({ where: { id } });
    if (!proposal) throw new NotFoundException(`Proposal ${id} not found`);
    if (proposal.status !== 'pending') {
      throw new BadRequestException(`Proposal ${id} is already ${proposal.status}`);
    }

    if (dto.status === 'approved') {
      const noteId = `note_${createId()}`;
      const conceptId = proposal.relatedConcepts?.[0] ?? null;
      // Use updated plan from conversation if provided, otherwise original
      const finalAction = dto.proposedAction || proposal.proposedAction;

      // The chat "Confirm plan and run" step generates the final manifest
      // from the discussion and passes it via dto.expectedDeliverables.
      // When present, that becomes the locked manifest. When absent, fall
      // back to whatever the proposal already has (could be the brain's
      // initial guess or empty). Notes with an empty manifest get legacy
      // free-form behavior in completeTask.
      const manifest = (dto.expectedDeliverables ?? (proposal.expectedDeliverables as unknown as Array<{
        type: string;
        filename: string;
        description: string;
      }>) ?? []) as Array<{
        type: string;
        filename: string;
        description: string;
      }>;

      // Atomic: create task + update proposal in one transaction
      const [, updated] = await this.prisma.$transaction([
        this.prisma.note.create({
          data: {
            id: noteId,
            title: proposal.title,
            content: finalAction,
            noteType: 'TASK',
            status: 'PENDING',
            source: 'CONVERSATION',
            conceptId,
            expectedOutcome: finalAction,
            tenantId: proposal.tenantId,
            userId: dto.approvedBy ?? 'dev-user-001',
            expectedDeliverables: manifest as unknown as object,
          },
        }),
        this.prisma.brainProposal.update({
          where: { id },
          data: {
            status: 'approved',
            approvedBy: dto.approvedBy,
            approvedAt: new Date(),
            executionNoteId: noteId,
            ...(dto.proposedAction ? { proposedAction: dto.proposedAction } : {}),
            // Persist the locked manifest back onto the proposal too, so
            // the proposal record reflects what was actually committed.
            ...(dto.expectedDeliverables
              ? { expectedDeliverables: dto.expectedDeliverables as unknown as object }
              : {}),
          },
        }),
      ]);

      // Mark task as running so the Task Hub can show a spinner even after
      // a page reload. Cleared in completeTask / auto-complete fallback.
      this.markTaskRunning(proposal.tenantId, noteId);

      // 3. Emit events
      this.eventBus.emit(BRIDGE_EVENTS.TASK_CREATED, {
        tenantId: proposal.tenantId,
        noteId,
        title: proposal.title,
        conceptId,
      });

      this.eventBus.emit(BRIDGE_EVENTS.PROPOSAL_APPROVED, {
        tenantId: proposal.tenantId,
        proposalId: id,
        title: proposal.title,
        noteId,
      });

      // 4. Notify OpenClaw to execute (fire-and-forget)
      if (this.openClawClient.isConfigured()) {
        // ─────────────────────────────────────────────────────────────────
        // Execution prompt — kept INTENTIONALLY short, direct, imperative,
        // English-only. Earlier verbose mixed Serbian/English versions
        // confused gpt-oss-120b: the model treated the prompt as a "describe
        // this plan" request and produced text instead of tool calls.
        //
        // Rules learned the hard way:
        //   1. Lead with the verb: EXECUTE NOW. Not "you must" / "please".
        //   2. Numbered, single-purpose steps. No "OBAVEZNI DELIVERABLES /
        //      KAKO DA IZVRSIS" headings — the model treats those as topics
        //      to summarize.
        //   3. ONE language. Mixed Serbian/English split the model's
        //      attention and pushed output into reasoning_content.
        //   4. NO meta-instructions about which sub-agent to choose. The
        //      brain knows. Letting it pick (or skip sub-agents entirely
        //      for trivial tasks) gives much higher success rates.
        //   5. The bridge endpoint URLs are listed once, with the noteId
        //      pre-substituted, so the model can copy-paste mechanically.
        // ─────────────────────────────────────────────────────────────────
        // Normalize manifest entries — the director/chat SOUL has emitted
        // two shapes over time: the old {type, filename, description} and
        // the newer {name, format, description, displayName, sizeEstimate}.
        // Everywhere else in this file already accepts both via
        // `d.filename ?? d.name`, so the execution-message builder must too.
        // Without this normalization, d.filename is `undefined` for new
        // proposals and the brain receives "paths" like
        // `/root/.openclaw/workspace/deliverables/{noteId}/undefined`,
        // which makes the entire task impossible.
        const normalizedManifest = manifest
          .map((d) => {
            const rec = d as Record<string, unknown>;
            const filename =
              (rec.filename as string | undefined) ??
              (rec.name as string | undefined);
            const type =
              (rec.type as string | undefined) ??
              (rec.format as string | undefined) ??
              (typeof filename === 'string'
                ? filename.split('.').pop()
                : undefined);
            const description =
              (rec.description as string | undefined) ?? '';
            return filename ? { filename, type, description } : null;
          })
          .filter(
            (d): d is { filename: string; type: string | undefined; description: string } =>
              d !== null,
          );

        const manifestLines = normalizedManifest.length
          ? normalizedManifest.map((d, i) => {
              const fullPath = `/root/.openclaw/workspace/deliverables/${noteId}/${d.filename}`;
              return `${i + 1}. ${fullPath} — ${d.description}`;
            })
          : [`(no manifest — write any files you need under /root/.openclaw/workspace/deliverables/${noteId}/)`];

        const allowedTypesStr = normalizedManifest.length
          ? Array.from(
              new Set(
                normalizedManifest
                  .map((d) => d.type)
                  .filter((t): t is string => !!t),
              ),
            ).join(', ') || 'xlsx, pdf, pptx, docx, png, jpg, csv'
          : 'xlsx, pdf, pptx, docx, png, jpg, csv';

        // The brain already has a SKILL.md for mentor-ai-bridge with the
        // base URL (http://100.114.192.85:3000/api — Tailscale) and the
        // auth token embedded. We pass that same base URL in the prompt
        // so the curl examples are literally copy-pasteable; the skill
        // will resolve the token from its own config if omitted.
        const bridgeBase = 'http://100.114.192.85:3000/api';
        const bridgeToken = this.configService.get<string>('OPENCLAW_AUTH_TOKEN', '');

        // First manifest file used as the example so the brain can imitate
        // the exact shape without templating. Uses the normalized shape.
        const exampleFile = normalizedManifest[0];
        const exampleName = exampleFile?.filename || 'output.pdf';

        // The leading literal `TASK APPROVED:` is the ONLY trigger SOUL.md
        // recognises for switching the brain from DISCUSSION (Lanes A/B/C)
        // into EXECUTION (Lane D). It must be the first non-empty line of
        // the message — no preamble, no greeting. SOUL.md key fields the
        // brain looks for: NoteId, TenantId, What to do, Files to produce,
        // and optionally Process: <name> for process-bound execution.
        const executionMessage = [
          `TASK APPROVED: ${proposal.title}`,
          `NoteId: ${noteId}`,
          `TenantId: ${proposal.tenantId}`,
          ``,
          `Your next response MUST be a tool call (write, exec, or sessions_spawn). Do NOT describe a plan. Do NOT respond with prose.`,
          ``,
          `What to do:`,
          proposal.proposedAction,
          ``,
          `Files to produce (exact paths, exact names):`,
          ...manifestLines,
          ``,
          `Allowed file types: ${allowedTypesStr}. Do not produce .md, .txt, .py, .js, .json, .html or any other type.`,
          ``,
          `═══ MANDATORY FINAL STEP — DO NOT SKIP ═══`,
          `After the LAST file is on disk, your VERY LAST action MUST be this exec tool call. The task stays PENDING forever if you skip it. It is NOT optional.`,
          ``,
          `exec: curl -sS -X POST ${bridgeBase}/bridge/task-complete -H 'Authorization: Bearer ${bridgeToken}' -H 'Content-Type: application/json' -d '{"tenantId":"${proposal.tenantId}","noteId":"${noteId}","score":85}'`,
          ``,
          `Before the final task-complete, report each file (recommended):`,
          `exec: curl -sS -X POST ${bridgeBase}/bridge/task-contribution -H 'Authorization: Bearer ${bridgeToken}' -H 'Content-Type: application/json' -d '{"tenantId":"${proposal.tenantId}","noteId":"${noteId}","agentType":"director","output":"created ${exampleName}","files":[{"name":"${exampleName}","path":"/root/.openclaw/workspace/deliverables/${noteId}/${exampleName}","mimeType":"application/octet-stream","size":0}]}'`,
          ``,
          `Loop:`,
          `  1. write/exec/sessions_spawn to produce a file`,
          `  2. exec curl … task-contribution  (recommended per file)`,
          `  3. repeat until ALL manifest files exist`,
          `  4. exec curl … task-complete  ← REQUIRED FINAL CALL`,
          ``,
          `Final user-facing message language: English.`,
          `Start with the first tool call now.`,
        ].join('\n');

        // ── GRAPH ANIMATION FIX 1/2: immediate "running" event ───────────
        // The frontend graph only animates the director node on
        // agent:status events. If we wait for the brain's first tool call
        // to fire the first event, the graph stays idle for the 10–60s
        // thinking phase and feels broken. Emit a synchronous running
        // event the instant we dispatch the executor — the animation
        // starts the moment the user clicks Confirm.
        this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
          tenantId: proposal.tenantId,
          taskId: noteId,
          agent: 'direktor',
          status: 'running',
          message: 'Dispatching executor — reasoning about plan…',
          timestamp: new Date().toISOString(),
        });

        this.openClawClient.executeAgent(executionMessage, {
          // Route TASK APPROVED to dedicated `ai-task-runner` agent.
          // This agent is standalone (its own dir, own session storage,
          // MiniMax-M2.7 with reasoning=true and maxTokens=32768) and
          // only handles execution — never chat. This keeps main's chat
          // behavior clean and gives execution a dedicated, purpose-built
          // SOUL with hard rules against hand-crafting binary files
          // via the `write` tool. All specialist sub-agents it can
          // delegate to (research/content/financial/marketing/sales/
          // designer/dev) also run on MiniMax-M2.7.
          agentId: 'ai-task-runner',
          sessionId: `exec-${noteId}`,
          // Tell the relay to tail ALL agent session jsonl files for
          // this noteId — critical for capturing sub-session activity
          // (specialist agents spawned via agentToAgent write to their
          // own jsonl files that the legacy single-file tailer missed).
          noteId,
          tenantProfile: proposal.tenantId,
          // MiniMax M2.7 native multi-agent body params — relay forwards
          // these into the model request body so the brain emits parallel
          // tool_calls in one shot and is forced to call tools (no prose).
          parallelToolCalls: true,
          toolChoice: 'required',
          reasoningEffort: 'high',
          thinking: 'high',
          onTool: (tool, status, query) => {
            this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
              tenantId: proposal.tenantId,
              taskId: noteId,
              agent: tool.includes('search') ? 'research' : 'direktor',
              status: status === 'start' ? 'running' : 'completed',
              message: status === 'start' ? `${tool}${query ? ': ' + query.substring(0, 80) : ''}` : `Completed: ${tool}`,
              timestamp: new Date().toISOString(),
            });
          },
          onStatus: (phase) => {
            this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
              tenantId: proposal.tenantId,
              taskId: noteId,
              agent: 'direktor',
              status: 'running',
              message: phase,
              timestamp: new Date().toISOString(),
            });
          },
          // ── REAL OBSERVABILITY (Phase 0) ──
          // Every structured event written to the session jsonl flows
          // through here. We translate each relevant event into an
          // AGENT_STATUS emission so the existing graph + activity
          // monitor finally show what's actually happening. Regex-based
          // onTool is kept as a fallback for event sources that don't
          // use jsonl.
          onJsonlEvent: (e) => {
            try {
              this.handleExecutorJsonlEvent(e, proposal.tenantId, noteId);
            } catch (err) {
              this.logger.warn({
                message: 'handleExecutorJsonlEvent threw',
                error: err instanceof Error ? err.message : 'unknown',
              });
            }
          },
        })
        .then(() => {
          // ── GRAPH ANIMATION FIX 2/2: immediate "completed" event ─────
          // The stream just closed. Regardless of whether the brain
          // called task-complete itself or we're about to run the
          // 10-second fast-path grace, the AGENT is no longer working.
          // Emit a director 'completed' status NOW so the pulse stops
          // immediately. Task completion (the blue checkmark badge) is
          // a separate concern driven by task:complete events.
          //
          // ALSO: mark the note as settled so any late jsonl events
          // still being tailed from the session file are filtered out
          // by handleExecutorJsonlEvent — prevents the "director keeps
          // pulsing after stream end" glitch.
          this.markNoteSettled(noteId);
          this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
            tenantId: proposal.tenantId,
            taskId: noteId,
            agent: 'direktor',
            status: 'completed',
            message: 'Executor stream ended',
            timestamp: new Date().toISOString(),
          });
        })
        .then(() => {
          // Three-tier completion strategy:
          //   FAST PATH (now+grace): brain stream ended → check disk
          //     immediately. If the manifest is already satisfied, complete
          //     the task within seconds. This is the common case for
          //     models that produce files but skip the curl task-complete
          //     call.
          //   FALLBACK 1 (10 min): for tasks where the brain is still
          //     working in the background (sub-agents, slow research)
          //     give it 10 min before forcing.
          //   FALLBACK 2 (30 min): final attempt for very long tasks.
          // The brain calling task-complete itself short-circuits all of
          // these via the PENDING-status check inside attemptAutoComplete.
          const FAST_PATH_GRACE_MS = 15 * 60 * 1000;   // 15 min grace after stream ends
          const FIRST_CHECK_MS = 10 * 60 * 1000;       // +10 min = 25 min total
          const FINAL_CHECK_DELAY_MS = 20 * 60 * 1000; // +20 min = 45 min total

          const attemptAutoComplete = async (attempt: 0 | 1 | 2) => {
            try {
              const n = await this.prisma.note.findUnique({
                where: { id: noteId },
                select: { status: true },
              });
              if (n?.status !== 'PENDING') {
                this.logger.debug({
                  message: `Auto-complete attempt ${attempt}: note already settled, skipping`,
                  noteId,
                  status: n?.status,
                });
                return;
              }
              // For attempts 0 and 1 we peek at the disk first; only when
              // the manifest is satisfied do we settle. Attempt 2 is the
              // final force-settle regardless of disk state.
              if (attempt < 2) {
                const [scanned, manifestRow] = await Promise.all([
                  this.scanTaskDeliverables(noteId).catch(() => []),
                  this.prisma.note.findUnique({
                    where: { id: noteId },
                    select: { expectedDeliverables: true },
                  }),
                ]);
                const manifest = (manifestRow?.expectedDeliverables as unknown as Array<{ filename?: unknown; name?: unknown }>) ?? [];
                const presentNames = new Set(
                  scanned.map((f) => (f.name ?? '').toLowerCase()),
                );
                // Defensive: drop manifest entries with no usable filename
                // (some models emit the wrong key) so this never throws
                // and strands the auto-complete. Same logic as completeTask.
                const expectedNames = manifest
                  .map((d) => {
                    const fn = d.filename ?? d.name;
                    return typeof fn === 'string' ? fn.toLowerCase() : null;
                  })
                  .filter((fn): fn is string => fn !== null);
                const allPresent = expectedNames.length > 0
                  && expectedNames.every((expected) => presentNames.has(expected));
                if (!allPresent) {
                  if (attempt === 0) {
                    this.logger.debug({
                      message: 'Fast-path auto-complete: manifest not satisfied, deferring 10 min',
                      noteId,
                      diskFiles: scanned.length,
                      manifestSize: manifest.length,
                    });
                    setTimeout(() => attemptAutoComplete(1), FIRST_CHECK_MS);
                  } else {
                    this.logger.debug({
                      message: 'Auto-complete attempt 1: manifest not satisfied, deferring 20 min',
                      noteId,
                      diskFiles: scanned.length,
                      manifestSize: manifest.length,
                    });
                    setTimeout(() => attemptAutoComplete(2), FINAL_CHECK_DELAY_MS);
                  }
                  return;
                }
                this.logger.log({
                  message: `Auto-complete attempt ${attempt}: manifest satisfied on disk → completing now`,
                  noteId,
                  diskFiles: scanned.length,
                  manifestSize: manifest.length,
                });
              } else {
                this.logger.warn({
                  message: 'Auto-complete fallback firing on final attempt',
                  noteId,
                });
              }
              await this.completeTask({
                tenantId: proposal.tenantId,
                noteId,
                score: attempt === 0 ? 90 : 70,
              });
            } catch (e) {
              this.logger.warn({
                message: 'Auto-complete fallback failed',
                noteId,
                attempt,
                error: e instanceof Error ? e.message : 'Unknown',
              });
            }
          };
          // Fire fast-path first; on miss it will schedule the 10-min check.
          setTimeout(() => attemptAutoComplete(0), FAST_PATH_GRACE_MS);
        })
        .catch((err) => {
          this.logger.error({
            message: 'Failed to notify OpenClaw of approved proposal',
            proposalId: id,
            error: err instanceof Error ? err.message : 'Unknown',
          });
          // Make sure the graph animation doesn't hang on error either.
          // Emit a failed status so the pulse stops and the frontend can
          // show an error indicator, and mark the note settled so late
          // jsonl events don't re-pulse the director.
          this.markNoteSettled(noteId);
          this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
            tenantId: proposal.tenantId,
            taskId: noteId,
            agent: 'direktor',
            status: 'failed',
            message: err instanceof Error ? err.message : 'Executor call failed',
            timestamp: new Date().toISOString(),
          });
        });

        this.logger.log({
          message: 'Proposal approved, task created, OpenClaw notified',
          proposalId: id,
          noteId,
          title: proposal.title,
        });
      } else {
        this.logger.warn({
          message: 'Proposal approved, task created, but OpenClaw NOT configured — no execution',
          proposalId: id,
          noteId,
        });
      }

      return updated;
    }

    if (dto.status === 'rejected') {
      const updated = await this.prisma.brainProposal.update({
        where: { id },
        data: {
          status: 'rejected',
          rejectedReason: dto.rejectedReason,
        },
      });

      // Create a memory so the brain learns from rejections
      const reason = dto.rejectedReason ? ` Reason: ${dto.rejectedReason}` : '';
      await this.createMemory({
        tenantId: proposal.tenantId,
        type: 'FACTUAL_STATEMENT',
        content: `Owner rejected proposal "${proposal.title}" (${proposal.canvasBlock}).${reason} Do not propose again unless circumstances materially change.`,
      });

      this.logger.log({
        message: 'Proposal rejected, rejection memory created',
        proposalId: id,
        title: proposal.title,
        reason: dto.rejectedReason,
      });

      return updated;
    }

    throw new BadRequestException(`Invalid status transition: ${dto.status}`);
  }

  // ════════════════════════════════════════════
  //  WRITE Operations: Concepts
  // ════════════════════════════════════════════

  async createConcept(dto: CreateConceptDto) {
    const id = `cpt_${createId()}`;
    const slug = dto.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 100);

    const needsReview = (dto.confidence ?? 0) < 0.7;

    // Transaction: create concept + relationships atomically
    const concept = await this.prisma.$transaction(async (tx) => {
      const created = await tx.concept.create({
        data: {
          id,
          name: dto.name,
          slug: `${slug}-${id.substring(4, 10)}`,
          category: dto.category,
          definition: dto.definition,
          extendedDescription: dto.extendedDescription,
          canvasBlock: dto.canvasBlock,
          tenantId: dto.tenantId,
          source: 'AI_DISCOVERED',
          discoveredBy: 'brain-heartbeat',
          discoveredAt: new Date(),
          confidence: dto.confidence,
          needsReview,
        },
      });

      if (dto.relationships?.length) {
        await tx.conceptRelationship.createMany({
          data: dto.relationships.map((rel) => ({
            id: `crel_${createId()}`,
            sourceConceptId: id,
            targetConceptId: rel.targetId,
            relationshipType: rel.type as any,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    this.eventBus.emit(BRIDGE_EVENTS.TREE_UPDATED, {
      tenantId: dto.tenantId,
      action: 'concept_created',
      conceptId: id,
      conceptName: dto.name,
      category: dto.category,
      needsReview,
    });

    this.logger.log({
      message: 'Tenant concept created by brain',
      id,
      name: dto.name,
      tenantId: dto.tenantId,
      confidence: dto.confidence,
      needsReview,
    });

    return concept;
  }

  // ════════════════════════════════════════════
  //  WRITE Operations: Tasks
  // ════════════════════════════════════════════

  async createTask(dto: CreateTaskDto) {
    const id = `note_${createId()}`;

    const note = await this.prisma.note.create({
      data: {
        id,
        title: dto.title,
        content: dto.content ?? '',
        noteType: 'TASK',
        status: 'PENDING',
        source: 'CONVERSATION',
        conceptId: dto.conceptId,
        expectedOutcome: dto.expectedOutcome,
        tenantId: dto.tenantId,
        userId: 'dev-user-001', // Bridge calls use system user; real user tracked via proposal approval
      },
    });

    // Link proposal to task if provided
    if (dto.proposalId) {
      await this.prisma.brainProposal.update({
        where: { id: dto.proposalId },
        data: { executionNoteId: id },
      });
    }

    this.eventBus.emit(BRIDGE_EVENTS.TASK_CREATED, {
      tenantId: dto.tenantId,
      noteId: id,
      title: dto.title,
      conceptId: dto.conceptId,
    });

    return note;
  }

  async addTaskContribution(dto: TaskContributionDto) {
    // If the note has a deliverable manifest, drop any reported file whose
    // extension is not in the allowed whitelist. The brain is told the rules
    // in the execution message — anything that violates them is junk and we
    // refuse to record it. Notes without a manifest (legacy / maturity engine)
    // accept anything as before.
    let acceptedFiles = dto.files ?? [];
    if (acceptedFiles.length > 0) {
      const note = await this.prisma.note.findUnique({
        where: { id: dto.noteId },
        select: { expectedDeliverables: true },
      });
      const manifest = (note?.expectedDeliverables as unknown as Array<{
        type: string;
        filename: string;
      }> | null) ?? null;
      if (manifest && manifest.length > 0) {
        const before = acceptedFiles.length;
        acceptedFiles = acceptedFiles.filter((f) => isAllowedDeliverableFile(f.name));
        const dropped = before - acceptedFiles.length;
        if (dropped > 0) {
          this.logger.warn({
            message: 'Dropped non-whitelisted files reported to manifest task',
            noteId: dto.noteId,
            agentType: dto.agentType,
            dropped,
            kept: acceptedFiles.length,
          });
        }
      }
    }

    // Atomic JSONB merge — same pattern as agent-execution.service.ts
    const enrichmentEntry = {
      executionId: `bridge_${createId()}`,
      status: 'COMPLETED',
      result: dto.output,
      completedAt: new Date().toISOString(),
      error: null,
      summary: dto.summary,
      files: acceptedFiles,
      actions: (dto.actions ?? []).map((a) => ({ ...a, status: a.status ?? 'none' })),
      metrics: dto.metrics ?? {},
    };

    // Use raw SQL for atomic JSONB merge to prevent race conditions
    await this.prisma.$executeRaw`
      UPDATE notes
      SET agent_enrichments = COALESCE(agent_enrichments, '{}'::jsonb) || ${JSON.stringify({ [dto.agentType]: enrichmentEntry })}::jsonb,
          updated_at = NOW()
      WHERE id = ${dto.noteId}
    `;

    this.eventBus.emit(BRIDGE_EVENTS.TASK_CONTRIBUTION, {
      tenantId: dto.tenantId,
      noteId: dto.noteId,
      agentType: dto.agentType,
      summary: dto.summary,
      hasFiles: (dto.files?.length ?? 0) > 0,
      hasActions: (dto.actions?.length ?? 0) > 0,
    });

    this.logger.log({
      message: 'Agent contribution added to task',
      noteId: dto.noteId,
      agentType: dto.agentType,
      files: dto.files?.length ?? 0,
    });
  }

  async updateTaskProgress(dto: TaskProgressDto) {
    this.eventBus.emit(BRIDGE_EVENTS.TASK_PROGRESS, {
      tenantId: dto.tenantId,
      noteId: dto.noteId,
      phase: dto.phase,
      percent: dto.percent,
      message: dto.message,
    });

    // Auto-complete if progress reaches 100% (safety net for when OpenClaw forgets to call task-complete)
    if (dto.percent >= 100) {
      this.logger.log({ message: 'Task progress 100% — auto-completing', noteId: dto.noteId });
      // Delay slightly to allow any final contributions to arrive
      setTimeout(() => {
        this.completeTask({ tenantId: dto.tenantId, noteId: dto.noteId, score: 85 }).catch(e =>
          this.logger.warn({ message: 'Auto-complete failed', noteId: dto.noteId, error: (e as Error).message })
        );
      }, 5000);
    }
  }

  async completeTask(dto: TaskCompleteDto) {
    // Mark the note as settled IMMEDIATELY so any late jsonl events
    // still being tailed from the CLI session file are filtered out
    // before they can re-pulse the graph director to 'running'.
    // This is the second half of the late-event debounce pair alongside
    // the mark in the executeAgent .then() path.
    this.markNoteSettled(dto.noteId);
    // Always clear the running marker, even if the rest of completeTask
    // throws — otherwise a buggy completion path leaves the Task Hub
    // spinning forever. The marker is in-memory only; clearing it on
    // failure is harmless because the bridge.task.complete event is also
    // emitted from within the happy path below.
    try {
      return await this._completeTaskImpl(dto);
    } finally {
      this.unmarkTaskRunning(dto.tenantId, dto.noteId);
    }
  }

  private async _completeTaskImpl(dto: TaskCompleteDto) {
    // Auto-scan deliverables folder for unreported files before completing.
    // When the note has a manifest we filter strictly to whitelisted file types;
    // otherwise we keep the legacy behavior (filter only .md).
    try {
      const scannedFiles = await this.scanTaskDeliverables(dto.noteId);
      if (scannedFiles.length > 0) {
        const note0 = await this.prisma.note.findUnique({
          where: { id: dto.noteId },
          select: { agentEnrichments: true, expectedDeliverables: true },
        });
        const hasManifest = Array.isArray(note0?.expectedDeliverables)
          && (note0!.expectedDeliverables as unknown as unknown[]).length > 0;
        const existingFiles = new Set<string>();
        for (const entry of Object.values((note0?.agentEnrichments as Record<string, any>) ?? {})) {
          for (const f of (entry.files ?? [])) existingFiles.add(f.path ?? f.name);
        }
        const newFiles = scannedFiles.filter((f) => {
          if (existingFiles.has(f.path)) return false;
          if (hasManifest) return isAllowedDeliverableFile(f.name);
          return !f.name.endsWith('.md');
        });
        if (newFiles.length > 0) {
          this.logger.log({ message: 'Auto-adding unreported deliverables on task complete', noteId: dto.noteId, count: newFiles.length });
          await this.addTaskContribution({
            tenantId: dto.tenantId,
            noteId: dto.noteId,
            agentType: 'auto-scan',
            summary: `${newFiles.length} file(s) found on disk`,
            files: newFiles.map(f => ({ name: f.name, path: f.path, mimeType: f.mimeType })),
          } as any);
        }
      }
    } catch (e) {
      this.logger.debug({ message: 'Auto-scan deliverables skipped (non-fatal)', error: (e as Error).message });
    }

    // Read current enrichments and build full content from all agent contributions
    const note = await this.prisma.note.findUnique({
      where: { id: dto.noteId },
      select: { agentEnrichments: true, title: true, expectedDeliverables: true },
    });

    let fullContent = `# ${note?.title ?? 'Task'}\n\n`;
    const enrichments = (note?.agentEnrichments as Record<string, any>) ?? {};

    // Collect every reported filename (basename) across all agent contributions
    // so we can check it against the manifest below.
    const reportedFilenames = new Set<string>();
    for (const entry of Object.values(enrichments)) {
      for (const f of (entry.files ?? [])) {
        const name = (f.name ?? '').toLowerCase();
        if (name) reportedFilenames.add(name);
      }
    }

    for (const [agentType, entry] of Object.entries(enrichments)) {
      if (entry.result || entry.summary) {
        fullContent += `## ${this.agentLabel(agentType)}\n\n`;
        if (entry.summary) fullContent += `**Summary:** ${entry.summary}\n\n`;
        if (entry.result) fullContent += `${entry.result}\n\n`;
        if (entry.files?.length) {
          fullContent += '**Files:**\n';
          for (const f of entry.files) {
            fullContent += `- ${f.displayName || f.name}\n`;
          }
          fullContent += '\n';
        }
      }
    }

    // Manifest match: only enforced when the note declared expected deliverables.
    // If any expected file is missing from reported files, mark INCOMPLETE so
    // the user sees "1 of 2 deliverables" instead of a fake green check.
    const manifest = (note?.expectedDeliverables as unknown as Array<{
      type: string;
      filename: string;
      description: string;
    }> | null) ?? null;

    let finalStatus: 'COMPLETED' | 'INCOMPLETE' = 'COMPLETED';
    let missingDeliverables: string[] = [];
    const emptyDeliverables: string[] = [];

    // ─── DEEP CONTENT VALIDATION ────────────────────────────────────────
    // Runs a python-based content check on each binary deliverable (xlsx,
    // docx, pptx, pdf) via SSH to Hetzner. Catches the "brain creates an
    // xlsx workbook with 11 empty sheets and calls it a deliverable"
    // failure mode. Any file that fails validation is treated as missing
    // — it's on disk but has no real content, so it can't count.
    //
    // Non-blocking: validator errors are logged but don't fail the task.
    // Text formats (md, csv, svg) are skipped — empty text is legit.
    try {
      const reportedFileRecords: Array<{ name: string; path: string }> = [];
      for (const entry of Object.values(enrichments)) {
        for (const f of (entry.files ?? [])) {
          if (f.path && f.name) {
            reportedFileRecords.push({ name: f.name, path: f.path });
          }
        }
      }

      for (const fileRec of reportedFileRecords) {
        const result = await this.openClawTenant
          .validateDeliverableContent(fileRec.path)
          .catch((err) => {
            this.logger.warn({
              message: 'Content validator call threw',
              path: fileRec.path,
              error: err instanceof Error ? err.message : 'unknown',
            });
            return { valid: true } as { valid: boolean; reason?: string; metric?: number };
          });
        if (!result.valid) {
          emptyDeliverables.push(fileRec.name);
          this.logger.warn({
            message: 'Deliverable failed content validation',
            noteId: dto.noteId,
            file: fileRec.name,
            reason: result.reason,
          });
          // Drop the empty file from the reported set so manifest check
          // treats it as missing (it's on disk but empty).
          reportedFilenames.delete(fileRec.name.toLowerCase());
        }
      }

      if (emptyDeliverables.length > 0) {
        fullContent += `\n## ⚠️ Empty/invalid content detected\n\n`;
        fullContent += `${emptyDeliverables.length} file(s) created but without content:\n`;
        for (const e of emptyDeliverables) fullContent += `- ${e}\n`;
        fullContent += '\nBrain created files but did not fill their content. These files do not count as valid deliverables.\n\n';
        finalStatus = 'INCOMPLETE';
      }
    } catch (valErr) {
      this.logger.warn({
        message: 'Deep content validation skipped (non-fatal)',
        error: valErr instanceof Error ? valErr.message : 'unknown',
      });
    }
    // ─── END DEEP CONTENT VALIDATION ────────────────────────────────────

    if (manifest && manifest.length > 0) {
      // Defensive: some LLMs (notably Gemma via local llama.cpp) emit
      // deliverable entries with the wrong field shape — `name` instead
      // of `filename`, missing keys, or non-string values. Drop anything
      // that doesn't have a usable filename so we never crash here and
      // strand the running marker. Worst case: the manifest looks empty
      // and we mark the task COMPLETED instead of INCOMPLETE — better
      // than throwing 500 and leaving the UI spinning forever.
      missingDeliverables = manifest
        .map((d) => {
          const fn =
            (d as { filename?: unknown; name?: unknown }).filename ??
            (d as { name?: unknown }).name;
          return typeof fn === 'string' ? fn.toLowerCase() : null;
        })
        .filter((fn): fn is string => fn !== null)
        .filter((expected) => !reportedFilenames.has(expected));
      if (missingDeliverables.length > 0) {
        finalStatus = 'INCOMPLETE';
        fullContent += `\n## ⚠️ Nedostaju deliverables\n\n`;
        fullContent += `${missingDeliverables.length} od ${manifest.length} fajla nije proizvedeno:\n`;
        for (const m of missingDeliverables) fullContent += `- ${m}\n`;
        fullContent += '\n';
      }
    }

    await this.prisma.note.update({
      where: { id: dto.noteId },
      data: {
        status: finalStatus,
        aiScore: dto.score,
        content: fullContent,
        userReport: fullContent,
      },
    });

    // Clear running marker so the Task Hub spinner stops.
    this.unmarkTaskRunning(dto.tenantId, dto.noteId);

    // Emit a final AGENT_STATUS=completed BEFORE TASK_COMPLETE so the
    // conversation gateway also broadcasts `agent:concept-activity` for
    // completion. Without this, the agent activity graph, maturity tree
    // pulse, and per-task agent timeline never receive a "done" signal —
    // they wait for an AGENT_STATUS event with status='completed' that
    // would otherwise never come (the brain doesn't fire one explicitly,
    // it just calls task-complete). The graph state service uses this to
    // remove agents from `activeAgents$` and stop pulsing the node.
    this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
      tenantId: dto.tenantId,
      taskId: dto.noteId,
      agent: 'direktor',
      status: 'completed',
      message: finalStatus === 'COMPLETED' ? 'Task completed' : 'Task incomplete',
      timestamp: new Date().toISOString(),
    });

    this.eventBus.emit(BRIDGE_EVENTS.TASK_COMPLETE, {
      tenantId: dto.tenantId,
      noteId: dto.noteId,
      score: dto.score,
      status: finalStatus,
      missingDeliverables,
      emptyDeliverables,
    });

    this.logger.log({
      message: 'Task completed via bridge',
      noteId: dto.noteId,
      score: dto.score,
      status: finalStatus,
      manifestSize: manifest?.length ?? 0,
      reportedFiles: reportedFilenames.size,
      missing: missingDeliverables.length,
    });
  }

  // ════════════════════════════════════════════
  //  Execute Tasks via OpenClaw Brain
  // ════════════════════════════════════════════

  /**
   * Send tasks to OpenClaw director for execution.
   * The director decides which agents to use and executes autonomously,
   * reporting progress via bridge API callbacks.
   */
  async executeTasksViaBrain(
    tenantId: string,
    userId: string,
    taskIds: string[],
  ): Promise<{ sent: number; sessionId: string }> {
    // Load task details
    const tasks = await this.prisma.note.findMany({
      where: { id: { in: taskIds }, tenantId },
      select: { id: true, title: true, content: true, conceptId: true, expectedOutcome: true },
    });

    if (tasks.length === 0) throw new NotFoundException('No tasks found');

    if (!this.openClawClient.isConfigured()) {
      throw new BadRequestException('OpenClaw is not configured');
    }

    const sessionId = `exec-batch-${Date.now()}`;

    // Build execution message for the director
    const taskList = tasks.map((t, i) => [
      `### Task ${i + 1}: ${t.title}`,
      `NoteId: ${t.id}`,
      t.conceptId ? `ConceptId: ${t.conceptId}` : '',
      t.content ? `Description: ${t.content.substring(0, 500)}` : '',
      t.expectedOutcome ? `Expected outcome: ${t.expectedOutcome}` : '',
    ].filter(Boolean).join('\n')).join('\n\n');

    const message = [
      `EXECUTING ${tasks.length} TASKS`,
      '',
      taskList,
      '',
      'Follow the procedure from SOUL.md: delegate to agents, track status, report deliverables, close task.',
      'Every deliverable must be a file (.xlsx, .pdf, .pptx, .png) or URL — never .md.',
      `TenantId: ${tenantId}`,
    ].join('\n');

    // Emit status events so frontend knows execution started
    for (const task of tasks) {
      this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
        tenantId,
        taskId: task.id,
        agent: 'direktor',
        status: 'running',
        message: `Received for execution: ${task.title}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Fire-and-forget with streaming callbacks for real-time UI updates
    this.openClawClient.executeAgent(message, {
      agentId: 'main',
      sessionId,
      tenantProfile: tenantId,
      timeoutSeconds: 10800,
      onText: (text) => {
        this.logger.debug({ message: 'Brain execution chunk', tenantId, len: text.length });
      },
      onTool: (tool, status, query) => {
        // Emit tool usage as agent status — frontend shows in agent graph
        this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
          tenantId,
          taskId: tasks[0]?.id ?? sessionId,
          agent: tool.includes('search') ? 'research' : tool.includes('exec') ? 'dev' : 'direktor',
          status: status === 'start' ? 'running' : 'completed',
          message: status === 'start'
            ? `${tool}${query ? ': ' + query.substring(0, 100) : ''}`
            : `Completed: ${tool}`,
          timestamp: new Date().toISOString(),
        });
      },
      onStatus: (phase) => {
        this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
          tenantId,
          taskId: tasks[0]?.id ?? sessionId,
          agent: 'direktor',
          status: 'running',
          message: phase,
          timestamp: new Date().toISOString(),
        });
      },
    }).then(async (result) => {
      // Emit completion of initial relay
      this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
        tenantId,
        taskId: tasks[0]?.id ?? sessionId,
        agent: 'direktor',
        status: result.success ? 'completed' : 'failed',
        message: result.success ? 'Execution completed' : (result.error ?? 'Error'),
        timestamp: new Date().toISOString(),
      });

      // Follow-up: ask director to check status and finalize
      if (result.success) {
        const pendingTaskIds = tasks.map(t => t.id);
        await this.askDirectorToFinalize(tenantId, pendingTaskIds, sessionId);
      }
    }).catch((err) => {
      this.logger.error({
        message: 'OpenClaw brain execution failed',
        tenantId,
        taskCount: tasks.length,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    });

    this.logger.log({
      message: 'Tasks sent to OpenClaw brain for execution',
      tenantId,
      taskCount: tasks.length,
      sessionId,
      taskIds: tasks.map(t => t.id),
    });

    return { sent: tasks.length, sessionId };
  }

  /**
   * Ask the director to check task status and finalize.
   * Sends a follow-up message asking OpenClaw to report deliverables and close tasks.
   */
  private async askDirectorToFinalize(tenantId: string, taskIds: string[], sessionId: string): Promise<void> {
    // Wait a bit for sub-agents to finish writing files
    await new Promise(r => setTimeout(r, 30_000));

    // Check which tasks are still pending
    const pendingTasks = await this.prisma.note.findMany({
      where: { id: { in: taskIds }, status: 'PENDING' },
      select: { id: true, title: true },
    });

    if (pendingTasks.length === 0) return; // All already completed

    const taskList = pendingTasks.map(t => `- ${t.id}: ${t.title}`).join('\n');

    const followUp = [
      'FINALIZATION: Check the status of these tasks and report results.',
      '',
      taskList,
      '',
      'For each task:',
      '1. Check if sub-agents have finished (ls deliverables/{noteId}/)',
      '2. For each file that exists, report it through task-contribution',
      '3. Close the task with task-complete and a rating',
      '',
      'If agents are still running, wait for them and report when they finish.',
      `TenantId: ${tenantId}`,
    ].join('\n');

    this.logger.log({ message: 'Sending finalization follow-up to director', pendingCount: pendingTasks.length });

    try {
      await this.openClawClient.executeAgent(followUp, {
        agentId: 'main',
        sessionId,
        tenantProfile: tenantId,
        timeoutSeconds: 3600,
        onText: () => { /* silent */ },
      });

      // After follow-up, check one more time and auto-complete any remaining
      const stillPending = await this.prisma.note.findMany({
        where: { id: { in: taskIds }, status: 'PENDING' },
        select: { id: true },
      });

      for (const task of stillPending) {
        this.logger.log({ message: 'Auto-completing task after finalization', noteId: task.id });
        await this.completeTask({ tenantId, noteId: task.id, score: 80 }).catch(() => {});
      }
    } catch (err) {
      // Finalization failed — auto-complete remaining tasks as fallback
      this.logger.warn({ message: 'Finalization follow-up failed, auto-completing', error: (err as Error).message });
      for (const task of pendingTasks) {
        await this.completeTask({ tenantId, noteId: task.id, score: 70 }).catch(() => {});
      }
    }
  }

  // ════════════════════════════════════════════
  //  WRITE Operations: Deliverable Actions
  // ════════════════════════════════════════════

  /**
   * Execute an approved deliverable action (publish, send, deploy).
   * Updates the action status in agentEnrichments and notifies OpenClaw.
   */
  async executeAction(
    tenantId: string,
    noteId: string,
    agentType: string,
    actionId: string,
    userId: string,
  ): Promise<void> {
    // Transaction returns action metadata for event emission outside the lock
    const actionInfo = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ agent_enrichments: any }>>`
        SELECT agent_enrichments FROM notes WHERE id = ${noteId} FOR UPDATE
      `;

      const row = rows[0];
      if (!row) throw new NotFoundException(`Note ${noteId} not found`);

      const enrichments = (row.agent_enrichments as Record<string, any>) ?? {};
      const agentEntry = enrichments[agentType];
      if (!agentEntry) throw new BadRequestException(`No enrichment found for agent ${agentType}`);

      const actions = agentEntry.actions as Array<{ id: string; type: string; target: string; label: string; status: string }> | undefined;
      const found = actions?.find((a) => a.id === actionId);
      if (!found) throw new NotFoundException(`Action ${actionId} not found`);
      if (found.status === 'completed') throw new BadRequestException('Action already completed');
      if (found.status === 'executing') throw new BadRequestException('Action already executing');

      found.status = 'executing';
      await tx.$executeRaw`
        UPDATE notes
        SET agent_enrichments = ${JSON.stringify(enrichments)}::jsonb,
            updated_at = NOW()
        WHERE id = ${noteId}
      `;

      return { type: found.type, target: found.target, label: found.label };
    });

    this.eventBus.emit(BRIDGE_EVENTS.ACTION_EXECUTING, {
      tenantId, noteId, agentType, actionId,
      actionType: actionInfo.type,
      actionTarget: actionInfo.target,
    });

    if (this.openClawClient.isConfigured()) {
      const message = [
        `ACTION APPROVED: Execute "${actionInfo.label}"`,
        `NoteId: ${noteId}`, `AgentType: ${agentType}`,
        `ActionId: ${actionId}`, `ActionType: ${actionInfo.type}`,
        `ActionTarget: ${actionInfo.target}`, `TenantId: ${tenantId}`,
        '', 'Execute this action using the appropriate skill.',
        'When done, call action-result to report completion.',
      ].join('\n');

      this.openClawClient.executeAgent(message, {
        agentId: 'main',
        sessionId: `action-${noteId}-${actionId}`,
        tenantProfile: tenantId,
      }).catch((err) => {
        this.logger.error({
          message: 'Failed to notify OpenClaw of action execution',
          noteId, actionId,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });
    }

    this.logger.log({ message: 'Action execution started', noteId, agentType, actionId, label: actionInfo.label });
  }

  /**
   * Update a specific action's status and result within agentEnrichments.
   * Called by OpenClaw after completing an action (publish, send, etc.)
   */
  async updateActionResult(
    tenantId: string,
    noteId: string,
    agentType: string,
    actionId: string,
    status: string,
    result?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ agent_enrichments: any }>>`
        SELECT agent_enrichments FROM notes WHERE id = ${noteId} FOR UPDATE
      `;
      const row = rows[0];
      if (!row) return;

      const enrichments = (row.agent_enrichments as Record<string, any>) ?? {};
      const agentEntry = enrichments[agentType];
      if (!agentEntry) return;

      const actions = agentEntry.actions as Array<{ id: string; status: string; result?: Record<string, unknown> }> | undefined;
      const action = actions?.find((a) => a.id === actionId);
      if (!action) return;

      action.status = status;
      if (result) action.result = result;

      await tx.$executeRaw`
        UPDATE notes
        SET agent_enrichments = ${JSON.stringify(enrichments)}::jsonb,
            updated_at = NOW()
        WHERE id = ${noteId}
      `;
    });

    this.eventBus.emit(BRIDGE_EVENTS.ACTION_COMPLETE, {
      tenantId,
      noteId,
      agentType,
      actionId,
      status,
      result,
    });
  }

  // ════════════════════════════════════════════
  //  WRITE Operations: Agent Status
  // ════════════════════════════════════════════

  async updateAgentStatus(dto: AgentStatusDto) {
    // Settled-task filter: if the brain calls this endpoint AFTER the
    // task has already been marked complete (e.g. late "final status"
    // update that races with task-complete), downgrade the event to
    // 'completed' so the graph doesn't re-pulse to 'running'. This is
    // the same race that caused financial/dev agent nodes to keep
    // spinning after task completion — the jsonl-tailer path has its
    // own filter, but updateAgentStatus is a SEPARATE HTTP endpoint
    // that the brain can call directly and bypassed it.
    const effectiveStatus =
      dto.taskId && this.settledNotes.has(dto.taskId) && dto.status === 'running'
        ? 'completed'
        : dto.status;

    this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
      tenantId: dto.tenantId,
      taskId: dto.taskId,
      agent: dto.agent,
      status: effectiveStatus,
      message: dto.message,
      timestamp: new Date().toISOString(),
    });
  }

  // ════════════════════════════════════════════
  //  WRITE Operations: Memories
  // ════════════════════════════════════════════

  async createMemory(dto: CreateMemoryDto) {
    const id = `mem_${createId()}`;

    // Richer memory shape for the learning loop. We pack the structured
    // fields (taskId, category, tags, keyFacts, appliesToFuture) into
    // the content as a structured prefix, since the Memory schema
    // currently only has tenantId/type/content/subject. The subject
    // field doubles as our "category" key for fast filtering.
    let enrichedContent = dto.content;
    const extras: string[] = [];
    if (dto.taskId) extras.push(`[task: ${dto.taskId}]`);
    if (dto.category) extras.push(`[category: ${dto.category}]`);
    if (dto.tags?.length) extras.push(`[tags: ${dto.tags.join(', ')}]`);
    if (dto.keyFacts?.length) {
      extras.push('[key facts:');
      for (const f of dto.keyFacts) extras.push(`  - ${f}`);
      extras.push(']');
    }
    if (dto.appliesToFuture) extras.push(`[applies to future: ${dto.appliesToFuture}]`);
    if (extras.length > 0) {
      enrichedContent = `${dto.content}\n\n---\n${extras.join('\n')}`;
    }

    // Normalize the type — Memory model has a strict enum
    // (CLIENT_CONTEXT, PROJECT_CONTEXT, USER_PREFERENCE, FACTUAL_STATEMENT).
    // Brain may pass arbitrary type strings; default to FACTUAL_STATEMENT
    // when the provided value isn't one of the enum members.
    const VALID_TYPES = new Set([
      'CLIENT_CONTEXT',
      'PROJECT_CONTEXT',
      'USER_PREFERENCE',
      'FACTUAL_STATEMENT',
    ]);
    const rawType = (dto.type || 'FACTUAL_STATEMENT').toUpperCase();
    const normalizedType = VALID_TYPES.has(rawType) ? rawType : 'FACTUAL_STATEMENT';

    // Memory has an FK to User. The "dev-user-001" placeholder doesn't
    // always exist in the DB. Look up the first real user for this
    // tenant and use them as the memory owner. Memories belong to the
    // tenant semantically; the userId is just an audit field.
    const tenantUser = await this.prisma.user.findFirst({
      where: { tenantId: dto.tenantId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!tenantUser) {
      throw new BadRequestException(
        `No users found for tenant ${dto.tenantId} — cannot create memory`,
      );
    }

    const created = await this.prisma.memory.create({
      data: {
        id,
        tenantId: dto.tenantId,
        userId: tenantUser.id,
        type: normalizedType as any,
        content: enrichedContent,
        source: 'AI_EXTRACTED',
        subject: dto.category ?? dto.conceptId ?? null,
      },
    });

    this.logger.log({
      message: 'Memory created',
      id,
      tenantId: dto.tenantId,
      taskId: dto.taskId,
      category: dto.category,
      contentLength: enrichedContent.length,
    });

    return created;
  }

  /**
   * Phase 6 — list memories for a tenant. Used by director/executor in
   * the grounding phase to surface accumulated learning. Supports
   * filters by subject (category) and substring match on content (q).
   * Returns newest-first, capped at limit (max 100).
   */
  async listMemories(opts: {
    tenantId: string;
    limit?: number;
    subject?: string;
    q?: string;
  }) {
    const where: Record<string, unknown> = {
      tenantId: opts.tenantId,
      isDeleted: false,
    };
    if (opts.subject) where.subject = opts.subject;
    if (opts.q) {
      where.content = { contains: opts.q, mode: 'insensitive' };
    }
    return this.prisma.memory.findMany({
      where: where as any,
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limit ?? 20, 100),
      select: {
        id: true,
        type: true,
        content: true,
        subject: true,
        confidence: true,
        createdAt: true,
      },
    });
  }

  // ════════════════════════════════════════════
  //  WRITE Operations: Brain State
  // ════════════════════════════════════════════

  async updateBrainState(dto: UpdateBrainStateDto) {
    await this.brainState.updateBlockScan(dto.tenantId, dto.canvasBlock, {
      risks: dto.risks,
      status: dto.status,
    });
  }

  // ════════════════════════════════════════════
  //  WRITE Operations: Conversations
  // ════════════════════════════════════════════

  async createConversation(dto: CreateConversationDto) {
    const id = `sess_${createId()}`;

    const conversation = await this.prisma.conversation.create({
      data: {
        id,
        userId: 'dev-user-001',
        title: dto.title,
        conceptId: dto.conceptId,
      },
    });

    // Add initial message if provided
    if (dto.initialMessage) {
      await this.prisma.message.create({
        data: {
          id: `msg_${createId()}`,
          conversationId: id,
          role: 'ASSISTANT',
          content: dto.initialMessage,
        },
      });
    }

    this.eventBus.emit(BRIDGE_EVENTS.CONVERSATION_CREATED, {
      tenantId: dto.tenantId,
      conversationId: id,
      conceptId: dto.conceptId,
      title: dto.title,
    });

    return conversation;
  }

  // ════════════════════════════════════════════
  //  File Operations
  // ════════════════════════════════════════════

  /**
   * Read a file from the OpenClaw workspace on Hetzner via SSH.
   * Used to proxy deliverable file downloads to the frontend.
   */
  async readFileFromWorkspace(tenantId: string, filePath: string): Promise<Buffer> {
    if (!this.openClawTenant) {
      throw new BadRequestException('OpenClaw tenant service not configured');
    }

    try {
      return await this.openClawTenant.readFile(filePath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown';
      if (msg.includes('not found')) {
        throw new NotFoundException(`File not found: ${filePath}`);
      }
      throw new BadRequestException(`Failed to read file: ${msg}`);
    }
  }

  /**
   * Scan Hetzner deliverables folder for a task and return all files found.
   * This discovers files that agents created but didn't register via Bridge API.
   */
  async scanTaskDeliverables(noteId: string): Promise<Array<{ name: string; path: string; mimeType: string }>> {
    const files = await this.openClawTenant.listDeliverables(noteId);
    const mimeMap: Record<string, string> = {
      md: 'text/markdown', txt: 'text/plain', html: 'text/html',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
      svg: 'image/svg+xml', csv: 'text/csv', zip: 'application/zip',
      py: 'text/x-python', js: 'application/javascript', css: 'text/css',
      json: 'application/json', sh: 'application/x-sh',
    };
    return files.map(f => {
      const name = f.split('/').pop() ?? f;
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      return { name, path: f, mimeType: mimeMap[ext] ?? 'application/octet-stream' };
    });
  }

  private agentLabel(agentType: string): string {
    const labels: Record<string, string> = {
      direktor: 'Director', research: 'Research', financial: 'Finance',
      content: 'Content', marketing: 'Marketing', sales: 'Sales',
      designer: 'Design', dev: 'Development', web_search: 'Web Search',
    };
    return labels[agentType] ?? agentType;
  }

  // ════════════════════════════════════════════════════════════════════
  //  OBSERVABILITY — translate CLI jsonl events into graph/activity WS
  //  events. Called for EVERY structured entry written to the executor's
  //  session jsonl file while a task is running. Source of truth for
  //  "what is the brain doing right now".
  // ════════════════════════════════════════════════════════════════════

  private static readonly SPECIALIST_KEYWORDS: Array<[RegExp, string]> = [
    [/\b(research|istra[žz]iva[nm]|market\s+research|web\s*search)\b/i, 'research'],
    [/\b(financial|finansij|roi|cash\s*flow|pricing|invest)\b/i, 'financial'],
    [/\b(content|sadr[žz]aj|caption|article|copy|write|writer)\b/i, 'content'],
    [/\b(marketing|seo|campaign|ads|social)\b/i, 'marketing'],
    [/\b(sales|prodaj|lead|outreach|partnership)\b/i, 'sales'],
    [/\b(designer|design|image|logo|visual|figma|kontext|fal)\b/i, 'designer'],
    [/\b(dev|developer|code|script|repo|api)\b/i, 'dev'],
  ];

  /**
   * Best-effort mapping of a sessions_spawn task description to one of
   * our known specialist agent types. The brain phrases its spawn tasks
   * like "You are a research agent for..." — we match on keywords and
   * fall back to 'direktor' if nothing matches.
   */
  private inferSpecialist(taskText: string): string {
    for (const [re, agent] of BridgeService.SPECIALIST_KEYWORDS) {
      if (re.test(taskText)) return agent;
    }
    return 'direktor';
  }

  /** Safely truncate to a max length for UI display. */
  private truncate(s: string | undefined, max: number): string {
    if (!s) return '';
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  /**
   * Core translator: jsonl event → bridge AGENT_STATUS event(s).
   *
   * Event shapes we care about (from MiniMax/OpenClaw CLI session files):
   *
   *   { type:"message", message:{ role:"assistant", content:[
   *       { type:"thinking", thinking:"..." },
   *       { type:"text", text:"..." },
   *   ]}}
   *     → director is reasoning/speaking
   *
   *   { type:"toolCall", name:"sessions_spawn", arguments:{ task:"You are a research agent for..." }}
   *     → specialist spawn: emit status for that specialist as "running"
   *
   *   { type:"toolResult", toolCallId:"..." content:[...]}
   *     → specialist/tool completed (we pair it with the last toolCall)
   *
   *   { type:"toolCall", name:"exec|write|web_search|web_fetch", arguments:{...}}
   *     → director-level tool use: show as director activity
   *
   * We keep a small in-memory correlation map (toolCallId → agent) so
   * toolResult events can be attributed back to the right specialist.
   */
  private toolCallAgentMap = new Map<string, { agent: string; label: string }>();

  /**
   * Notes whose execution has terminated (stream ended, task-complete
   * called, watchdog fired, or manual completion). Once a noteId is in
   * this set, `handleExecutorJsonlEvent` silently drops any further
   * events for that noteId. Prevents the "director keeps pulsing after
   * task complete" glitch caused by late jsonl events still being tailed
   * from the session file AFTER the stream closed and the frontend
   * already rewrote events to `completed`.
   *
   * Entries are pruned by a simple LRU cap — we don't need precision,
   * just enough to debounce the last few hundred events per task.
   */
  private settledNotes = new Map<string, number>(); // noteId -> timestamp settled

  private markNoteSettled(noteId: string): void {
    if (!noteId) return;
    this.settledNotes.set(noteId, Date.now());
    // LRU cap: prune oldest 50 when we exceed 500 entries
    if (this.settledNotes.size > 500) {
      const sorted = Array.from(this.settledNotes.entries()).sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < 50; i++) {
        const entry = sorted[i];
        if (entry) this.settledNotes.delete(entry[0]);
      }
    }
  }

  private handleExecutorJsonlEvent(e: unknown, tenantId: string, noteId: string): void {
    // Late-event filter: if this noteId has already been marked settled
    // (stream ended, task-complete fired, or watchdog rescued), silently
    // drop any straggling jsonl events so the graph director doesn't
    // re-pulse to 'running' after the frontend already saw 'completed'.
    if (this.settledNotes.has(noteId)) {
      return;
    }

    const event = (e as { event?: Record<string, unknown> })?.event;
    if (!event || typeof event !== 'object') return;

    const eventType = event['type'] as string | undefined;
    const now = new Date().toISOString();

    // Direct toolCall entries (some CLI versions emit these at top level)
    if (eventType === 'toolCall') {
      this.emitFromToolCall(event, tenantId, noteId, now);
      return;
    }
    if (eventType === 'toolResult') {
      this.emitFromToolResult(event, tenantId, noteId, now);
      return;
    }

    // Message-wrapped content (most common shape)
    if (eventType === 'message') {
      const msg = event['message'] as { role?: string; content?: Array<Record<string, unknown>> } | undefined;
      if (!msg || !Array.isArray(msg.content)) return;

      for (const item of msg.content) {
        const itemType = item['type'] as string | undefined;

        if (itemType === 'thinking') {
          // Don't spam the graph with raw thinking — just emit a light
          // "reasoning" status so the pulse stays alive during long
          // thinking phases. The full thinking text is captured by the
          // full event log (future Phase 1 — EventLog service).
          this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
            tenantId, taskId: noteId, agent: 'direktor',
            status: 'running',
            message: this.truncate((item['thinking'] as string) || 'Thinking…', 140),
            timestamp: now,
          });
          continue;
        }

        if (itemType === 'text') {
          const text = (item['text'] as string) || '';
          if (text.trim().length === 0) continue;
          this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
            tenantId, taskId: noteId, agent: 'direktor',
            status: 'running',
            message: this.truncate(text, 140),
            timestamp: now,
          });
          continue;
        }

        if (itemType === 'toolCall' || itemType === 'tool_use') {
          this.emitFromToolCall(item, tenantId, noteId, now);
          continue;
        }

        if (itemType === 'toolResult' || itemType === 'tool_result') {
          this.emitFromToolResult(item, tenantId, noteId, now);
          continue;
        }
      }
    }
  }

  private emitFromToolCall(
    item: Record<string, unknown>,
    tenantId: string,
    noteId: string,
    now: string,
  ): void {
    const toolName = (item['name'] as string) || 'tool';
    const toolCallId = (item['id'] as string) || '';
    const args = (item['arguments'] as Record<string, unknown>) || {};

    let agent = 'direktor';
    let label = toolName;

    if (toolName === 'sessions_spawn') {
      // Derive specialist from the task description
      const taskText = (args['task'] as string) || (args['prompt'] as string) || '';
      agent = this.inferSpecialist(taskText);
      label = `spawn ${agent}: ${this.truncate(taskText, 100)}`;
    } else if (toolName === 'web_search' || toolName === 'brave-search') {
      agent = 'research';
      const query = (args['query'] as string) || '';
      label = `🔍 ${this.truncate(query, 120)}`;
    } else if (toolName === 'web_fetch' || toolName === 'fetch') {
      agent = 'research';
      const url = (args['url'] as string) || '';
      label = `🌐 ${this.truncate(url, 120)}`;
    } else if (toolName === 'exec') {
      const command = (args['command'] as string) || (args['cmd'] as string) || '';
      // Infer specialist from the command content (e.g. openpyxl → financial)
      agent = this.inferSpecialist(command);
      label = `⚙ ${this.truncate(command, 120)}`;
    } else if (toolName === 'write') {
      agent = 'direktor';
      const path = (args['file_path'] as string) || (args['path'] as string) || '';
      label = `✎ write ${this.truncate(path, 100)}`;
    }

    if (toolCallId) {
      this.toolCallAgentMap.set(toolCallId, { agent, label });
      // Prune if the map grows too large (shouldn't, but safety)
      if (this.toolCallAgentMap.size > 500) {
        const firstKey = this.toolCallAgentMap.keys().next().value;
        if (firstKey) this.toolCallAgentMap.delete(firstKey);
      }
    }

    this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
      tenantId, taskId: noteId, agent,
      status: 'running',
      message: label,
      timestamp: now,
    });
  }

  private emitFromToolResult(
    item: Record<string, unknown>,
    tenantId: string,
    noteId: string,
    now: string,
  ): void {
    const toolCallId = (item['tool_use_id'] as string) || (item['toolCallId'] as string) || (item['id'] as string) || '';
    const mapped = this.toolCallAgentMap.get(toolCallId);
    const agent = mapped?.agent ?? 'direktor';
    const label = mapped ? `✓ ${mapped.label}` : '✓ tool result';

    this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
      tenantId, taskId: noteId, agent,
      status: 'completed',
      message: this.truncate(label, 140),
      timestamp: now,
    });

    if (toolCallId) {
      this.toolCallAgentMap.delete(toolCallId);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  TASK WATCHDOG — auto-complete stuck PENDING notes
  // ════════════════════════════════════════════════════════════════════
  //
  // Problem: when the OpenClaw CLI crashes mid-assistant-turn (e.g. gateway
  // timeout, provider 5xx, embedded-fallback failure), it never calls
  // /bridge/task-complete. The UI keeps showing "executing" forever because
  // it's waiting for a websocket task:complete event that never fires.
  //
  // This watchdog runs every 2 minutes. Any TASK note that has been in
  // PENDING status for > STUCK_THRESHOLD_MIN minutes since its updatedAt
  // (which tracks the last progress/contribution event) is considered
  // stuck. We auto-complete it with a TIMEOUT reason so the UI unblocks.
  //
  // We use updatedAt as the freshness cue because every task-progress and
  // task-contribution call touches it via prisma update. A truly active
  // task refreshes updatedAt on every event. A dead task doesn't.
  //
  // Memory note (brain-architecture-implementation.md):
  //   "OpenClaw never calls task-complete. Auto-scan safety net works on
  //    manual complete. Next: Need timeout mechanism to auto-complete
  //    tasks after inactivity"
  // This is that mechanism.

  // Must be greater than the fast-path auto-complete total lifetime (45 min:
  // 15 min grace + 10 min + 20 min). Otherwise the watchdog short-circuits
  // the fast-path pipeline and force-completes tasks where specialists are
  // still legitimately working. 60 min gives a 15-min safety buffer after
  // the final force-complete attempt.
  private static readonly STUCK_THRESHOLD_MIN = 60;

  // Every 2 minutes — raw cron because @nestjs/schedule's CronExpression
  // helper doesn't ship an EVERY_2_MINUTES constant.
  @Cron('*/2 * * * *')
  async watchdogSweepStuckTasks(): Promise<void> {
    const threshold = new Date(
      Date.now() - BridgeService.STUCK_THRESHOLD_MIN * 60 * 1000,
    );

    let stuck: Array<{ id: string; tenantId: string; title: string; updatedAt: Date }>;
    try {
      stuck = await this.prisma.note.findMany({
        where: {
          noteType: 'TASK',
          status: 'PENDING',
          updatedAt: { lt: threshold },
        },
        select: {
          id: true,
          tenantId: true,
          title: true,
          updatedAt: true,
        },
        take: 20, // cap per sweep
      });
    } catch (err) {
      this.logger.warn({
        message: 'Watchdog query failed',
        error: err instanceof Error ? err.message : 'unknown',
      });
      return;
    }

    if (stuck.length === 0) return;

    this.logger.warn({
      message: 'Watchdog: found stuck PENDING tasks',
      count: stuck.length,
      thresholdMinutes: BridgeService.STUCK_THRESHOLD_MIN,
    });

    for (const note of stuck) {
      try {
        // Mark as INCOMPLETE with a timeout flag in aiFeedback so the UI
        // can display a clear "the brain timed out" message. We reuse the
        // existing INCOMPLETE enum rather than adding a new TIMEOUT state.
        const ageMin = Math.round(
          (Date.now() - note.updatedAt.getTime()) / 60000,
        );
        // Mark settled BEFORE the DB update so any in-flight jsonl
        // events get filtered immediately.
        this.markNoteSettled(note.id);
        await this.prisma.note.update({
          where: { id: note.id },
          data: {
            status: 'INCOMPLETE',
            aiFeedback: `Watchdog auto-complete: task had no progress events for ${ageMin} minutes. The brain likely crashed or timed out mid-execution. Any files already written to the workspace are preserved on disk but may not be linked to this note.`,
          },
        });

        // Emit the WS events so the UI unblocks (graph stops navigating,
        // Activity bar clears). Mirror what a normal task-complete does.
        this.eventBus.emit(BRIDGE_EVENTS.TASK_COMPLETE, {
          tenantId: note.tenantId,
          noteId: note.id,
          status: 'INCOMPLETE',
          reason: 'watchdog_timeout',
          ageMinutes: ageMin,
          timestamp: new Date().toISOString(),
        });
        // Stop director pulse. Use 'failed' which is a valid status in
        // the frontend's BridgeAgentStatusPayload enum; 'timeout' is not.
        this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
          tenantId: note.tenantId,
          taskId: note.id,
          agent: 'direktor',
          status: 'failed',
          message: `Watchdog auto-closed after ${ageMin}m of inactivity`,
          timestamp: new Date().toISOString(),
        });

        this.logger.warn({
          message: 'Watchdog: auto-completed stuck task',
          noteId: note.id,
          tenantId: note.tenantId,
          title: note.title,
          ageMinutes: ageMin,
        });
      } catch (err) {
        this.logger.error({
          message: 'Watchdog: failed to auto-complete note',
          noteId: note.id,
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    }
  }
}
