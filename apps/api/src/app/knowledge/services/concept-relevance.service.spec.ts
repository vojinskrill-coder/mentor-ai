import { ConceptRelevanceService, RelevanceInput } from './concept-relevance.service';

describe('ConceptRelevanceService', () => {
  let service: ConceptRelevanceService;

  beforeEach(() => {
    service = new ConceptRelevanceService();
  });

  describe('scoreRelevance', () => {
    const baseInput: RelevanceInput = {
      conceptCategory: 'Marketing',
      tenantIndustry: 'digital marketing agency',
      completedConceptIds: new Set(['cpt_1', 'cpt_2']),
      department: null,
      role: 'PLATFORM_OWNER',
    };

    it('should return 1.0 for foundation category "Uvod u Poslovanje"', () => {
      expect(service.scoreRelevance({ ...baseInput, conceptCategory: 'Uvod u Poslovanje' })).toBe(
        1.0
      );
    });

    it('should return 1.0 for foundation category "Vrednost"', () => {
      expect(service.scoreRelevance({ ...baseInput, conceptCategory: 'Vrednost' })).toBe(1.0);
    });

    it('should return 1.0 for foundation categories with number prefix', () => {
      expect(
        service.scoreRelevance({ ...baseInput, conceptCategory: '1. Uvod u Poslovanje' })
      ).toBe(1.0);
      expect(service.scoreRelevance({ ...baseInput, conceptCategory: '2. Vrednost' })).toBe(1.0);
    });

    it('should score higher for industry-matched categories', () => {
      const techInput = { ...baseInput, tenantIndustry: 'software development' };
      const techScore = service.scoreRelevance({ ...techInput, conceptCategory: 'Tehnologija' });
      const unrelatedScore = service.scoreRelevance({
        ...techInput,
        conceptCategory: 'Računovodstvo',
      });
      expect(techScore).toBeGreaterThan(unrelatedScore);
    });

    it('should score PREREQUISITE higher than ADVANCED', () => {
      const prereqScore = service.scoreRelevance({
        ...baseInput,
        relationshipType: 'PREREQUISITE',
      });
      const advancedScore = service.scoreRelevance({ ...baseInput, relationshipType: 'ADVANCED' });
      expect(prereqScore).toBeGreaterThan(advancedScore);
    });

    it('should score RELATED between PREREQUISITE and ADVANCED', () => {
      const prereqScore = service.scoreRelevance({
        ...baseInput,
        relationshipType: 'PREREQUISITE',
      });
      const relatedScore = service.scoreRelevance({ ...baseInput, relationshipType: 'RELATED' });
      const advancedScore = service.scoreRelevance({ ...baseInput, relationshipType: 'ADVANCED' });
      expect(prereqScore).toBeGreaterThan(relatedScore);
      expect(relatedScore).toBeGreaterThan(advancedScore);
    });

    it('should score higher with prior activity than without', () => {
      const withActivity = service.scoreRelevance({
        ...baseInput,
        completedConceptIds: new Set(['cpt_1']),
      });
      const noActivity = service.scoreRelevance({ ...baseInput, completedConceptIds: new Set() });
      expect(withActivity).toBeGreaterThan(noActivity);
    });

    it('should score higher when completedCategories includes candidate category (domain-specific)', () => {
      const withDomainActivity = service.scoreRelevance({
        ...baseInput,
        completedCategories: new Set(['Marketing']),
      });
      const withoutDomainActivity = service.scoreRelevance({
        ...baseInput,
        completedCategories: new Set(['Finansije']),
      });
      expect(withDomainActivity).toBeGreaterThan(withoutDomainActivity);
    });

    it('should fall back to global check when completedCategories not provided', () => {
      const withGlobal = service.scoreRelevance({
        ...baseInput,
        completedConceptIds: new Set(['cpt_1']),
      });
      const withoutGlobal = service.scoreRelevance({
        ...baseInput,
        completedConceptIds: new Set(),
      });
      // Without completedCategories, uses completedConceptIds.size > 0
      expect(withGlobal).toBeGreaterThan(withoutGlobal);
    });

    it('should score higher for department-aligned categories', () => {
      const financeInput: RelevanceInput = {
        ...baseInput,
        department: 'FINANCE',
        role: 'MEMBER',
      };
      const alignedScore = service.scoreRelevance({
        ...financeInput,
        conceptCategory: 'Finansije',
      });
      const misalignedScore = service.scoreRelevance({
        ...financeInput,
        conceptCategory: 'Tehnologija',
      });
      expect(alignedScore).toBeGreaterThan(misalignedScore);
    });

    it('should always return score between 0 and 1', () => {
      const score = service.scoreRelevance(baseInput);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should handle null department with neutral score', () => {
      const ownerScore = service.scoreRelevance({ ...baseInput, department: null });
      expect(ownerScore).toBeGreaterThan(0);
    });

    it('should handle empty tenantIndustry with neutral industry score', () => {
      const score = service.scoreRelevance({ ...baseInput, tenantIndustry: '' });
      expect(score).toBeGreaterThan(0);
    });

    it('should score universal categories higher for unknown industries', () => {
      const unknownIndustry = { ...baseInput, tenantIndustry: 'underwater basket weaving' };
      const universalScore = service.scoreRelevance({
        ...unknownIndustry,
        conceptCategory: 'Menadžment',
      });
      const nicheScore = service.scoreRelevance({
        ...unknownIndustry,
        conceptCategory: 'Digitalni Marketing',
      });
      expect(universalScore).toBeGreaterThan(nicheScore);
    });
  });

  describe('getThreshold', () => {
    it('should return OWNER_THRESHOLD for PLATFORM_OWNER', () => {
      expect(service.getThreshold('PLATFORM_OWNER')).toBe(service.OWNER_THRESHOLD);
    });

    it('should return OWNER_THRESHOLD for TENANT_OWNER', () => {
      expect(service.getThreshold('TENANT_OWNER')).toBe(service.OWNER_THRESHOLD);
    });

    it('should return DEFAULT_THRESHOLD for MEMBER role', () => {
      expect(service.getThreshold('MEMBER')).toBe(service.DEFAULT_THRESHOLD);
    });

    it('should return DEFAULT_THRESHOLD for unknown roles', () => {
      expect(service.getThreshold('ADMIN')).toBe(service.DEFAULT_THRESHOLD);
    });

    it('OWNER_THRESHOLD should be lower than DEFAULT_THRESHOLD', () => {
      expect(service.OWNER_THRESHOLD).toBeLessThan(service.DEFAULT_THRESHOLD);
    });
  });
});
