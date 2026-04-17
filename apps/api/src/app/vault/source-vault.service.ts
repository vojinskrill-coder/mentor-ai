import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Loads the canonical 445 concepts from the source Obsidian vault data.
 *
 * Reads from the cached obsidian-pages.json (exported from
 * publish.obsidian.md/hadzi-vojin) and transforms into a structured
 * concept list with: name, slug, category, sortOrder, departmentTags,
 * originalContent, parentId for hierarchy.
 *
 * EXCLUDES: "Kako koristiti Mentor AI?" and "Promptovi" sections.
 */

export interface SourceConcept {
  name: string;
  slug: string;
  category: string;
  sortOrder: number;
  categorySortOrder: number;
  originalContent: string;
  definition: string;
  departmentTags: string[];
  curriculumId: string | null;
  parentCurriculumId: string | null;
}

/** Categories to exclude from the vault */
const EXCLUDED_CATEGORIES = [
  'Kako koristiti Mentor AI?',
  'Kako koristiti Mentor AI',
  'Promptovi',
];

/** Maps category names to department tags */
const CATEGORY_DEPARTMENT_MAP: Record<string, string[]> = {
  'Uvod u Poslovanje': ['all'],
  'Vrednost': ['all'],
  'Marketing': ['Marketing'],
  'Kognitivne Sklonosti': ['all'],
  'Odredjivanje Cene': ['Sales', 'Finance'],
  'Određivanje Cene': ['Sales', 'Finance'],
  'Prodaja': ['Sales'],
  'Razvoj Poslovanja': ['Strategy', 'Sales'],
  'Finansije': ['Finance'],
  'Operacije i Proizvodnja': ['Operations'],
  'Menadzment': ['Operations', 'Strategy'],
  'Menadžment': ['Operations', 'Strategy'],
  'Ljudski Resursi': ['Operations'],
  'Rad sa Ljudima': ['Operations', 'all'],
  'Upravljanje Svojim Radom': ['all'],
  'Isporuka Vrednosti': ['Operations', 'Sales'],
  'Sistemi': ['Technology', 'Operations'],
  'Poslovni Modeli': ['Strategy'],
  'Kompanijska Struktura': ['Operations', 'Strategy'],
  'Tipovi Kompanija': ['Strategy'],
  'Kupovina i Prodaja Poslovanja': ['Finance', 'Strategy'],
  'Startup': ['Strategy'],
  'Upravljanje Podacima': ['Technology'],
};

@Injectable()
export class SourceVaultService {
  private readonly logger = new Logger(SourceVaultService.name);
  private cachedConcepts: SourceConcept[] | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PlatformPrismaService,
  ) {}

  /**
   * Load all source concepts from the Obsidian vault data.
   * Uses curriculum.json as the authoritative structure + obsidian-pages.json for content.
   */
  async loadSourceConcepts(): Promise<SourceConcept[]> {
    if (this.cachedConcepts) return this.cachedConcepts;

    const concepts: SourceConcept[] = [];

    // Load curriculum.json for structure.
    // Try multiple paths: webpack __dirname, CWD-relative, and absolute config.
    const candidatePaths = [
      path.join(__dirname, '..', 'knowledge', 'data', 'curriculum.json'),
      path.join(process.cwd(), 'apps', 'api', 'src', 'app', 'knowledge', 'data', 'curriculum.json'),
      path.join(process.cwd(), 'src', 'app', 'knowledge', 'data', 'curriculum.json'),
    ];
    const curriculumPath = candidatePaths.find((p) => fs.existsSync(p)) ?? candidatePaths[0]!;
    let curriculum: Array<{ id: string; parentId: string | null; label: string; sortOrder: number }> = [];

    try {
      const raw = fs.readFileSync(curriculumPath, 'utf-8');
      curriculum = JSON.parse(raw);
      this.logger.log(`Loaded ${curriculum.length} curriculum nodes`);
    } catch (err) {
      this.logger.warn(`Could not load curriculum.json: ${(err as Error).message}`);
    }

    // Load obsidian-pages.json for content (if available)
    const obsidianPagesPath = path.join(os.tmpdir(), 'obsidian-pages.json');
    let obsidianPages: Record<string, string> = {};
    try {
      if (fs.existsSync(obsidianPagesPath)) {
        obsidianPages = JSON.parse(fs.readFileSync(obsidianPagesPath, 'utf-8'));
        this.logger.log(`Loaded ${Object.keys(obsidianPages).length} Obsidian pages`);
      }
    } catch {
      this.logger.warn('obsidian-pages.json not available — concepts will have placeholder content');
    }

    // Get top-level categories (parentId = null)
    const topLevelCategories = curriculum.filter((n) => n.parentId === null);

    // Load English names from platform concepts
    // curriculum.json now has English labels and English IDs
    const englishNameMap = new Map<string, string>(); // curriculumId/slug → English name
    try {
      const platformConcepts = await this.prisma.concept.findMany({
        where: { tenantId: null, source: 'SEED_DATA' },
        select: { name: true, slug: true, curriculumId: true },
      });
      for (const pc of platformConcepts) {
        const key = pc.curriculumId ?? pc.slug;
        if (key) englishNameMap.set(key, pc.name);
      }
      this.logger.log(`Loaded ${englishNameMap.size} English names from platform concepts`);
    } catch {
      this.logger.warn('Could not load platform concept names — using curriculum labels');
    }

    // Build concepts from curriculum tree
    for (const node of curriculum) {
      // Skip excluded categories and their children
      const rootAncestor = this.findRootAncestor(node, curriculum);
      if (rootAncestor && EXCLUDED_CATEGORIES.some((ex) => rootAncestor.label.includes(ex))) {
        continue;
      }

      // Skip top-level category nodes themselves (they're folders, not concepts)
      // But include leaf nodes and mid-level nodes
      if (node.parentId === null) continue;

      // Determine category from root ancestor
      const category = rootAncestor?.label ?? 'General';
      const categorySortOrder = rootAncestor?.sortOrder ?? 0;

      // Get content from obsidian pages if available
      const content = this.findContentForNode(node, obsidianPages);
      const definition = this.extractDefinition(content);

      // Map department tags
      const deptTags = CATEGORY_DEPARTMENT_MAP[category] ?? ['all'];

      // Ensure unique slugs within the concept set
      let slug = this.slugify(node.label);
      const existingSlugs = new Set(concepts.map((c) => c.slug));
      if (existingSlugs.has(slug)) {
        slug = `${slug}-${this.slugify(category)}`;
        if (existingSlugs.has(slug)) {
          slug = `${slug}-${node.sortOrder}`;
        }
      }

      // Use English name from Obsidian (platform concepts) if available, else fall back to curriculum label
      const englishName = englishNameMap.get(node.id) ?? node.label;

      concepts.push({
        name: englishName,
        slug,
        category,
        sortOrder: node.sortOrder,
        categorySortOrder,
        originalContent: content,
        definition,
        departmentTags: deptTags,
        curriculumId: node.id,
        parentCurriculumId: node.parentId,
      });
    }

    // Add root-level standalone notes (English names matching curriculum.json)
    const standaloneNotes = [
      { name: 'Value Stream', slug: 'value-stream' },
      { name: 'Creating Barriers for Competitors', slug: 'creating-barriers-for-competitors' },
    ];
    for (const note of standaloneNotes) {
      const existing = concepts.find((c) => c.slug === note.slug || c.name === note.name);
      if (!existing) {
        concepts.push({
          name: note.name,
          slug: note.slug,
          category: 'Value', // Root-level notes belong to Value category
          sortOrder: 999,
          categorySortOrder: 2,
          originalContent: '',
          definition: `${note.name} — a core business concept.`,
          departmentTags: ['all'],
          curriculumId: note.slug,
          parentCurriculumId: null,
        });
      }
    }

    this.logger.log(`Source vault loaded: ${concepts.length} concepts, ${topLevelCategories.length} categories`);
    this.cachedConcepts = concepts;
    return concepts;
  }

  /**
   * Get just the category list (top-level, excluding excluded ones).
   */
  async getCategories(): Promise<Array<{ id: string; label: string; sortOrder: number }>> {
    const candidatePaths = [
      path.join(__dirname, '..', 'knowledge', 'data', 'curriculum.json'),
      path.join(process.cwd(), 'apps', 'api', 'src', 'app', 'knowledge', 'data', 'curriculum.json'),
      path.join(process.cwd(), 'src', 'app', 'knowledge', 'data', 'curriculum.json'),
    ];
    const curriculumPath = candidatePaths.find((p) => fs.existsSync(p)) ?? candidatePaths[0]!;
    const curriculum = JSON.parse(fs.readFileSync(curriculumPath, 'utf-8')) as Array<{
      id: string;
      parentId: string | null;
      label: string;
      sortOrder: number;
    }>;

    return curriculum
      .filter((n) => n.parentId === null)
      .filter((n) => !EXCLUDED_CATEGORIES.some((ex) => n.label.includes(ex)))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // ── Helpers ──────────────────────────────────────────────────

  private findRootAncestor(
    node: { id: string; parentId: string | null; label: string; sortOrder?: number },
    tree: Array<{ id: string; parentId: string | null; label: string; sortOrder: number }>,
  ): { id: string; label: string; sortOrder: number } | null {
    let current: { id: string; parentId: string | null; label: string; sortOrder?: number } = node;
    while (current.parentId) {
      const parent = tree.find((n) => n.id === current.parentId);
      if (!parent) break;
      current = parent;
    }
    return { id: current.id, label: current.label, sortOrder: current.sortOrder ?? 0 };
  }

  private findContentForNode(
    node: { id: string; label: string },
    pages: Record<string, string>,
  ): string {
    // Try to find matching page by name
    for (const [filePath, content] of Object.entries(pages)) {
      const fileName = filePath.split('/').pop()?.replace('.md', '') ?? '';
      if (
        fileName === node.label ||
        fileName.replace(/^\d+(\.\d+)*\s+/, '') === node.label
      ) {
        return content;
      }
    }
    return '';
  }

  private extractDefinition(content: string): string {
    if (!content) return 'Placeholder — awaiting enrichment.';
    // Extract first meaningful paragraph (50+ chars)
    const paragraphs = content
      .split('\n\n')
      .map((p) => p.trim())
      .filter((p) => p.length >= 50 && !p.startsWith('#') && !p.startsWith('Created:'));
    return paragraphs[0]?.substring(0, 500) ?? 'Placeholder — awaiting enrichment.';
  }

  /**
   * Extract [[wikilinks]] from markdown content.
   * Returns an array of concept names referenced in the content.
   */
  extractWikilinks(content: string): string[] {
    if (!content) return [];
    const pattern = /\[\[([^\]]+)\]\]/g;
    const links: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const linkText = match[1]!.trim();
      // Handle pipes (display text aliases) and section anchors
      let name = linkText.includes('|') ? linkText.split('|')[0]!.trim() : linkText;
      // Strip section anchors: [[Concept#Section]] → Concept
      name = name.includes('#') ? name.split('#')[0]!.trim() : name;
      if (name && !links.includes(name)) {
        links.push(name);
      }
    }
    return links;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đ]/g, 'dj')
      .replace(/[ž]/g, 'z')
      .replace(/[ć]/g, 'c')
      .replace(/[č]/g, 'c')
      .replace(/[š]/g, 's')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 120);
  }
}
