import { Injectable } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

@Injectable()
export class ToolkitGeneratorService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Generates a complete TOOLKIT.md content for a tenant.
   * Reads all enabled TenantToolBindings, fills adapter templates
   * with tenant-specific credentials, and returns the markdown string.
   */
  async generateToolkit(tenantId: string): Promise<string> {
    // 1. Find all enabled bindings for this tenant with their adapters
    const bindings = await this.prisma.tenantToolBinding.findMany({
      where: {
        tenantId,
        enabled: true,
        adapter: { isActive: true },
      },
      include: { adapter: true },
      orderBy: { adapter: { processSlug: 'asc' } },
    });

    if (bindings.length === 0) {
      return '# TOOLKIT\n\nNo tools configured for this tenant.\n';
    }

    // 2. Group by processSlug
    const grouped = new Map<string, typeof bindings>();
    for (const binding of bindings) {
      const slug = binding.adapter.processSlug;
      if (!grouped.has(slug)) {
        grouped.set(slug, []);
      }
      grouped.get(slug)!.push(binding);
    }

    // 3. Build the TOOLKIT.md content
    const sections: string[] = ['# TOOLKIT\n'];

    for (const [processSlug, processBindings] of grouped) {
      sections.push(`## Process: ${processSlug}\n`);

      for (const binding of processBindings) {
        const { adapter } = binding;
        const credentials = binding.toolCredentials as Record<string, string>;
        const fieldMapping =
          (binding.customFieldMapping as Record<string, string> | null) ??
          (adapter.fieldMapping as Record<string, string>);

        // Format the field mapping as markdown lines
        const fieldMappingFormatted = Object.entries(fieldMapping)
          .map(([ourField, toolField]) => `  - ${ourField} → ${toolField}`)
          .join('\n');

        // Fill template placeholders with tenant credentials
        let filled = adapter.toolkitTemplate;
        filled = filled.replace(/\{\{baseUrl\}\}/g, credentials.baseUrl ?? '(not configured)');
        filled = filled.replace(/\{\{tableId\}\}/g, credentials.tableId ?? '(not configured)');
        filled = filled.replace(/\{\{apiToken\}\}/g, credentials.apiToken ?? '(not configured)');
        filled = filled.replace(/\{\{fieldMappingFormatted\}\}/g, fieldMappingFormatted);

        // Replace any remaining custom credential placeholders
        for (const [key, value] of Object.entries(credentials)) {
          filled = filled.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        }

        sections.push(filled);
        sections.push(''); // blank line between tools
      }
    }

    return sections.join('\n');
  }
}
