import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';
import type { ExecutionPlanStep, WorkflowStep } from '@mentor-ai/shared/types';
import { createId } from '@paralleldrive/cuid2';
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
    private readonly crossPersonaIntelligence: CrossPersonaIntelligenceService
  ) {}

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
      const stepCachedContext = { tenant: cachedTenantData, brainContext: brainCtx };

      // Build lean business context for LLM calls
      const bizContext = this.buildLeanBusinessContext(cachedTenantData);

      // ── Phase 1: Workflow generation + step execution ──
      let childNotes = await this.prisma.note.findMany({
        where: { parentNoteId: taskId },
        select: { title: true, content: true, workflowStepNumber: true, status: true },
        orderBy: { workflowStepNumber: 'asc' },
      });

      if (childNotes.length === 0) {
        try {
          this.wsHolder.emitToTenant(tenantId, 'task:ai-workflow-start', {
            taskId,
            conversationId: convId,
            message: 'Generišem plan izvršavanja...',
            auto: true,
          });

          const isMinimalContent = !taskNote.content || taskNote.content.length < 200;
          const hasConcept = !!taskNote.conceptId;

          let workflow: { conceptName: string; steps: WorkflowStep[] };
          if (hasConcept && isMinimalContent) {
            workflow = await this.workflowService.getOrGenerateWorkflow(
              taskNote.conceptId!,
              tenantId,
              userId
            );
          } else {
            workflow = await this.workflowService.generateTaskSpecificWorkflow(
              {
                title: taskNote.title,
                content: taskNote.content ?? '',
                conversationId: convId || null,
                conceptId: taskNote.conceptId,
              },
              tenantId,
              userId
            );
          }

          this.logger.log({
            message: 'Headless: workflow generated',
            taskId,
            stepCount: workflow.steps.length,
          });

          const completedSummaries: Array<{
            title: string;
            conceptName: string;
            summary: string;
          }> = [];

          for (let stepIdx = 0; stepIdx < workflow.steps.length; stepIdx++) {
            const workflowStep = workflow.steps[stepIdx]!;

            this.wsHolder.emitToTenant(tenantId, 'task:ai-step-progress', {
              taskId,
              conversationId: convId,
              stepIndex: stepIdx,
              totalSteps: workflow.steps.length,
              stepTitle: workflowStep.title,
              auto: true,
            });

            const step: ExecutionPlanStep = {
              stepId: `auto_step_${createId()}`,
              conceptId: taskNote.conceptId ?? '',
              conceptName: workflow.conceptName,
              workflowStepNumber: workflowStep.stepNumber,
              title: workflowStep.title,
              description: workflowStep.description,
              estimatedMinutes: workflowStep.estimatedMinutes,
              departmentTag: workflowStep.departmentTag,
              status: 'in_progress',
              taskTitle: taskNote.title,
              taskContent: taskNote.content ?? undefined,
              taskConversationId: convId || undefined,
            };

            const result = await this.workflowService.executeStepAutonomous(
              step,
              convId,
              userId,
              tenantId,
              () => {
                /* headless: collect silently */
              },
              completedSummaries,
              workflow.steps,
              stepCachedContext
            );

            // Dedup: check if child note already exists
            const existingSub = await this.prisma.note.findFirst({
              where: {
                tenantId,
                parentNoteId: taskId,
                workflowStepNumber: workflowStep.stepNumber,
                noteType: NoteType.TASK,
              },
              select: { id: true },
            });

            if (!existingSub) {
              await this.prisma.note.create({
                data: {
                  id: `note_${createId()}`,
                  title: workflowStep.title,
                  content: result.content,
                  source: NoteSource.CONVERSATION,
                  noteType: NoteType.TASK,
                  status: NoteStatus.READY_FOR_REVIEW,
                  userId,
                  tenantId,
                  conversationId: convId || undefined,
                  conceptId: taskNote.conceptId ?? undefined,
                  parentNoteId: taskId,
                  expectedOutcome: workflowStep.expectedOutcome?.substring(0, 500),
                  workflowStepNumber: workflowStep.stepNumber,
                },
              });
            }

            completedSummaries.push({
              title: workflowStep.title,
              conceptName: workflow.conceptName,
              summary: result.content.substring(0, 500),
            });

            this.wsHolder.emitToTenant(tenantId, 'task:ai-step-complete', {
              taskId,
              conversationId: convId,
              stepIndex: stepIdx,
              totalSteps: workflow.steps.length,
              stepTitle: workflowStep.title,
              auto: true,
            });
          }

          // Re-load children after execution
          childNotes = await this.prisma.note.findMany({
            where: { parentNoteId: taskId },
            select: { title: true, content: true, workflowStepNumber: true, status: true },
            orderBy: { workflowStepNumber: 'asc' },
          });
        } catch (err) {
          this.logger.warn({
            message: 'Headless: workflow generation failed, falling back to direct execution',
            taskId,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      }

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

      // --- Cross-persona intelligence (non-blocking) ---
      let crossPersonaContext = '';
      if (taskNote.conceptId) {
        try {
          const assignment = await this.prisma.stageConceptAssignment.findFirst({
            where: { tenantId, noteId: taskId },
            select: { personaType: true, stage: true },
          });
          if (assignment) {
            const crossPersona = await this.crossPersonaIntelligence.getRelevantOutputs({
              tenantId,
              conceptId: taskNote.conceptId,
              currentPersonaType: assignment.personaType,
              stage: assignment.stage,
            });
            if (crossPersona.outputs.length > 0) {
              crossPersonaContext = crossPersona.promptSection;
            }
          }
        } catch { /* non-blocking enrichment */ }
      }

      let prompt: string;

      if (childNotes.length > 0) {
        const workflowResults = childNotes
          .map((note, i) => {
            const stepNum = note.workflowStepNumber ?? i + 1;
            return `--- KORAK ${stepNum}: ${note.title} ---\n${note.content}`;
          })
          .join('\n\n');

        prompt = `Ti si vrhunski poslovni stručnjak. Tvoj tim je završio detaljnu analizu kroz ${childNotes.length} koraka workflow-a. Sintetiši SVE rezultate u FINALNI DOKUMENT koji vlasnik može odmah koristiti.

ZADATAK: ${taskNote.title}
${taskNote.content ? `OPIS ZADATKA: ${taskNote.content}` : ''}
${taskNote.expectedOutcome ? `OČEKIVANI REZULTAT: ${taskNote.expectedOutcome}` : ''}

REZULTATI ISTRAŽIVANJA I ANALIZE (koristi SVE podatke iz svih koraka):
${workflowResults}
${crossPersonaContext}${conceptKnowledge}

PRAVILA ZA FINALNI DOKUMENT:
1. Ovo je FINALNI DELIVERABLE — gotov dokument, NE izveštaj o radu
2. Sintetiši rezultate iz koraka u koherentan, upotrebljiv dokument
3. NIKADA ne piši "trebalo bi da..." za digitalne zadatke — URADI to
4. Koristi SPECIFIČNE podatke, brojke i nalaze iz koraka — ne generalizuj
5. Strukturiraj sa ## zaglavljima, tabelama, nabrajanjima
6. Dodaj sekciju "Sledeći koraci" sa konkretnim akcijama
7. NIKADA ne piši "u prethodnim koracima smo..." — PRIKAŽI gotov rezultat
8. Minimum 1000 reči — ovo je sveobuhvatan dokument
9. Odgovaraj ISKLJUČIVO na srpskom jeziku.`;
      } else {
        prompt = `Ti si poslovni stručnjak. IZVRŠI sledeći zadatak u potpunosti.

ZADATAK: ${taskNote.title}
${taskNote.content ? `OPIS:\n${taskNote.content}` : ''}
${taskNote.expectedOutcome ? `OČEKIVANI REZULTAT: ${taskNote.expectedOutcome}` : ''}
${crossPersonaContext}${conceptKnowledge}

PRAVILA:
1. Proizvedi KOMPLETAN, GOTOV dokument
2. NIKADA ne piši "trebalo bi da..." za digitalne zadatke — NAPRAVI to sam
3. NIKADA ne izmišljaj podatke — ako nemaš podatak, naznači "[POPUNITI: ...]"
4. Strukturiraj sa ## zaglavljima, tabelama, nabrajanjima
5. Minimum 800 reči za analitičke zadatke
6. Odgovaraj ISKLJUČIVO na srpskom jeziku`;
      }

      let fullContent = '';
      await this.aiGateway.streamCompletionWithContext(
        [{ role: 'user', content: prompt }],
        { tenantId, userId, conversationId: convId, businessContext: bizContext },
        (chunk: string) => {
          fullContent += chunk;
        }
      );

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
    timeoutMs = 300_000, // 5 minutes max per job
  ): Promise<void> {
    const start = Date.now();
    const pollInterval = 3_000; // 3 seconds

    while (Date.now() - start < timeoutMs) {
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
      timeoutMs,
    });

    try {
      const job = await this.prisma.agentJob.findFirst({
        where: { id: jobId, tenantId },
        select: { status: true, executionId: true },
      });

      if (job && !['COMPLETED', 'FAILED'].includes(job.status)) {
        await this.prisma.agentJob.update({
          where: { id: jobId },
          data: { status: 'FAILED', error: `Timed out after ${timeoutMs / 1000}s` },
        });

        if (job.executionId) {
          await this.prisma.agentExecution.update({
            where: { id: job.executionId },
            data: { status: 'FAILED', error: `Timed out after ${timeoutMs / 1000}s` },
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
