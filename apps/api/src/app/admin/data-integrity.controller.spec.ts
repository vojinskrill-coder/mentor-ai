import { Test, TestingModule } from '@nestjs/testing';
import { DataIntegrityController } from './data-integrity.controller';
import { DataIntegrityService, DataIntegrityReport } from './data-integrity.service';

describe('DataIntegrityController', () => {
  let controller: DataIntegrityController;
  let integrityService: jest.Mocked<DataIntegrityService>;

  const mockReport: DataIntegrityReport = {
    timestamp: '2026-02-22T12:00:00.000Z',
    concepts: {
      total: 443,
      withEmbeddingId: 0,
      withoutEmbeddingId: 443,
      withCurriculumId: 443,
      withoutCurriculumId: 0,
    },
    qdrant: {
      available: false,
      pointCount: null,
      collectionExists: false,
    },
    sync: {
      status: 'unavailable',
      mismatchCount: 0,
    },
    issues: ['Qdrant not configured (QDRANT_URL missing)'],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataIntegrityController],
      providers: [
        {
          provide: DataIntegrityService,
          useValue: {
            runFullCheck: jest.fn().mockResolvedValue(mockReport),
          },
        },
      ],
    }).compile();

    controller = module.get<DataIntegrityController>(DataIntegrityController);
    integrityService = module.get(DataIntegrityService) as jest.Mocked<DataIntegrityService>;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /v1/admin/data-integrity', () => {
    it('should return data integrity report', async () => {
      const result = await controller.checkIntegrity();

      expect(result).toEqual(mockReport);
      expect(integrityService.runFullCheck).toHaveBeenCalledTimes(1);
    });

    it('should return report with issues when problems detected', async () => {
      const reportWithIssues: DataIntegrityReport = {
        ...mockReport,
        issues: [
          'No concepts have embeddings — run embedding script',
          'Qdrant not configured (QDRANT_URL missing)',
        ],
      };
      integrityService.runFullCheck.mockResolvedValue(reportWithIssues);

      const result = await controller.checkIntegrity();

      expect(result.issues).toHaveLength(2);
      expect(result.issues[0]).toContain('embeddings');
    });

    it('should return synced status when DB and Qdrant match', async () => {
      const syncedReport: DataIntegrityReport = {
        ...mockReport,
        qdrant: { available: true, pointCount: 443, collectionExists: true },
        sync: { status: 'synced', mismatchCount: 0 },
        issues: [],
      };
      integrityService.runFullCheck.mockResolvedValue(syncedReport);

      const result = await controller.checkIntegrity();

      expect(result.sync.status).toBe('synced');
      expect(result.issues).toHaveLength(0);
    });
  });
});
