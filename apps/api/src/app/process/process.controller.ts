import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Prisma } from '@prisma/client';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { ProcessExecutorService } from './process-executor.service';
import { ProcessSchedulerService } from './process-scheduler.service';
import { OpenClawTenantService } from '../openclaw-tenant/openclaw-tenant.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import type { ChatMessage } from '@mentor-ai/shared/types';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  CreateStepDto,
  UpdateStepDto,
  TriggerRunDto,
  ApproveStepDto,
  ListRunsQueryDto,
} from './dto/process.dto';

@Controller('v1/processes')
@UseGuards(JwtAuthGuard)
export class ProcessController {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly executor: ProcessExecutorService,
    private readonly scheduler: ProcessSchedulerService,
    private readonly openClawTenant: OpenClawTenantService,
    private readonly aiGateway: AiGatewayService,
  ) {}

  // ════════════════════════════════════════════
  //  Approved Items (saved from approval steps)
  // ════════════════════════════════════════════

  /** List all approved leads for tenant */
  @Get('approved/leads')
  async listApprovedLeads(@CurrentUser() user: CurrentUserPayload) {
    const leads = await this.prisma.approvedLead.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: leads };
  }

  /** List all approved content for tenant */
  @Get('approved/content')
  async listApprovedContent(@CurrentUser() user: CurrentUserPayload) {
    const content = await this.prisma.approvedContent.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: content };
  }

  // ════════════════════════════════════════════
  //  Run Operations (MUST come before :workflowId to avoid route collision)
  // ════════════════════════════════════════════

  /** Get a single run with step results */
  @Get('runs/:runId')
  async getRun(
    @Param('runId') runId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const run = await this.prisma.processRun.findUnique({
      where: { id: runId },
      include: {
        stepResults: {
          include: { step: true },
          orderBy: { step: { order: 'asc' } },
        },
        workflow: true,
      },
    });

    if (!run || run.tenantId !== user.tenantId) {
      throw new NotFoundException({
        type: 'run_not_found',
        title: 'Run Not Found',
        status: 404,
      });
    }

    return { data: run };
  }

  /** Cancel a running process */
  @Post('runs/:runId/cancel')
  async cancelRun(
    @Param('runId') runId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      await this.executor.cancelRun(runId, user.tenantId);
      return { data: { cancelled: true } };
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        throw new NotFoundException({
          type: 'run_not_found',
          title: 'Run Not Found',
          status: 404,
          detail: err.message,
        });
      }
      throw new BadRequestException({
        type: 'cancel_failed',
        title: 'Cancel Failed',
        status: 400,
        detail: err.message,
      });
    }
  }

  /** Approve or reject a step */
  @Post('runs/:runId/approve/:stepResultId')
  async approveStep(
    @Param('runId') runId: string,
    @Param('stepResultId') stepResultId: string,
    @Body() dto: ApproveStepDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      await this.executor.handleApproval(
        stepResultId,
        dto.approved,
        user.userId,
        user.tenantId,
        dto.modifiedOutput,
      );
      return { data: { approved: dto.approved } };
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        throw new NotFoundException({
          type: 'step_result_not_found',
          title: 'Step Result Not Found',
          status: 404,
          detail: err.message,
        });
      }
      throw new BadRequestException({
        type: 'approval_failed',
        title: 'Approval Failed',
        status: 400,
        detail: err.message,
      });
    }
  }

  // ════════════════════════════════════════════
  //  Workflow CRUD
  // ════════════════════════════════════════════

  /** List workflows for the tenant — only those enabled in catalog settings */
  @Get()
  async listWorkflows(@CurrentUser() user: CurrentUserPayload) {
    // Find which process slugs are enabled in the tenant's catalog
    const enabledItems = await this.prisma.tenantCatalogItem.findMany({
      where: { tenantId: user.tenantId, enabled: true, catalogItem: { type: 'process' } },
      select: { catalogItem: { select: { slug: true } } },
    });

    const enabledSlugs = enabledItems.map(i => i.catalogItem.slug);

    // If no catalog items exist yet (not seeded), show all (backward compat)
    const allCatalogProcesses = await this.prisma.catalogItem.count({ where: { type: 'process' } });
    const filterBySlug = allCatalogProcesses > 0 && enabledSlugs.length > 0;

    const workflows = await this.prisma.processWorkflow.findMany({
      where: {
        tenantId: user.tenantId,
        ...(filterBySlug ? { slug: { in: enabledSlugs } } : {}),
      },
      include: { steps: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return { data: workflows };
  }

  /** Get a single workflow with steps */
  @Get(':workflowId')
  async getWorkflow(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const workflow = await this.prisma.processWorkflow.findUnique({
      where: { id: workflowId },
      include: { steps: { orderBy: { order: 'asc' } } },
    });

    if (!workflow || workflow.tenantId !== user.tenantId) {
      throw new NotFoundException({
        type: 'workflow_not_found',
        title: 'Workflow Not Found',
        status: 404,
        detail: `Process workflow ${workflowId} not found`,
      });
    }

    return { data: workflow };
  }

  /** Create a new workflow (TENANT_OWNER only) */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('TENANT_OWNER')
  async createWorkflow(
    @Body() dto: CreateWorkflowDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    // Validate cron if provided
    if (dto.cronSchedule) {
      try {
        const { CronExpressionParser } = await import('cron-parser');
        CronExpressionParser.parse(dto.cronSchedule);
      } catch {
        throw new BadRequestException({
          type: 'invalid_cron',
          title: 'Invalid Cron Expression',
          status: 400,
          detail: `"${dto.cronSchedule}" is not a valid cron expression`,
        });
      }
    }

    // Check slug uniqueness within tenant
    const existing = await this.prisma.processWorkflow.findUnique({
      where: { tenantId_slug: { tenantId: user.tenantId, slug: dto.slug } },
    });
    if (existing) {
      throw new ConflictException({
        type: 'slug_conflict',
        title: 'Slug Already Exists',
        status: 409,
        detail: `A workflow with slug "${dto.slug}" already exists`,
      });
    }

    const workflow = await this.prisma.processWorkflow.create({
      data: {
        id: `proc_${createId()}`,
        tenantId: user.tenantId,
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        cronSchedule: dto.cronSchedule,
        skillMd: dto.skillMd,
      },
    });

    // Register cron if provided
    if (dto.cronSchedule) {
      this.scheduler.schedule(workflow.id, user.tenantId, dto.cronSchedule);
    }

    return { data: workflow };
  }

  /** Update a workflow (TENANT_OWNER only) */
  @Patch(':workflowId')
  @UseGuards(RolesGuard)
  @Roles('TENANT_OWNER')
  async updateWorkflow(
    @Param('workflowId') workflowId: string,
    @Body() dto: UpdateWorkflowDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const existing = await this.prisma.processWorkflow.findUnique({
      where: { id: workflowId },
    });

    if (!existing || existing.tenantId !== user.tenantId) {
      throw new NotFoundException({
        type: 'workflow_not_found',
        title: 'Workflow Not Found',
        status: 404,
      });
    }

    if (dto.cronSchedule) {
      try {
        const { CronExpressionParser } = await import('cron-parser');
        CronExpressionParser.parse(dto.cronSchedule);
      } catch {
        throw new BadRequestException({
          type: 'invalid_cron',
          title: 'Invalid Cron Expression',
          status: 400,
          detail: `"${dto.cronSchedule}" is not a valid cron expression`,
        });
      }
    }

    const workflow = await this.prisma.processWorkflow.update({
      where: { id: workflowId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.cronSchedule !== undefined && { cronSchedule: dto.cronSchedule }),
        ...(dto.skillMd !== undefined && { skillMd: dto.skillMd }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    // Update cron schedule
    if (dto.cronSchedule !== undefined || dto.isActive !== undefined) {
      if (workflow.isActive && workflow.cronSchedule) {
        this.scheduler.schedule(workflow.id, user.tenantId, workflow.cronSchedule);
      } else {
        this.scheduler.unschedule(workflow.id);
      }
    }

    return { data: workflow };
  }

  /** Delete a workflow and all runs (TENANT_OWNER only) */
  @Delete(':workflowId')
  @UseGuards(RolesGuard)
  @Roles('TENANT_OWNER')
  async deleteWorkflow(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const existing = await this.prisma.processWorkflow.findUnique({
      where: { id: workflowId },
    });

    if (!existing || existing.tenantId !== user.tenantId) {
      throw new NotFoundException({
        type: 'workflow_not_found',
        title: 'Workflow Not Found',
        status: 404,
      });
    }

    this.scheduler.unschedule(workflowId);

    // Delete in correct order within transaction: stepResults → runs → steps → workflow
    // (deleteMany doesn't trigger Prisma cascades, so we must handle manually)
    await this.prisma.$transaction(async (tx) => {
      // Delete step results for all runs of this workflow
      const runIds = (await tx.processRun.findMany({
        where: { workflowId },
        select: { id: true },
      })).map(r => r.id);

      if (runIds.length > 0) {
        await tx.processStepResult.deleteMany({ where: { runId: { in: runIds } } });
        await tx.processRun.deleteMany({ where: { workflowId } });
      }

      // Steps have onDelete: Cascade from workflow, but deleteMany on workflow
      // doesn't trigger it, so delete steps explicitly
      await tx.processStep.deleteMany({ where: { workflowId } });
      await tx.processWorkflow.delete({ where: { id: workflowId } });
    });

    return { data: { deleted: true } };
  }

  // ════════════════════════════════════════════
  //  Step CRUD
  // ════════════════════════════════════════════

  /** Add a step to a workflow (TENANT_OWNER only) */
  @Post(':workflowId/steps')
  @UseGuards(RolesGuard)
  @Roles('TENANT_OWNER')
  async createStep(
    @Param('workflowId') workflowId: string,
    @Body() dto: CreateStepDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const workflow = await this.prisma.processWorkflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow || workflow.tenantId !== user.tenantId) {
      throw new NotFoundException({
        type: 'workflow_not_found',
        title: 'Workflow Not Found',
        status: 404,
      });
    }

    const step = await this.prisma.processStep.create({
      data: {
        id: `pstep_${createId()}`,
        workflowId,
        order: dto.order,
        name: dto.name,
        description: dto.description,
        stepType: dto.stepType as any,
        agentType: dto.agentType,
        toolSkill: dto.toolSkill,
        inputSchema: dto.inputSchema as unknown as Prisma.InputJsonValue,
        outputSchema: dto.outputSchema as unknown as Prisma.InputJsonValue,
        skillMdSection: dto.skillMdSection,
        retryPolicy: (dto.retryPolicy ?? {}) as unknown as Prisma.InputJsonValue,
        verifyRules: dto.verifyRules as unknown as Prisma.InputJsonValue ?? Prisma.JsonNull,
      },
    });

    return { data: step };
  }

  /** Update a step (TENANT_OWNER only) */
  @Patch(':workflowId/steps/:stepId')
  @UseGuards(RolesGuard)
  @Roles('TENANT_OWNER')
  async updateStep(
    @Param('workflowId') workflowId: string,
    @Param('stepId') stepId: string,
    @Body() dto: UpdateStepDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const step = await this.prisma.processStep.findUnique({
      where: { id: stepId },
      include: { workflow: true },
    });

    if (!step || step.workflowId !== workflowId || step.workflow.tenantId !== user.tenantId) {
      throw new NotFoundException({
        type: 'step_not_found',
        title: 'Step Not Found',
        status: 404,
      });
    }

    const updateData: Record<string, unknown> = {};
    if (dto.order !== undefined) updateData.order = dto.order;
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.stepType !== undefined) updateData.stepType = dto.stepType;
    if (dto.agentType !== undefined) updateData.agentType = dto.agentType;
    if (dto.toolSkill !== undefined) updateData.toolSkill = dto.toolSkill;
    if (dto.inputSchema !== undefined) updateData.inputSchema = dto.inputSchema;
    if (dto.outputSchema !== undefined) updateData.outputSchema = dto.outputSchema;
    if (dto.skillMdSection !== undefined) updateData.skillMdSection = dto.skillMdSection;
    if (dto.retryPolicy !== undefined) updateData.retryPolicy = dto.retryPolicy;
    if (dto.verifyRules !== undefined) updateData.verifyRules = dto.verifyRules;

    const updated = await this.prisma.processStep.update({
      where: { id: stepId },
      data: updateData as any,
    });

    return { data: updated };
  }

  /** Delete a step (TENANT_OWNER only) */
  @Delete(':workflowId/steps/:stepId')
  @UseGuards(RolesGuard)
  @Roles('TENANT_OWNER')
  async deleteStep(
    @Param('workflowId') workflowId: string,
    @Param('stepId') stepId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const step = await this.prisma.processStep.findUnique({
      where: { id: stepId },
      include: { workflow: true },
    });

    if (!step || step.workflowId !== workflowId || step.workflow.tenantId !== user.tenantId) {
      throw new NotFoundException({
        type: 'step_not_found',
        title: 'Step Not Found',
        status: 404,
      });
    }

    await this.prisma.processStep.delete({ where: { id: stepId } });
    return { data: { deleted: true } };
  }

  /** Deploy SKILL.md to Hetzner for a workflow (TENANT_OWNER only) */
  @Post(':workflowId/deploy-skill')
  @UseGuards(RolesGuard)
  @Roles('TENANT_OWNER')
  async deploySkill(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const workflow = await this.prisma.processWorkflow.findUnique({
      where: { id: workflowId },
      include: { steps: { orderBy: { order: 'asc' } } },
    });

    if (!workflow || workflow.tenantId !== user.tenantId) {
      throw new NotFoundException({
        type: 'workflow_not_found',
        title: 'Workflow Not Found',
        status: 404,
      });
    }

    // Generate combined SKILL.md from workflow + steps
    const skillMd = this.generateSkillMd(workflow.name, workflow.steps);
    const skillPath = `/root/.openclaw/workspace/skills/lsa-${workflow.slug}/SKILL.md`;

    try {
      await this.openClawTenant.writeRemoteFile(skillPath, skillMd);
      return { data: { deployed: true, path: skillPath } };
    } catch (err: any) {
      throw new BadRequestException({
        type: 'deploy_failed',
        title: 'SKILL.md Deploy Failed',
        status: 400,
        detail: err.message,
      });
    }
  }

  private generateSkillMd(
    workflowName: string,
    steps: Array<{ order: number; name: string; stepType: string; agentType: string; toolSkill: string; skillMdSection: string | null; outputSchema: unknown }>,
  ): string {
    const parts: string[] = [
      `# SKILL: ${workflowName}`,
      '',
      'Follow each step exactly. Return ONLY valid JSON matching the output schema.',
      '',
      '---',
    ];

    for (const step of steps) {
      parts.push('');
      parts.push(`## Step ${step.order}: ${step.name}`);
      parts.push(`**Agent:** ${step.agentType}`);
      parts.push(`**Tool:** ${step.toolSkill}`);
      parts.push(`**Type:** ${step.stepType}`);

      if (step.skillMdSection) {
        parts.push('', step.skillMdSection);
      }

      const schema = step.outputSchema as Record<string, unknown>;
      if (schema && Object.keys(schema).length > 0) {
        parts.push('', '**Output Schema:**', '```json', JSON.stringify(schema, null, 2), '```');
      }

      parts.push('', '---');
    }

    return parts.join('\n');
  }

  /** Auto-generate SKILL.md sections for all steps using AI + business context */
  @Post(':workflowId/auto-generate-skills')
  @UseGuards(RolesGuard)
  @Roles('TENANT_OWNER')
  async autoGenerateSkills(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const workflow = await this.prisma.processWorkflow.findUnique({
      where: { id: workflowId },
      include: { steps: { orderBy: { order: 'asc' } } },
    });

    if (!workflow || workflow.tenantId !== user.tenantId) {
      throw new NotFoundException({ type: 'workflow_not_found', title: 'Workflow Not Found', status: 404 });
    }

    // Load business context
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true, industry: true, description: true },
    });

    const memories = await this.prisma.memory.findMany({
      where: { tenantId: user.tenantId, isDeleted: false },
      select: { content: true, subject: true },
      orderBy: { updatedAt: 'desc' },
      take: 15,
    });

    const businessContext = [
      `Company: ${tenant?.name ?? 'Unknown'}`,
      `Industry: ${tenant?.industry ?? 'Unknown'}`,
      tenant?.description ? `Description: ${tenant.description}` : '',
      '',
      memories.length > 0 ? 'Business knowledge:' : '',
      ...memories.map(m => `- ${m.subject ? `[${m.subject}] ` : ''}${m.content.slice(0, 150)}`),
    ].filter(Boolean).join('\n');

    // Generate skillMdSection for each step
    const updatedSteps: Array<{ id: string; name: string; skillMdSection: string }> = [];

    for (const step of workflow.steps) {
      if (step.stepType === 'APPROVAL') {
        // Approval steps get a simple description
        await this.prisma.processStep.update({
          where: { id: step.id },
          data: { skillMdSection: `Owner reviews the output from previous steps. Can approve, edit, or reject.` },
        });
        updatedSteps.push({ id: step.id, name: step.name, skillMdSection: 'Auto-generated (approval step)' });
        continue;
      }

      const prompt = [
        `You are writing agent instructions for step "${step.name}" (step ${step.order} of ${workflow.steps.length}) in the "${workflow.name}" process.`,
        '',
        '## Business Context',
        businessContext,
        '',
        '## Step Details',
        `- Name: ${step.name}`,
        `- Description: ${step.description ?? 'None'}`,
        `- Agent: ${step.agentType}`,
        `- Tool: ${step.toolSkill}`,
        `- Type: ${step.stepType}`,
        '',
        '## Output Schema (what the agent must produce)',
        '```json',
        JSON.stringify(step.outputSchema, null, 2).slice(0, 3000),
        '```',
        '',
        step.order > 1 ? `This step receives input from step ${step.order - 1}. Use that data as context.` : 'This is the first step — no input from previous steps.',
        '',
        'Write detailed, actionable instructions for the AI agent executing this step.',
        'Be specific about:',
        '- What to search for / analyze / create',
        '- Quality criteria and constraints',
        '- What to NEVER do (hallucinate, invent data, etc.)',
        '- How this relates to the business context above',
        '',
        'Keep it under 500 words. Be direct and specific to THIS business.',
        'Return ONLY the instruction text, no JSON wrapping, no markdown code fences.',
      ].join('\n');

      // Collect streaming output into a string
      let skillMd = '';
      try {
        await this.aiGateway.streamCompletionWithContext(
          [{ role: 'user', content: prompt } as ChatMessage],
          { tenantId: user.tenantId, userId: user.userId, useFallback: true, skipQuotaCheck: true },
          (chunk: string) => { skillMd += chunk; },
        );
      } catch (err: any) {
        skillMd = `[Auto-generation failed: ${err.message ?? 'unknown'}]`;
      }

      await this.prisma.processStep.update({
        where: { id: step.id },
        data: { skillMdSection: skillMd },
      });

      updatedSteps.push({ id: step.id, name: step.name, skillMdSection: skillMd.slice(0, 100) + '...' });
    }

    return { data: { generated: updatedSteps.length, steps: updatedSteps } };
  }

  // ════════════════════════════════════════════
  //  Run Trigger + List (under :workflowId)
  // ════════════════════════════════════════════

  /** Trigger a new process run */
  @Post(':workflowId/run')
  async triggerRun(
    @Param('workflowId') workflowId: string,
    @Body() dto: TriggerRunDto,
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    try {
      const runId = await this.executor.startRun(
        workflowId,
        user.tenantId,
        dto.input,
        correlationId,
      );
      return { data: { runId } };
    } catch (err: any) {
      if (err.message?.includes('already has an active run')) {
        throw new ConflictException({
          type: 'run_already_active',
          title: 'Run Already Active',
          status: 409,
          detail: err.message,
        });
      }
      if (err.message?.includes('not found')) {
        throw new NotFoundException({
          type: 'workflow_not_found',
          title: 'Workflow Not Found',
          status: 404,
          detail: err.message,
        });
      }
      throw err;
    }
  }

  /** List runs for a workflow with pagination */
  @Get(':workflowId/runs')
  async listRuns(
    @Param('workflowId') workflowId: string,
    @Query() query: ListRunsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {
      workflowId,
      workflow: { tenantId: user.tenantId },
    };
    if (query.status) {
      where.status = query.status;
    }

    const [runs, total] = await Promise.all([
      this.prisma.processRun.findMany({
        where,
        include: { stepResults: { orderBy: { step: { order: 'asc' } } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.processRun.count({ where }),
    ]);

    return {
      data: runs,
      meta: { page, pageSize: limit, total },
    };
  }
}
