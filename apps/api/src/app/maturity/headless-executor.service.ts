import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { WorkflowService } from '../workflow/workflow.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { JobPlannerService } from '../agent-execution/job-planner.service';
import { AgentExecutionService } from '../agent-execution/agent-execution.service';
import { OpenClawClientService } from '../agent-execution/openclaw-client.service';
import { BusinessContextService } from '../knowledge/services/business-context.service';
import { MaturityEngineService } from './maturity-engine.service';
import { WsServerHolder } from './ws-server-holder.service';
import { CrossPersonaIntelligenceService } from './cross-persona-intelligence.service';
import { AppEventBus, APP_EVENTS } from '../events/app-event-bus.service';

/**
 * Headless task executor — runs the full auto-popuni pipeline
 * (workflow → synthesis → scoring → jobs → maturity update)
 * WITHOUT requiring a WebSocket client.
 *
 * Broadcasts progress events to tenant room if connected clients exist.
 */
@Injectable()
export class HeadlessExecutorService {
  private readonly logger = new Logger(HeadlessExecutorService.name);
  private readonly jobCompletionTimeoutMs: number;

  constructor(
    private readonly prisma: PlatformPrismaService,
    @Inject(forwardRef(() => WorkflowService))
    private readonly workflowService: WorkflowService,
    private readonly aiGateway: AiGatewayService,
    private readonly jobPlanner: JobPlannerService,
    private readonly agentExecutionService: AgentExecutionService,
    private readonly businessContext: BusinessContextService,
    @Inject(forwardRef(() => MaturityEngineService))
    private readonly maturityEngine: MaturityEngineService,
    private readonly wsHolder: WsServerHolder,
    private readonly crossPersonaIntelligence: CrossPersonaIntelligenceService,
    private readonly openClawClient: OpenClawClientService,
    private readonly appEventBus: AppEventBus,
    private readonly configService: ConfigService,
  ) {
    // Align job completion timeout with OpenClaw execution time + retry budget
    const openclawTimeout = parseInt(
      this.configService.get<string>('OPENCLAW_TIMEOUT_SECONDS') ?? '600', 10,
    );
    // Single OpenClaw call can take up to openclawTimeout + 60s buffer.
    // Add generous margin for network delays and queue wait.
    this.jobCompletionTimeoutMs = (openclawTimeout + 60) * 1000 + 120_000;
    // With defaults: (600 + 60) * 1000 + 120_000 = 780_000ms = 13 min

    // Start stuck job watchdog — checks every 30s for jobs stuck >20 min
    this.startStuckJobWatchdog();
  }

  /**
   * Periodic watchdog: detects stuck EXECUTING/RUNNING jobs and resets them for retry.
   * Jobs get stuck when OpenClaw completes but the response is never received
   * (connection drop, relay crash, timeout).
   *
   * Resets stuck job to PLANNED + cleans up the execution record.
   * The headless executor's executeJobsInOrder/waitForJobCompletion loop will
   * automatically pick up the reset job on its next poll cycle.
   * Max 2 automatic retries per job, then permanently fails.
   */
  private startStuckJobWatchdog(): void {
    const STUCK_THRESHOLD_MS = 20 * 60_000; // 20 minutes (agents with multiple web_search calls need 10-15 min)
    const CHECK_INTERVAL_MS = 30_000; // 30 seconds

    setInterval(async () => {
      try {
        const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);

        // Find stuck executions
        const stuckExecs = await this.prisma.agentExecution.findMany({
          where: {
            status: { in: ['EXECUTING', 'FORMATTING', 'PENDING'] },
            startedAt: { lt: cutoff },
          },
          select: { id: true, agentType: true, startedAt: true, tenantId: true },
        });

        if (stuckExecs.length === 0) return;

        this.logger.warn({
          message: `Watchdog: found ${stuckExecs.length} stuck executions (>20min)`,
          executionIds: stuckExecs.map((e) => e.id),
        });

        for (const exec of stuckExecs) {
          // Find linked job
          const linkedJob = await this.prisma.agentJob.findFirst({
            where: { executionId: exec.id },
            select: { id: true, status: true },
          });

          const stuckDurationMs = Date.now() - new Date(exec.startedAt!).getTime();

          // Emit stuck event — recovery is handled by AppEventHandlers
          this.appEventBus.emit(APP_EVENTS.AGENT_JOB_STUCK, {
            tenantId: exec.tenantId,
            executionId: exec.id,
            jobId: linkedJob?.id,
            agentType: exec.agentType,
            stuckDurationMs,
          });
        }
        // Also check for PLANNED jobs whose dependencies are all done but weren't picked up
        const plannedJobs = await this.prisma.agentJob.findMany({
          where: { status: 'PLANNED' },
          select: { id: true, dependsOn: true, noteId: true, agentType: true, createdAt: true },
        });

        for (const job of plannedJobs) {
          const ageMs = Date.now() - new Date(job.createdAt).getTime();
          if (ageMs < 60_000) continue; // skip if less than 1 min old (still being set up)

          if (job.dependsOn.length === 0) {
            // No dependencies — should have been started already
            this.logger.warn({
              message: 'Watchdog: orphan PLANNED job with no dependencies, triggering',
              jobId: job.id, agentType: job.agentType, ageMin: Math.round(ageMs / 60000),
            });
          } else {
            // Check if all dependencies are terminal
            const deps = await this.prisma.agentJob.findMany({
              where: { id: { in: job.dependsOn } },
              select: { status: true },
            });
            const allTerminal = deps.every((d) => ['COMPLETED', 'FAILED'].includes(d.status));
            if (!allTerminal) continue; // dependencies still running — normal

            this.logger.warn({
              message: 'Watchdog: PLANNED job with all deps done, triggering',
              jobId: job.id, agentType: job.agentType, depStatuses: deps.map((d) => d.status),
            });
          }

          // Find tenant/user from the note
          const note = await this.prisma.note.findUnique({
            where: { id: job.noteId },
            select: { tenantId: true, userId: true },
          });
          if (!note) continue;

          try {
            await this.agentExecutionService.executeJob(job.id, note.userId, note.tenantId);
            this.logger.log({ message: `Watchdog: triggered PLANNED job ${job.id}` });
          } catch (triggerErr) {
            const msg = triggerErr instanceof Error ? triggerErr.message : '';
            if (!msg.includes('concurrent') && !msg.includes('Maximum')) {
              this.logger.warn({
                message: `Watchdog: failed to trigger job ${job.id}`,
                error: msg,
              });
            }
            // concurrent limit hit — will retry on next watchdog cycle
          }
        }
      } catch (err) {
        this.logger.error({
          message: 'Watchdog: error checking stuck jobs',
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }, CHECK_INTERVAL_MS);
  }

  /**
   * Execute a single task through the full pipeline.
   */
  async executeTask(params: {
    taskId: string;
    tenantId: string;
    userId: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { taskId, tenantId, userId } = params;
    let taskNote: { id: string; conceptId: string | null; [key: string]: any } | null = null;

    try {
      // Load task note
      taskNote = await this.prisma.note.findUnique({ where: { id: taskId } });
      if (!taskNote) return { success: false, error: 'Task not found' };

      // If note already completed (e.g., from prior execution before server restart),
      // still call onConceptCompleted to ensure the assignment is marked COMPLETED too.
      if (taskNote.status === 'COMPLETED') {
        if (taskNote.conceptId) {
          try {
            await this.maturityEngine.onConceptCompleted(tenantId, taskNote.conceptId, taskId, userId);
          } catch { /* best-effort */ }
        }
        return { success: true };
      }

      const convId = taskNote.conversationId ?? '';

      this.wsHolder.emitToTenant(tenantId, 'task:ai-start', {
        taskId,
        conversationId: convId,
        timestamp: new Date().toISOString(),
        auto: true,
      });

      // Bridge event: task execution started (activity panel sees it)
      this.appEventBus.emit('bridge.agent.status', {
        tenantId,
        taskId,
        agent: 'maturity',
        status: 'running',
        message: `Executing: ${taskNote.title?.substring(0, 60)}`,
        timestamp: new Date().toISOString(),
      });

      // Pre-load tenant + brain context once for all steps
      const [cachedTenantData, _brainCtx] = await Promise.all([
        this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, industry: true, description: true },
        }),
        this.businessContext.getBusinessContext(tenantId).catch(() => ''),
      ]);

      // Build lean business context for LLM calls
      const bizContext = this.buildLeanBusinessContext(cachedTenantData);

      // ── Phase 1: Build enriched context (prerequisite outputs + cross-persona) ──
      // Replaces workflow step execution — OpenClaw agents handle research via persistent sessions.
      this.wsHolder.emitToTenant(tenantId, 'task:ai-workflow-start', {
        taskId,
        conversationId: convId,
        message: 'Preparing context for execution...',
        auto: true,
      });

      // Load assignment once for both prerequisite loading and cross-persona intelligence
      let conceptAssignment: { stage: string; personaType: string } | null = null;
      if (taskNote.conceptId) {
        try {
          conceptAssignment = await this.prisma.stageConceptAssignment.findFirst({
            where: { tenantId, noteId: taskId },
            select: { stage: true, personaType: true },
          });
        } catch { /* non-blocking — assignment may not exist for ad-hoc tasks */ }
      }

      // Load prerequisite concept outputs
      let prerequisiteContext = '';
      if (taskNote.conceptId && conceptAssignment) {
        try {
          const prereqs = await this.maturityEngine.checkPrerequisites(
            tenantId, taskNote.conceptId, conceptAssignment.stage as any,
          );
          if (prereqs.prerequisiteOutputs.length > 0) {
            prerequisiteContext = '\n\n--- RESULTS FROM PREVIOUSLY COMPLETED CONCEPTS ---';
            for (const po of prereqs.prerequisiteOutputs) {
              prerequisiteContext += `\n### ${po.conceptName}\n${po.outputSummary}`;
            }
            prerequisiteContext += '\n--- END OF PREVIOUS CONTEXT ---';
            prerequisiteContext += '\nUSE these findings as a FOUNDATION — do not repeat them, BUILD UPON them.';
          }
        } catch { /* non-blocking */ }
      }

      this.wsHolder.emitToTenant(tenantId, 'task:ai-step-progress', {
        taskId,
        conversationId: convId,
        stepIndex: 0,
        totalSteps: 1,
        stepTitle: 'Analysis and synthesis with prior knowledge',
        auto: true,
      });

      // ── Phase 2: Pre-check main agent + Build context ──
      let conceptKnowledge = '';
      if (taskNote.conceptId) {
        try {
          const concept = await this.prisma.concept.findUnique({
            where: { id: taskNote.conceptId },
            include: {
              relatedTo: {
                include: { targetConcept: { select: { name: true } } },
                take: 5,
              },
            },
          });
          if (concept) {
            conceptKnowledge = `\n\n--- KNOWLEDGE BASE ---`;
            conceptKnowledge += `\nCONCEPT: ${concept.name} (${concept.category})`;
            conceptKnowledge += `\nDEFINITION: ${concept.definition}`;
            if (concept.extendedDescription) {
              conceptKnowledge += `\nDETAILED: ${concept.extendedDescription}`;
            }
            if (concept.relatedTo.length > 0) {
              const related = concept.relatedTo
                .map((r) => `${r.targetConcept.name} (${r.relationshipType})`)
                .join(', ');
              conceptKnowledge += `\nRELATED CONCEPTS: ${related}`;
            }
            conceptKnowledge += '\n--- END OF KNOWLEDGE BASE ---';
          }
        } catch {
          /* non-blocking */
        }
      }

      // --- Cross-persona intelligence (non-blocking, reuses conceptAssignment) ---
      let crossPersonaContext = '';
      if (taskNote.conceptId && conceptAssignment) {
        try {
          const crossPersona = await this.crossPersonaIntelligence.getRelevantOutputs({
            tenantId,
            conceptId: taskNote.conceptId,
            currentPersonaType: conceptAssignment.personaType,
            stage: conceptAssignment.stage,
          });
          if (crossPersona.outputs.length > 0) {
            crossPersonaContext = crossPersona.promptSection;
          }
        } catch { /* non-blocking enrichment */ }
      }

      // --- Pre-check main agent: what does the business brain already know? ---
      let mainPreCheckContext = '';
      if (this.openClawClient.isConfigured()) {
        try {
          const preCheckResult = await this.executeWithLockRetry(
            () => this.openClawClient.executeAgent(
              `What do you know about the concept "${taskNote!.title}" for the company ${cachedTenantData?.name || 'Unknown'}? Which aspects have already been covered from previous concepts? What needs to be newly researched? Answer briefly, in 200-300 words.`,
              { agentId: 'main', tenantProfile: tenantId, timeoutSeconds: 60 }
            ),
            'pre-check-main',
          );
          if (preCheckResult.success && preCheckResult.output.length > 50) {
            mainPreCheckContext = preCheckResult.output;
            this.logger.log({
              message: 'Headless: main pre-check completed',
              taskId,
              preCheckLength: mainPreCheckContext.length,
            });
          }
        } catch {
          this.logger.warn({ message: 'Headless: main pre-check failed (non-blocking)', taskId });
        }
      }

      // Store pre-check context for later use by agent prompts
      if (mainPreCheckContext) {
        await this.prisma.note.update({
          where: { id: taskId },
          data: {
            agentEnrichments: {
              ...(taskNote.agentEnrichments as Record<string, unknown> || {}),
              mainPreCheck: mainPreCheckContext,
            },
          },
        });
      }

      const prompt = `You are a top-tier business expert. Create a DRAFT analysis that will be enriched by AI agent research.

TASK: ${taskNote.title}
${taskNote.content ? `TASK DESCRIPTION: ${taskNote.content}` : ''}
${taskNote.expectedOutcome ? `EXPECTED OUTCOME: ${taskNote.expectedOutcome}` : ''}
${prerequisiteContext}${crossPersonaContext}${conceptKnowledge}
${mainPreCheckContext ? `\n--- WHAT IS ALREADY KNOWN (from the business brain) ---\n${mainPreCheckContext}\n--- END OF KNOWN ---` : ''}

CRITICAL — GROUNDING ON CONCEPT:
- Your task is EXCLUSIVELY to analyze the concept listed in the KNOWLEDGE BASE above.
- EVERY part of the document MUST be directly tied to that concept and its definition.
- NEVER invent concepts, terms, or data that do not exist in the knowledge base or sources.
- If you don't know something — write "[NEEDS RESEARCH]" instead of fabricating.
- DO NOT expand to topics not directly related to the assigned concept.

THIS IS A DRAFT — it will be enriched by agent research:
1. Structure the analysis with ## headings, tables
2. Identify KEY TOPICS for research — mark them with "[RESEARCH]"
3. Use data from previous concepts and known context
4. 300-800 words — focus on structure and analysis, not length
5. Respond EXCLUSIVELY in English
6. Format: Markdown (## headings, tables, **bold**, > for sources)`;

      this.logger.log({
        message: 'Headless: synthesizing with enriched context',
        taskId,
        hasPrereqs: prerequisiteContext.length > 0,
        hasCrossPersona: crossPersonaContext.length > 0,
        hasConceptKnowledge: conceptKnowledge.length > 0,
      });

      let fullContent = '';
      await this.aiGateway.streamCompletionWithContext(
        [{ role: 'user', content: prompt }],
        { tenantId, userId, conversationId: convId, businessContext: bizContext },
        (chunk: string) => {
          fullContent += chunk;
        }
      );

      this.wsHolder.emitToTenant(tenantId, 'task:ai-step-complete', {
        taskId,
        conversationId: convId,
        stepIndex: 0,
        totalSteps: 1,
        stepTitle: 'Analysis and synthesis with prior knowledge',
        auto: true,
      });

      // Save synthesis result
      await this.prisma.note.update({
        where: { id: taskId },
        data: { status: 'COMPLETED', userReport: fullContent },
      });

      this.wsHolder.emitToTenant(tenantId, 'task:ai-complete', {
        taskId,
        fullContent,
        conversationId: convId,
        auto: true,
      });

      // ── Phase 3: Skip scoring rewrite — scoring happens AFTER consolidation ──
      // The draft is sufficient for job planning. Final scoring happens after agents enrich it.
      // Save draft as initial userReport (will be replaced by consolidation later).

      this.wsHolder.emitToTenant(tenantId, 'task:result-complete', {
        taskId,
        conversationId: convId,
        score: null, // Scoring happens after consolidation
        finalResult: fullContent,
        timestamp: new Date().toISOString(),
        auto: true,
      });

      // ── Post-scoring hooks ──

      // Job planning + execution (MUST complete before continuing)
      const jobs = await this.jobPlanner.planJobs(taskId, tenantId, userId);
      if (jobs.length > 0) {
        this.wsHolder.emitToTenant(tenantId, 'jobs:planned', {
          noteId: taskId,
          conversationId: convId,
          jobs,
        });

        await this.executeJobsInOrder(jobs, userId, tenantId);

        // Verify all jobs reached terminal state before continuing
        const pendingJobs = await this.prisma.agentJob.count({
          where: { noteId: taskId, tenantId, status: { in: ['PLANNED', 'RUNNING'] } },
        });
        if (pendingJobs > 0) {
          this.logger.warn({
            message: `Headless: ${pendingJobs} jobs still pending after executeJobsInOrder — marking task as incomplete`,
            taskId,
          });
          throw new Error(`${pendingJobs} agent jobs did not complete`);
        }
      }

      // ── Final consolidation + scoring (single step, replaces 3 separate rewrites) ──
      // Merges draft synthesis + ALL agent findings into one final document with scores.
      // NO truncation — all agent outputs included in full.
      let completedJobs: Array<{ agentType: string; agentOutput: string | null; order: number }> | null = null;
      try {
        completedJobs = await this.prisma.agentJob.findMany({
          where: { noteId: taskId, tenantId, status: 'COMPLETED' },
          select: { agentType: true, agentOutput: true, order: true },
          orderBy: { order: 'asc' },
        });

        const currentNote = await this.prisma.note.findUnique({
          where: { id: taskId },
          select: { userReport: true, title: true },
        });

        // Summarize each agent's output to preserve key findings without context overflow
        const SUMMARY_THRESHOLD = 3000; // Only summarize if output exceeds this
        const agentParts: string[] = [];

        for (const job of completedJobs.filter((j) => j.agentOutput)) {
          const output = job.agentOutput!;
          if (output.length <= SUMMARY_THRESHOLD) {
            agentParts.push(`### ${job.agentType.toUpperCase()} research\n${output}`);
          } else {
            // Summarize long outputs via LLM to preserve key findings
            try {
              let summary = '';
              await this.aiGateway.streamCompletionWithContext(
                [{ role: 'user', content: `Sumiraj KLJUCNE NALAZE iz ovog istrazivanja u 800-1200 reci. Zadrzi sve konkretne podatke, brojke, izvore (URL-ove) i preporuke. KRITICNO: Zadrzi SVE slike u formatu ![opis](url) — ne brisaj ih i ne menjaj URL-ove. NE gubi nijednu konkretnu cinjenicu.\n\n${output}` }],
                { tenantId, userId, conversationId: convId, businessContext: bizContext, useFallback: true },
                (chunk: string) => { summary += chunk; },
              );
              agentParts.push(`### ${job.agentType.toUpperCase()} research (summarized)\n${summary}`);
              this.logger.log({ message: `Headless: summarized ${job.agentType} output`, taskId, original: output.length, summarized: summary.length });
            } catch {
              // Fallback to first 3000 chars if summarization fails
              agentParts.push(`### ${job.agentType.toUpperCase()} research\n${output.substring(0, SUMMARY_THRESHOLD)}`);
            }
          }
        }

        const agentFindings = agentParts.join('\n\n');

        let tenantInfo = '';
        if (cachedTenantData) {
          tenantInfo = `COMPANY: ${cachedTenantData.name}${cachedTenantData.industry ? ` | INDUSTRY: ${cachedTenantData.industry}` : ''}`;
        }

        const consolidationPrompt = `You are a senior business expert. Create the FINAL document and SCORE it.

${tenantInfo}
CONCEPT: ${currentNote?.title ?? taskNote.title}

1. DRAFT ANALYSIS:
${currentNote?.userReport ?? fullContent}

${agentFindings.length > 0 ? `2. AGENT RESEARCH RESULTS:\n${agentFindings}` : '(No agent research results)'}

TASK — TWO THINGS:

A) CREATE AN OUTSTANDING FINAL DOCUMENT (4000-5000 words) that:

STRUCTURE AND FORMATTING:
- Use a clear hierarchy: # title, ## sections, ### subsections
- Each section must have tables with concrete data, numbers, metrics
- Use **bold** for key values, numbers, and conclusions
- Use > blockquote for key insights and recommendations
- Use bullet lists for action items
- Use horizontal rules (---) to separate major sections

CONTENT AND QUALITY:
- Integrate ALL findings from the draft and ALL agent research — do not skip any finding
- Prioritize CONCRETE data with sources over generic analyses
- Every data point, benchmark, or statistic MUST have a source: ([Name](URL))
- Include detailed tables with comparative analyses, metrics, benchmarks
- For each recommendation provide a CONCRETE action plan with responsible person/team and deadline
- Include a "Financial Impact" section with concrete projections
- Include a "Risks and Mitigation" section with a risk table
- Include a "KPIs and Success Measurement" section with concrete target values
- Include a "Next Steps" section with a time frame (week/month)
- Include a "Sources" section at the end with all used URLs

IMAGES:
- MUST PRESERVE ALL images (![description](url)) from agent findings
- Copy them EXACTLY as they are — do not change URLs
- Place them in appropriate locations in the document where they are contextually relevant

RULES:
- Write in English
- NEVER fabricate data — if data is unavailable, make a reasonable estimate and state the assumption
- NEVER write "[NEEDS RESEARCH]" or "[NEEDS FURTHER RESEARCH]" — all data has already been researched
- DO NOT repeat the same information from different agents — synthesize them into a single conclusion
- Document must be PROFESSIONAL, ready for presentation to C-level executives
- 4000-5000 words — be thorough, detailed, and comprehensive
- NEVER write programming code (JavaScript, Python, etc.) — only text, tables, and markdown
- For images use EXCLUSIVELY markdown format: ![image description](url) — NEVER write fal-generate commands or code
- NEVER write FAL_IMAGE_SIZE, fal-generate, require("fal-ai") or any image generation code

B) AT THE END OF THE DOCUMENT SCORE by 5 criteria (each 1-10):
---
EVALUACIJA:
- Primenljivost: X/10
- Specificnost: X/10
- Kompletnost: X/10
- Relevantnost: X/10
- Kvalitet: X/10
OCENA: X/10
---

Respond EXCLUSIVELY in English.`;

        let consolidated = '';
        await this.aiGateway.streamCompletionWithContext(
          [{ role: 'user', content: consolidationPrompt }],
          { tenantId, userId, conversationId: convId, businessContext: bizContext, useFallback: true },
          (chunk: string) => { consolidated += chunk; },
        );

        // Extract score from consolidated output
        let score: number | null = null;
        const scoreMatch = consolidated.match(/OCENA:\s*(\d{1,2})\s*\/\s*10/i);
        if (scoreMatch) {
          const rawScore = parseInt(scoreMatch[1]!, 10);
          if (rawScore >= 1 && rawScore <= 10) {
            score = rawScore * 10;
          }
        }

        if (consolidated.length > 300) {
          // Restore images lost during consolidation (supports http URLs, data: URLs, and any other URL scheme)
          const imgRegex = /!\[[^\]]*\]\([^)]+\)/g;
          const originalImages = agentFindings.match(imgRegex) ?? [];
          const consolidatedImages = consolidated.match(imgRegex) ?? [];
          if (originalImages.length > consolidatedImages.length) {
            const missingImages = originalImages.filter(
              (img) => !consolidatedImages.some((ci) => ci === img),
            );
            if (missingImages.length > 0) {
              consolidated += '\n\n---\n## Vizuali\n' + missingImages.join('\n\n');
              this.logger.warn({ message: 'Headless: restored lost images', taskId, restored: missingImages.length });
            }
          }

          await this.prisma.note.update({
            where: { id: taskId },
            data: {
              userReport: consolidated,
              aiScore: score,
              aiFeedback: score !== null ? `AI ocena: ${score}/100` : null,
            },
          });

          this.logger.log({
            message: 'Headless: consolidated + scored',
            taskId,
            agentJobCount: completedJobs.length,
            consolidatedLength: consolidated.length,
            aiScore: score,
            images: consolidatedImages.length,
          });
        }
      } catch (consolidationErr) {
        this.logger.warn({
          message: 'Headless: consolidation+scoring failed (non-blocking, draft preserved)',
          taskId,
          error: consolidationErr instanceof Error ? consolidationErr.message : 'Unknown',
        });
      }

      // ── Knowledge Update: Send findings to domain masters + main ──
      // Fire-and-forget: runs in background so it doesn't block the next wave.
      // Uses default sessions (no session-id) for persistent memory.
      // Stagger delay prevents lock contention when parallel tasks complete simultaneously.
      // Emit knowledge update event (handled async by AppEventHandlers, non-blocking)
      try {
        const finalNote = await this.prisma.note.findUnique({
          where: { id: taskId },
          select: { userReport: true, title: true },
        });
        if (finalNote?.userReport && finalNote.userReport.length > 200) {
          const jobTypes = completedJobs
            ? [...new Set(completedJobs.map((j) => j.agentType))]
            : [];
          const assignment = await this.prisma.stageConceptAssignment.findFirst({
            where: { noteId: taskId, tenantId },
            select: { personaType: true },
          });
          this.appEventBus.emit(APP_EVENTS.KNOWLEDGE_UPDATE_NEEDED, {
            tenantId,
            conceptName: finalNote.title || 'Unknown',
            agentTypes: jobTypes,
            summary: finalNote.userReport.substring(0, 5000),
            companyName: cachedTenantData?.name || 'Unknown Company',
            personaType: assignment?.personaType,
          });
        }
      } catch { /* non-blocking */ }

      // Maturity update (non-blocking)
      try {
        if (taskNote.conceptId) {
          const result = await this.maturityEngine.onConceptCompleted(
            tenantId,
            taskNote.conceptId,
            taskId,
            userId
          );
          if (result.stageCompleted) {
            this.wsHolder.emitToTenant(tenantId, 'maturity:stage-completed', {
              stage: result.nextStage,
            });
          }
        }
      } catch (maturityErr) {
        this.logger.warn({
          message: 'Headless: maturity update failed (non-blocking)',
          taskId,
          error: maturityErr instanceof Error ? maturityErr.message : 'Unknown',
        });
      }

      // Emit concept.completed event (fire-and-forget, non-blocking)
      if (taskNote.conceptId) {
        this.appEventBus.emit(APP_EVENTS.CONCEPT_COMPLETED, {
          tenantId,
          conceptId: taskNote.conceptId,
          noteId: taskId,
          userId,
          stage: conceptAssignment?.stage ?? 'UNKNOWN',
          personaType: conceptAssignment?.personaType ?? 'UNKNOWN',
          success: true,
        });

        // Bridge events: task complete + tree update (so frontend activity/tree/graph update)
        const noteScore = await this.prisma.note.findUnique({
          where: { id: taskId },
          select: { aiScore: true },
        });
        this.appEventBus.emit('bridge.task.complete', {
          tenantId,
          noteId: taskId,
          score: noteScore?.aiScore ?? null,
        });
        this.appEventBus.emit('bridge.tree.updated', {
          tenantId,
          action: 'concept-completed',
          conceptId: taskNote.conceptId,
          conceptName: taskNote.title,
        });
      }

      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error({
        message: 'Headless: task execution failed',
        taskId,
        error: errorMsg,
      });

      // Emit concept.failed event (fire-and-forget, non-blocking)
      if (taskNote?.conceptId) {
        this.appEventBus.emit(APP_EVENTS.CONCEPT_FAILED, {
          tenantId,
          conceptId: taskNote.conceptId,
          noteId: taskId,
          userId,
          stage: 'UNKNOWN',
          personaType: 'UNKNOWN',
          success: false,
          error: errorMsg,
        });
      }

      return { success: false, error: errorMsg };
    }
  }

  /**
   * Execute a batch of tasks sequentially.
   */
  async executeBatch(params: {
    tasks: Array<{ id: string; conceptId: string | null }>;
    tenantId: string;
    userId: string;
    runType: string;
  }): Promise<{ completed: number; failed: number; total: number }> {
    const { tasks, tenantId, userId, runType } = params;
    let completed = 0;
    let failed = 0;

    this.logger.log({
      message: `Headless batch: starting ${runType}`,
      tenantId,
      taskCount: tasks.length,
    });

    for (const task of tasks) {
      const result = await this.executeTask({ taskId: task.id, tenantId, userId });
      if (result.success) {
        completed++;
      } else {
        failed++;
        this.logger.warn({
          message: 'Headless batch: task failed',
          taskId: task.id,
          error: result.error,
        });
      }
    }

    this.logger.log({
      message: `Headless batch: ${runType} finished`,
      tenantId,
      completed,
      failed,
      total: tasks.length,
    });

    return { completed, failed, total: tasks.length };
  }

  /**
   * Execute PLANNED agent jobs respecting dependency order.
   * Waits for each job to finish before starting dependents.
   */
  private async executeJobsInOrder(
    jobs: Array<{ id: string; dependsOn: string[] }>,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const finished = new Set<string>(); // both completed and failed
    const failed = new Set<string>();
    const jobMap = new Map(jobs.map((j) => [j.id, j]));
    let remaining = [...jobs];

    while (remaining.length > 0) {
      const ready = remaining.filter((j) =>
        j.dependsOn.every((dep) => finished.has(dep) || !jobMap.has(dep)),
      );

      if (ready.length === 0) {
        this.logger.warn({
          message: 'Headless: no ready jobs, breaking (unmet dependencies)',
          remaining: remaining.map((j) => j.id),
        });
        break;
      }

      for (const job of ready) {
        // Skip if all dependencies failed — no point executing
        const allDepsFailed = job.dependsOn.length > 0 &&
          job.dependsOn.filter((dep) => jobMap.has(dep)).every((dep) => failed.has(dep));
        if (allDepsFailed) {
          this.logger.warn({
            message: 'Headless: skipping job — all dependencies failed',
            jobId: job.id,
            failedDeps: job.dependsOn.filter((dep) => failed.has(dep)),
          });
          finished.add(job.id);
          failed.add(job.id);
          continue;
        }

        const MAX_JOB_RETRIES = 1; // 1 extra attempt on transient failure
        let jobSucceeded = false;

        for (let jobAttempt = 0; jobAttempt <= MAX_JOB_RETRIES; jobAttempt++) {
          try {
            // Retry with backoff if concurrency limit is hit (MAX_CONCURRENT_PER_TENANT = 5)
            const MAX_CONCURRENCY_RETRIES = 60; // 60 × 5s = 5 min max wait for a slot
            let started = false;
            for (let attempt = 0; attempt < MAX_CONCURRENCY_RETRIES; attempt++) {
              try {
                await this.agentExecutionService.executeJob(job.id, userId, tenantId);
                started = true;
                break;
              } catch (concErr) {
                const msg = concErr instanceof Error ? concErr.message : '';
                if (msg.includes('concurrent') || msg.includes('Maximum')) {
                  if (attempt % 10 === 0) {
                    this.logger.log({
                      message: 'Headless: waiting for agent slot',
                      jobId: job.id, attempt, maxAttempts: MAX_CONCURRENCY_RETRIES,
                    });
                  }
                  await new Promise((r) => setTimeout(r, 5_000));
                  continue;
                }
                throw concErr; // non-concurrency error — propagate
              }
            }

            if (!started) {
              throw new Error('Timed out waiting for agent concurrency slot');
            }

            // Verify the job was actually started before polling
            const jobRecord = await this.prisma.agentJob.findFirst({
              where: { id: job.id, tenantId },
              select: { status: true },
            });

            if (jobRecord && jobRecord.status !== 'PLANNED') {
              await this.waitForJobCompletion(job.id, tenantId);
            }

            // Check final job status — auto-retry on transient failure
            const finalJob = await this.prisma.agentJob.findFirst({
              where: { id: job.id, tenantId },
              select: { status: true, error: true },
            });

            if (finalJob?.status === 'FAILED' && jobAttempt < MAX_JOB_RETRIES &&
                this.openClawClient.isRetryableError(finalJob.error)) {
              this.logger.warn({
                message: `Headless: transient job failure, retrying (${jobAttempt + 1}/${MAX_JOB_RETRIES})`,
                jobId: job.id, error: finalJob.error?.substring(0, 100),
              });
              // Reset job to PLANNED for retry
              await this.prisma.agentJob.update({
                where: { id: job.id },
                data: { status: 'PLANNED', executionId: null, error: null },
              });
              await new Promise((r) => setTimeout(r, 10_000)); // 10s cooldown
              continue; // retry the job
            }

            jobSucceeded = finalJob?.status === 'COMPLETED';
            break; // exit retry loop (either success or non-retryable failure)
          } catch (err) {
            if (jobAttempt < MAX_JOB_RETRIES && this.openClawClient.isRetryableError(
              err instanceof Error ? err.message : String(err)
            )) {
              this.logger.warn({
                message: `Headless: job execution error, retrying (${jobAttempt + 1}/${MAX_JOB_RETRIES})`,
                jobId: job.id, error: err instanceof Error ? err.message : 'Unknown',
              });
              await new Promise((r) => setTimeout(r, 10_000));
              continue;
            }
            this.logger.error({
              message: 'Headless: agent job execution failed',
              jobId: job.id,
              error: err instanceof Error ? err.message : 'Unknown',
            });
            break; // non-retryable error
          }
        }

        finished.add(job.id);
        if (jobSucceeded) {
          this.logger.log({
            message: 'Headless: agent job completed',
            jobId: job.id,
          });
        } else {
          failed.add(job.id);
        }
      }

      remaining = remaining.filter((j) => !finished.has(j.id));
    }

    if (failed.size > 0) {
      this.logger.warn({
        message: `Headless: ${failed.size}/${jobs.length} agent jobs failed`,
        failedJobIds: [...failed],
      });
    }
  }

  /** Poll DB until agent job reaches terminal status */
  private async waitForJobCompletion(
    jobId: string,
    tenantId: string,
    timeoutMs?: number,
  ): Promise<void> {
    const effectiveTimeout = timeoutMs ?? this.jobCompletionTimeoutMs;
    const start = Date.now();
    const pollInterval = 3_000; // 3 seconds

    while (Date.now() - start < effectiveTimeout) {
      const job = await this.prisma.agentJob.findFirst({
        where: { id: jobId, tenantId },
        select: { status: true, executionId: true },
      });

      if (!job || job.status === 'COMPLETED' || job.status === 'FAILED') {
        return;
      }

      await new Promise((r) => setTimeout(r, pollInterval));
    }

    // Timeout: mark job + execution as FAILED to release concurrency slot
    this.logger.warn({
      message: 'Headless: agent job timed out — marking FAILED',
      jobId,
      timeoutMs: effectiveTimeout,
    });

    try {
      const job = await this.prisma.agentJob.findFirst({
        where: { id: jobId, tenantId },
        select: { status: true, executionId: true },
      });

      if (job && !['COMPLETED', 'FAILED'].includes(job.status)) {
        await this.prisma.agentJob.update({
          where: { id: jobId },
          data: { status: 'FAILED', error: `Timed out after ${effectiveTimeout / 1000}s` },
        });

        if (job.executionId) {
          await this.prisma.agentExecution.update({
            where: { id: job.executionId },
            data: { status: 'FAILED', error: `Timed out after ${effectiveTimeout / 1000}s` },
          });
        }
      }
    } catch (cleanupErr) {
      this.logger.error({
        message: 'Headless: failed to mark timed-out job',
        jobId,
        error: cleanupErr instanceof Error ? cleanupErr.message : 'Unknown',
      });
    }
  }

  /**
   * Knowledge updates are now handled by AppEventBus KNOWLEDGE_UPDATE_NEEDED event.
   * See event-handlers.service.ts handleKnowledgeUpdate().
   */

  /**
   * Execute an async operation with retry on session lock errors.
   * Retries up to 5 times with 10s delay between attempts.
   */
  private async executeWithLockRetry<T>(
    fn: () => Promise<T>,
    label: string,
    maxRetries = 5,
    delayMs = 10_000,
  ): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isLock = msg.includes('session file locked') || msg.includes('.lock') || msg.includes('EBUSY') || msg.includes('session locked');
        if (isLock && attempt < maxRetries) {
          this.logger.warn({
            message: `Lock retry ${attempt + 1}/${maxRetries}: ${label}`,
            error: msg.slice(0, 100),
          });
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Lock retry exhausted for ${label}`);
  }

  private buildLeanBusinessContext(
    tenant: { name: string; industry: string | null; description: string | null } | null
  ): string {
    if (!tenant) return '';
    let ctx = `Kompanija: ${tenant.name}`;
    if (tenant.industry) ctx += ` | Industrija: ${tenant.industry}`;
    if (tenant.description) ctx += `\n${tenant.description}`;
    return ctx;
  }
}
