import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { NotesService } from './notes.service';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';
import { CreateCommentDto, UpdateCommentDto } from './dto/comment.dto';

@Controller('v1/notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

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
