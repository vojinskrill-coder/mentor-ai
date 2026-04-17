import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

/**
 * Read + manage the generic MCP tool catalog that the Neuron Process
 * Builder skill uses during the DESIGN phase. The catalog is tenant-
 * independent — every tenant sees the same tools, they just bind them
 * differently per process.
 *
 * Seeded via prisma/seed-mcp-catalog.ts. Adding a new tool is one row
 * insert — no code change required for existing processes to be able
 * to use it (they'd need a new binding, which the builder handles).
 */
@Injectable()
export class McpCatalogService {
  private readonly logger = new Logger(McpCatalogService.name);

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * List all active tools in the catalog, sorted alphabetically by
   * display name. Used by:
   *   - Builder skill DISCOVER phase (to present picks to the user)
   *   - Builder UI tool picker (right-panel chip list)
   *   - Admin catalog preview
   */
  async listActive() {
    return this.prisma.mcpToolCatalog.findMany({
      where: { isActive: true },
      orderBy: { displayName: 'asc' },
    });
  }

  /**
   * Look up a single tool by slug. Throws NotFoundException if
   * missing — the builder skill treats this as a hard error
   * ("admin must add this tool first") and stops the design flow.
   */
  async getBySlug(slug: string) {
    const tool = await this.prisma.mcpToolCatalog.findUnique({
      where: { slug },
    });
    if (!tool) {
      throw new NotFoundException(`MCP tool not found in catalog: ${slug}`);
    }
    return tool;
  }

  /**
   * Look up multiple tools by their slugs in one query. Returns only
   * the ones that exist — callers decide how to handle missing slugs.
   */
  async getMany(slugs: string[]) {
    if (slugs.length === 0) return [];
    return this.prisma.mcpToolCatalog.findMany({
      where: { slug: { in: slugs }, isActive: true },
    });
  }
}
