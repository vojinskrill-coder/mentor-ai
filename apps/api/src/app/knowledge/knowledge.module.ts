import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AuthModule } from '../auth/auth.module';
import { LlmConfigModule } from '../llm-config/llm-config.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { KnowledgeController } from './knowledge.controller';
import { ConceptService } from './services/concept.service';
import { ConceptSeedService } from './services/concept-seed.service';
import { ConceptMatchingService } from './services/concept-matching.service';
import { CitationInjectorService } from './services/citation-injector.service';
import { CitationService } from './services/citation.service';
import { EmbeddingService } from './services/embedding.service';
import { CurriculumService } from './services/curriculum.service';
import { ConceptExtractionService } from './services/concept-extraction.service';

/**
 * Module for business concepts knowledge base.
 * Provides services for querying, seeding, and citing concepts.
 *
 * Story 2.6: Added citation services for concept matching and injection.
 * Story 2.13: Added AiGatewayModule for dynamic relationship creation.
 */
@Module({
  imports: [TenantModule, AuthModule, LlmConfigModule, AiGatewayModule],
  controllers: [KnowledgeController],
  providers: [
    ConceptService,
    ConceptSeedService,
    ConceptMatchingService,
    CitationInjectorService,
    CitationService,
    EmbeddingService,
    CurriculumService,
    ConceptExtractionService,
  ],
  exports: [
    ConceptService,
    ConceptSeedService,
    ConceptMatchingService,
    CitationInjectorService,
    CitationService,
    EmbeddingService,
    CurriculumService,
    ConceptExtractionService,
  ],
})
export class KnowledgeModule {}
