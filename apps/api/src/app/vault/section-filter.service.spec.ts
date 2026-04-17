import { SectionFilterService } from './section-filter.service';

describe('SectionFilterService', () => {
  let service: SectionFilterService;

  beforeEach(() => {
    service = new SectionFilterService();
  });

  const sampleMarkdown = `---
title: "Test Concept"
departmentTags: ["Finance", "Marketing"]
---

# Test Concept

Introduction paragraph visible to everyone.

## Overview
<!-- dept:all -->
This is the overview section.

## Financial Analysis
<!-- dept:Finance -->
This section has financial details.

## Marketing Strategy
<!-- dept:Marketing -->
This section covers marketing.

## Cross-Functional Budget
<!-- dept:Finance,Marketing -->
Budget shared between teams.

## Untagged Section
No department tag on this one.

## Sources
<!-- dept:all -->
Reference URLs here.`;

  describe('filterByDepartment', () => {
    it('should return all sections for PLATFORM_OWNER', () => {
      const result = service.filterByDepartment(sampleMarkdown, null, 'PLATFORM_OWNER');
      expect(result).toContain('Financial Analysis');
      expect(result).toContain('Marketing Strategy');
      expect(result).toContain('Cross-Functional Budget');
    });

    it('should return all sections for TENANT_OWNER', () => {
      const result = service.filterByDepartment(sampleMarkdown, null, 'TENANT_OWNER');
      expect(result).toContain('Financial Analysis');
      expect(result).toContain('Marketing Strategy');
    });

    it('should return all sections when department is null (owner)', () => {
      const result = service.filterByDepartment(sampleMarkdown, null, 'TEAM_MEMBER');
      expect(result).toContain('Financial Analysis');
      expect(result).toContain('Marketing Strategy');
    });

    it('should filter to Marketing sections only for Marketing user', () => {
      const result = service.filterByDepartment(sampleMarkdown, 'Marketing', 'TEAM_MEMBER');
      expect(result).toContain('Overview'); // dept:all
      expect(result).not.toContain('Financial Analysis'); // dept:Finance only
      expect(result).toContain('Marketing Strategy'); // dept:Marketing
      expect(result).toContain('Cross-Functional Budget'); // dept:Finance,Marketing
      expect(result).toContain('Untagged Section'); // no tag = visible to all
      expect(result).toContain('Sources'); // dept:all
    });

    it('should filter to Finance sections only for Finance user', () => {
      const result = service.filterByDepartment(sampleMarkdown, 'Finance', 'TEAM_MEMBER');
      expect(result).toContain('Overview');
      expect(result).toContain('Financial Analysis');
      expect(result).not.toContain('Marketing Strategy');
      expect(result).toContain('Cross-Functional Budget');
    });

    it('should strip dept comments from output', () => {
      const result = service.filterByDepartment(sampleMarkdown, 'Finance', 'TEAM_MEMBER');
      expect(result).not.toContain('<!-- dept:');
    });

    it('should handle markdown without frontmatter', () => {
      const noFrontmatter = `# Title\n\n## Section\n<!-- dept:all -->\nContent here.`;
      const result = service.filterByDepartment(noFrontmatter, 'Marketing', 'TEAM_MEMBER');
      expect(result).toContain('Content here');
    });

    it('should include intro content before first H2', () => {
      const result = service.filterByDepartment(sampleMarkdown, 'Finance', 'TEAM_MEMBER');
      expect(result).toContain('Introduction paragraph');
    });
  });

  describe('extractSectionTags', () => {
    it('should return section name to departments mapping', () => {
      const tags = service.extractSectionTags(sampleMarkdown);
      expect(tags['overview']).toEqual(['all']);
      expect(tags['financial_analysis']).toEqual(['Finance']);
      expect(tags['marketing_strategy']).toEqual(['Marketing']);
      expect(tags['cross-functional_budget']).toEqual(['Finance', 'Marketing']);
    });

    it('should return empty departments for untagged sections', () => {
      const tags = service.extractSectionTags(sampleMarkdown);
      expect(tags['untagged_section']).toEqual([]);
    });
  });
});
