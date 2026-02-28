import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { MemoryModule } from '../memory/memory.module';
import { WebSearchModule } from '../web-search/web-search.module';
import { NotesModule } from '../notes/notes.module';
import { ConceptResearchService } from './concept-research.service';

/**
 * Module for multi-turn AI research on business concepts.
 * Used by YOLO scheduler for autonomous research and by the gateway for manual research.
 */
@Module({
  imports: [
    TenantModule,
    AiGatewayModule,
    KnowledgeModule,
    MemoryModule,
    WebSearchModule,
    NotesModule,
  ],
  providers: [ConceptResearchService],
  exports: [ConceptResearchService],
})
export class ResearchModule {}
