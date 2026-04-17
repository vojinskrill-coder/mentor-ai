import { Injectable, Inject, Logger } from '@nestjs/common';
import { AgentRegistryService } from '../agent-registry/agent-registry.service';
import { TemplateService } from '../template/template.service';
import { VAULT_STORAGE, VaultStorage } from '../vault-storage/vault-storage.interface';

export interface TenantConfig {
  tenantName: string;
  backendUrl: string;
  bridgeAuthToken: string;
  [key: string]: string;
}

export interface ProvisioningResult {
  agentId: string;
  success: boolean;
  error?: string;
}

@Injectable()
export class AgentProvisioningService {
  private readonly logger = new Logger(AgentProvisioningService.name);

  constructor(
    private readonly agentRegistry: AgentRegistryService,
    private readonly templateService: TemplateService,
    @Inject(VAULT_STORAGE) private readonly vaultStorage: VaultStorage,
  ) {}

  async provisionAgents(
    tenantId: string,
    tenantConfig: TenantConfig,
  ): Promise<ProvisioningResult[]> {
    const agents = this.agentRegistry.getAllAgents();
    const results: ProvisioningResult[] = [];

    // Prepare common template vars
    const vars: Record<string, string> = {
      TENANT_ID: tenantId,
      TENANT_NAME: tenantConfig.tenantName,
      BACKEND_URL: tenantConfig.backendUrl,
      BRIDGE_AUTH_TOKEN: tenantConfig.bridgeAuthToken,
      ...tenantConfig,
    };

    // Create tenant directories
    await this.vaultStorage.createDirectories(tenantId, [
      'agents',
      'concepts',
      'logs',
    ]);

    for (const agent of agents) {
      try {
        // Resolve SOUL template for this agent
        const agentVars = {
          ...vars,
          AGENT_NAME: agent.name,
          AGENT_ID: agent.id,
        };

        const soulContent = this.templateService.resolve(
          `vault/${agent.soulTemplate}`,
          agentVars,
        );

        // Write SOUL.md to vault
        await this.vaultStorage.writeFile(
          tenantId,
          `agents/${agent.id}/SOUL.md`,
          soulContent,
        );

        results.push({ agentId: agent.id, success: true });
        this.logger.log(
          `Provisioned agent ${agent.id} for tenant ${tenantId}`,
        );
      } catch (err) {
        const error = (err as Error).message;
        results.push({ agentId: agent.id, success: false, error });
        this.logger.error(
          `Failed to provision agent ${agent.id} for tenant ${tenantId}: ${error}`,
        );
      }
    }

    return results;
  }
}
