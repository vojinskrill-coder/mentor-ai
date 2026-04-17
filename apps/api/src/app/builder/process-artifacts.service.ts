import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import {
  compileDesignToIR,
  emitAllArtifacts,
  type ProcessArtifacts,
  type ProcessIR,
} from './ir';
import type { DesignPayload } from './process-draft.service';
import type { NotionSchema } from './notion-database-creator.service';

/**
 * ProcessArtifactsService — compiles a draft's design.json to the IR,
 * emits all 4 artifacts (n8n workflow JSON, SOUL.md, SKILL.md,
 * openclaw.json entry), and returns them to the caller.
 *
 * This is the single source of truth for "what needs to exist on
 * disk + in the config for a per-process agent to work." The agent
 * on Hetzner calls the render-artifacts endpoint to fetch these
 * artifacts, then writes them to the filesystem + updates config +
 * reloads the gateway.
 */
@Injectable()
export class ProcessArtifactsService {
  private readonly logger = new Logger(ProcessArtifactsService.name);

  constructor(private readonly prisma: PlatformPrismaService) {}

  async renderForDraft(
    tenantId: string,
    draftId: string,
  ): Promise<ProcessArtifacts> {
    const draft = await this.prisma.processWorkflow.findFirst({
      where: { id: draftId, tenantId },
    });
    if (!draft) {
      throw new NotFoundException(`draft not found: ${draftId}`);
    }

    const design = (draft.designArtifact ?? {}) as unknown as DesignPayload & {
      notionSchema?: NotionSchema;
    };
    if (!design || !design.slug || !Array.isArray(design.steps)) {
      throw new BadRequestException(
        `draft ${draftId} has no valid designArtifact — cannot render`,
      );
    }

    // Compile to IR
    const ir: ProcessIR = compileDesignToIR(design, { tenantId });

    // Pull n8nWorkflowId from invocationConfig if available, so the
    // SOUL.md can reference it explicitly.
    const config = (draft.invocationConfig ?? {}) as Record<string, unknown>;
    const n8nWorkflowId = config.n8nWorkflowId as string | undefined;

    // Emit all 4 artifacts
    const artifacts = emitAllArtifacts(ir, { n8nWorkflowId });

    this.logger.log({
      message: 'Rendered per-process artifacts',
      draftId,
      slug: ir.slug,
      agentId: ir.agentId,
      brainCallCount: ir.brainCalls.length,
      hasNotionSchema: !!ir.notionSchema,
    });

    return artifacts;
  }
}
