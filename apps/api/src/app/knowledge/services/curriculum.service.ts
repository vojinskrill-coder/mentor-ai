import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { createId } from '@paralleldrive/cuid2';
import type { CurriculumNode } from '@mentor-ai/shared/types';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Service for managing the curriculum reference data and on-demand concept creation.
 * Loads the curriculum hierarchy from a static JSON file and creates DB concepts
 * only when they are first discussed in a conversation.
 */
@Injectable()
export class CurriculumService {
  private readonly logger = new Logger(CurriculumService.name);
  private readonly nodes: CurriculumNode[];
  private readonly nodeMap: Map<string, CurriculumNode>;

  constructor(private readonly prisma: PlatformPrismaService) {
    this.nodes = this.loadCurriculumData();
    this.nodeMap = new Map(this.nodes.map((n) => [n.id, n]));
    this.logger.log(`Loaded ${this.nodes.length} curriculum nodes`);
  }

  private loadCurriculumData(): CurriculumNode[] {
    // Try multiple paths since __dirname varies between dev and built output
    const paths = [
      join(__dirname, 'data', 'curriculum.json'),
      join(__dirname, '..', 'knowledge', 'data', 'curriculum.json'),
      join(__dirname, '..', 'app', 'knowledge', 'data', 'curriculum.json'),
    ];
    for (const p of paths) {
      try {
        const raw = readFileSync(p, 'utf-8');
        return JSON.parse(raw) as CurriculumNode[];
      } catch {
        // Try next path
      }
    }
    this.logger.warn('Could not load curriculum.json from any expected path');
    return [];
  }

  /** Returns the full curriculum tree as a flat array. */
  getFullTree(): CurriculumNode[] {
    return this.nodes;
  }

  /** Looks up a single curriculum node by ID. */
  findNode(curriculumId: string): CurriculumNode | null {
    return this.nodeMap.get(curriculumId) ?? null;
  }

  /** Returns the ancestor chain from root to the given node (inclusive). */
  getAncestorChain(curriculumId: string): CurriculumNode[] {
    const chain: CurriculumNode[] = [];
    let current = this.nodeMap.get(curriculumId);
    while (current) {
      chain.unshift(current);
      current = current.parentId ? this.nodeMap.get(current.parentId) : undefined;
    }
    return chain;
  }

  /** Returns all top-level nodes (parentId === null). */
  getTopLevelNodes(): CurriculumNode[] {
    return this.nodes.filter((n) => n.parentId === null);
  }

  /** Returns children of a given curriculum node. */
  getChildren(curriculumId: string): CurriculumNode[] {
    return this.nodes.filter((n) => n.parentId === curriculumId);
  }

  /**
   * Simple substring match of a text against curriculum labels.
   * Returns the best matching node or null.
   */
  matchTopic(text: string): CurriculumNode | null {
    const lower = text.toLowerCase();
    // Exact match first
    for (const node of this.nodes) {
      if (node.label.toLowerCase() === lower) return node;
    }
    // Substring match (prefer longer labels = more specific)
    const matches = this.nodes.filter((n) =>
      lower.includes(n.label.toLowerCase()) || n.label.toLowerCase().includes(lower)
    );
    if (matches.length === 0) return null;
    // Return the most specific (deepest) match
    return matches.sort((a, b) => b.label.length - a.label.length)[0] ?? null;
  }

  /**
   * Searches curriculum labels by substring.
   * @param query - Search string
   * @param limit - Max results (default 20)
   */
  searchCurriculum(query: string, limit = 20): CurriculumNode[] {
    const lower = query.toLowerCase();
    return this.nodes
      .filter((n) => n.label.toLowerCase().includes(lower))
      .slice(0, limit);
  }

  /**
   * Ensures a concept exists in the DB for the given curriculum ID.
   * Creates the concept and all ancestor concepts if they don't exist yet.
   * Returns the concept ID (cpt_ prefixed).
   */
  async ensureConceptExists(curriculumId: string): Promise<string> {
    const node = this.nodeMap.get(curriculumId);
    if (!node) {
      throw new Error(`Curriculum node not found: ${curriculumId}`);
    }

    // Check if already exists
    const existing = await this.prisma.concept.findUnique({
      where: { curriculumId },
      select: { id: true },
    });
    if (existing) return existing.id;

    // Get ancestor chain and ensure all ancestors exist first
    const chain = this.getAncestorChain(curriculumId);
    let parentConceptId: string | null = null;

    for (const ancestor of chain) {
      const existingAncestor = await this.prisma.concept.findUnique({
        where: { curriculumId: ancestor.id },
        select: { id: true },
      });

      if (existingAncestor) {
        parentConceptId = existingAncestor.id;
        continue;
      }

      // Create the ancestor concept
      const conceptId = `cpt_${createId()}`;
      const topLevelCategory = chain[0]?.label ?? 'General'; // Root ancestor label as category

      await this.prisma.concept.create({
        data: {
          id: conceptId,
          name: ancestor.label,
          slug: ancestor.id,
          category: topLevelCategory,
          definition: ancestor.label,
          departmentTags: [],
          parentId: parentConceptId,
          sortOrder: ancestor.sortOrder,
          curriculumId: ancestor.id,
        },
      });

      this.logger.log(`Created concept for curriculum node: ${ancestor.id} (${ancestor.label})`);
      parentConceptId = conceptId;
    }

    // The last parentConceptId is the one we just created for our target node
    return parentConceptId!;
  }

  /**
   * Finds all concepts that have a curriculumId set.
   * Used for building the sparse sidebar tree.
   */
  async getActiveConceptsByCurriculum(): Promise<
    Map<string, { id: string; name: string; curriculumId: string; parentId: string | null }>
  > {
    const concepts = await this.prisma.concept.findMany({
      where: { curriculumId: { not: null } },
      select: { id: true, name: true, curriculumId: true, parentId: true },
    });

    return new Map(
      concepts
        .filter((c): c is typeof c & { curriculumId: string } => c.curriculumId !== null)
        .map((c) => [c.curriculumId, { id: c.id, name: c.name, curriculumId: c.curriculumId, parentId: c.parentId }])
    );
  }
}
