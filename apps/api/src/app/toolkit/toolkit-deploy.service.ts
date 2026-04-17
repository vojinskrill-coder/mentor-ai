import { Injectable, Logger } from '@nestjs/common';
import { OpenClawTenantService } from '../openclaw-tenant/openclaw-tenant.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

/**
 * ToolkitDeployService — updates SOUL.md to reference the active toolkit.
 *
 * Toolkits are STATIC files already deployed on Hetzner (/root/.openclaw/toolkits/).
 * This service only changes WHICH toolkit SOUL.md points to.
 * It does NOT generate or modify toolkit files.
 */
@Injectable()
export class ToolkitDeployService {
  private readonly logger = new Logger(ToolkitDeployService.name);

  // Map of tool slugs to their toolkit file paths on Hetzner
  private static readonly TOOLKIT_PATHS: Record<string, { name: string; path: string }> = {
    'nocodb': { name: 'NocoDB (CRM)', path: '/root/.openclaw/toolkits/nocodb.md' },
    'notion': { name: 'Notion (Content)', path: '/root/.openclaw/toolkits/notion.md' },
    // Future:
    // 'hubspot-crm': { name: 'HubSpot (CRM)', path: '/root/.openclaw/toolkits/hubspot.md' },
  };

  constructor(
    private readonly openclawTenant: OpenClawTenantService,
    private readonly prisma: PlatformPrismaService,
  ) {}

  /**
   * Update SOUL.md to reference the active toolkit based on Settings.
   * Called when user enables/disables a tool in Settings.
   */
  async deployToolkit(tenantId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Find active tool bindings for this tenant
      const bindings = await this.prisma.tenantToolBinding.findMany({
        where: { tenantId, enabled: true },
        include: { adapter: true },
      });

      // Get active tool slugs
      const activeTools = bindings
        .map(b => b.adapter.toolSlug)
        .filter(slug => ToolkitDeployService.TOOLKIT_PATHS[slug]);

      // Update SOUL.md with active toolkit reference
      await this.updateSoulToolkitSection(tenantId, activeTools);

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error({ message: 'Toolkit deploy failed', tenantId, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Partially update SOUL.md — only replace ## Active Toolkit section.
   * All other sections (identity, behavior) are preserved.
   */
  private async updateSoulToolkitSection(tenantId: string, activeToolSlugs: string[]): Promise<void> {
    // Try tenant-specific SOUL.md first, then default
    const soulPaths = [
      `/root/.openclaw-${tenantId}/agents/main/agent/SOUL.md`,
      `/root/.openclaw/agents/main/agent/SOUL.md`,
    ];

    let soulPath = '';
    let currentSoul = '';
    for (const path of soulPaths) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        currentSoul = await (this.openclawTenant as any).readRemoteFile(path);
        soulPath = path;
        break;
      } catch { /* try next */ }
    }

    if (!soulPath) {
      this.logger.warn({ message: 'SOUL.md not found, skipping toolkit update', tenantId });
      return;
    }

    // Build new toolkit section
    let toolkitSection: string;
    if (activeToolSlugs.length === 0) {
      toolkitSection = `\n\n## Active Toolkit\n\nNo MCP tools are currently active. Process discovery will run without CRM integration.`;
    } else {
      const toolLines = activeToolSlugs.map(slug => {
        const info = ToolkitDeployService.TOOLKIT_PATHS[slug]!;
        return `**Active MCP Tool:** ${info.name}\n**Toolkit file:** ${info.path}`;
      }).join('\n\n');

      toolkitSection = `\n\n## Active Toolkit

You have CRM access through MCP tools. Before running any process that discovers or manages leads, read the active toolkit for instructions.

${toolLines}

Read the toolkit file for:
- How to connect and authenticate
- How to read existing records for deduplication
- How to build exclusion lists
- Error handling when CRM is offline

Always read existing CRM data BEFORE triggering a discovery process to avoid duplicates.`;
    }

    // Replace or append
    let updatedSoul: string;
    if (currentSoul.includes('## Active Toolkit')) {
      updatedSoul = currentSoul.replace(/\n\n## Active Toolkit[\s\S]*?(?=\n\n## |\s*$)/, toolkitSection);
    } else {
      updatedSoul = currentSoul.trimEnd() + toolkitSection;
    }

    await this.openclawTenant.writeRemoteFile(soulPath, updatedSoul);
    this.logger.log({ message: 'SOUL.md toolkit section updated', tenantId, activeTools: activeToolSlugs });
  }
}
