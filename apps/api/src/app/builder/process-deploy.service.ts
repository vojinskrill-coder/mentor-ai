import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { createId } from '@paralleldrive/cuid2';
import { N8nOrchestratorService } from '../n8n/n8n-orchestrator.service';
import { N8nWorkflowGeneratorService } from './n8n-workflow-generator.service';
import {
  NotionDatabaseCreatorService,
  NotionSchema,
} from './notion-database-creator.service';
import { DesignPayload } from './process-draft.service';
import {
  compileDesignToIR,
  emitN8nWorkflow,
  emitSoulMd,
  emitSkillMd,
  emitOpenclawEntry,
} from './ir';

/**
 * Orchestrates the real deployment of a draft process:
 *
 *   1. Create Notion database (if notionSchema present)
 *   2. Generate n8n workflow JSON from design + credential refs
 *   3. POST to n8n instance via N8nOrchestratorService
 *   4. Persist n8nWorkflowId + notionDatabaseId onto the draft's
 *      invocationConfig JSON
 *
 * Does NOT publish the process (that's Phase 5 — per-process agent
 * creation, draft→published state transition, processes page entry).
 * The draft remains in status='draft' with isTestMode=true after this
 * runs. All it does is make the artifacts real so the publish step
 * just has to flip flags.
 */
@Injectable()
export class ProcessDeployService {
  private readonly logger = new Logger(ProcessDeployService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly config: ConfigService,
    private readonly n8n: N8nOrchestratorService,
    private readonly n8nGen: N8nWorkflowGeneratorService,
    private readonly notionCreator: NotionDatabaseCreatorService,
  ) {}

  async deploy(
    tenantId: string,
    draftId: string,
  ): Promise<{
    draftId: string;
    n8nWorkflowId: string | null;
    notionDatabaseId: string | null;
    notionDatabaseUrl: string | null;
    invocationConfig: Record<string, unknown>;
  }> {
    const deployStartMs = Date.now();
    const draft = await this.prisma.processWorkflow.findFirst({
      where: { id: draftId, tenantId },
    });
    if (!draft) {
      throw new NotFoundException(`draft not found: ${draftId}`);
    }
    // Allow redeploy on draft OR published status (idempotent updates
    // from the process-builder agent during iteration). Only archived
    // or deleted statuses are blocked.
    if (draft.status !== 'draft' && draft.status !== 'published') {
      throw new BadRequestException(
        `Cannot deploy a ${draft.status} process via the draft deploy endpoint.`,
      );
    }

    const design = (draft.designArtifact ?? {}) as unknown as DesignPayload & {
      notionSchema?: NotionSchema;
    };
    if (!design.steps?.length) {
      throw new BadRequestException(
        'draft.designArtifact.steps is empty — nothing to deploy',
      );
    }

    const existingConfig = (draft.invocationConfig ?? {}) as Record<
      string,
      unknown
    >;
    const newConfig: Record<string, unknown> = { ...existingConfig };

    // ── Step 1: Notion database (if schema present and doesn't exist yet)
    let notionResult: {
      id: string;
      url: string;
      parentPageId: string;
    } | null = null;

    if (design.notionSchema && !existingConfig.notionDatabaseId) {
      try {
        const created = await this.notionCreator.createDatabase(
          tenantId,
          design.notionSchema,
        );
        notionResult = {
          id: created.id,
          url: created.url,
          parentPageId: created.parentPageId,
        };
        newConfig.notionDatabaseId = created.id;
        newConfig.notionDatabaseUrl = created.url;
        newConfig.notionParentPageId = created.parentPageId;
      } catch (e) {
        this.logger.error(
          `Notion database creation failed for draft ${draftId}: ${(e as Error).message}`,
        );
        throw e;
      }
    } else if (existingConfig.notionDatabaseId) {
      this.logger.log(
        `Reusing existing notionDatabaseId ${existingConfig.notionDatabaseId}`,
      );
      notionResult = {
        id: existingConfig.notionDatabaseId as string,
        url: (existingConfig.notionDatabaseUrl as string) ?? '',
        parentPageId: (existingConfig.notionParentPageId as string) ?? '',
      };
    }

    // ── Step 2: Generate n8n workflow JSON from the IR
    // Use the IR-based emitter (matches lead-discovery pattern: Webhook
    // → Ack → brain call → Parse → Callback). The per-process agent
    // proc-<slug> is called by the brain-call http nodes via the
    // OpenClaw relay.
    const ir = compileDesignToIR(design, { tenantId });
    const workflowDef = emitN8nWorkflow(ir);

    // ── Step 3: Deploy to n8n
    let n8nWorkflowId: string | null = null;
    if (!existingConfig.n8nWorkflowId) {
      try {
        const created = await this.n8n.createWorkflow(workflowDef);
        n8nWorkflowId = created.id;
        newConfig.n8nWorkflowId = created.id;
        newConfig.n8nWorkflowName = created.name;
        // Activate the workflow so the webhook URL becomes live.
        // Without this, trigger calls return 404 "webhook not registered".
        try {
          await this.n8n.activateWorkflow(created.id);
          this.logger.log(`Activated n8n workflow ${created.id}`);
        } catch (activateErr) {
          this.logger.warn(
            `Workflow ${created.id} created but activation failed: ${(activateErr as Error).message}`,
          );
        }
      } catch (e) {
        this.logger.error(
          `n8n deploy failed for draft ${draftId}: ${(e as Error).message}`,
        );
        throw e;
      }
    } else {
      // UPDATE existing workflow in-place with the latest IR-compiled
      // definition. n8n rejects PUT on active workflows, so we must
      // deactivate first, update, then reactivate.
      n8nWorkflowId = existingConfig.n8nWorkflowId as string;
      this.logger.log(`Updating existing n8n workflow ${n8nWorkflowId}`);
      try {
        // Deactivate first — n8n rejects PUT on active workflows
        try {
          await this.n8n.deactivateWorkflow(n8nWorkflowId);
        } catch { /* may already be inactive */ }

        await this.n8n.updateWorkflow(n8nWorkflowId, workflowDef);
        await this.n8n.activateWorkflow(n8nWorkflowId);
        this.logger.log(`n8n workflow ${n8nWorkflowId} deactivated → updated → reactivated`);
      } catch (updateErr) {
        // Re-throw — the caller must know the deploy failed.
        // Swallowing this error caused 10 retries against a stale workflow.
        this.logger.error(
          `n8n workflow update FAILED: ${(updateErr as Error).message}`,
        );
        throw updateErr;
      }
    }

    // ── Step 4: Persist config. Status stays as-is (draft or published).
    // For NEW drafts: stays 'draft' until user clicks Confirm in the UI
    //   (confirmDraft → deploy again → then promotes to 'published').
    // For EXISTING published processes (edit/redeploy): stays 'published'.
    // This is the Orchestrator Pattern: deploy creates infrastructure
    // (n8n + Notion + agent) but does NOT auto-publish. The user must
    // explicitly approve test results before the process goes live.
    const currentStatus = draft.status;
    await this.prisma.processWorkflow.update({
      where: { id: draftId },
      data: {
        invocationConfig: newConfig as unknown as object,
        // Keep current status: draft stays draft, published stays published
        status: currentStatus === 'published' ? 'published' : currentStatus,
        isTestMode: currentStatus !== 'published',
        updatedAt: new Date(),
      },
    });

    // ── Step 4b: Create/update the ProcessN8nWorkflow relation row.
    // This is what ProcessExecutorService reads to decide between n8n
    // execution and the legacy OpenClaw subagent path. Without this
    // row, the runtime falls back to subagent execution and fails.
    // webhookPath must match the path the workflow was created with
    // (emitN8nWorkflow uses `neuron-<slug>`).
    if (n8nWorkflowId) {
      const webhookPath = `neuron-${design.slug}`;
      await this.prisma.processN8nWorkflow.upsert({
        where: {
          processWorkflowId_tenantId: {
            processWorkflowId: draftId,
            tenantId,
          },
        },
        create: {
          processWorkflowId: draftId,
          tenantId,
          n8nWorkflowId,
          webhookPath,
          isActive: true,
        },
        update: {
          n8nWorkflowId,
          webhookPath,
          isActive: true,
          syncedAt: new Date(),
        },
      });
    }

    // ── Step 4c: Auto-register the per-process OpenClaw agent.
    // Without this, the n8n brain calls fire against an agent that
    // doesn't exist and the workflow fails. We POST the rendered
    // SOUL.md / SKILL.md / openclaw entry to the relay's
    // /register-agent endpoint, which writes the files, patches both
    // openclaw.json files, and restarts the gateway.
    try {
      // Load tenant business profile for SOUL.md context injection
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, industry: true, description: true },
      });

      const ir2 = compileDesignToIR(design, { tenantId });
      const soulMd = emitSoulMd(ir2, {
        n8nWorkflowId: n8nWorkflowId ?? undefined,
        businessContext: tenant ? {
          companyName: tenant.name,
          industry: tenant.industry,
          description: tenant.description ?? undefined,
        } : undefined,
      });
      const skillMd = emitSkillMd(ir2);
      const openclawEntry = emitOpenclawEntry(ir2);

      // OPENCLAW_RELAY_URL may include /execute suffix — strip it for
      // the register-agent endpoint which lives at the relay root.
      const rawRelayUrl = this.config.get<string>('OPENCLAW_RELAY_URL') ??
        'http://91.98.231.87:3100';
      const relayBase = rawRelayUrl.replace(/\/execute\/?$/, '').replace(/\/stream\/?$/, '');
      const relayToken = this.config.get<string>('OPENCLAW_RELAY_TOKEN') ??
        '9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d';

      const regRes = await fetch(`${relayBase}/register-agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${relayToken}`,
        },
        body: JSON.stringify({
          agentId: ir2.agentId,
          slug: ir2.slug,
          soulMd,
          skillMd,
          openclawEntry,
          tenantId,
          // Ensure per-process agent gets MiniMax M2.7 with reasoning + 32K tokens
          modelsJson: {
            providers: {
              deepseek: {
                baseUrl: 'https://api.minimax.io/v1',
                api: 'openai-completions',
                apiKey: 'DEEPSEEK_API_KEY',
                models: [{
                  id: 'MiniMax-M2.7',
                  name: 'MiniMax M2.7 (Reasoning)',
                  api: 'openai-completions',
                  reasoning: true,
                  input: ['text'],
                  cost: { input: 0.27, output: 1.1, cacheRead: 0, cacheWrite: 0 },
                  contextWindow: 192000,
                  maxTokens: 32768,
                }],
              },
            },
          },
        }),
      });
      if (!regRes.ok) {
        const errText = await regRes.text();
        this.logger.warn(
          `register-agent failed for ${ir2.agentId}: ${regRes.status} ${errText}`,
        );
      } else {
        const regData = (await regRes.json()) as {
          ok: boolean;
          verified: boolean;
        };
        this.logger.log(
          `register-agent ok: ${ir2.agentId} verified=${regData.verified}`,
        );
      }
    } catch (regErr) {
      // Non-fatal — the deploy still succeeds, but the per-process
      // agent isn't registered. The user gets a clear failure on next
      // run instead of a silent error.
      this.logger.warn(
        `register-agent threw: ${(regErr as Error).message}`,
      );
    }

    // ── Step 5: Register in CatalogItem + TenantCatalogItem
    // The existing Processes settings page filters workflows by
    // tenantCatalogItems. Without these rows the new process is
    // invisible to that UI. Upsert a CatalogItem (platform-wide) and
    // a TenantCatalogItem (enabled for this tenant).
    const catalogSlug = design.slug;
    const catalogItem = await this.prisma.catalogItem.upsert({
      where: { slug: catalogSlug },
      create: {
        type: 'process',
        name: design.name,
        slug: catalogSlug,
        description:
          design.description ?? `Auto-generated via process-builder`,
        icon: '⚙️',
        category: (design.tools?.[0] as string) ?? 'custom',
        requiredTier: 'starter',
        creditCost: 0,
        n8nWorkflowId: n8nWorkflowId ?? undefined,
        isActive: true,
      },
      update: {
        name: design.name,
        description:
          design.description ?? `Auto-generated via process-builder`,
        n8nWorkflowId: n8nWorkflowId ?? undefined,
        isActive: true,
      },
    });

    await this.prisma.tenantCatalogItem.upsert({
      where: {
        tenantId_catalogItemId: {
          tenantId,
          catalogItemId: catalogItem.id,
        },
      },
      create: {
        tenantId,
        catalogItemId: catalogItem.id,
        enabled: true,
        enabledAt: new Date(),
        enabledBy: 'process-builder',
      },
      update: {
        enabled: true,
        enabledAt: new Date(),
      },
    });

    // Log deploy operation for monitoring
    const deployDurationMs = Date.now() - deployStartMs;
    try {
      await this.prisma.vaultOperationLog.create({
        data: {
          id: `vlog_${createId()}`,
          tenantId,
          operationType: 'process_deploy',
          conceptsAffected: 0,
          durationMs: deployDurationMs,
          status: 'completed',
          details: {
            processId: draftId,
            processName: design.name,
            n8nWorkflowId,
            agentId: `proc-${design.slug}`,
            notionDatabaseId: notionResult?.id ?? null,
          },
        },
      });
    } catch {
      // Non-fatal — monitoring should not block deploy
    }

    this.logger.log({
      message: 'Draft deployed',
      draftId,
      n8nWorkflowId,
      notionDatabaseId: notionResult?.id ?? null,
    });

    return {
      draftId,
      n8nWorkflowId,
      notionDatabaseId: notionResult?.id ?? null,
      notionDatabaseUrl: notionResult?.url ?? null,
      invocationConfig: newConfig,
    };
  }

  /**
   * Look up n8n credential IDs for the tools this design uses. n8n
   * stores credentials with the name `cred_<tenantId>_<toolSlug>`.
   * Returns a map toolSlug → { id, name } that the generator uses to
   * reference credentials in nodes.
   *
   * For Phase 3B we only return a symbolic placeholder — the actual
   * credential resolution will use the n8n credentials list API in a
   * follow-up. This keeps the generator pure while the real mapping
   * gets wired in Phase 4.
   */
  private async resolveN8nCredentialIds(
    tenantId: string,
    design: DesignPayload,
  ): Promise<Record<string, { id: string; name: string }>> {
    const map: Record<string, { id: string; name: string }> = {};
    for (const tool of design.tools ?? []) {
      map[tool] = {
        id: `cred_${tenantId}_${tool}`,
        name: `${tool} (${tenantId})`,
      };
    }
    return map;
  }
}
