import { Inject, Injectable, Logger } from '@nestjs/common';
import { AgentRegistryService, AgentConfig } from '../agent-registry/agent-registry.service';
import { TemplateService } from '../template/template.service';
import { VaultStorage, VAULT_STORAGE } from '../vault-storage/vault-storage.interface';

export interface TenantConfig {
  companyName: string;
  industry: string;
  description: string;
}

/**
 * AgentProvisioningService — provisions all registered agents for a tenant.
 *
 * For each agent in the registry:
 *   1. Resolves the SOUL.template.md with tenant-specific variables
 *   2. Writes the resolved SOUL.md to the agent's vault directory
 *
 * Deterministic: same inputs always produce identical output.
 */
@Injectable()
export class AgentProvisioningService {
  private readonly logger = new Logger(AgentProvisioningService.name);

  constructor(
    private readonly agentRegistry: AgentRegistryService,
    private readonly templateService: TemplateService,
    @Inject(VAULT_STORAGE) private readonly vault: VaultStorage,
  ) {}

  /**
   * Provision all agents for a tenant. Creates a SOUL.md for each agent
   * in the vault at `agents/{agentId}/SOUL.md`.
   */
  async provisionAgents(
    tenantId: string,
    tenantConfig: TenantConfig,
  ): Promise<void> {
    const agents = this.agentRegistry.getAllAgents();
    this.logger.log(
      `Provisioning ${agents.length} agents for tenant ${tenantId} (${tenantConfig.companyName})`,
    );

    // Create agent directories
    const dirs = agents.map((a) => `agents/${a.id}`);
    await this.vault.createDirectories(tenantId, dirs);

    // Resolve and write SOUL.md for each agent
    const files = new Map<string, string>();
    for (const agent of agents) {
      const variables = this.buildVariables(tenantId, tenantConfig, agent);
      const soulContent = this.templateService.resolve(
        'SOUL.template.md',
        variables,
      );
      files.set(`agents/${agent.id}/SOUL.md`, soulContent);
    }

    await this.vault.writeFiles(tenantId, files);
    this.logger.log(
      `Provisioned ${files.size} agent SOUL files for tenant ${tenantId}`,
    );
  }

  /**
   * Build template variables for a specific agent + tenant combination.
   * Deterministic: same inputs always produce identical variable map.
   */
  private buildVariables(
    tenantId: string,
    tenantConfig: TenantConfig,
    agent: AgentConfig,
  ): Record<string, string> {
    return {
      companyName: tenantConfig.companyName,
      industry: tenantConfig.industry,
      description: tenantConfig.description,
      tenantId,
      vaultPath: `/root/${tenantId}/vault`,
      agentId: agent.id,
      agentRole: agent.role,
      agentModel: agent.model,
      capabilities: agent.capabilities.join(', '),
      guardrails: JSON.stringify(agent.guardrails),
    };
  }
}
