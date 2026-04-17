import { ContentDeliveryService } from './content-delivery.service';

describe('ContentDeliveryService', () => {
  let service: ContentDeliveryService;
  let mockPrisma: any;
  let mockVault: any;

  const mockConcept = {
    id: 'concept-1',
    name: 'Prodajni Plan',
    slug: 'prodajni-plan',
    category: 'Prodaja',
    description: 'Database description of prodajni plan.',
  };

  beforeEach(() => {
    mockPrisma = {
      concept: {
        findUnique: jest.fn().mockResolvedValue(mockConcept),
        findFirst: jest.fn().mockResolvedValue(mockConcept),
      },
    };
    mockVault = {
      readFile: jest.fn().mockResolvedValue('# Vault Content\n\nDetailed vault content.'),
      listFiles: jest.fn().mockResolvedValue(['prodajni-plan.md', 'marketing.md']),
    };
    service = new ContentDeliveryService(mockPrisma, mockVault);
  });

  it('should return vault content when available', async () => {
    const result = await service.getConceptContent('tenant-1', 'concept-1');
    expect(result).not.toBeNull();
    expect(result!.source).toBe('vault');
    expect(result!.content).toContain('Vault Content');
  });

  it('should fall back to database description when vault fails', async () => {
    mockVault.readFile.mockRejectedValue(new Error('File not found'));
    const result = await service.getConceptContent('tenant-1', 'concept-1');
    expect(result!.source).toBe('database');
    expect(result!.content).toBe('Database description of prodajni plan.');
  });

  it('should return fallback when no description and no vault', async () => {
    mockVault.readFile.mockRejectedValue(new Error('File not found'));
    mockPrisma.concept.findUnique.mockResolvedValue({
      ...mockConcept,
      description: null,
    });
    const result = await service.getConceptContent('tenant-1', 'concept-1');
    expect(result!.source).toBe('fallback');
    expect(result!.content).toContain('being generated');
  });

  it('should return null for nonexistent concept', async () => {
    mockPrisma.concept.findUnique.mockResolvedValue(null);
    const result = await service.getConceptContent('tenant-1', 'nonexistent');
    expect(result).toBeNull();
  });

  it('should include metadata in result', async () => {
    const result = await service.getConceptContent('tenant-1', 'concept-1');
    expect(result!.metadata).toBeDefined();
    expect(result!.metadata!.name).toBe('Prodajni Plan');
    expect(result!.metadata!.category).toBe('Prodaja');
  });

  it('should get content by slug', async () => {
    const result = await service.getConceptContentBySlug(
      'tenant-1',
      'prodajni-plan',
    );
    expect(result).not.toBeNull();
    expect(result!.slug).toBe('prodajni-plan');
  });

  it('should return null for nonexistent slug', async () => {
    mockPrisma.concept.findFirst.mockResolvedValue(null);
    const result = await service.getConceptContentBySlug(
      'tenant-1',
      'nonexistent',
    );
    expect(result).toBeNull();
  });

  it('should list available content', async () => {
    const files = await service.listAvailableContent('tenant-1');
    expect(files).toEqual(['prodajni-plan', 'marketing']);
  });

  it('should return empty list when vault is unavailable', async () => {
    mockVault.listFiles.mockRejectedValue(new Error('Vault down'));
    const files = await service.listAvailableContent('tenant-1');
    expect(files).toEqual([]);
  });
});
