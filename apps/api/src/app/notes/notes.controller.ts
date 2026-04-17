import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  forwardRef,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { NotesService } from './notes.service';
import { BridgeService } from '../bridge/bridge.service';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';
import { CreateCommentDto, UpdateCommentDto } from './dto/comment.dto';
import { TaskHubQueryDto } from './dto/task-hub-query.dto';

@Controller('v1/notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(
    private readonly notesService: NotesService,
    @Inject(forwardRef(() => BridgeService))
    private readonly bridgeService: BridgeService,
  ) {}

  /**
   * Create a new note (manual).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createNote(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      title: string;
      content: string;
      noteType?: string;
      status?: string;
      conversationId?: string;
      conceptId?: string;
    }
  ) {
    const result = await this.notesService.createNote({
      title: body.title,
      content: body.content,
      source: NoteSource.MANUAL,
      noteType: (body.noteType as NoteType) ?? NoteType.NOTE,
      status:
        body.noteType === 'TASK' ? ((body.status as NoteStatus) ?? NoteStatus.PENDING) : undefined,
      conversationId: body.conversationId,
      conceptId: body.conceptId,
      userId: user.userId,
      tenantId: user.tenantId,
    });
    return { data: result };
  }

  /**
   * Get all tasks for the Task Hub.
   * Must be defined BEFORE parametric routes to avoid conflict with :id.
   */
  @Get('tasks')
  async getAllTasks(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: TaskHubQueryDto
  ) {
    const result = await this.notesService.getAllTasks(user.tenantId, {
      status: query.status,
      category: query.category,
      search: query.search,
      hasJobs: query.hasJobs === 'true',
      page: query.page,
      limit: query.limit,
    });
    return {
      data: result,
      // Echo currently-running noteIds so the frontend can show the running
      // spinner immediately on page load (without waiting for WS events).
      // Backed by an in-memory Set in BridgeService.
      runningTaskIds: this.bridgeService.getRunningTaskIds(user.tenantId),
    };
  }

  /**
   * Get notes for a specific conversation.
   */
  @Get('conversation/:conversationId')
  async getByConversation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('conversationId') conversationId: string
  ) {
    const notes = await this.notesService.getByConversation(
      conversationId,
      user.userId,
      user.tenantId
    );
    return { data: notes };
  }

  /**
   * Get notes for a specific concept.
   */
  @Get('concept/:conceptId')
  async getByConcept(
    @CurrentUser() user: CurrentUserPayload,
    @Param('conceptId') conceptId: string
  ) {
    const notes = await this.notesService.getByConcept(conceptId, user.userId, user.tenantId);
    return { data: notes };
  }

  // ── Brain Proposals + Actions (must be BEFORE parametric :id route) ──

  @Get('proposals')
  async getProposals(
    @CurrentUser() user: CurrentUserPayload,
    @Query('status') status?: string,
  ) {
    return this.bridgeService.getProposals(user.tenantId, status);
  }

  @Patch('proposals/:id/approve')
  async approveProposal(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body()
    body: {
      updatedAction?: string;
      expectedDeliverables?: Array<{ type: string; filename: string; description: string }>;
    },
  ) {
    // The chat "Confirm plan and run" flow passes both updatedAction and
    // expectedDeliverables — the manifest locked in during discussion. Pass
    // both through so bridgeService.updateProposal can persist the locked
    // manifest onto the new Note.
    return this.bridgeService.updateProposal(id, {
      status: 'approved',
      approvedBy: user.userId,
      ...(body?.updatedAction ? { proposedAction: body.updatedAction } : {}),
      ...(body?.expectedDeliverables && body.expectedDeliverables.length > 0
        ? { expectedDeliverables: body.expectedDeliverables as any }
        : {}),
    });
  }

  @Patch('proposals/:id/reject')
  async rejectProposal(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.bridgeService.updateProposal(id, {
      status: 'rejected',
      rejectedReason: body.reason,
      approvedBy: user.userId,
    });
  }

  /**
   * Execute tasks via OpenClaw Brain (brain relay mode).
   * Sends task details to OpenClaw director who decides how to execute them.
   */
  @Post('execute-via-brain')
  async executeViaBrain(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { taskIds: string[] },
  ) {
    if (!body.taskIds?.length) {
      throw new BadRequestException('taskIds array is required');
    }
    const result = await this.bridgeService.executeTasksViaBrain(
      user.tenantId, user.userId, body.taskIds,
    );
    return { data: result };
  }

  @Post('actions/execute')
  async executeAction(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { noteId: string; agentType: string; actionId: string },
  ) {
    await this.bridgeService.executeAction(
      user.tenantId, body.noteId, body.agentType, body.actionId, user.userId,
    );
    return { success: true };
  }

  @Get('files/scan/:noteId')
  async scanDeliverables(
    @CurrentUser() user: CurrentUserPayload,
    @Param('noteId') noteId: string,
  ) {
    const files = await this.bridgeService.scanTaskDeliverables(noteId);
    return { data: files };
  }

  @Get('files/download')
  async downloadFile(
    @CurrentUser() user: CurrentUserPayload,
    @Query('path') filePath: string,
    @Res() res: Response,
  ) {
    if (!filePath) {
      throw new BadRequestException('path query parameter is required');
    }
    // Allow files from tenant workspace OR shared workspace deliverables
    const isTenantFile = filePath.includes(`.openclaw-${user.tenantId}`);
    const isDeliverable = filePath.includes('/deliverables/');
    if (!isTenantFile && !isDeliverable) {
      throw new BadRequestException('File does not belong to your tenant');
    }
    const fileData = await this.bridgeService.readFileFromWorkspace(user.tenantId, filePath);
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const mimeTypes: Record<string, string> = {
      md: 'text/markdown', txt: 'text/plain', html: 'text/html',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
      svg: 'image/svg+xml', csv: 'text/csv', zip: 'application/zip',
    };
    const filename = filePath.split('/').pop() ?? 'download';
    res.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fileData);
  }

  // ── Parametric routes (MUST come after literal routes) ──

  /**
   * Get a single note by ID (with children).
   */
  @Get(':id')
  async getById(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string
  ) {
    const note = await this.notesService.getNoteByIdWithChildren(id, user.tenantId);
    if (!note) {
      throw new NotFoundException(`Note ${id} not found`);
    }
    return { data: note };
  }

  /**
   * Update a note's status (toggle task completion).
   */
  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: { status: string }
  ) {
    const note = await this.notesService.updateStatus(id, body.status as NoteStatus, user.tenantId);
    return { data: note };
  }

  /**
   * Update a note's title and/or content.
   */
  @Patch(':id')
  async updateNote(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: { title?: string; content?: string }
  ) {
    const note = await this.notesService.updateNote(id, body.title, body.content, user.tenantId);
    return { data: note };
  }

  /**
   * Submit a user completion report for a note/task.
   */
  @Post(':id/report')
  async submitReport(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: { report: string }
  ) {
    const note = await this.notesService.submitReport(id, body.report, user.tenantId);
    return { data: note };
  }

  /**
   * AI-generate a completion report for a task.
   * Returns the generated text for user review before submission.
   */
  @Post(':id/generate-report')
  async generateReport(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    const report = await this.notesService.generateReport(id, user.userId, user.tenantId);
    return { data: { report } };
  }

  /**
   * AI-score a user's completion report.
   */
  @Post(':id/score')
  async scoreReport(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    const note = await this.notesService.scoreReport(id, user.userId, user.tenantId);
    return { data: note };
  }

  // ─── Comment endpoints (Story 3.4 AC4) ─────────────────

  /**
   * Create a comment on a task or workflow step.
   */
  @Post(':taskId/comments')
  @HttpCode(HttpStatus.CREATED)
  async createComment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('taskId') taskId: string,
    @Body() body: CreateCommentDto
  ) {
    const comment = await this.notesService.createComment(
      taskId,
      body.content,
      user.userId,
      user.tenantId
    );
    return { data: comment };
  }

  /**
   * Get comments for a task or workflow step.
   * Supports pagination via ?page=1&limit=50 query params.
   */
  @Get(':taskId/comments')
  async getComments(
    @CurrentUser() user: CurrentUserPayload,
    @Param('taskId') taskId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const result = await this.notesService.getCommentsByTask(
      taskId,
      user.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50
    );
    return { data: result };
  }

  /**
   * Edit a comment (author-only).
   */
  @Patch(':commentId/comment')
  async updateComment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('commentId') commentId: string,
    @Body() body: UpdateCommentDto
  ) {
    const updated = await this.notesService.updateComment(
      commentId,
      body.content,
      user.userId,
      user.tenantId
    );
    return { data: updated };
  }

  /**
   * Delete a comment (author or owner only).
   */
  @Delete(':commentId/comment')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteComment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('commentId') commentId: string
  ) {
    await this.notesService.deleteComment(commentId, user.userId, user.role, user.tenantId);
  }

  /**
   * Delete a note.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteNote(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.notesService.deleteNote(id, user.tenantId);
  }

}
