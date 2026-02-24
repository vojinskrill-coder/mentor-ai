import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowService } from './workflow.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { ConceptService } from '../knowledge/services/concept.service';
import { ConceptMatchingService } from '../knowledge/services/concept-matching.service';
import { CitationInjectorService } from '../knowledge/services/citation-injector.service';
import { CitationService } from '../knowledge/services/citation.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { NotesService } from '../notes/notes.service';
import { WebSearchService } from '../web-search/web-search.service';
import { BusinessContextService } from '../knowledge/services/business-context.service';
import { ConceptRelevanceService } from '../knowledge/services/concept-relevance.service';
import type { ExecutionPlanStep, EnrichedSearchResult } from '@mentor-ai/shared/types';

describe('WorkflowService', () => {
  let service: WorkflowService;
  let mockPrisma: {
    conceptWorkflow: { findUnique: jest.Mock; create: jest.Mock; deleteMany: jest.Mock };
    note: { findMany: jest.Mock; createMany: jest.Mock };
    tenant: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    conceptRelationship: { findMany: jest.Mock };
  };
  let mockConceptService: { findById: jest.Mock };
  let mockAiGateway: { streamCompletionWithContext: jest.Mock };
  let mockCitationInjector: { injectCitations: jest.Mock };
  let mockWebSearch: {
    isAvailable: jest.Mock;
    search: jest.Mock;
    fetchWebpage: jest.Mock;
    searchAndExtract: jest.Mock;
    formatSourcesAsObsidian: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      conceptWorkflow: { findUnique: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
      note: { findMany: jest.fn(), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      tenant: { findUnique: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      conceptRelationship: { findMany: jest.fn().mockResolvedValue([]) },
    };
    mockConceptService = { findById: jest.fn() };
    mockAiGateway = { streamCompletionWithContext: jest.fn() };
    mockCitationInjector = { injectCitations: jest.fn() };
    mockWebSearch = {
      isAvailable: jest.fn().mockReturnValue(true),
      search: jest.fn().mockResolvedValue([]),
      fetchWebpage: jest.fn().mockResolvedValue(''),
      searchAndExtract: jest.fn().mockResolvedValue([]),
      formatSourcesAsObsidian: jest
        .fn()
        .mockImplementation(WebSearchService.prototype.formatSourcesAsObsidian),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
        { provide: ConceptService, useValue: mockConceptService },
        {
          provide: ConceptMatchingService,
          useValue: { findRelevantConcepts: jest.fn().mockResolvedValue([]) },
        },
        { provide: CitationInjectorService, useValue: mockCitationInjector },
        { provide: CitationService, useValue: { storeCitations: jest.fn() } },
        { provide: AiGatewayService, useValue: mockAiGateway },
        {
          provide: NotesService,
          useValue: { createNote: jest.fn(), getNoteById: jest.fn(), updateStatus: jest.fn() },
        },
        { provide: WebSearchService, useValue: mockWebSearch },
        {
          provide: BusinessContextService,
          useValue: { getBusinessContext: jest.fn().mockResolvedValue('') },
        },
        {
          provide: ConceptRelevanceService,
          useValue: {
            scoreRelevance: jest.fn().mockReturnValue(0.8),
            getThreshold: jest.fn().mockReturnValue(0.3),
          },
        },
      ],
    }).compile();

    service = module.get<WorkflowService>(WorkflowService);
  });

  describe('buildSearchQuery', () => {
    const makeStep = (overrides: Partial<ExecutionPlanStep> = {}): ExecutionPlanStep => ({
      stepId: 'step_test',
      conceptId: 'cpt_test',
      conceptName: 'Brand Positioning',
      workflowStepNumber: 1,
      title: 'Create a SWOT Analysis',
      description: 'Perform SWOT for brand positioning',
      estimatedMinutes: 10,
      status: 'pending',
      ...overrides,
    });

    it('should include company name when tenant provides it', () => {
      const query = service.buildSearchQuery(makeStep(), { name: 'LuxVino', industry: 'Wine' });
      expect(query).toContain('LuxVino');
    });

    it('should lead with concept name', () => {
      const query = service.buildSearchQuery(makeStep(), null);
      expect(query.startsWith('Brand Positioning')).toBe(true);
    });

    it('should include step title keywords (stripped of filler words)', () => {
      const query = service.buildSearchQuery(makeStep(), null);
      expect(query).toContain('SWOT');
      expect(query).toContain('Analysis');
      // Filler words should be stripped
      expect(query).not.toMatch(/\bCreate\b/);
    });

    it('should include industry when tenant provides it', () => {
      const query = service.buildSearchQuery(makeStep(), {
        name: 'TestCo',
        industry: 'Technology',
      });
      expect(query).toContain('Technology');
    });

    it('should append current year for temporal relevance', () => {
      const year = new Date().getFullYear().toString();
      const query = service.buildSearchQuery(makeStep(), null);
      expect(query).toContain(year);
    });

    it('should deduplicate words case-insensitively', () => {
      const step = makeStep({ conceptName: 'SWOT Analysis', title: 'Perform SWOT Analysis' });
      const query = service.buildSearchQuery(step, null);
      // "SWOT" and "Analysis" should appear only once each
      const words = query.split(' ');
      const swotCount = words.filter((w) => w.toLowerCase() === 'swot').length;
      expect(swotCount).toBe(1);
    });

    it('should limit query to 12 words maximum', () => {
      const step = makeStep({
        title:
          'Perform Complete Comprehensive Detailed Strategic Market Research And Analysis For Business Growth',
      });
      const query = service.buildSearchQuery(step, { name: 'TestCo', industry: 'Technology' });
      const wordCount = query.split(' ').length;
      expect(wordCount).toBeLessThanOrEqual(12);
    });

    it('should handle missing tenant gracefully', () => {
      const query = service.buildSearchQuery(makeStep(), null);
      expect(query).toBeTruthy();
      expect(query.length).toBeGreaterThan(0);
    });

    it('should strip short words (2 chars or less)', () => {
      const step = makeStep({ title: 'Do a SWOT on it' });
      const query = service.buildSearchQuery(step, null);
      // "Do", "a", "on", "it" should all be stripped (length <= 2)
      expect(query).not.toMatch(/\bDo\b/);
    });
  });

  describe('formatWebContext', () => {
    it('should return empty string for empty results', () => {
      expect(service.formatWebContext([])).toBe('');
    });

    it('should return empty string for null/undefined results', () => {
      expect(service.formatWebContext(null as unknown as EnrichedSearchResult[])).toBe('');
    });

    it('should format results with page content when available', () => {
      const results: EnrichedSearchResult[] = [
        {
          title: 'Test Article',
          link: 'https://example.com/article',
          snippet: 'A brief snippet',
          pageContent: 'Full page content extracted from the article',
          fetchedAt: '2026-02-09T12:00:00Z',
        },
      ];

      const context = service.formatWebContext(results);

      expect(context).toContain('WEB ISTRAŽIVANJE');
      expect(context).toContain('Test Article');
      expect(context).toContain('https://example.com/article');
      expect(context).toContain('Full page content extracted');
      expect(context).toContain('INLINE');
    });

    it('should use snippet when page content is not available', () => {
      const results: EnrichedSearchResult[] = [
        {
          title: 'Snippet Only',
          link: 'https://example.com/snippet',
          snippet: 'Only the snippet is available',
          fetchedAt: '2026-02-09T12:00:00Z',
        },
      ];

      const context = service.formatWebContext(results);

      expect(context).toContain('Only the snippet is available');
    });

    it('should include source attribution instruction', () => {
      const results: EnrichedSearchResult[] = [
        {
          title: 'Source',
          link: 'https://example.com',
          snippet: 'Content',
          fetchedAt: '2026-02-09T12:00:00Z',
        },
      ];

      const context = service.formatWebContext(results);

      expect(context).toContain('citiraj izvor');
      expect(context).toContain('INLINE');
    });

    it('should format multiple results', () => {
      const results: EnrichedSearchResult[] = [
        { title: 'R1', link: 'https://a.com', snippet: 'S1', fetchedAt: '2026-02-09T12:00:00Z' },
        { title: 'R2', link: 'https://b.com', snippet: 'S2', fetchedAt: '2026-02-09T12:00:00Z' },
      ];

      const context = service.formatWebContext(results);

      expect(context).toContain('R1');
      expect(context).toContain('R2');
      expect(context).toContain('https://a.com');
      expect(context).toContain('https://b.com');
    });
  });

  describe('executeStepAutonomous — web search integration', () => {
    const step: ExecutionPlanStep = {
      stepId: 'step_ws1',
      conceptId: 'cpt_ws1',
      conceptName: 'Market Segmentation',
      workflowStepNumber: 1,
      title: 'Analyze target segments',
      description: 'Identify key market segments',
      estimatedMinutes: 10,
      status: 'pending',
    };

    beforeEach(() => {
      // Mock cached workflow lookup
      mockPrisma.conceptWorkflow.findUnique.mockResolvedValue({
        conceptId: 'cpt_ws1',
        concept: { name: 'Market Segmentation' },
        steps: [
          {
            stepNumber: 1,
            title: 'Analyze target segments',
            description: 'Identify key market segments',
            promptTemplate: 'Analyze {{conceptName}} for {{businessContext}}',
            expectedOutcome: 'Segment analysis',
            estimatedMinutes: 10,
          },
        ],
      });
      // Mock concept lookup for knowledge building
      mockConceptService.findById.mockResolvedValue({
        id: 'cpt_ws1',
        name: 'Market Segmentation',
        category: 'Marketing',
        definition: 'Dividing market into segments',
        extendedDescription: null,
        departmentTags: [],
        relatedConcepts: [],
      });
      // Mock tenant
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'TestCo',
        industry: 'Technology',
        description: null,
      });
      // Mock LLM streaming
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        (_messages: unknown, _opts: unknown, onChunk: (chunk: string) => void) => {
          onChunk('AI response content');
          return Promise.resolve();
        }
      );
      // Mock citation injector
      mockCitationInjector.injectCitations.mockReturnValue({
        content: 'AI response content',
        citations: [],
      });
    });

    it('should call searchAndExtract when web search is available (AC1)', async () => {
      mockWebSearch.isAvailable.mockReturnValue(true);
      mockWebSearch.searchAndExtract.mockResolvedValue([]);

      await service.executeStepAutonomous(step, 'conv_1', 'usr_1', 'tnt_1', jest.fn());

      expect(mockWebSearch.searchAndExtract).toHaveBeenCalledTimes(1);
      expect(mockWebSearch.searchAndExtract).toHaveBeenCalledWith(
        expect.stringContaining('Market'),
        5
      );
    });

    it('should NOT call searchAndExtract when web search is unavailable (AC5)', async () => {
      mockWebSearch.isAvailable.mockReturnValue(false);

      await service.executeStepAutonomous(step, 'conv_1', 'usr_1', 'tnt_1', jest.fn());

      expect(mockWebSearch.searchAndExtract).not.toHaveBeenCalled();
    });

    it('should still complete step when searchAndExtract throws (AC5)', async () => {
      mockWebSearch.isAvailable.mockReturnValue(true);
      mockWebSearch.searchAndExtract.mockRejectedValue(new Error('API down'));

      const result = await service.executeStepAutonomous(
        step,
        'conv_1',
        'usr_1',
        'tnt_1',
        jest.fn()
      );

      expect(result.content).toBe('AI response content');
    });
  });
});
