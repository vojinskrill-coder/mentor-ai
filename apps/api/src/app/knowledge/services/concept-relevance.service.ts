/**
 * Concept Relevance Service (Story 3.3 AC5)
 *
 * Rule-based business relevance scoring for concept discovery.
 * DISTINCT from ConceptMatchingService (embedding-based vector similarity).
 *
 * Evaluates whether a candidate concept is relevant for a specific tenant
 * based on industry match, department alignment, relationship type, and prior activity.
 */

import { Injectable, Logger } from '@nestjs/common';
import { FOUNDATION_CATEGORIES, DEPARTMENT_CATEGORY_MAP } from '../config/department-categories';

/** Relationship types ordered by discovery priority */
type RelationshipType = 'PREREQUISITE' | 'RELATED' | 'ADVANCED';

/** Input for relevance scoring */
export interface RelevanceInput {
  conceptCategory: string;
  tenantIndustry: string;
  completedConceptIds: Set<string>;
  /** Categories where the user has prior completed concepts (domain-specific scoring) */
  completedCategories?: Set<string>;
  department: string | null;
  role: string;
  relationshipType?: RelationshipType;
}

/** Scoring weights */
const WEIGHTS = {
  INDUSTRY: 0.3,
  DEPARTMENT: 0.3,
  RELATIONSHIP: 0.25,
  PRIOR_ACTIVITY: 0.15,
};

/** Relationship type scores */
const RELATIONSHIP_SCORES: Record<RelationshipType, number> = {
  PREREQUISITE: 1.0,
  RELATED: 0.6,
  ADVANCED: 0.2,
};

/**
 * Maps industries to relevant business concept categories.
 * Keywords in tenant industry string matched against category relevance.
 */
const INDUSTRY_CATEGORY_RELEVANCE: Record<string, string[]> = {
  digital: ['Digitalni Marketing', 'Tehnologija', 'Inovacije', 'Marketing'],
  tech: ['Tehnologija', 'Inovacije', 'Digitalni Marketing', 'Sistemi'],
  software: ['Tehnologija', 'Inovacije', 'Digitalni Marketing', 'Sistemi'],
  retail: ['Prodaja', 'Marketing', 'Odnosi sa Klijentima', 'Operacije'],
  ecommerce: ['Digitalni Marketing', 'Prodaja', 'Marketing', 'Tehnologija'],
  finance: ['Finansije', 'Računovodstvo', 'Strategija'],
  consulting: ['Strategija', 'Menadžment', 'Liderstvo', 'Odnosi sa Klijentima'],
  manufacturing: ['Operacije i Proizvodnja', 'Sistemi', 'Menadžment'],
  healthcare: ['Operacije', 'Menadžment', 'Ljudski Resursi'],
  education: ['Menadžment', 'Ljudski Resursi', 'Liderstvo'],
  marketing: ['Marketing', 'Digitalni Marketing', 'Prodaja'],
  services: ['Odnosi sa Klijentima', 'Prodaja', 'Marketing', 'Operacije'],
  startup: ['Preduzetništvo', 'Startup', 'Inovacije', 'Poslovni Modeli'],
  food: ['Operacije', 'Prodaja', 'Marketing', 'Finansije'],
  'real estate': ['Finansije', 'Prodaja', 'Strategija'],
  media: ['Marketing', 'Digitalni Marketing', 'Inovacije'],
};

@Injectable()
export class ConceptRelevanceService {
  private readonly logger = new Logger(ConceptRelevanceService.name);

  /** Default relevance threshold */
  readonly DEFAULT_THRESHOLD = 0.3;

  /** Lowered threshold for PLATFORM_OWNER (broader exploration) */
  readonly OWNER_THRESHOLD = 0.15;

  /**
   * Scores a concept's relevance for a specific tenant context.
   * Returns 0.0 - 1.0 where higher = more relevant.
   *
   * Foundation categories always return 1.0.
   */
  scoreRelevance(input: RelevanceInput): number {
    const {
      conceptCategory,
      tenantIndustry,
      completedConceptIds,
      department,
      role: _role,
      relationshipType,
    } = input;

    // Foundation categories always pass
    if ((FOUNDATION_CATEGORIES as readonly string[]).includes(conceptCategory)) {
      return 1.0;
    }

    // Strip number prefix for matching (e.g., "3. Marketing" → "Marketing")
    const strippedCategory = conceptCategory.replace(/^\d+\.\s*/, '').trim();
    if ((FOUNDATION_CATEGORIES as readonly string[]).includes(strippedCategory)) {
      return 1.0;
    }

    let score = 0;

    // 1. Industry match (0.3 weight)
    const industryScore = this.scoreIndustryMatch(strippedCategory, tenantIndustry);
    score += industryScore * WEIGHTS.INDUSTRY;

    // 2. Department alignment (0.3 weight)
    const deptScore = this.scoreDepartmentMatch(strippedCategory, department);
    score += deptScore * WEIGHTS.DEPARTMENT;

    // 3. Relationship type (0.25 weight)
    if (relationshipType) {
      score += (RELATIONSHIP_SCORES[relationshipType] ?? 0.5) * WEIGHTS.RELATIONSHIP;
    } else {
      score += 0.5 * WEIGHTS.RELATIONSHIP; // Default: moderate
    }

    // 4. Prior activity (0.15 weight) — has tenant explored this DOMAIN before?
    // If completedCategories provided, check if user has explored this specific category
    // Falls back to global check if category data unavailable
    const hasDomainActivity = input.completedCategories
      ? input.completedCategories.has(strippedCategory) ||
        input.completedCategories.has(conceptCategory)
      : completedConceptIds.size > 0;
    score += (hasDomainActivity ? 0.8 : 0.3) * WEIGHTS.PRIOR_ACTIVITY;

    return Math.min(score, 1.0);
  }

  /**
   * Returns the appropriate threshold for a given role.
   */
  getThreshold(role: string): number {
    if (role === 'PLATFORM_OWNER' || role === 'TENANT_OWNER') {
      return this.OWNER_THRESHOLD;
    }
    return this.DEFAULT_THRESHOLD;
  }

  /**
   * Scores industry-to-category match using keyword matching.
   */
  private scoreIndustryMatch(category: string, tenantIndustry: string): number {
    if (!tenantIndustry) return 0.5; // No industry info = neutral

    const industryLower = tenantIndustry.toLowerCase();

    // Check each industry keyword for matches
    for (const [keyword, categories] of Object.entries(INDUSTRY_CATEGORY_RELEVANCE)) {
      if (industryLower.includes(keyword)) {
        if (categories.includes(category)) {
          return 1.0; // Direct match
        }
      }
    }

    // Universal categories that apply to any business
    const universalCategories = [
      'Menadžment',
      'Finansije',
      'Prodaja',
      'Marketing',
      'Strategija',
      'Liderstvo',
      'Poslovni Modeli',
    ];
    if (universalCategories.includes(category)) {
      return 0.6; // Broadly relevant
    }

    return 0.2; // Low relevance
  }

  /**
   * Scores department-to-category alignment.
   */
  private scoreDepartmentMatch(category: string, department: string | null): number {
    if (!department) return 0.7; // No department = owner, broadly relevant

    const deptCategories =
      DEPARTMENT_CATEGORY_MAP[department as keyof typeof DEPARTMENT_CATEGORY_MAP];
    if (!deptCategories) return 0.5;

    if (deptCategories.includes(category)) {
      return 1.0; // Direct department match
    }

    return 0.3; // Not in department scope
  }
}
