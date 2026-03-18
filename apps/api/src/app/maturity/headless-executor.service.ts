import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
// NoteSource, NoteType, NoteStatus removed — no longer used after workflow step removal
import { WorkflowService } from '../workflow/workflow.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { JobPlannerService } from '../agent-execution/job-planner.service';
import { AgentExecutionService } from '../agent-execution/agent-execution.service';
import { OpenClawClientService } from '../agent-execution/openclaw-client.service';
import { BusinessContextService } from '../knowledge/services/business-context.service';
import { MaturityEngineService } from './maturity-engine.service';
import { WsServerHolder } from './ws-server-holder.service';
import { CrossPersonaIntelligenceService } from './cross-persona-intelligence.service';

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

    // Start stuck job watchdog — checks every 30s for jobs stuck >10 min
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
  private stuckRetryCount = new Map<string, number>();

  private startStuckJobWatchdog(): void {
    const STUCK_THRESHOLD_MS = 20 * 60_000; // 20 minutes (agents with multiple web_search calls need 10-15 min)
    const CHECK_INTERVAL_MS = 30_000; // 30 seconds
    const MAX_AUTO_RETRIES = 2;

    setInterval(async () => {
      try {
        const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);

        // Find stuck executions
        const stuckExecs = await this.prisma.agentExecution.findMany({
          where: {
            status: { in: ['EXECUTING', 'FORMATTING', 'PENDING'] },
            startedAt: { lt: cutoff },
          },
          select: { id: true, agentType: true, startedAt: true },
        });

        if (stuckExecs.length === 0) return;

        this.logger.warn({
          message: `Watchdog: found ${stuckExecs.length} stuck executions (>10min)`,
          executionIds: stuckExecs.map((e) => e.id),
        });

        for (const exec of stuckExecs) {
          // Find linked job
          const linkedJob = await this.prisma.agentJob.findFirst({
            where: { executionId: exec.id },
            select: { id: true, status: true },
          });

          const jobId = linkedJob?.id ?? exec.id;
          const retries = this.stuckRetryCount.get(jobId) ?? 0;

          // Force-fail the execution to release concurrency slot
          await this.prisma.agentExecution.update({
            where: { id: exec.id },
            data: {
              status: 'FAILED',
              error: `Watchdog: stuck >10min (retry ${retries + 1}/${MAX_AUTO_RETRIES})`,
              completedAt: new Date(),
            },
          });

          if (linkedJob && ['RUNNING', 'PENDING'].includes(linkedJob.status)) {
            if (retries < MAX_AUTO_RETRIES) {
              // Reset job to PLANNED for automatic retry
              await this.prisma.agentJob.update({
                where: { id: linkedJob.id },
                data: { status: 'PLANNED', executionId: null, error: null },
              });
              this.stuckRetryCount.set(jobId, retries + 1);
              this.logger.log({
                message: `Watchdog: reset job to PLANNED for retry`,
                jobId: linkedJob.id,
                attempt: retries + 1,
                maxRetries: MAX_AUTO_RETRIES,
              });
            } else {
              // Exceeded retries — permanently fail
              await this.prisma.agentJob.update({
                where: { id: linkedJob.id },
                data: { status: 'FAILED', error: `Watchdog: exceeded ${MAX_AUTO_RETRIES} auto-retries` },
              });
              this.stuckRetryCount.delete(jobId);
              this.logger.warn({
                message: `Watchdog: job permanently failed after ${MAX_AUTO_RETRIES} retries`,
                jobId: linkedJob.id,
              });
            }
          }
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

    try {
      // Load task note
      const taskNote = await this.prisma.note.findUnique({ where: { id: taskId } });
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

      // Pre-load tenant + brain context once for all steps
      const [cachedTenantData, brainCtx] = await Promise.all([
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
        message: 'Pripremam kontekst za izvršavanje...',
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
            prerequisiteContext = '\n\n--- REZULTATI PRETHODNO ZAVRSENIH KONCEPATA ---';
            for (const po of prereqs.prerequisiteOutputs) {
              prerequisiteContext += `\n### ${po.conceptName}\n${po.outputSummary}`;
            }
            prerequisiteContext += '\n--- KRAJ PRETHODNOG KONTEKSTA ---';
            prerequisiteContext += '\nKORISTI ove nalaze kao TEMELJ — ne ponavljaj ih, NADOGRADI na njima.';
          }
        } catch { /* non-blocking */ }
      }

      this.wsHolder.emitToTenant(tenantId, 'task:ai-step-progress', {
        taskId,
        conversationId: convId,
        stepIndex: 0,
        totalSteps: 1,
        stepTitle: 'Analiza i sinteza sa prethodnim znanjem',
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
            conceptKnowledge = `\n\n--- BAZA ZNANJA ---`;
            conceptKnowledge += `\nKONCEPT: ${concept.name} (${concept.category})`;
            conceptKnowledge += `\nDEFINICIJA: ${concept.definition}`;
            if (concept.extendedDescription) {
              conceptKnowledge += `\nDETALJNO: ${concept.extendedDescription}`;
            }
            if (concept.relatedTo.length > 0) {
              const related = concept.relatedTo
                .map((r) => `${r.targetConcept.name} (${r.relationshipType})`)
                .join(', ');
              conceptKnowledge += `\nPOVEZANI KONCEPTI: ${related}`;
            }
            conceptKnowledge += '\n--- KRAJ BAZE ZNANJA ---';
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
          const preCheckResult = await this.openClawClient.executeAgent(
            `Šta znaš o konceptu "${taskNote.title}" za kompaniju ${cachedTenantData?.name || 'Unknown'}? Koji aspekti su već pokriveni iz prethodnih koncepata? Šta treba NOVO istražiti? Odgovori kratko, u 200-300 reči.`,
            { agentId: 'main', timeoutSeconds: 60 }
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

      const prompt = `Ti si vrhunski poslovni stručnjak. Napravi NACRT analize koji će biti obogaćen istraživanjem AI agenata.

ZADATAK: ${taskNote.title}
${taskNote.content ? `OPIS ZADATKA: ${taskNote.content}` : ''}
${taskNote.expectedOutcome ? `OČEKIVANI REZULTAT: ${taskNote.expectedOutcome}` : ''}
${prerequisiteContext}${crossPersonaContext}${conceptKnowledge}
${mainPreCheckContext ? `\n--- ŠTA JE VEĆ POZNATO (iz poslovnog mozga) ---\n${mainPreCheckContext}\n--- KRAJ POZNATOG ---` : ''}

KRITIČNO — UZEMLJENJE NA KONCEPT:
- Tvoj zadatak je ISKLJUČIVO analiza koncepta navedenog u BAZI ZNANJA iznad.
- SVAKI deo dokumenta MORA biti direktno vezan za taj koncept i njegovu definiciju.
- NIKADA ne izmišljaj koncepte, termine ili podatke koji ne postoje u bazi znanja ili izvorima.
- Ako nešto ne znaš — napiši "[POTREBNO ISTRAŽITI]" umesto da izmišljaš.
- NE širi se na teme koje nisu direktno povezane sa zadatim konceptom.

OVO JE NACRT — biće obogaćen istraživanjem agenata:
1. Strukturiraj analizu sa ## zaglavljima, tabelama
2. Identifikuj KLJUČNE TEME za istraživanje — označi ih sa "[ISTRAŽITI]"
3. Koristi podatke iz prethodnih koncepata i poznatog konteksta
4. 300-800 reči — fokusiraj se na strukturu i analizu, ne na dužinu
5. Odgovaraj ISKLJUČIVO na srpskom jeziku
6. Format: Markdown (## zaglavlja, tabele, **bold**, > za izvore)`;

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
        stepTitle: 'Analiza i sinteza sa prethodnim znanjem',
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

      // Job planning + execution
      try {
        const jobs = await this.jobPlanner.planJobs(taskId, tenantId, userId);
        if (jobs.length > 0) {
          this.wsHolder.emitToTenant(tenantId, 'jobs:planned', {
            noteId: taskId,
            conversationId: convId,
            jobs,
          });

          await this.executeJobsInOrder(jobs, userId, tenantId);
        }
      } catch (jobErr) {
        this.logger.error({
          message: 'Headless: job planning/execution failed',
          taskId,
          error: jobErr instanceof Error ? jobErr.message : 'Unknown',
        });
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

        // Build agent findings WITHOUT truncation — include ALL output
        const agentFindings = completedJobs
          .filter((j) => j.agentOutput)
          .map((j) => `### ${j.agentType.toUpperCase()} istraživanje\n${j.agentOutput}`)
          .join('\n\n');

        let tenantInfo = '';
        if (cachedTenantData) {
          tenantInfo = `KOMPANIJA: ${cachedTenantData.name}${cachedTenantData.industry ? ` | INDUSTRIJA: ${cachedTenantData.industry}` : ''}`;
        }

        const consolidationPrompt = `Ti si senior poslovni stručnjak. Napravi FINALNI dokument i OCENI ga.

${tenantInfo}
KONCEPT: ${currentNote?.title ?? taskNote.title}

1. NACRT ANALIZE:
${currentNote?.userReport ?? fullContent}

${agentFindings.length > 0 ? `2. REZULTATI ISTRAŽIVANJA AGENATA:\n${agentFindings}` : '(Nema rezultata istraživanja agenata)'}

ZADATAK — DVE STVARI:

A) NAPRAVI FINALNI DOKUMENT koji:
- Integriše SVE nalaze iz nacrta i agentskog istraživanja
- Daje prednost KONKRETNIM podacima sa izvorima nad generičkim analizama
- Strukturiraj: ## zaglavlja, tabele, **bold** za ključne vrednosti
- Uključi sekciju "Izvori" sa URL-ovima iz istraživanja
- NE ponavljaj iste informacije — konsoliduj ih
- Proporcionalna dužina: jednostavni koncepti 300-500 reči, strateški 800-1500, kompleksni 1500+
- Dodaj sekciju "Sledeći koraci" sa konkretnim akcijama
- NIKADA ne izmišljaj podatke — ako nešto nije istraženo, napiši "[POTREBNO ISTRAŽITI]"

B) NA KRAJU DOKUMENTA OCENI po 5 kriterijuma (svaki 1-10):
---
EVALUACIJA:
- Primenljivost: X/10
- Specifičnost: X/10
- Kompletnost: X/10
- Relevantnost: X/10
- Kvalitet: X/10
OCENA: X/10
---

Odgovaraj ISKLJUČIVO na srpskom jeziku.`;

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
      // After consolidation, update domain master agents so they accumulate knowledge.
      // Uses default sessions (no session-id) for persistent memory.
      // Stagger delay prevents lock contention when parallel tasks complete simultaneously.
      try {
        const finalNote = await this.prisma.note.findUnique({
          where: { id: taskId },
          select: { userReport: true, title: true, conceptId: true },
        });

        if (finalNote?.userReport && finalNote.userReport.length > 200) {
          // Reuse completedJobs from consolidation above (already fetched at line ~388)
          // If consolidation was skipped, fetch fresh
          const jobsForKnowledge = completedJobs ?? await this.prisma.agentJob.findMany({
            where: { noteId: taskId, tenantId, status: 'COMPLETED' },
            select: { agentType: true, agentOutput: true, order: true },
            orderBy: { order: 'asc' },
          });
          const agentTypes = [...new Set(jobsForKnowledge.map((j) => j.agentType))];

          const knowledgeSummary = finalNote.userReport.substring(0, 5000);
          const conceptName = finalNote.title || 'Unknown';
          const companyName = cachedTenantData?.name || 'Unknown Company';

          // Stagger: random 0-10s delay to spread out parallel task completions
          await new Promise((r) => setTimeout(r, Math.random() * 10_000));

          // Update domain masters (sequential — one at a time per agent type)
          for (const agentTypeStr of agentTypes) {
            try {
              const agentId = agentTypeStr.replace(/_/g, '-');
              await this.openClawClient.executeAgent(
                `KNOWLEDGE UPDATE za ${companyName} - Koncept: ${conceptName}. Zapamti ove nalaze za buduce istrazivanje i analizu. Ovo su FINALNI, KONSOLIDOVANI rezultati:\n\n${knowledgeSummary}`,
                { agentId, timeoutSeconds: 180 }
              );
              this.logger.log({
                message: `Headless: knowledge update sent to ${agentTypeStr} master`,
                taskId,
                conceptName,
              });
            } catch (kuErr) {
              this.logger.warn({
                message: `Headless: knowledge update to ${agentTypeStr} failed (non-blocking)`,
                taskId,
                error: kuErr instanceof Error ? kuErr.message : 'Unknown',
              });
            }
          }

          // Update main agent (business brain)
          try {
            const assignment = await this.prisma.stageConceptAssignment.findFirst({
              where: { noteId: taskId, tenantId },
              select: { personaType: true },
            });
            await this.openClawClient.executeAgent(
              `KNOWLEDGE UPDATE za ${companyName}: Koncept "${conceptName}" (${assignment?.personaType ?? 'UNKNOWN'} perspektiva) zavrsen. Zapamti i organizuj ove nalaze:\n${knowledgeSummary.substring(0, 3000)}`,
              { agentId: 'main', timeoutSeconds: 120 }
            );
            this.logger.log({
              message: 'Headless: knowledge update sent to main (business brain)',
              taskId,
              conceptName,
            });
          } catch (mainErr) {
            this.logger.warn({
              message: 'Headless: main knowledge update failed (non-blocking)',
              taskId,
              error: mainErr instanceof Error ? mainErr.message : 'Unknown',
            });
          }
        }
      } catch (knowledgeErr) {
        this.logger.warn({
          message: 'Headless: knowledge updates failed (non-blocking)',
          taskId,
          error: knowledgeErr instanceof Error ? knowledgeErr.message : 'Unknown',
        });
      }

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

      return { success: true };
    } catch (err) {
      this.logger.error({
        message: 'Headless: task execution failed',
        taskId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
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

        try {
          // Retry with backoff if concurrency limit is hit (MAX_CONCURRENT_PER_TENANT = 5)
          // Multiple headless tasks run in parallel, competing for limited agent slots
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

          finished.add(job.id);
          this.logger.log({
            message: 'Headless: agent job completed',
            jobId: job.id,
          });
        } catch (err) {
          this.logger.error({
            message: 'Headless: agent job execution failed',
            jobId: job.id,
            error: err instanceof Error ? err.message : 'Unknown',
          });
          finished.add(job.id);
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
