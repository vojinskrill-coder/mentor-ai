import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { TenantPrismaService } from '@mentor-ai/shared/tenant-context';
import { MemoryType, MemorySource } from '@mentor-ai/shared/types';

describe('MemoryService', () => {
  let service: MemoryService;
  let mockPrismaClient: {
    memory: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let mockTenantPrismaService: { getClient: jest.Mock };

  const mockTenantId = 'tnt_test123';
  const mockUserId = 'usr_test456';
  const mockMemoryId = 'mem_test789';

  const mockMemory = {
    id: mockMemoryId,
    tenantId: mockTenantId,
    userId: mockUserId,
    type: 'CLIENT_CONTEXT',
    source: 'AI_EXTRACTED',
    content: 'Acme Corp has a budget of $50,000',
    subject: 'Acme Corp',
    confidence: 0.92,
    embeddingId: null,
    sourceMessageId: 'msg_abc123',
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockPrismaClient = {
      memory: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
    };

    mockTenantPrismaService = {
      getClient: jest.fn().mockResolvedValue(mockPrismaClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryService,
        {
          provide: TenantPrismaService,
          useValue: mockTenantPrismaService,
        },
      ],
    }).compile();

    service = module.get<MemoryService>(MemoryService);
  });

  describe('createMemory', () => {
    it('should create a memory with mem_ prefix', async () => {
      mockPrismaClient.memory.create.mockResolvedValue(mockMemory);

      const result = await service.createMemory(mockTenantId, mockUserId, {
        type: MemoryType.CLIENT_CONTEXT,
        source: MemorySource.AI_EXTRACTED,
        content: 'Acme Corp has a budget of $50,000',
        subject: 'Acme Corp',
        confidence: 0.92,
      });

      expect(result.id).toBe(mockMemoryId);
      expect(result.type).toBe(MemoryType.CLIENT_CONTEXT);
      expect(result.source).toBe(MemorySource.AI_EXTRACTED);
      expect(result.content).toBe('Acme Corp has a budget of $50,000');
      expect(result.subject).toBe('Acme Corp');
    });

    it('should use default confidence of 1.0 when not provided', async () => {
      mockPrismaClient.memory.create.mockImplementation(async (args) => ({
        ...mockMemory,
        confidence: args.data.confidence,
      }));

      await service.createMemory(mockTenantId, mockUserId, {
        type: MemoryType.FACTUAL_STATEMENT,
        source: MemorySource.USER_STATED,
        content: 'The project deadline is next Friday',
      });

      expect(mockPrismaClient.memory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            confidence: 1.0,
          }),
        })
      );
    });
  });

  describe('findMemories', () => {
    it('should return paginated memories', async () => {
      const memories = [mockMemory, { ...mockMemory, id: 'mem_test2' }];
      mockPrismaClient.memory.findMany.mockResolvedValue(memories);
      mockPrismaClient.memory.count.mockResolvedValue(2);

      const result = await service.findMemories(mockTenantId, mockUserId, {
        limit: 20,
        offset: 0,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.offset).toBe(0);
    });

    it('should filter by memory type', async () => {
      mockPrismaClient.memory.findMany.mockResolvedValue([mockMemory]);
      mockPrismaClient.memory.count.mockResolvedValue(1);

      await service.findMemories(mockTenantId, mockUserId, {
        type: MemoryType.CLIENT_CONTEXT,
      });

      expect(mockPrismaClient.memory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: MemoryType.CLIENT_CONTEXT,
          }),
        })
      );
    });

    it('should exclude deleted memories by default', async () => {
      mockPrismaClient.memory.findMany.mockResolvedValue([]);
      mockPrismaClient.memory.count.mockResolvedValue(0);

      await service.findMemories(mockTenantId, mockUserId, {});

      expect(mockPrismaClient.memory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
          }),
        })
      );
    });

    it('should limit to max 100 results', async () => {
      mockPrismaClient.memory.findMany.mockResolvedValue([]);
      mockPrismaClient.memory.count.mockResolvedValue(0);

      await service.findMemories(mockTenantId, mockUserId, { limit: 200 });

      expect(mockPrismaClient.memory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });
  });

  describe('findRelevantMemories', () => {
    it('should search by query in content and subject', async () => {
      mockPrismaClient.memory.findMany.mockResolvedValue([mockMemory]);

      const result = await service.findRelevantMemories(
        mockTenantId,
        mockUserId,
        'Acme',
        10
      );

      expect(result).toHaveLength(1);
      expect(mockPrismaClient.memory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { content: { contains: 'Acme', mode: 'insensitive' } },
              { subject: { contains: 'Acme', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });
  });

  describe('getMemory', () => {
    it('should return memory when user owns it', async () => {
      mockPrismaClient.memory.findUnique.mockResolvedValue(mockMemory);

      const result = await service.getMemory(mockTenantId, mockMemoryId, mockUserId);

      expect(result.id).toBe(mockMemoryId);
    });

    it('should throw NotFoundException when memory does not exist', async () => {
      mockPrismaClient.memory.findUnique.mockResolvedValue(null);

      await expect(
        service.getMemory(mockTenantId, 'mem_nonexistent', mockUserId)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user does not own memory', async () => {
      mockPrismaClient.memory.findUnique.mockResolvedValue({
        ...mockMemory,
        userId: 'usr_other',
      });

      await expect(
        service.getMemory(mockTenantId, mockMemoryId, mockUserId)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for wrong tenant', async () => {
      mockPrismaClient.memory.findUnique.mockResolvedValue({
        ...mockMemory,
        tenantId: 'tnt_other',
      });

      await expect(
        service.getMemory(mockTenantId, mockMemoryId, mockUserId)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateMemory', () => {
    it('should update memory content and set source to USER_CORRECTED', async () => {
      mockPrismaClient.memory.findUnique.mockResolvedValue(mockMemory);
      mockPrismaClient.memory.update.mockResolvedValue({
        ...mockMemory,
        content: 'Acme Corp has a budget of $75,000',
        source: 'USER_CORRECTED',
        confidence: 1.0,
      });

      const result = await service.updateMemory(mockTenantId, mockMemoryId, mockUserId, {
        content: 'Acme Corp has a budget of $75,000',
      });

      expect(result.content).toBe('Acme Corp has a budget of $75,000');
      expect(result.source).toBe(MemorySource.USER_CORRECTED);
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('deleteMemory', () => {
    it('should soft delete memory', async () => {
      mockPrismaClient.memory.findUnique.mockResolvedValue(mockMemory);
      mockPrismaClient.memory.update.mockResolvedValue({
        ...mockMemory,
        isDeleted: true,
        deletedAt: new Date(),
      });

      await service.deleteMemory(mockTenantId, mockMemoryId, mockUserId);

      expect(mockPrismaClient.memory.update).toHaveBeenCalledWith({
        where: { id: mockMemoryId },
        data: expect.objectContaining({
          isDeleted: true,
          deletedAt: expect.any(Date),
        }),
      });
    });
  });

  describe('forgetAll', () => {
    it('should require "FORGET" confirmation', async () => {
      await expect(
        service.forgetAll(mockTenantId, mockUserId, 'wrong')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should soft delete all user memories with correct confirmation', async () => {
      mockPrismaClient.memory.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.forgetAll(mockTenantId, mockUserId, 'FORGET');

      expect(result.deletedCount).toBe(5);
      expect(mockPrismaClient.memory.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: mockTenantId,
          userId: mockUserId,
          isDeleted: false,
        },
        data: expect.objectContaining({
          isDeleted: true,
          deletedAt: expect.any(Date),
        }),
      });
    });
  });

  describe('updateEmbeddingId', () => {
    it('should update embedding ID for memory', async () => {
      mockPrismaClient.memory.update.mockResolvedValue({
        ...mockMemory,
        embeddingId: 'emb_test123',
      });

      await service.updateEmbeddingId(mockTenantId, mockMemoryId, 'emb_test123');

      expect(mockPrismaClient.memory.update).toHaveBeenCalledWith({
        where: { id: mockMemoryId },
        data: { embeddingId: 'emb_test123' },
      });
    });
  });
});
