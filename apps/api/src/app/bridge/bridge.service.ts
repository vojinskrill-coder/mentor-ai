import { Injectable, Logger, NotFoundException, BadRequestException, Optional, Inject, forwardRef } from '@nestjs/common';
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
} from './dto/bridge.dto';

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
  PROCESS_STEP_OUTPUT: 'bridge.process.step-output',
  PROCESS_STEP_FAILED: 'bridge.process.step-failed',
  PROCESS_COMPLETE: 'bridge.process.complete',
  PROCESS_APPROVAL_NEEDED: 'bridge.process.approval-needed',
  PROCESS_CANCELLED: 'bridge.process.cancelled',
} as const;

@Injectable()
export class BridgeService {
  private readonly logger = new Logger(BridgeService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly eventBus: AppEventBus,
    private readonly brainState: BrainStateService,
    @Inject(forwardRef(() => OpenClawClientService))
    private readonly openClawClient: OpenClawClientService,
    private readonly openClawTenant: OpenClawTenantService,
    private readonly embeddingService: EmbeddingService,
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

    // 1. Semantic search via Qdrant (cross-language, finds Serbian concepts from English queries)
    const semanticMatches = await this.embeddingService.search(query, limit * 2);
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

      // Atomic: create task + update proposal in one transaction
      const [, updated] = await this.prisma.$transaction([
        this.prisma.note.create({
          data: {
            id: noteId,
            title: proposal.title,
            content: proposal.proposedAction,
            noteType: 'TASK',
            status: 'PENDING',
            source: 'CONVERSATION',
            conceptId,
            expectedOutcome: proposal.proposedAction,
            tenantId: proposal.tenantId,
            userId: dto.approvedBy ?? 'dev-user-001',
          },
        }),
        this.prisma.brainProposal.update({
          where: { id },
          data: {
            status: 'approved',
            approvedBy: dto.approvedBy,
            approvedAt: new Date(),
            executionNoteId: noteId,
          },
        }),
      ]);

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
        const executionMessage = [
          `ZADATAK ODOBREN: "${proposal.title}"`,
          `NoteId: ${noteId}`,
          `TenantId: ${proposal.tenantId}`,
          `Canvas Block: ${proposal.canvasBlock}`,
          '',
          'PLAN:',
          proposal.proposedAction,
          '',
          '=== HOW TO EXECUTE ===',
          'NEVER describe what you would do — DO it using tools and agents.',
          'Every task MUST have a concrete output that you PRODUCED using tools, not described.',
          'Spin up as many sub-agents as needed (sessions_spawn) to complete task parts in parallel.',
          'Use ClawTeam for complex tasks with dependencies between agents.',
          '',
          'USE THESE AGENTS (sessions_spawn):',
          '- research: brave-search, tavily, browser-automation for research',
          '- content: seo-content-writer, content-creator, ghost-cms for content writing',
          '- financial: fin-cog, excel-xlsx, financial-analyst for Excel files and analyses',
          '- marketing: marketing-strategy-pmm, simplified-social-media for strategies',
          '- sales: apollo, cold-email, campaign-orchestrator for lead generation',
          '- designer: generate-presentation for presentations, fal-generate for images',
          '- dev: write, exec for code (landing page, email template, scripts)',
          '',
          'FOR EVERY FILE YOU CREATE:',
          '1. Save it to workspace: write file to deliverables/',
          '2. Report it through POST /api/bridge/task-contribution with files[] field:',
          `   {"name":"file.xlsx","displayName":"Description","path":"/root/.openclaw/workspace/deliverables/${noteId}/file.xlsx","mimeType":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","size":1000}`,
          '',
          'DURING WORK use mentor-ai-bridge:',
          'Use curl commands from mentor-ai-bridge SKILL.md for:',
          `- POST /api/bridge/agent-status — report which agent is working (tenantId="${proposal.tenantId}", taskId="${noteId}")`,
          `- POST /api/bridge/task-progress — report progress (noteId="${noteId}", percent 0-100)`,
          `- POST /api/bridge/task-contribution — add agent result with output and files`,
          `- POST /api/bridge/task-complete — complete task (noteId="${noteId}", score 1-100)`,
        ].join('\n');

        this.openClawClient.executeAgent(executionMessage, {
          agentId: 'main',
          sessionId: `exec-${noteId}`,
          tenantProfile: proposal.tenantId,
          onTool: (tool, status, query) => {
            this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
              tenantId: proposal.tenantId,
              taskId: noteId,
              agent: tool.includes('search') ? 'research' : 'director',
              status: status === 'start' ? 'running' : 'completed',
              message: status === 'start' ? `${tool}${query ? ': ' + query.substring(0, 80) : ''}` : `Completed: ${tool}`,
              timestamp: new Date().toISOString(),
            });
          },
          onStatus: (phase) => {
            this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
              tenantId: proposal.tenantId,
              taskId: noteId,
              agent: 'director',
              status: 'running',
              message: phase,
              timestamp: new Date().toISOString(),
            });
          },
        }).catch((err) => {
          this.logger.error({
            message: 'Failed to notify OpenClaw of approved proposal',
            proposalId: id,
            error: err instanceof Error ? err.message : 'Unknown',
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
      const reason = dto.rejectedReason ? ` Razlog: ${dto.rejectedReason}` : '';
      await this.createMemory({
        tenantId: proposal.tenantId,
        type: 'FACTUAL_STATEMENT',
        content: `Vlasnik je odbio predlog "${proposal.title}" (${proposal.canvasBlock}).${reason} Ne predlazi ponovo osim ako se okolnosti materijalno promene.`,
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
    // Atomic JSONB merge — same pattern as agent-execution.service.ts
    const enrichmentEntry = {
      executionId: `bridge_${createId()}`,
      status: 'COMPLETED',
      result: dto.output,
      completedAt: new Date().toISOString(),
      error: null,
      summary: dto.summary,
      files: dto.files ?? [],
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
    // Auto-scan deliverables folder for unreported files before completing
    try {
      const scannedFiles = await this.scanTaskDeliverables(dto.noteId);
      if (scannedFiles.length > 0) {
        // Check which files are already in enrichments
        const note0 = await this.prisma.note.findUnique({
          where: { id: dto.noteId },
          select: { agentEnrichments: true },
        });
        const existingFiles = new Set<string>();
        for (const entry of Object.values((note0?.agentEnrichments as Record<string, any>) ?? {})) {
          for (const f of (entry.files ?? [])) existingFiles.add(f.path ?? f.name);
        }
        const newFiles = scannedFiles.filter(f => !existingFiles.has(f.path) && !f.name.endsWith('.md'));
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
      select: { agentEnrichments: true, title: true },
    });

    let fullContent = `# ${note?.title ?? 'Task'}\n\n`;
    const enrichments = (note?.agentEnrichments as Record<string, any>) ?? {};

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

    await this.prisma.note.update({
      where: { id: dto.noteId },
      data: {
        status: 'COMPLETED',
        aiScore: dto.score,
        content: fullContent, // Update content with full aggregated result
        userReport: fullContent, // Also set userReport for PDF export
      },
    });

    this.eventBus.emit(BRIDGE_EVENTS.TASK_COMPLETE, {
      tenantId: dto.tenantId,
      noteId: dto.noteId,
      score: dto.score,
    });

    this.logger.log({ message: 'Task completed via bridge', noteId: dto.noteId, score: dto.score });
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
      t.content ? `Opis: ${t.content.substring(0, 500)}` : '',
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
        agent: 'director',
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
          agent: tool.includes('search') ? 'research' : tool.includes('exec') ? 'dev' : 'director',
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
          agent: 'director',
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
        agent: 'director',
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
      'Za svaki zadatak:',
      '1. Check if sub-agents have finished (ls deliverables/{noteId}/)',
      '2. For each file that exists, report it through task-contribution',
      '3. Close the task with task-complete and a score',
      '',
      'If agents are still working, wait for them and report when done.',
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
    this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
      tenantId: dto.tenantId,
      taskId: dto.taskId,
      agent: dto.agent,
      status: dto.status,
      message: dto.message,
      timestamp: new Date().toISOString(),
    });
  }

  // ════════════════════════════════════════════
  //  WRITE Operations: Memories
  // ════════════════════════════════════════════

  async createMemory(dto: CreateMemoryDto) {
    const id = `mem_${createId()}`;

    return this.prisma.memory.create({
      data: {
        id,
        tenantId: dto.tenantId,
        userId: 'dev-user-001',
        type: dto.type as any,
        content: dto.content,
        source: 'AI_EXTRACTED',
        subject: dto.conceptId ?? null, // Store concept reference in subject field
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
      director: 'Director', research: 'Research', financial: 'Finance',
      content: 'Content', marketing: 'Marketing', sales: 'Sales',
      designer: 'Design', dev: 'Development', web_search: 'Web Search',
    };
    return labels[agentType] ?? agentType;
  }
}
