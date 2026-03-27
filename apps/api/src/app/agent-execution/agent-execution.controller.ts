import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AgentExecutionService } from './agent-execution.service';
import { JobPlannerService } from './job-planner.service';
import { BudgetService } from './budget.service';
import { AgentType } from '@mentor-ai/shared/types';

interface CurrentUserPayload {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  auth0Id: string;
  department: string | null;
}

@Controller('v1/agent-execution')
@UseGuards(JwtAuthGuard)
export class AgentExecutionController {
  constructor(
    private readonly agentExecutionService: AgentExecutionService,
    private readonly jobPlannerService: JobPlannerService,
    private readonly budgetService: BudgetService
  ) {}

  @Get('budget/today')
  async getTodaysBudget(@CurrentUser() user: CurrentUserPayload) {
    const { spentEur, limitEur } = await this.budgetService.getDailySpent(user.tenantId);
    return { data: { spentEur, limitEur } };
  }

  @Post('trigger/:noteId/:agentType')
  @HttpCode(HttpStatus.CREATED)
  async triggerAgent(
    @Param('noteId') noteId: string,
    @Param('agentType') agentType: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    const validTypes = Object.values(AgentType) as string[];
    if (!validTypes.includes(agentType)) {
      throw new BadRequestException(`Invalid agent type: ${agentType}`);
    }

    const result = await this.agentExecutionService.triggerAgent(
      noteId,
      agentType as AgentType,
      user.userId,
      user.tenantId
    );
    return { data: result };
  }

  @Get('note/:noteId')
  async getExecutionsByNote(
    @Param('noteId') noteId: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    const executions = await this.agentExecutionService.getExecutionsByNote(noteId, user.tenantId);
    return { data: executions };
  }

  @Get('jobs/:noteId')
  async getJobsForNote(@Param('noteId') noteId: string, @CurrentUser() user: CurrentUserPayload) {
    const jobs = await this.jobPlannerService.getJobsForNote(noteId, user.tenantId);
    const budget = await this.budgetService.getDailySpent(user.tenantId);
    const estimatedCost = this.budgetService.getEstimatedCost();
    return {
      data: {
        noteId,
        jobs,
        dailySpentEur: budget.spentEur,
        dailyLimitEur: budget.limitEur,
        canProceed: budget.spentEur + estimatedCost <= budget.limitEur,
      },
    };
  }

  @Post('jobs/:jobId/execute')
  @HttpCode(HttpStatus.CREATED)
  async executeJob(@Param('jobId') jobId: string, @CurrentUser() user: CurrentUserPayload) {
    const result = await this.agentExecutionService.executeJob(jobId, user.userId, user.tenantId);
    return { data: result };
  }

  @Post('jobs/:jobId/retry')
  @HttpCode(HttpStatus.CREATED)
  async retryJob(@Param('jobId') jobId: string, @CurrentUser() user: CurrentUserPayload) {
    const result = await this.agentExecutionService.retryJob(jobId, user.userId, user.tenantId);
    return { data: result };
  }

  /**
   * POST /api/v1/agent-execution/retry-all-pending
   * Retry all PLANNED/FAILED jobs in waves of 5, respecting dependencies.
   * Fire-and-forget — returns immediately, processes in background.
   */
  /**
   * POST /api/v1/agent-execution/stop-all
   * Force-stop all running agent executions and jobs.
   */
  @Post('stop-all')
  @HttpCode(HttpStatus.OK)
  async stopAll(@CurrentUser() user: CurrentUserPayload) {
    const result = await this.agentExecutionService.stopAllExecutions(user.tenantId);
    return result;
  }

  @Post('retry-all-pending')
  @HttpCode(HttpStatus.ACCEPTED)
  async retryAllPending(@CurrentUser() user: CurrentUserPayload) {
    const result = await this.agentExecutionService.retryAllPendingJobs(user.userId, user.tenantId);
    return { data: result };
  }

  /**
   * POST /api/v1/agent-execution/jobs/:jobId/feedback
   * Send user feedback on a completed agent job. The agent learns from the feedback.
   */
  @Post('jobs/:jobId/feedback')
  @HttpCode(HttpStatus.OK)
  async submitJobFeedback(
    @Param('jobId') jobId: string,
    @Body() body: { feedback: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!body.feedback?.trim()) {
      throw new BadRequestException('Feedback text is required');
    }
    const result = await this.agentExecutionService.submitJobFeedback(
      jobId, body.feedback.trim(), user.userId, user.tenantId,
    );
    return { data: result };
  }

  @Get(':executionId')
  async getExecution(
    @Param('executionId') executionId: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    const execution = await this.agentExecutionService.getExecution(executionId, user.tenantId);
    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }
    return { data: execution };
  }
}
