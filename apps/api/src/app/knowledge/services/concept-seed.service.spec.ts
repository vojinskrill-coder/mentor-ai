import { Test, TestingModule } from '@nestjs/testing';
import { ConceptSeedService, SeedResult } from './concept-seed.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

// Mock fs and path modules
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn(),
}));

import * as fs from 'fs';

describe('ConceptSeedService', () => {
  let service: ConceptSeedService;
  let mockPrisma: {
    concept: {
      findUnique: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    conceptRelationship: {
      findUnique: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  const mockSeedData = {
    concepts: [
      {
        name: 'Test Concept',
        slug: 'test-concept',
        category: 'Finance',
        definition: 'A test concept',
        extendedDescription: 'Extended description',
        departmentTags: ['Finance'],
        relatedConcepts: [{ slug: 'related-concept', type: 'RELATED' }],
      },
      {
        name: 'Related Concept',
        slug: 'related-concept',
        category: 'Finance',
        definition: 'A related concept',
        departmentTags: ['Finance'],
      },
    ],
  };

  beforeEach(async () => {
    mockPrisma = {
      concept: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      conceptRelationship: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConceptSeedService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ConceptSeedService>(ConceptSeedService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('seedAllConcepts', () => {
    it('should create concepts from seed files', async () => {
      // Setup fs mocks
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['test.json']);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockSeedData));

      // Setup prisma mocks - concepts don't exist yet
      mockPrisma.concept.findUnique.mockResolvedValue(null);
      mockPrisma.concept.create
        .mockResolvedValueOnce({ id: 'cpt_1', name: 'Test Concept', category: 'Finance' })
        .mockResolvedValueOnce({ id: 'cpt_2', name: 'Related Concept', category: 'Finance' });
      mockPrisma.conceptRelationship.findUnique.mockResolvedValue(null);
      mockPrisma.conceptRelationship.create.mockResolvedValue({});

      const result = await service.seedAllConcepts();

      expect(result.conceptsCreated).toBe(2);
      expect(result.conceptsSkipped).toBe(0);
      expect(result.relationshipsCreated).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip existing concepts', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['test.json']);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockSeedData));

      // Concepts already exist
      mockPrisma.concept.findUnique.mockResolvedValue({ id: 'cpt_existing' });
      mockPrisma.conceptRelationship.findUnique.mockResolvedValue(null);
      mockPrisma.conceptRelationship.create.mockResolvedValue({});

      const result = await service.seedAllConcepts();

      expect(result.conceptsCreated).toBe(0);
      expect(result.conceptsSkipped).toBe(2);
      expect(mockPrisma.concept.create).not.toHaveBeenCalled();
    });

    it('should not create concepts in dry run mode', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['test.json']);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockSeedData));

      mockPrisma.concept.findUnique.mockResolvedValue(null);

      const result = await service.seedAllConcepts(true);

      expect(result.conceptsCreated).toBe(2);
      expect(mockPrisma.concept.create).not.toHaveBeenCalled();
      expect(mockPrisma.conceptRelationship.create).not.toHaveBeenCalled();
    });

    it('should return empty result when no seed files found', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue([]);

      const result = await service.seedAllConcepts();

      expect(result.conceptsCreated).toBe(0);
      expect(result.conceptsSkipped).toBe(0);
      expect(result.relationshipsCreated).toBe(0);
    });

    it('should return empty result when seed path does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = await service.seedAllConcepts();

      expect(result.conceptsCreated).toBe(0);
    });

    it('should handle concept creation errors gracefully', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['test.json']);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({
          concepts: [{ name: 'Bad Concept', slug: 'bad-concept', category: 'Finance', definition: 'Test', departmentTags: [] }],
        })
      );

      mockPrisma.concept.findUnique.mockResolvedValue(null);
      mockPrisma.concept.create.mockRejectedValue(new Error('Database error'));

      const result = await service.seedAllConcepts();

      expect(result.conceptsCreated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to create concept bad-concept');
    });

    it('should skip existing relationships', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['test.json']);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockSeedData));

      mockPrisma.concept.findUnique.mockResolvedValue({ id: 'cpt_existing' });
      // Relationship already exists
      mockPrisma.conceptRelationship.findUnique.mockResolvedValue({ id: 'rel_existing' });

      const result = await service.seedAllConcepts();

      expect(mockPrisma.conceptRelationship.create).not.toHaveBeenCalled();
    });

    it('should create concepts with cpt_ prefix', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['test.json']);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({
          concepts: [{ name: 'Single Concept', slug: 'single', category: 'Finance', definition: 'Test', departmentTags: [] }],
        })
      );

      mockPrisma.concept.findUnique.mockResolvedValue(null);
      mockPrisma.concept.create.mockResolvedValue({ id: 'cpt_123', name: 'Single Concept', category: 'Finance' });

      await service.seedAllConcepts();

      const createArgs = mockPrisma.concept.create.mock.calls[0][0];
      expect(createArgs.data.id).toMatch(/^cpt_/);
    });
  });

  describe('clearAllConcepts', () => {
    it('should delete all relationships first, then concepts', async () => {
      mockPrisma.conceptRelationship.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.concept.deleteMany.mockResolvedValue({ count: 10 });

      await service.clearAllConcepts();

      // Verify both delete methods were called
      expect(mockPrisma.conceptRelationship.deleteMany).toHaveBeenCalledWith({});
      expect(mockPrisma.concept.deleteMany).toHaveBeenCalledWith({});
    });
  });
});
