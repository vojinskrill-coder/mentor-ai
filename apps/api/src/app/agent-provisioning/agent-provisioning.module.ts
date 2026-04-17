import { Module } from '@nestjs/common';
import { AgentProvisioningService } from './agent-provisioning.service';
import { AgentRegistryModule } from '../agent-registry/agent-registry.module';
import { TemplateModule } from '../template/template.module';
import { VaultStorageModule } from '../vault-storage/vault-storage.module';

@Module({
  imports: [AgentRegistryModule, TemplateModule, VaultStorageModule],
  providers: [AgentProvisioningService],
  exports: [AgentProvisioningService],
})
export class AgentProvisioningModule {}
