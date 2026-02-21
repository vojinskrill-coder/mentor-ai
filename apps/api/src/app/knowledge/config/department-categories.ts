/**
 * Department → Obsidian Category Mapping (Story 3.2)
 *
 * Maps the Department enum to Serbian category names from the Obsidian vault.
 * Foundation categories are always visible to all users.
 * PLATFORM_OWNER / TENANT_OWNER (department = null) see all categories.
 */

import { Department } from '@mentor-ai/shared/prisma';

/** Foundation categories — always visible regardless of department */
export const FOUNDATION_CATEGORIES = ['Uvod u Poslovanje', 'Vrednost'] as const;

/** All known categories from the Obsidian vault (excluding guide/skipped) */
export const ALL_CATEGORIES = [
  'Uvod u Poslovanje',
  'Marketing',
  'Prodaja',
  'Vrednost',
  'Finansije',
  'Operacije',
  'Menadžment',
  'Preduzetništvo',
  'Digitalni Marketing',
  'Odnosi sa Klijentima',
  'Računovodstvo',
  'Tehnologija',
  'Inovacije',
  'Liderstvo',
  'Strategija',
  'Poslovni Modeli',
] as const;

/**
 * Maps each Department enum value to its relevant Obsidian categories.
 * Foundation categories are added automatically — do NOT include them here.
 */
export const DEPARTMENT_CATEGORY_MAP: Record<Department, string[]> = {
  [Department.MARKETING]: ['Marketing', 'Digitalni Marketing'],
  [Department.FINANCE]: ['Finansije', 'Računovodstvo'],
  [Department.SALES]: ['Prodaja', 'Odnosi sa Klijentima'],
  [Department.OPERATIONS]: ['Operacije', 'Preduzetništvo', 'Menadžment'],
  [Department.TECHNOLOGY]: ['Tehnologija', 'Inovacije'],
  [Department.STRATEGY]: ['Strategija', 'Poslovni Modeli', 'Liderstvo'],
  [Department.LEGAL]: ['Menadžment'],
  [Department.CREATIVE]: ['Marketing', 'Digitalni Marketing'],
};

/**
 * Resolve visible categories for a user based on department and role.
 *
 * - PLATFORM_OWNER / TENANT_OWNER (department = null) → ALL categories
 * - Department user → foundation + department-specific categories
 */
export function getVisibleCategories(department: string | null, role: string): string[] | null {
  // Owner roles see everything — return null to signal "no filter"
  if (role === 'PLATFORM_OWNER' || role === 'TENANT_OWNER' || !department) {
    return null;
  }

  const deptCategories = DEPARTMENT_CATEGORY_MAP[department as Department] ?? [];

  // Deduplicate (foundation might overlap with dept categories)
  return [...new Set([...FOUNDATION_CATEGORIES, ...deptCategories])];
}
