import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { NotesService } from './notes.service';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';

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
      status: body.noteType === 'TASK' ? ((body.status as NoteStatus) ?? NoteStatus.PENDING) : undefined,
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
    const notes = await this.notesService.getByConcept(
      conceptId,
      user.userId,
      user.tenantId
    );
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
    const note = await this.notesService.updateStatus(
      id,
      body.status as NoteStatus,
      user.tenantId
    );
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
    const note = await this.notesService.updateNote(
      id,
      body.title,
      body.content,
      user.tenantId
    );
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
    const note = await this.notesService.submitReport(
      id,
      body.report,
      user.tenantId
    );
    return { data: note };
  }

  /**
   * AI-score a user's completion report.
   */
  @Post(':id/score')
  async scoreReport(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string
  ) {
    const note = await this.notesService.scoreReport(
      id,
      user.userId,
      user.tenantId
    );
    return { data: note };
  }

  /**
   * Delete a note.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteNote(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string
  ) {
    await this.notesService.deleteNote(id, user.tenantId);
  }
}
