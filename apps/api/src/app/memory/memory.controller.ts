import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { IsString, Equals } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { MemoryService } from './services/memory.service';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import type {
  Memory,
  MemoryType,
  MemoryListResponse,
  MemoryResponse,
  MemoryDeleteResponse,
} from '@mentor-ai/shared/types';

/**
 * Request body for forgetting all memories.
 * Requires typing "FORGET" to confirm deletion.
 */
class ForgetAllDto {
  @IsString()
  confirmation!: string;
}

/**
 * Controller for memory management endpoints.
 * All endpoints require JWT authentication.
 * Operations are tenant-scoped through the user's JWT claims.
 *
 * Story 2.7: Persistent Memory Across Conversations
 */
@Controller('v1/memory')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  private readonly logger = new Logger(MemoryController.name);

  constructor(private readonly memoryService: MemoryService) {}

  /**
   * Lists all memories for the current user.
   *
   * @param type - Filter by memory type
   * @param subject - Filter by subject (client/project name)
   * @param search - Search in content
   * @param limit - Max results (default 20, max 100)
   * @param offset - Pagination offset
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listMemories(
    @CurrentUser() user: CurrentUserPayload,
    @Query('type') type?: MemoryType,
    @Query('subject') subject?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ): Promise<MemoryListResponse> {
    this.logger.log({
      message: 'Listing memories',
      userId: user.userId,
      tenantId: user.tenantId,
      type,
      subject,
      search,
    });

    const result = await this.memoryService.findMemories(
      user.tenantId,
      user.userId,
      {
        type,
        subject,
        search,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      }
    );

    return {
      data: result.data,
      meta: result.meta,
    };
  }

  /**
   * Gets a single memory by ID.
   *
   * @param id - Memory ID (mem_ prefix)
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getMemory(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') memoryId: string
  ): Promise<MemoryResponse> {
    this.logger.log({
      message: 'Getting memory',
      memoryId,
      userId: user.userId,
      tenantId: user.tenantId,
    });

    const memory = await this.memoryService.getMemory(
      user.tenantId,
      memoryId,
      user.userId
    );

    return {
      data: memory,
    };
  }

  /**
   * Creates a new memory entry.
   * Typically used for user-stated memories rather than AI-extracted ones.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createMemory(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateMemoryDto
  ): Promise<MemoryResponse> {
    this.logger.log({
      message: 'Creating memory',
      userId: user.userId,
      tenantId: user.tenantId,
      type: dto.type,
      source: dto.source,
    });

    const memory = await this.memoryService.createMemory(
      user.tenantId,
      user.userId,
      dto
    );

    return {
      data: memory,
    };
  }

  /**
   * Updates/corrects a memory entry.
   * Source is automatically set to USER_CORRECTED.
   *
   * @param id - Memory ID (mem_ prefix)
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateMemory(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') memoryId: string,
    @Body() dto: UpdateMemoryDto
  ): Promise<MemoryResponse> {
    this.logger.log({
      message: 'Updating memory',
      memoryId,
      userId: user.userId,
      tenantId: user.tenantId,
    });

    const memory = await this.memoryService.updateMemory(
      user.tenantId,
      memoryId,
      user.userId,
      dto
    );

    return {
      data: memory,
    };
  }

  /**
   * Soft-deletes a memory entry.
   * The memory is marked as deleted but not physically removed.
   *
   * @param id - Memory ID (mem_ prefix)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteMemory(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') memoryId: string
  ): Promise<MemoryDeleteResponse> {
    this.logger.log({
      message: 'Deleting memory',
      memoryId,
      userId: user.userId,
      tenantId: user.tenantId,
    });

    await this.memoryService.deleteMemory(user.tenantId, memoryId, user.userId);

    return {
      success: true,
      message: 'Memory deleted successfully',
    };
  }

  /**
   * Forgets all memories for the current user.
   * Requires typing "FORGET" to confirm.
   */
  @Post('forget-all')
  @HttpCode(HttpStatus.OK)
  async forgetAll(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ForgetAllDto
  ): Promise<{ success: boolean; deletedCount: number }> {
    this.logger.warn({
      message: 'User requesting to forget all memories',
      userId: user.userId,
      tenantId: user.tenantId,
    });

    const result = await this.memoryService.forgetAll(
      user.tenantId,
      user.userId,
      dto.confirmation
    );

    return {
      success: true,
      deletedCount: result.deletedCount,
    };
  }
}
