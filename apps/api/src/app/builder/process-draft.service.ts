import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { createId } from '@paralleldrive/cuid2';

/**
 * Handles draft process workflows created by the neuron-process-builder
 * skill. A draft is a ProcessWorkflow row with status='draft' that has
 * no dedicated agent, no deployed n8n workflow, and no live run path.
 *
 * Phase 3A scope: just persist the design.json as a draft row. Phase 4
 * adds test runs. Phase 5 adds the publish flow that materializes the
 * per-process agent + skill + n8n workflow.
 */
@Injectable()
export class ProcessDraftService {
  private readonly logger = new Logger(ProcessDraftService.name);

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Create or upsert a draft process from a builder skill design.json.
   * Idempotent by `tenantId + slug` — if a draft already exists with
   * the same slug, it gets updated in place (lets the builder iterate).
   */
  async createDraft(tenantId: string, design: DesignPayload) {
    // Basic structural validation — heavier validation happens in the
    // builder skill's validate_process.py before this endpoint is hit.
    if (!design || typeof design !== 'object') {
      throw new BadRequestException('design payload is required');
    }
    if (!design.name || typeof design.name !== 'string') {
      throw new BadRequestException('design.name is required');
    }
    if (!design.slug || !/^[a-z][a-z0-9-]*$/.test(design.slug)) {
      throw new BadRequestException(
        'design.slug is required and must be kebab-case (lowercase, digits, hyphens)',
      );
    }
    if (!Array.isArray(design.steps) || design.steps.length === 0) {
      throw new BadRequestException('design.steps must be a non-empty array');
    }

    // Upsert by (tenantId, slug) — allows the builder to iterate on a
    // draft without creating a new row every turn.
    const existing = await this.prisma.processWorkflow.findFirst({
      where: { tenantId, slug: design.slug },
      select: { id: true, status: true },
    });

    if (existing && existing.status !== 'draft') {
      throw new BadRequestException(
        `A ${existing.status} process with slug "${design.slug}" already exists. Choose a different slug or edit the existing process.`,
      );
    }

    const id = existing?.id ?? `proc_${createId()}`;
    const now = new Date();

    const workflow = await this.prisma.processWorkflow.upsert({
      where: { id },
      create: {
        id,
        tenantId,
        name: design.name,
        slug: design.slug,
        description: design.description ?? null,
        isActive: false,
        cronSchedule: design.trigger?.cronSchedule ?? null,
        status: 'draft',
        isTestMode: true,
        triggerType: design.trigger?.type ?? 'manual',
        automationLevel: this.inferAutomationLevel(design),
        inputContract: (design.inputContract ?? {}) as unknown as object,
        outputManifest: (design.outputManifest ?? {}) as unknown as object,
        approvalPayloadShape: (design.approvalPayloadShape ?? {}) as unknown as object,
        designArtifact: design as unknown as object,
        builderSessionId: design.builderSessionId ?? null,
        createdByAgentId: 'process-builder',
        createdAt: now,
        updatedAt: now,
      },
      update: {
        name: design.name,
        description: design.description ?? null,
        cronSchedule: design.trigger?.cronSchedule ?? null,
        triggerType: design.trigger?.type ?? 'manual',
        automationLevel: this.inferAutomationLevel(design),
        inputContract: (design.inputContract ?? {}) as unknown as object,
        outputManifest: (design.outputManifest ?? {}) as unknown as object,
        approvalPayloadShape: (design.approvalPayloadShape ?? {}) as unknown as object,
        designArtifact: design as unknown as object,
        builderSessionId: design.builderSessionId ?? null,
        updatedAt: now,
      },
    });

    // Replace ProcessStep rows (simpler than diffing)
    await this.prisma.processStep.deleteMany({ where: { workflowId: id } });
    for (const [index, step] of design.steps.entries()) {
      await this.prisma.processStep.create({
        data: {
          id: `pstep_${createId()}`,
          workflowId: id,
          order: step.index ?? index + 1,
          name: step.name ?? `step-${index + 1}`,
          description: step.description ?? null,
          stepType: (step.manualStep || step.stepKind === 'APPROVAL_GATE'
            ? 'APPROVAL'
            : 'AUTOMATIC') as 'AUTOMATIC' | 'APPROVAL',
          agentType: 'process-executor', // placeholder until Phase 5 replaces with proc-<slug>
          toolSkill: step.mcpToolSlug ?? step.toolSkill ?? 'none',
          inputSchema: (step.inputSchema ?? {}) as unknown as object,
          outputSchema: (step.outputSchema ?? {}) as unknown as object,
          skillMdSection: null,
          retryPolicy: (step.retryPolicy ?? {}) as unknown as object,
          verifyRules: (step.verifyRules ?? []) as unknown as object,
          inputSource: (step.fieldBindings ?? step.inputSource ?? null) as unknown as object,
          mcpToolSlug: step.mcpToolSlug ?? null,
          manualStep: Boolean(step.manualStep) || step.stepKind === 'APPROVAL_GATE',
          fieldBindings: (step.fieldBindings ?? null) as unknown as object,
          mockFixture: (step.mockFixture ?? null) as unknown as object,
          dedupKey: step.dedupKey ?? null,
          maxRetries: step.maxRetries ?? 3,
        },
      });
    }

    this.logger.log({
      message: 'Draft process upserted',
      draftId: id,
      tenantId,
      slug: design.slug,
      stepCount: design.steps.length,
      isNew: !existing,
    });

    return this.fetchDraft(tenantId, id);
  }

  async listDrafts(tenantId: string) {
    // Return everything created via the builder — drafts AND deployed
    // (published) processes. From the user's perspective on the
    // Design Process page, both are "processes I built".
    return this.prisma.processWorkflow.findMany({
      where: {
        tenantId,
        createdByAgentId: 'process-builder',
      },
      orderBy: { updatedAt: 'desc' },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
  }

  async fetchDraft(tenantId: string, id: string) {
    const draft = await this.prisma.processWorkflow.findFirst({
      where: { id, tenantId },
      include: { steps: { orderBy: { order: 'asc' } }, mcpBindings: true },
    });
    if (!draft) throw new NotFoundException(`draft not found: ${id}`);
    return draft;
  }

  async deleteDraft(tenantId: string, id: string) {
    const draft = await this.prisma.processWorkflow.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, createdByAgentId: true, slug: true },
    });
    if (!draft) throw new NotFoundException(`draft not found: ${id}`);
    if (draft.createdByAgentId !== 'process-builder') {
      throw new BadRequestException(
        `Cannot delete a process that wasn't created via the builder.`,
      );
    }
    // Best-effort cleanup of companion rows (so the Settings page
    // doesn't show a ghost CatalogItem pointing at a deleted workflow).
    try {
      const catalogItem = await this.prisma.catalogItem.findUnique({
        where: { slug: draft.slug },
      });
      if (catalogItem) {
        await this.prisma.tenantCatalogItem.deleteMany({
          where: { tenantId, catalogItemId: catalogItem.id },
        });
        await this.prisma.catalogItem.delete({ where: { id: catalogItem.id } });
      }
    } catch (e) {
      this.logger.warn(
        `Catalog cleanup failed for ${id}: ${(e as Error).message}`,
      );
    }
    await this.prisma.processWorkflow.delete({ where: { id } });
    return { deleted: id };
  }

  /**
   * Infer the automation level from the design's input sources. This
   * drives the UI badge ("Auto" / "AI-assisted" / "Manual") and the
   * scheduler rules (only fully_automated can run on cron unattended).
   *
   * v1 rule: if ANY step has an input bound to `manual` source AND
   * that field is required, the process needs manual input before run.
   */
  private inferAutomationLevel(design: DesignPayload): string {
    const steps = design.steps ?? [];
    let hasRequiredManual = false;
    let hasAiAssistance = false;

    for (const step of steps) {
      const bindings = step.fieldBindings ?? {};
      for (const source of Object.values(bindings) as Array<{ source?: string }>) {
        if (!source || typeof source !== 'object') continue;
        if (source.source === 'manual' || source.source === 'user_input') {
          hasRequiredManual = true;
        }
        if (source.source === 'ai_recommended' || source.source === 'ai_generated') {
          hasAiAssistance = true;
        }
      }
    }

    if (hasRequiredManual) return 'manual_input_required';
    if (hasAiAssistance) return 'ai_with_review';
    return 'fully_automated';
  }
}

// ─── Types ──────────────────────────────────────────────────────────

// Intentionally structural — matches what the builder skill produces.
// Full Zod validation will land in Phase 5 as part of the publish flow.
export interface DesignPayload {
  name: string;
  slug: string;
  description?: string;
  trigger?: { type?: string; cronSchedule?: string | null };
  tools?: string[];
  inputContract?: Record<string, unknown>;
  outputManifest?: Record<string, unknown>;
  approvalPayloadShape?: Record<string, unknown>;
  steps: Array<{
    index?: number;
    name?: string;
    description?: string;
    stepKind?: string;
    mcpToolSlug?: string;
    mcpOperationId?: string;
    mcpOperationKind?: string;
    fieldBindings?: Record<string, unknown>;
    verifyRules?: unknown[];
    manualStep?: boolean;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    toolSkill?: string;
    retryPolicy?: Record<string, unknown>;
    mockFixture?: Record<string, unknown>;
    dedupKey?: string;
    maxRetries?: number;
    inputSource?: Record<string, unknown>;
  }>;
  builderSessionId?: string;
}
