import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { VaultStorageModule } from '../vault-storage/vault-storage.module';
import { TemplateModule } from '../template/template.module';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';
import { SourceVaultService } from './source-vault.service';
import { ConceptPriorityService } from './concept-priority.service';
import { ConceptEnrichmentService } from './concept-enrichment.service';
import { SectionFilterService } from './section-filter.service';
import { BrainIndexService } from './brain-index.service';
import { PromptEnrichmentService } from './prompt-enrichment.service';
import { InsightCrystallizationService } from './insight-crystallization.service';
import { ConversationHooksService } from './conversation-hooks.service';
import { RecommendationService } from './recommendation.service';
import { McpEvolutionService } from './mcp-evolution.service';
import { BrainMaintenanceService } from './brain-maintenance.service';
import { VaultProvisionerService } from './vault-provisioner.service';
import { TenantGuardService } from './tenant-guard.service';
import { AgentExecutionModule } from '../agent-execution/agent-execution.module';
// QdrantModule is @Global — no explicit import needed
import { AppEventsModule } from '../events/events.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

/**
 * Vault Module — per-tenant Obsidian-style knowledge vault management.
 *
 * Provides:
 *   - VaultService: creates tenant vaults with placeholder concepts
 *   - SourceVaultService: loads canonical concepts from source vault
 *   - VaultController: REST API for vault status, stats, and monitoring
 *
 * Used by:
 *   - OnboardingService (creates vault during setupCompany)
 *   - Brain maintenance agents (lint, enrich, dedup)
 *   - Monitoring dashboard (operation logs)
 */
@Module({
  imports: [ConfigModule, TenantModule, AgentExecutionModule, AppEventsModule, KnowledgeModule, VaultStorageModule, TemplateModule],
  controllers: [VaultController],
  providers: [
    VaultService,
    SourceVaultService,
    ConceptPriorityService,
    ConceptEnrichmentService,
    SectionFilterService,
    BrainIndexService,
    PromptEnrichmentService,
    InsightCrystallizationService,
    ConversationHooksService,
    RecommendationService,
    McpEvolutionService,
    BrainMaintenanceService,
    VaultProvisionerService,
    TenantGuardService,
  ],
  exports: [
    VaultService,
    VaultProvisionerService,
    TenantGuardService,
    SourceVaultService,
    ConceptPriorityService,
    ConceptEnrichmentService,
    SectionFilterService,
    BrainIndexService,
    PromptEnrichmentService,
    InsightCrystallizationService,
    ConversationHooksService,
    RecommendationService,
    McpEvolutionService,
    BrainMaintenanceService,
  ],
})
export class VaultModule {}
