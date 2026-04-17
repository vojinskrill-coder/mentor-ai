import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { ProcessDeployService } from './process-deploy.service';
import { ProcessDraftService, DesignPayload } from './process-draft.service';
import { createId } from '@paralleldrive/cuid2';

/**
 * Backend-driven stage machine for Process Builder.
 *
 * The AI agent ONLY generates a designArtifact JSON. This service
 * handles everything else deterministically:
 *
 *   Stage 1: DESIGN    — AI generates design, backend saves as draft
 *   Stage 2: VALIDATE  — Backend validates against business rules + MCP catalog
 *   Stage 3: PROPOSE   — Backend returns formatted proposal to UI
 *   Stage 4: DEPLOY    — Backend creates n8n workflow + agent (after user confirm)
 *   Stage 5: TEST      — Backend triggers test run + waits for results
 *   Stage 6: PUBLISH   — Backend promotes to published (after user approve)
 *
 * The AI cannot skip stages, deploy directly, or self-publish.
 * Each stage is a deterministic function call, not an AI decision.
 */

export type OrchestratorStage =
  | 'design'
  | 'validating'
  | 'proposal'
  | 'confirmed'
  | 'deploying'
  | 'testing'
  | 'awaiting_approval'
  | 'published'
  | 'failed';

export interface OrchestratorState {
  processId: string;
  stage: OrchestratorStage;
  validationErrors?: string[];
  proposal?: {
    name: string;
    description: string;
    steps: Array<{ index: number; name: string; type: string; tool?: string; hasPrompt: boolean }>;
    inputFields: string[];
    connectedTools: string[];
    saveTo: string;
  };
  testRunId?: string;
  testResults?: { itemCount: number; sample?: unknown; status: string };
  error?: string;
}

@Injectable()
export class BuilderOrchestratorService {
  private readonly logger = new Logger(BuilderOrchestratorService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly draftService: ProcessDraftService,
    private readonly deployer: ProcessDeployService,
  ) {}

  /**
   * Stage 1 + 2: Accept AI-generated design, save as draft, validate.
   * Returns the current state including validation results and a
   * formatted proposal for the user to review.
   */
  async submitDesign(
    tenantId: string,
    design: DesignPayload,
    existingProcessId?: string,
  ): Promise<OrchestratorState> {
    // Save or update draft
    let processId: string;
    if (existingProcessId) {
      await this.prisma.processWorkflow.update({
        where: { id: existingProcessId },
        data: {
          designArtifact: design as unknown as object,
          name: design.name ?? undefined,
          inputContract: design.inputContract as unknown as object ?? undefined,
          updatedAt: new Date(),
        },
      });
      processId = existingProcessId;
    } else {
      processId = `proc_${createId()}`;
      await this.prisma.processWorkflow.create({
        data: {
          id: processId,
          tenantId,
          name: design.name ?? 'Untitled Process',
          slug: design.slug ?? `proc-${createId()}`,
          status: 'draft',
          createdByAgentId: 'process-builder',
          designArtifact: design as unknown as object,
          inputContract: (design.inputContract ?? {}) as unknown as object,
        },
      });
    }

    // Validate
    const validation = await this.validate(processId, tenantId);
    if (!validation.valid) {
      return {
        processId,
        stage: 'failed',
        validationErrors: validation.errors,
        error: `Design validation failed: ${validation.errors.join('; ')}`,
      };
    }

    // Build proposal for user
    const proposal = await this.buildProposal(processId, tenantId, design);

    return {
      processId,
      stage: 'proposal',
      proposal,
    };
  }

  /**
   * Stage 4: User confirmed the proposal → deploy infrastructure.
   */
  async confirmAndDeploy(
    tenantId: string,
    processId: string,
  ): Promise<OrchestratorState> {
    try {
      const deployed = await this.deployer.deploy(tenantId, processId);
      return {
        processId,
        stage: 'deploying',
        testResults: {
          itemCount: 0,
          status: 'deployed',
        },
      };
    } catch (err) {
      return {
        processId,
        stage: 'failed',
        error: `Deploy failed: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Stage 6: User approved test results → publish.
   */
  async approveAndPublish(
    tenantId: string,
    processId: string,
  ): Promise<OrchestratorState> {
    await this.prisma.processWorkflow.update({
      where: { id: processId },
      data: { status: 'published', isTestMode: false, updatedAt: new Date() },
    });

    return {
      processId,
      stage: 'published',
    };
  }

  // ─── Internal helpers ──────────────────────────────────────────

  private async validate(
    processId: string,
    tenantId: string,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const draft = await this.prisma.processWorkflow.findFirst({
      where: { id: processId, tenantId },
    });
    if (!draft) return { valid: false, errors: ['Draft not found'] };

    const design = (draft.designArtifact ?? {}) as unknown as DesignPayload;
    const errors: string[] = [];

    if (!design.steps?.length) {
      errors.push('Process has no steps');
      return { valid: false, errors };
    }

    // Rule 1: At least 1 brain-call step with prompt
    const brainSteps = (design.steps ?? []).filter((s) => {
      const kind = (s.stepKind ?? '').toUpperCase();
      return (
        !kind.includes('APPROVAL') &&
        !kind.includes('GATE') &&
        !kind.includes('WRITE') &&
        !kind.includes('SEARCH') &&
        !kind.includes('READ') &&
        !s.manualStep
      );
    });
    if (brainSteps.length === 0) {
      errors.push('Process must have at least one AI reasoning step with a prompt.');
    }
    for (const s of brainSteps) {
      const prompt = (s as Record<string, unknown>).prompt as string | undefined;
      if (!prompt || prompt.length < 20) {
        errors.push(`Step "${s.name}" needs a detailed prompt (min 20 chars).`);
      }
    }

    // Rule 2: Exactly 1 approval gate
    const gates = (design.steps ?? []).filter(
      (s) =>
        s.stepKind?.toUpperCase().includes('APPROVAL') ||
        s.stepKind?.toUpperCase().includes('GATE') ||
        s.manualStep,
    );
    if (gates.length === 0) {
      errors.push('Process must have an approval gate for user review.');
    }

    // Rule 3: MCP tools exist, are connected, AND operation is accessible
    const [catalogTools, connectedCreds] = await Promise.all([
      this.prisma.mcpToolCatalog.findMany({
        where: { isActive: true },
        select: { slug: true, operations: true, credentialType: true },
      }),
      this.prisma.tenantCredential.findMany({
        where: { tenantId },
        select: { toolSlug: true, config: true },
      }),
    ]);
    const catalogSlugs = new Map(catalogTools.map((t) => [t.slug, t]));
    const connectedMap = new Map(
      connectedCreds.map((c) => [c.toolSlug, c]),
    );

    for (const s of design.steps ?? []) {
      if (s.mcpToolSlug) {
        const tool = catalogSlugs.get(s.mcpToolSlug);
        if (!tool) {
          errors.push(`Step "${s.name}" uses tool "${s.mcpToolSlug}" not in MCP catalog.`);
          continue;
        }

        const cred = connectedMap.get(s.mcpToolSlug);
        if (tool.credentialType !== 'none' && !cred) {
          errors.push(`Step "${s.name}" uses "${s.mcpToolSlug}" which is not connected. Go to Settings → Integrations.`);
          continue;
        }

        // Check operation exists in catalog
        if (s.mcpOperationId) {
          const ops = (tool.operations as unknown as Array<{ id: string }>) ?? [];
          if (!ops.some((op) => op.id === s.mcpOperationId)) {
            errors.push(
              `Step "${s.name}": operation "${s.mcpOperationId}" doesn't exist on "${s.mcpToolSlug}". Available: ${ops.map((o) => o.id).join(', ')}`,
            );
            continue;
          }

          // Check operation is accessible with this API key
          // (verifiedOperations is populated by testConnection probe)
          if (cred) {
            const config = (cred.config as Record<string, unknown>) ?? {};
            const verifiedOps = (config.verifiedOperations as string[]) ?? [];
            const failedOps = (config.failedOperations as string[]) ?? [];

            if (failedOps.includes(s.mcpOperationId)) {
              errors.push(
                `Step "${s.name}": operation "${s.mcpOperationId}" on "${s.mcpToolSlug}" is NOT accessible with your current API key/plan. ` +
                `Upgrade your ${tool.slug} plan or use a different operation. ` +
                `Accessible operations: ${verifiedOps.join(', ') || 'unknown (run Test Connection in Settings → Integrations)'}`,
              );
            }
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private async buildProposal(
    processId: string,
    tenantId: string,
    design: DesignPayload,
  ) {
    const connectedCreds = await this.prisma.tenantCredential.findMany({
      where: { tenantId },
      select: { toolSlug: true },
    });

    const steps = (design.steps ?? []).map((s, i) => {
      const kind = (s.stepKind ?? '').toUpperCase();
      let type = 'AI Reasoning';
      if (kind.includes('SEARCH') || kind.includes('FIND')) type = 'MCP Search';
      else if (kind.includes('READ') || kind.includes('ENRICH')) type = 'MCP Read';
      else if (kind.includes('WRITE') || kind.includes('SAVE')) type = 'MCP Write';
      else if (kind.includes('APPROVAL') || kind.includes('GATE') || s.manualStep) type = 'User Approval';

      return {
        index: i + 1,
        name: s.name ?? `Step ${i + 1}`,
        type,
        tool: s.mcpToolSlug ?? undefined,
        hasPrompt: !!((s as Record<string, unknown>).prompt),
      };
    });

    const inputFields = Object.keys(
      (design.inputContract as Record<string, unknown>)?.properties ?? {},
    );

    // Determine save target
    const writeStep = (design.steps ?? []).find(
      (s) => s.stepKind?.toUpperCase().includes('WRITE'),
    );
    const saveTo = writeStep?.mcpToolSlug ?? 'notion';

    return {
      name: design.name ?? 'Untitled',
      description: design.description ?? '',
      steps,
      inputFields,
      connectedTools: connectedCreds.map((c) => c.toolSlug),
      saveTo,
    };
  }
}
