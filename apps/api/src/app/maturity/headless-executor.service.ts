import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
// NoteSource, NoteType, NoteStatus removed — no longer used after workflow step removal
import { WorkflowService } from '../workflow/workflow.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { JobPlannerService } from '../agent-execution/job-planner.service';
import { AgentExecutionService } from '../agent-execution/agent-execution.service';
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
      if (taskNote.status === 'COMPLETED') return { success: true };

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

      // ── Phase 2: Synthesis ──
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

      const prompt = `Ti si vrhunski poslovni stručnjak. Izvrši detaljnu analizu i proizvedi FINALNI DOKUMENT koji vlasnik može odmah koristiti.

ZADATAK: ${taskNote.title}
${taskNote.content ? `OPIS ZADATKA: ${taskNote.content}` : ''}
${taskNote.expectedOutcome ? `OČEKIVANI REZULTAT: ${taskNote.expectedOutcome}` : ''}
${prerequisiteContext}${crossPersonaContext}${conceptKnowledge}

PRAVILA ZA FINALNI DOKUMENT:
1. Ovo je FINALNI DELIVERABLE — gotov dokument, NE izveštaj o radu
2. NIKADA ne piši "trebalo bi da..." za digitalne zadatke — URADI to
3. Koristi SPECIFIČNE podatke, brojke i nalaze iz prethodnih koncepata — ne generalizuj
4. Strukturiraj sa ## zaglavljima, tabelama, nabrajanjima
5. Dodaj sekciju "Sledeći koraci" sa konkretnim akcijama
6. NIKADA ne piši "u prethodnim koracima smo..." — PRIKAŽI gotov rezultat
7. Ako postoji kontekst iz prethodno završenih koncepata, NADOGRADI na njima — ne ponavljaj
8. Minimum 1000 reči — ovo je sveobuhvatan dokument
9. Odgovaraj ISKLJUČIVO na srpskom jeziku
10. Format: profesionalan Markdown (## zaglavlja, tabele, **bold** za ključne vrednosti, > za izvore)`;

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

      // ── Phase 3: Scoring ──
      let tenantInfo = '';
      if (cachedTenantData) {
        tenantInfo = `\nKOMPANIJA: ${cachedTenantData.name}${cachedTenantData.industry ? ` | INDUSTRIJA: ${cachedTenantData.industry}` : ''}`;
      }

      let conceptScoreContext = '';
      if (taskNote.conceptId) {
        const concept = await this.prisma.concept.findUnique({
          where: { id: taskNote.conceptId },
          select: { name: true, category: true, definition: true },
        });
        if (concept) {
          conceptScoreContext = `\nKONCEPT: ${concept.name} (${concept.category}) — ${concept.definition}`;
        }
      }

      const scorePrompt = `Ti si senior poslovni konsultant koji recenzira deliverable-e. Tvoj zadatak je da:

1. OPTIMIZUJEŠ rezultat — napravi finalnu, poliranu verziju:
   - Poboljšaj strukturu (## zaglavlja, tabele, nabrajanja)
   - Dodaj konkretne brojke, rokove i metrike gde nedostaju
   - Zameni generičke preporuke SPECIFIČNIM akcijama prilagođenim kompaniji
   - Ukloni redundantni tekst i ponavljanja
   - Dodaj sekciju "Sledeći koraci" ako ne postoji

2. OCENI rezultat po 5 kriterijuma (svaki 1-10):
   - PRIMENLJIVOST: Da li se može odmah implementirati?
   - SPECIFIČNOST: Da li sadrži konkretne brojke, nazive, rokove?
   - KOMPLETNOST: Da li pokriva sve aspekte zadatka?
   - RELEVANTNOST: Da li je prilagođen industriji i kompaniji?
   - KVALITET: Da li je profesionalno strukturiran i jasan?
${tenantInfo}${conceptScoreContext}

ZADATAK: ${taskNote.title}
${taskNote.content ? `OPIS: ${taskNote.content}` : ''}
${taskNote.expectedOutcome ? `OČEKIVANI REZULTAT: ${taskNote.expectedOutcome}` : ''}

IZLAZ KOJI TREBA OCENITI I OPTIMIZOVATI:
${fullContent}

FORMAT ODGOVORA:
1. Napiši OPTIMIZOVANI REZULTAT (kompletan dokument)
2. Na samom kraju dodaj:
---
EVALUACIJA:
- Primenljivost: X/10
- Specifičnost: X/10
- Kompletnost: X/10
- Relevantnost: X/10
- Kvalitet: X/10
OCENA: X/10
---

Gde je OCENA prosek svih pet kriterijuma (zaokružen na ceo broj).
Odgovaraj ISKLJUČIVO na srpskom jeziku.`;

      let scoreResult = '';
      await this.aiGateway.streamCompletionWithContext(
        [{ role: 'user', content: scorePrompt }],
        {
          tenantId,
          userId,
          conversationId: convId,
          businessContext: bizContext,
          useFallback: true,
        },
        (chunk: string) => {
          scoreResult += chunk;
        }
      );

      // Extract score
      let score: number | null = null;
      const scoreMatch = scoreResult.match(/OCENA:\s*(\d{1,2})\s*\/\s*10/i);
      if (scoreMatch) {
        const rawScore = parseInt(scoreMatch[1]!, 10);
        if (rawScore >= 1 && rawScore <= 10) {
          score = rawScore * 10;
        }
      }

      // Save optimized result + score
      await this.prisma.note.update({
        where: { id: taskId },
        data: {
          userReport: scoreResult,
          aiScore: score,
          aiFeedback: score !== null ? `AI ocena: ${score}/100` : null,
        },
      });

      this.wsHolder.emitToTenant(tenantId, 'task:result-complete', {
        taskId,
        conversationId: convId,
        score,
        finalResult: scoreResult,
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
