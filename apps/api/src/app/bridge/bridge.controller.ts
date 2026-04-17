import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Headers,
  Res,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { BridgeService } from './bridge.service';
import { BrainStateService } from './brain-state.service';
import {
  ActionResultDto,
  ConceptSearchQuery,
  TenantIdQuery,
  ProposalListQuery,
  CreateProposalDto,
  UpdateProposalDto,
  CreateConceptDto,
  CreateTaskDto,
  TaskContributionDto,
  TaskProgressDto,
  TaskCompleteDto,
  AgentStatusDto,
  CreateMemoryDto,
  UpdateBrainStateDto,
  CreateConversationDto,
} from './dto/bridge.dto';

/**
 * Bridge API Controller
 *
 * REST endpoints that OpenClaw calls via the mentor-ai-bridge skill.
 * Authenticated via Bearer token (OPENCLAW_AUTH_TOKEN).
 * Not exposed publicly — only reachable from the OpenClaw server.
 *
 * Two categories:
 * - READ: OpenClaw queries state (concepts, context, budget, proposals)
 * - WRITE: OpenClaw updates state (tasks, proposals, agent status)
 *   → Each write emits WebSocket events to the tenant room
 */
@Controller('bridge')
export class BridgeController {
  private readonly authToken: string;
  private readonly defaultTenantId: string;

  constructor(
    private readonly bridgeService: BridgeService,
    private readonly brainStateService: BrainStateService,
    private readonly configService: ConfigService,
  ) {
    this.authToken = this.configService.get<string>('OPENCLAW_AUTH_TOKEN', '');
    // OPENCLAW_DEFAULT_TENANT_ID intentionally empty — body tenantId is always required
    this.defaultTenantId = '';
  }

  // ── Auth Guard ──

  private validateAuth(authorization: string | undefined): void {
    if (!this.authToken) return; // No token configured = dev mode bypass
    const token = authorization?.replace('Bearer ', '');
    if (token !== this.authToken) {
      throw new UnauthorizedException('Invalid bridge auth token');
    }
  }

  /**
   * Resolve tenantId: always use server-side default if configured.
   * This prevents OpenClaw from ever sending wrong/stale tenantId.
   */
  private resolveTenantId(requestedTenantId?: string): string {
    // Body/query tenantId takes priority; env default is only a fallback
    return requestedTenantId || this.defaultTenantId || '';
  }

  // ════════════════════════════════════════════
  //  READ Endpoints
  // ════════════════════════════════════════════

  @Get('concepts/search')
  async searchConcepts(
    @Headers('authorization') auth: string,
    @Query() query: ConceptSearchQuery,
  ) {
    this.validateAuth(auth);
    return this.bridgeService.searchConcepts(this.resolveTenantId(query.tenantId), query.q, query.limit);
  }

  // IMPORTANT: /pending must be declared BEFORE /:id to avoid NestJS matching "pending" as an :id param
  @Get('concepts/pending')
  async getPendingConcepts(
    @Headers('authorization') auth: string,
    @Query() query: TenantIdQuery,
  ) {
    this.validateAuth(auth);
    return this.bridgeService.getPendingConcepts(this.resolveTenantId(query.tenantId));
  }

  @Get('concepts/:id')
  async getConceptDetails(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
  ) {
    this.validateAuth(auth);
    return this.bridgeService.getConceptDetails(id);
  }

  @Get('categories')
  async getCategories(@Headers('authorization') auth: string) {
    this.validateAuth(auth);
    return this.bridgeService.getCategories();
  }

  @Get('brain-state')
  async getBrainState(
    @Headers('authorization') auth: string,
    @Query() query: TenantIdQuery,
  ) {
    this.validateAuth(auth);
    return this.brainStateService.getState(this.resolveTenantId(query.tenantId));
  }

  @Get('context/:tenantId')
  async getBusinessContext(
    @Headers('authorization') auth: string,
    @Param('tenantId') tenantId: string,
  ) {
    this.validateAuth(auth);
    return this.bridgeService.getBusinessContext(this.resolveTenantId(tenantId));
  }

  @Get('budget/:tenantId')
  async getBudget(
    @Headers('authorization') auth: string,
    @Param('tenantId') tenantId: string,
  ) {
    this.validateAuth(auth);
    return this.bridgeService.getBudget(this.resolveTenantId(tenantId));
  }

  @Get('proposals')
  async getProposals(
    @Headers('authorization') auth: string,
    @Query() query: ProposalListQuery,
  ) {
    this.validateAuth(auth);
    return this.bridgeService.getProposals(this.resolveTenantId(query.tenantId), query.status);
  }

  // ════════════════════════════════════════════
  //  WRITE Endpoints (each emits WebSocket event)
  // ════════════════════════════════════════════

  @Post('proposals')
  async createProposal(
    @Headers('authorization') auth: string,
    @Body() dto: CreateProposalDto,
  ) {
    this.validateAuth(auth);
    dto.tenantId = this.resolveTenantId(dto.tenantId);
    return this.bridgeService.createProposal(dto);
  }

  @Patch('proposals/:id')
  async updateProposal(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() dto: UpdateProposalDto,
  ) {
    this.validateAuth(auth);
    return this.bridgeService.updateProposal(id, dto);
  }

  @Post('concepts')
  async createConcept(
    @Headers('authorization') auth: string,
    @Body() dto: CreateConceptDto,
  ) {
    this.validateAuth(auth);
    dto.tenantId = this.resolveTenantId(dto.tenantId);
    return this.bridgeService.createConcept(dto);
  }

  @Post('conversations')
  async createConversation(
    @Headers('authorization') auth: string,
    @Body() dto: CreateConversationDto,
  ) {
    this.validateAuth(auth);
    dto.tenantId = this.resolveTenantId(dto.tenantId);
    return this.bridgeService.createConversation(dto);
  }

  @Post('tasks')
  async createTask(
    @Headers('authorization') auth: string,
    @Body() dto: CreateTaskDto,
  ) {
    this.validateAuth(auth);
    dto.tenantId = this.resolveTenantId(dto.tenantId);
    return this.bridgeService.createTask(dto);
  }

  @Post('task-contribution')
  async addTaskContribution(
    @Headers('authorization') auth: string,
    @Body() dto: TaskContributionDto,
  ) {
    this.validateAuth(auth);
    dto.tenantId = this.resolveTenantId(dto.tenantId);
    await this.bridgeService.addTaskContribution(dto);
    return { success: true };
  }

  @Post('task-progress')
  async updateTaskProgress(
    @Headers('authorization') auth: string,
    @Body() dto: TaskProgressDto,
  ) {
    this.validateAuth(auth);
    dto.tenantId = this.resolveTenantId(dto.tenantId);
    await this.bridgeService.updateTaskProgress(dto);
    return { success: true };
  }

  @Post('task-complete')
  async completeTask(
    @Headers('authorization') auth: string,
    @Body() dto: TaskCompleteDto,
  ) {
    this.validateAuth(auth);
    dto.tenantId = this.resolveTenantId(dto.tenantId);
    await this.bridgeService.completeTask(dto);
    return { success: true };
  }

  @Post('agent-status')
  async updateAgentStatus(
    @Headers('authorization') auth: string,
    @Body() dto: AgentStatusDto,
  ) {
    this.validateAuth(auth);
    dto.tenantId = this.resolveTenantId(dto.tenantId);
    await this.bridgeService.updateAgentStatus(dto);
    return { success: true };
  }

  @Post('memories')
  async createMemory(
    @Headers('authorization') auth: string,
    @Body() dto: CreateMemoryDto,
  ) {
    this.validateAuth(auth);
    dto.tenantId = this.resolveTenantId(dto.tenantId);
    return this.bridgeService.createMemory(dto);
  }

  @Get('memories')
  async listMemories(
    @Headers('authorization') auth: string,
    @Query('tenantId') tenantId: string,
    @Query('limit') limit?: string,
    @Query('subject') subject?: string,
    @Query('q') q?: string,
  ) {
    this.validateAuth(auth);
    const resolvedTenantId = this.resolveTenantId(tenantId);
    return this.bridgeService.listMemories({
      tenantId: resolvedTenantId,
      limit: limit ? Number(limit) : undefined,
      subject,
      q,
    });
  }

  @Post('brain-state')
  async updateBrainState(
    @Headers('authorization') auth: string,
    @Body() dto: UpdateBrainStateDto,
  ) {
    this.validateAuth(auth);
    dto.tenantId = this.resolveTenantId(dto.tenantId);
    await this.bridgeService.updateBrainState(dto);
    return { success: true };
  }

  @Post('action-result')
  async reportActionResult(
    @Headers('authorization') auth: string,
    @Body() dto: ActionResultDto,
  ) {
    this.validateAuth(auth);
    await this.bridgeService.updateActionResult(
      dto.tenantId, dto.noteId, dto.agentType, dto.actionId, dto.status, dto.result,
    );
    return { success: true };
  }

  // ════════════════════════════════════════════
  //  File Proxy (download from OpenClaw workspace)
  // ════════════════════════════════════════════

  /**
   * Proxy file download from OpenClaw workspace on Hetzner.
   * Used by frontend to download deliverable files produced by agents.
   * Auth: accepts both bridge token and user JWT (via notes controller proxy).
   */
  @Get('files')
  async downloadFile(
    @Headers('authorization') auth: string,
    @Query('path') filePath: string,
    @Query('tenantId') tenantId: string,
    @Res() res: Response,
  ) {
    this.validateAuth(auth);

    if (!filePath || !tenantId) {
      throw new BadRequestException('path and tenantId are required');
    }

    // Security: prevent path traversal
    if (filePath.includes('..') || filePath.includes('~') || !filePath.startsWith('/root/.openclaw-')) {
      throw new BadRequestException('Invalid file path');
    }

    // Verify the path belongs to the requesting tenant
    if (!filePath.includes(`.openclaw-${tenantId}`)) {
      throw new BadRequestException('File path does not belong to this tenant');
    }

    const fileData = await this.bridgeService.readFileFromWorkspace(tenantId, filePath);

    // Determine content type from extension
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const mimeTypes: Record<string, string> = {
      'md': 'text/markdown',
      'txt': 'text/plain',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'json': 'application/json',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'pdf': 'application/pdf',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'svg': 'image/svg+xml',
      'csv': 'text/csv',
      'zip': 'application/zip',
    };
    const contentType = mimeTypes[ext] ?? 'application/octet-stream';
    const filename = filePath.split('/').pop() ?? 'download';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fileData);
  }
}
