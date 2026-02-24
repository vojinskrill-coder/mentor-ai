import { Test, TestingModule } from '@nestjs/testing';
import { DataIntegrityService } from './data-integrity.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { QdrantClientService } from '../qdrant/qdrant-client.service';

describe('DataIntegrityService', () => {
  let service: DataIntegrityService;
  let mockPrisma: {
    concept: {
      findMany: jest.Mock;
    };
  };
  let mockQdrant: {
    isAvailable: jest.Mock;
    getClient: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      concept: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockQdrant = {
      isAvailable: jest.fn().mockReturnValue(false),
      getClient: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataIntegrityService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
        { provide: QdrantClientService, useValue: mockQdrant },
      ],
    }).compile();

    service = module.get<DataIntegrityService>(DataIntegrityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runFullCheck', () => {
    it('should report empty database when no concepts found', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([]);

      const report = await service.runFullCheck();

      expect(report.concepts.total).toBe(0);
      expect(report.issues).toContain('No concepts found in database — run seed script');
    });

    it('should report missing embeddings when concepts exist without embeddingId', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: '1', embeddingId: null, curriculumId: '1.1', slug: 'concept-1' },
        { id: '2', embeddingId: null, curriculumId: '1.2', slug: 'concept-2' },
      ]);

      const report = await service.runFullCheck();

      expect(report.concepts.total).toBe(2);
      expect(report.concepts.withEmbeddingId).toBe(0);
      expect(report.concepts.withoutEmbeddingId).toBe(2);
      expect(report.issues).toContain('No concepts have embeddings — run embedding script');
    });

    it('should report qdrant unavailable when not configured', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: '1', embeddingId: 'emb-1', curriculumId: '1.1', slug: 'c1' },
      ]);
      mockQdrant.isAvailable.mockReturnValue(false);

      const report = await service.runFullCheck();

      expect(report.qdrant.available).toBe(false);
      expect(report.sync.status).toBe('unavailable');
      expect(report.issues).toContain('Qdrant not configured (QDRANT_URL missing)');
    });

    it('should detect sync drift when counts differ', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: '1', embeddingId: 'emb-1', curriculumId: '1.1', slug: 'c1' },
        { id: '2', embeddingId: 'emb-2', curriculumId: '1.2', slug: 'c2' },
      ]);
      mockQdrant.isAvailable.mockReturnValue(true);
      mockQdrant.getClient.mockReturnValue({
        getCollections: jest.fn().mockResolvedValue({
          collections: [{ name: 'concepts' }],
        }),
        getCollection: jest.fn().mockResolvedValue({
          points_count: 5,
        }),
      });

      const report = await service.runFullCheck();

      expect(report.sync.status).toBe('drift');
      expect(report.sync.mismatchCount).toBe(3);
    });

    it('should report synced when counts match', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: '1', embeddingId: 'emb-1', curriculumId: '1.1', slug: 'c1' },
        { id: '2', embeddingId: 'emb-2', curriculumId: '1.2', slug: 'c2' },
      ]);
      mockQdrant.isAvailable.mockReturnValue(true);
      mockQdrant.getClient.mockReturnValue({
        getCollections: jest.fn().mockResolvedValue({
          collections: [{ name: 'concepts' }],
        }),
        getCollection: jest.fn().mockResolvedValue({
          points_count: 2,
        }),
      });

      const report = await service.runFullCheck();

      expect(report.sync.status).toBe('synced');
      expect(report.sync.mismatchCount).toBe(0);
    });

    it('should detect duplicate slugs', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: '1', embeddingId: null, curriculumId: '1.1', slug: 'duplicate' },
        { id: '2', embeddingId: null, curriculumId: '1.2', slug: 'duplicate' },
        { id: '3', embeddingId: null, curriculumId: '1.3', slug: 'unique' },
      ]);

      const report = await service.runFullCheck();

      expect(report.issues).toEqual(
        expect.arrayContaining([expect.stringContaining('Duplicate slugs found')])
      );
    });

    it('should detect duplicate curriculumIds', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: '1', embeddingId: null, curriculumId: '1.1', slug: 'c1' },
        { id: '2', embeddingId: null, curriculumId: '1.1', slug: 'c2' },
      ]);

      const report = await service.runFullCheck();

      expect(report.issues).toEqual(
        expect.arrayContaining([expect.stringContaining('Duplicate curriculumIds')])
      );
    });

    it('should report missing qdrant collection', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: '1', embeddingId: 'emb-1', curriculumId: '1.1', slug: 'c1' },
      ]);
      mockQdrant.isAvailable.mockReturnValue(true);
      mockQdrant.getClient.mockReturnValue({
        getCollections: jest.fn().mockResolvedValue({
          collections: [],
        }),
      });

      const report = await service.runFullCheck();

      expect(report.qdrant.collectionExists).toBe(false);
      expect(report.issues).toContain("Qdrant collection 'concepts' does not exist");
    });

    it('should handle qdrant query failure gracefully', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: '1', embeddingId: 'emb-1', curriculumId: '1.1', slug: 'c1' },
      ]);
      mockQdrant.isAvailable.mockReturnValue(true);
      mockQdrant.getClient.mockReturnValue({
        getCollections: jest.fn().mockRejectedValue(new Error('Connection refused')),
      });

      const report = await service.runFullCheck();

      expect(report.issues).toEqual(
        expect.arrayContaining([expect.stringContaining('Qdrant query failed')])
      );
    });

    it('should include timestamp in report', async () => {
      const report = await service.runFullCheck();

      expect(report.timestamp).toBeDefined();
      expect(new Date(report.timestamp).getTime()).not.toBeNaN();
    });
  });
});
