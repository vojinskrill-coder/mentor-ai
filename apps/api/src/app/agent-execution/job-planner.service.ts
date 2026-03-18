import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { createId } from '@paralleldrive/cuid2';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { AgentRegistryService } from './agent-registry.service';
import { AgentType, AgentJobItem, AgentJobStatus, ChatMessage } from '@mentor-ai/shared/types';

@Injectable()
export class JobPlannerService {
  private readonly logger = new Logger(JobPlannerService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly aiGateway: AiGatewayService,
    private readonly registry: AgentRegistryService
  ) {}

  /**
   * Analyzes a scored task report and creates ordered, dependent agent jobs.
   * Uses LLM to determine which agents are relevant and what they should do.
   * Automatically injects tenant business context via AiGatewayService.
   */
  async planJobs(noteId: string, tenantId: string, userId: string): Promise<AgentJobItem[]> {
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, tenantId },
    });

    if (!note || !note.userReport) {
      this.logger.warn({ message: 'Cannot plan jobs — note or report missing', noteId });
      return [];
    }

    // Guard against duplicate planning — return existing jobs if already planned
    const existingJobs = await this.getJobsForNote(noteId, tenantId);
    if (existingJobs.length > 0) {
      this.logger.log({
        message: 'Jobs already exist for note, skipping planning',
        noteId,
        jobCount: existingJobs.length,
      });
      return existingJobs;
    }

    const agentDescriptions = this.registry
      .getAllAgents()
      .map((a) => `- ${a.type}: ${a.label} — ${a.description}`)
      .join('\n');

    const systemPrompt = `You are a business operations planner. Given a completed task report, create an execution plan of AI agent jobs.

Available agent types:
${agentDescriptions}

ARCHITECTURE — HOW AGENTS COLLABORATE:
1. web_search is ALWAYS the first job — it researches ALL aspects and structures output by domain
2. Domain agents (content, marketing, sales, financial) receive web_search output and do their SPECIALIZED work
3. Domain agents execute SEQUENTIALLY — each sees output from ALL previous agents
4. Domain agents do NOT do their own web research — they USE the data from web_search

DECISION FRAMEWORK:
- web_search is ALWAYS included (order 1, no dependencies)
- Add domain agents ONLY when the concept needs their expertise:
  * financial: when concept involves costs, ROI, budgets, pricing, cash flow
  * content: when concept needs written deliverables, brand materials, visual content
  * marketing: when concept involves positioning, competition, market strategy
  * sales: when concept involves customer outreach, selling strategy, pricing negotiation
- Create 1-4 jobs total. Simple concepts may need ONLY web_search (1 job).

Rules:
- web_search instruction MUST tell the agent to structure output with domain headers:
  ## FINANSIJSKI PODACI, ## MARKETING PODACI, ## SADRŽAJ I PRIMERI, ## PRODAJNI PODACI
- Each domain agent instruction MUST say "Using the research data provided, ..." — NOT "Search for..."
- Domain agents depend on web_search (and optionally on each other for collaboration)
- Write instructions in English (agents produce Serbian output)
- Respond ONLY with a JSON array, no other text.

Output format:
[{"agentType":"web_search","order":1,"dependsOnOrders":[],"instruction":"Research ALL aspects of [topic]..."},{"agentType":"financial","order":2,"dependsOnOrders":[1],"instruction":"Using the financial data from research, calculate..."}]`;

    const userMessage = `Task: ${note.title}

Description: ${note.content.substring(0, 500)}

${note.expectedOutcome ? `Expected Outcome: ${note.expectedOutcome}\n` : ''}Completed Report:
${note.userReport.substring(0, 4000)}

Create an execution plan of agent jobs for this task. Return JSON array only.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    let result = '';
    try {
      await this.aiGateway.streamCompletionWithContext(
        messages,
        {
          tenantId,
          userId,
          skipRateLimit: true,
          skipQuotaCheck: true,
        },
        (chunk) => {
          result += chunk;
        }
      );

      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn({
          message: 'No JSON array found in job plan response',
          result: result.substring(0, 200),
        });
        return this.createDefaultJobs(noteId, tenantId, userId, note.title, note.userReport);
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        agentType: string;
        order: number;
        dependsOnOrders: number[];
        instruction: string;
      }>;

      // If LLM returned empty array, use default web_search → content chain
      if (parsed.length === 0) {
        this.logger.warn({ message: 'LLM returned empty job plan — using default chain', noteId });
        return this.createDefaultJobs(noteId, tenantId, userId, note.title, note.userReport);
      }

      const validTypes = Object.values(AgentType) as string[];
      const validJobs = parsed
        .filter((j) => validTypes.includes(j.agentType) && j.instruction?.length > 10)
        .sort((a, b) => a.order - b.order)
        .slice(0, 4);

      if (validJobs.length === 0) {
        return this.createDefaultJobs(noteId, tenantId, userId, note.title, note.userReport);
      }

      return await this.persistJobs(validJobs, noteId, tenantId, userId);
    } catch (err) {
      this.logger.error({
        message: 'Failed to plan jobs',
        noteId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return this.createDefaultJobs(noteId, tenantId, userId, note.title, note.userReport);
    }
  }

  /**
   * Persist parsed LLM job plan into AgentJob rows.
   * Pre-generates IDs, resolves order-based dependencies to IDs, batch creates.
   */
  private async persistJobs(
    jobs: Array<{
      agentType: string;
      order: number;
      dependsOnOrders: number[];
      instruction: string;
    }>,
    noteId: string,
    tenantId: string,
    userId: string
  ): Promise<AgentJobItem[]> {
    // Pre-generate IDs and build original-order→ID map BEFORE renormalizing
    const jobsWithIds = jobs.map((j, idx) => ({
      ...j,
      id: `ajob_${createId()}`,
      originalOrder: j.order,
      order: idx + 1, // Normalize to 1-based sequential
    }));

    // Map from ORIGINAL LLM order to ID (so dependsOnOrders references resolve correctly)
    const orderToId = new Map(jobsWithIds.map((j) => [j.originalOrder, j.id]));

    // Resolve dependsOnOrders to actual IDs
    const jobData = jobsWithIds.map((j) => ({
      id: j.id,
      noteId,
      tenantId,
      userId,
      agentType: j.agentType,
      order: j.order,
      dependsOn: j.dependsOnOrders
        .map((depOrder) => orderToId.get(depOrder))
        .filter((id): id is string => !!id),
      instruction: j.instruction,
      status: 'PLANNED' as const,
    }));

    // Batch create in transaction
    await this.prisma.$transaction(jobData.map((data) => this.prisma.agentJob.create({ data })));

    this.logger.log({
      message: 'Agent jobs planned',
      noteId,
      jobCount: jobData.length,
      types: jobData.map((j) => j.agentType),
    });

    return this.getJobsForNote(noteId, tenantId);
  }

  /**
   * Fallback: create a simple web_search → content chain.
   */
  private async createDefaultJobs(
    noteId: string,
    tenantId: string,
    userId: string,
    taskTitle: string,
    userReport: string
  ): Promise<AgentJobItem[]> {
    const searchId = `ajob_${createId()}`;
    const contentId = `ajob_${createId()}`;

    await this.prisma.$transaction([
      this.prisma.agentJob.create({
        data: {
          id: searchId,
          noteId,
          tenantId,
          userId,
          agentType: AgentType.WEB_SEARCH,
          order: 1,
          dependsOn: [],
          instruction: `Research the topic "${taskTitle}" — find market data, competitors, pricing, and trends relevant to the business. Report: ${userReport.substring(0, 500)}`,
          status: 'PLANNED',
        },
      }),
      this.prisma.agentJob.create({
        data: {
          id: contentId,
          noteId,
          tenantId,
          userId,
          agentType: AgentType.CONTENT,
          order: 2,
          dependsOn: [searchId],
          instruction: `Using the research results from the previous step, create actionable content deliverables for "${taskTitle}". Include blog posts, social media content, or marketing materials as appropriate.`,
          status: 'PLANNED',
        },
      }),
    ]);

    return this.getJobsForNote(noteId, tenantId);
  }

  /**
   * Returns all jobs for a note, ordered by execution order.
   */
  async getJobsForNote(noteId: string, tenantId: string): Promise<AgentJobItem[]> {
    const jobs = await this.prisma.agentJob.findMany({
      where: { noteId, tenantId },
      orderBy: { order: 'asc' },
    });

    return jobs.map((j) => ({
      id: j.id,
      noteId: j.noteId,
      agentType: j.agentType as AgentType,
      order: j.order,
      dependsOn: j.dependsOn,
      instruction: j.instruction,
      status: j.status as AgentJobStatus,
      executionId: j.executionId,
      agentOutput: j.agentOutput,
      error: j.error,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
    }));
  }
}
