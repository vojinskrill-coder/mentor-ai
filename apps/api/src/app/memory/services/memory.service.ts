import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { TenantPrismaService } from '@mentor-ai/shared/tenant-context';
import type {
  Memory,
  MemoryType,
  MemorySource,
} from '@mentor-ai/shared/types';
import { CreateMemoryDto } from '../dto/create-memory.dto';
import { UpdateMemoryDto } from '../dto/update-memory.dto';

/**
 * Query options for listing memories.
 */
export interface MemoryQueryOptions {
  /** Filter by memory type */
  type?: MemoryType;
  /** Filter by subject (client/project name) */
  subject?: string;
  /** Search query for content */
  search?: string;
  /** Pagination limit */
  limit?: number;
  /** Pagination offset */
  offset?: number;
  /** Include soft-deleted memories */
  includeDeleted?: boolean;
}

/**
 * Service for managing user memories.
 * All operations are tenant-scoped through the TenantPrismaService.
 *
 * Story 2.7: Persistent Memory Across Conversations
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Creates a new memory entry.
   *
   * @param tenantId - Tenant ID for database isolation
   * @param userId - User ID who owns the memory
   * @param dto - Memory creation data
   * @returns Created memory
   */
  async createMemory(
    tenantId: string,
    userId: string,
    dto: CreateMemoryDto
  ): Promise<Memory> {
    const prisma = await this.tenantPrisma.getClient(tenantId);
    const memoryId = `mem_${createId()}`;

    const memory = await prisma.memory.create({
      data: {
        id: memoryId,
        tenantId,
        userId,
        type: dto.type,
        source: dto.source,
        content: dto.content,
        subject: dto.subject ?? null,
        confidence: dto.confidence ?? 1.0,
        sourceMessageId: dto.sourceMessageId ?? null,
      },
    });

    this.logger.log({
      message: 'Memory created',
      memoryId,
      userId,
      tenantId,
      type: dto.type,
      source: dto.source,
      subject: dto.subject ?? 'none',
    });

    return this.mapMemory(memory);
  }

  /**
   * Finds memories for a user with optional filtering.
   *
   * @param tenantId - Tenant ID for database isolation
   * @param userId - User ID to filter memories
   * @param options - Query options for filtering and pagination
   * @returns Paginated list of memories with total count
   */
  async findMemories(
    tenantId: string,
    userId: string,
    options: MemoryQueryOptions = {}
  ): Promise<{ data: Memory[]; meta: { total: number; limit: number; offset: number } }> {
    const prisma = await this.tenantPrisma.getClient(tenantId);
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;

    const where: Record<string, unknown> = {
      tenantId,
      userId,
    };

    // Only include non-deleted memories by default
    if (!options.includeDeleted) {
      where.isDeleted = false;
    }

    if (options.type) {
      where.type = options.type;
    }

    if (options.subject) {
      where.subject = { contains: options.subject, mode: 'insensitive' };
    }

    if (options.search) {
      where.content = { contains: options.search, mode: 'insensitive' };
    }

    const [memories, total] = await Promise.all([
      prisma.memory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.memory.count({ where }),
    ]);

    this.logger.debug({
      message: 'Memories query executed',
      userId,
      tenantId,
      type: options.type,
      resultCount: memories.length,
      total,
    });

    return {
      data: memories.map((m) => this.mapMemory(m)),
      meta: { total, limit, offset },
    };
  }

  /**
   * Finds relevant memories for a query using keyword matching.
   * This is a fallback method when semantic search is not available.
   *
   * @param tenantId - Tenant ID for database isolation
   * @param userId - User ID to filter memories
   * @param query - Search query
   * @param limit - Maximum number of results
   * @returns List of relevant memories
   */
  async findRelevantMemories(
    tenantId: string,
    userId: string,
    query: string,
    limit: number = 10
  ): Promise<Memory[]> {
    const prisma = await this.tenantPrisma.getClient(tenantId);

    // Simple keyword search - will be enhanced with semantic search via MemoryEmbeddingService
    const memories = await prisma.memory.findMany({
      where: {
        tenantId,
        userId,
        isDeleted: false,
        OR: [
          { content: { contains: query, mode: 'insensitive' } },
          { subject: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    this.logger.debug({
      message: 'Relevant memories search',
      userId,
      tenantId,
      query: query.substring(0, 50),
      resultCount: memories.length,
    });

    return memories.map((m) => this.mapMemory(m));
  }

  /**
   * Gets a single memory by ID.
   *
   * @param tenantId - Tenant ID for database isolation
   * @param memoryId - Memory ID to retrieve
   * @param userId - User ID for ownership verification
   * @returns Memory entry
   * @throws NotFoundException if memory not found
   * @throws ForbiddenException if user doesn't own the memory
   */
  async getMemory(
    tenantId: string,
    memoryId: string,
    userId: string
  ): Promise<Memory> {
    const prisma = await this.tenantPrisma.getClient(tenantId);

    const memory = await prisma.memory.findUnique({
      where: { id: memoryId },
    });

    if (!memory) {
      throw new NotFoundException({
        type: 'memory_not_found',
        title: 'Memory Not Found',
        status: 404,
        detail: `Memory with ID ${memoryId} not found`,
      });
    }

    if (memory.userId !== userId || memory.tenantId !== tenantId) {
      throw new ForbiddenException({
        type: 'memory_access_denied',
        title: 'Access Denied',
        status: 403,
        detail: 'You do not have access to this memory',
      });
    }

    return this.mapMemory(memory);
  }

  /**
   * Updates/corrects a memory entry.
   * Source is automatically set to USER_CORRECTED.
   *
   * @param tenantId - Tenant ID for database isolation
   * @param memoryId - Memory ID to update
   * @param userId - User ID for ownership verification
   * @param dto - Update data
   * @returns Updated memory
   * @throws NotFoundException if memory not found
   * @throws ForbiddenException if user doesn't own the memory
   */
  async updateMemory(
    tenantId: string,
    memoryId: string,
    userId: string,
    dto: UpdateMemoryDto
  ): Promise<Memory> {
    const prisma = await this.tenantPrisma.getClient(tenantId);

    // Verify ownership first
    await this.getMemory(tenantId, memoryId, userId);

    const updated = await prisma.memory.update({
      where: { id: memoryId },
      data: {
        content: dto.content,
        subject: dto.subject,
        source: 'USER_CORRECTED',
        confidence: 1.0, // User corrections have full confidence
      },
    });

    this.logger.log({
      message: 'Memory updated',
      memoryId,
      userId,
      tenantId,
      newSource: 'USER_CORRECTED',
    });

    return this.mapMemory(updated);
  }

  /**
   * Soft-deletes a memory entry.
   *
   * @param tenantId - Tenant ID for database isolation
   * @param memoryId - Memory ID to delete
   * @param userId - User ID for ownership verification
   * @throws NotFoundException if memory not found
   * @throws ForbiddenException if user doesn't own the memory
   */
  async deleteMemory(
    tenantId: string,
    memoryId: string,
    userId: string
  ): Promise<void> {
    const prisma = await this.tenantPrisma.getClient(tenantId);

    // Verify ownership first
    await this.getMemory(tenantId, memoryId, userId);

    await prisma.memory.update({
      where: { id: memoryId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    this.logger.log({
      message: 'Memory soft-deleted',
      memoryId,
      userId,
      tenantId,
    });
  }

  /**
   * Deletes all memories for a user (with confirmation).
   *
   * @param tenantId - Tenant ID for database isolation
   * @param userId - User ID whose memories to delete
   * @param confirmation - Must be "FORGET" to proceed
   * @returns Number of memories deleted
   * @throws ForbiddenException if confirmation is incorrect
   */
  async forgetAll(
    tenantId: string,
    userId: string,
    confirmation: string
  ): Promise<{ deletedCount: number }> {
    if (confirmation !== 'FORGET') {
      throw new ForbiddenException({
        type: 'invalid_confirmation',
        title: 'Invalid Confirmation',
        status: 403,
        detail: 'You must type "FORGET" to confirm deletion of all memories',
      });
    }

    const prisma = await this.tenantPrisma.getClient(tenantId);

    const result = await prisma.memory.updateMany({
      where: {
        tenantId,
        userId,
        isDeleted: false,
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    this.logger.warn({
      message: 'All memories soft-deleted for user',
      userId,
      tenantId,
      deletedCount: result.count,
    });

    return { deletedCount: result.count };
  }

  /**
   * Updates the embedding ID for a memory after vector generation.
   *
   * @param tenantId - Tenant ID for database isolation
   * @param memoryId - Memory ID to update
   * @param embeddingId - Qdrant vector ID
   */
  async updateEmbeddingId(
    tenantId: string,
    memoryId: string,
    embeddingId: string
  ): Promise<void> {
    const prisma = await this.tenantPrisma.getClient(tenantId);

    await prisma.memory.update({
      where: { id: memoryId },
      data: { embeddingId },
    });

    this.logger.debug({
      message: 'Memory embedding ID updated',
      memoryId,
      tenantId,
      embeddingId,
    });
  }

  /**
   * Maps a Prisma memory record to the Memory interface.
   */
  private mapMemory(memory: {
    id: string;
    tenantId: string;
    userId: string;
    type: string;
    source: string;
    content: string;
    subject: string | null;
    confidence: number;
    embeddingId: string | null;
    sourceMessageId: string | null;
    isDeleted: boolean;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): Memory {
    return {
      id: memory.id,
      tenantId: memory.tenantId,
      userId: memory.userId,
      type: memory.type as MemoryType,
      source: memory.source as MemorySource,
      content: memory.content,
      subject: memory.subject ?? undefined,
      confidence: memory.confidence,
      embeddingId: memory.embeddingId ?? undefined,
      sourceMessageId: memory.sourceMessageId ?? undefined,
      isDeleted: memory.isDeleted,
      deletedAt: memory.deletedAt?.toISOString(),
      createdAt: memory.createdAt.toISOString(),
      updatedAt: memory.updatedAt.toISOString(),
    };
  }
}
