import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DepartmentGuard } from '../knowledge/guards/department.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { UpdatePersonaDto } from '../personas/dto/update-persona.dto';
import { CurriculumService } from '../knowledge/services/curriculum.service';
import { ConceptService } from '../knowledge/services/concept.service';
import { ConceptPlanService } from './concept-plan.service';

/**
 * Controller for chat conversation management.
 * All endpoints require JWT authentication.
 * Operations are tenant-scoped through the user's JWT claims.
 */
@Controller('v1/conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly curriculumService: CurriculumService,
    private readonly conceptService: ConceptService,
    private readonly conceptPlanService: ConceptPlanService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a new conversation.
   * If curriculumId is provided, ensures the concept exists in DB first.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createConversation(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateConversationDto
  ) {
    let conceptId = dto.conceptId;

    // If curriculumId is provided, ensure concept exists and get its ID
    if (dto.curriculumId && !conceptId) {
      conceptId = await this.curriculumService.ensureConceptExists(dto.curriculumId);

      // Story 2.13: Fire-and-forget dynamic relationship creation for newly created concepts
      // Deviation: uses .catch() instead of try/catch — fire-and-forget pattern requires it
      if (conceptId) {
        this.conceptService.createDynamicRelationships(conceptId).catch(() => {
          /* non-blocking */
        });
      }
    }

    const conversation = await this.conversationService.createConversation(
      user.tenantId,
      user.userId,
      dto.title,
      dto.personaType,
      conceptId
    );

    // Auto Concept Plan: fire-and-forget plan creation or next-step suggestion.
    //
    // CRITICAL: this path uses the legacy internal HeadlessExecutorService
    // pipeline (synthesis → job planning → Gemini/DeepSeek agents). When
    // BRAIN_RELAY_MODE=true the brain is OpenClaw — the user has explicitly
    // chosen to delegate ALL orchestration to OpenClaw via SOUL.md, and the
    // internal pipeline must NOT auto-fire because:
    //   1. It bypasses OpenClaw entirely (wrong brain)
    //   2. It runs without user approval (wrong gating)
    //   3. It auto-creates tasks the user didn't ask for
    // The user-facing symptom is "I clicked Discuss and it just started
    // executing without my confirmation". Don't reintroduce this without
    // a very good reason.
    // Additionally, even when relay mode is OFF the proposal-discussion flow
    // explicitly opts out via `dto.skipAutoTrigger` so clicking "Discuss"
    // never spawns a background plan that the user didn't ask for.
    const relayMode = this.configService.get<string>('BRAIN_RELAY_MODE', 'false') === 'true';
    if (conceptId && !relayMode && !dto.skipAutoTrigger) {
      this.conceptPlanService
        .triggerConceptPlan(conceptId, conversation.id, user.userId, user.tenantId)
        .catch(() => {
          /* logged inside service */
        });
    }

    return { data: conversation };
  }

  /**
   * List all conversations for the current user.
   * Returns conversations without messages, sorted by most recent.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listConversations(@CurrentUser() user: CurrentUserPayload) {
    const conversations = await this.conversationService.listConversations(
      user.tenantId,
      user.userId
    );

    return { data: conversations };
  }

  /**
   * List conversations grouped by concept category for tree display.
   */
  @Get('grouped')
  @HttpCode(HttpStatus.OK)
  async listGroupedConversations(@CurrentUser() user: CurrentUserPayload) {
    const tree = await this.conversationService.listGroupedConversations(
      user.tenantId,
      user.userId
    );

    return { data: tree };
  }

  /**
   * Business Brain tree — active + pending concepts grouped by category (Story 3.2).
   * Filtered by the user's department → visible categories.
   */
  @Get('brain-tree')
  @HttpCode(HttpStatus.OK)
  async getBrainTree(@CurrentUser() user: CurrentUserPayload) {
    const tree = await this.conversationService.getBrainTree(
      user.tenantId,
      user.userId,
      user.department,
      user.role
    );

    return { data: tree };
  }

  /**
   * Get a single conversation with all its messages.
   * Validates ownership and department scope before returning.
   */
  @Get(':id')
  @UseGuards(DepartmentGuard)
  @HttpCode(HttpStatus.OK)
  async getConversation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') conversationId: string
  ) {
    const conversation = await this.conversationService.getConversation(
      user.tenantId,
      conversationId,
      user.userId
    );

    return { data: conversation };
  }

  /**
   * Delete a conversation and all its messages.
   * Validates ownership before deletion.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConversation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') conversationId: string
  ) {
    await this.conversationService.deleteConversation(user.tenantId, conversationId, user.userId);
  }

  /**
   * Update the persona for a conversation.
   * Allows switching personas mid-conversation while maintaining context.
   * @param conversationId - Conversation ID to update
   * @param dto.personaType - New persona type
   */
  @Patch(':id/persona')
  @HttpCode(HttpStatus.OK)
  async updatePersona(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') conversationId: string,
    @Body() dto: UpdatePersonaDto
  ) {
    const conversation = await this.conversationService.updatePersona(
      user.tenantId,
      conversationId,
      user.userId,
      dto.personaType
    );

    return { data: conversation };
  }

  /**
   * Rename a conversation (update its title).
   * Placed AFTER :id/persona to avoid route collision.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateConversation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') conversationId: string,
    @Body() dto: UpdateConversationDto
  ) {
    const conversation = await this.conversationService.updateTitle(
      user.tenantId,
      conversationId,
      user.userId,
      dto.title
    );
    return { data: conversation };
  }
}
