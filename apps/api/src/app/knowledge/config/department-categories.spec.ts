import {
  FOUNDATION_CATEGORIES,
  ALL_CATEGORIES,
  DEPARTMENT_CATEGORY_MAP,
  getVisibleCategories,
} from './department-categories';
import { Department } from '@mentor-ai/shared/prisma';

describe('department-categories', () => {
  describe('FOUNDATION_CATEGORIES', () => {
    it('should contain exactly the two foundation categories', () => {
      expect(FOUNDATION_CATEGORIES).toEqual(['Uvod u Poslovanje', 'Vrednost']);
    });
  });

  describe('ALL_CATEGORIES', () => {
    it('should contain 16 categories', () => {
      expect(ALL_CATEGORIES).toHaveLength(16);
    });

    it('should include all foundation categories', () => {
      for (const fc of FOUNDATION_CATEGORIES) {
        expect(ALL_CATEGORIES).toContain(fc);
      }
    });
  });

  describe('DEPARTMENT_CATEGORY_MAP', () => {
    it('should have a mapping for every Department enum value', () => {
      const allDepts = Object.values(Department);
      for (const dept of allDepts) {
        expect(DEPARTMENT_CATEGORY_MAP).toHaveProperty(dept);
        expect(Array.isArray(DEPARTMENT_CATEGORY_MAP[dept])).toBe(true);
      }
    });

    it('should map MARKETING to Marketing and Digitalni Marketing', () => {
      expect(DEPARTMENT_CATEGORY_MAP[Department.MARKETING]).toEqual([
        'Marketing',
        'Digitalni Marketing',
      ]);
    });

    it('should map FINANCE to Finansije and Računovodstvo', () => {
      expect(DEPARTMENT_CATEGORY_MAP[Department.FINANCE]).toEqual(['Finansije', 'Računovodstvo']);
    });

    it('should only reference categories that exist in ALL_CATEGORIES', () => {
      const allSet = new Set<string>(ALL_CATEGORIES);
      for (const [_dept, cats] of Object.entries(DEPARTMENT_CATEGORY_MAP)) {
        for (const cat of cats) {
          expect(allSet.has(cat)).toBe(true);
        }
      }
    });
  });

  describe('getVisibleCategories', () => {
    it('should return null for PLATFORM_OWNER role', () => {
      expect(getVisibleCategories(null, 'PLATFORM_OWNER')).toBeNull();
    });

    it('should return null for TENANT_OWNER role', () => {
      expect(getVisibleCategories(null, 'TENANT_OWNER')).toBeNull();
    });

    it('should return null when department is null (owner path)', () => {
      expect(getVisibleCategories(null, 'MEMBER')).toBeNull();
    });

    it('should return foundation + department categories for department user', () => {
      const result = getVisibleCategories('MARKETING', 'MEMBER');
      expect(result).not.toBeNull();
      // Must include foundation
      for (const fc of FOUNDATION_CATEGORIES) {
        expect(result).toContain(fc);
      }
      // Must include department-specific
      expect(result).toContain('Marketing');
      expect(result).toContain('Digitalni Marketing');
    });

    it('should not include categories outside department scope', () => {
      const result = getVisibleCategories('MARKETING', 'MEMBER')!;
      expect(result).not.toContain('Finansije');
      expect(result).not.toContain('Računovodstvo');
      expect(result).not.toContain('Tehnologija');
    });

    it('should deduplicate when foundation overlaps with department', () => {
      const result = getVisibleCategories('FINANCE', 'MEMBER')!;
      const uniqueCheck = new Set(result);
      expect(result.length).toBe(uniqueCheck.size);
    });

    it('should return only foundation for unknown department', () => {
      const result = getVisibleCategories('UNKNOWN_DEPT', 'MEMBER')!;
      expect(result).toEqual([...FOUNDATION_CATEGORIES]);
    });
  });
});
