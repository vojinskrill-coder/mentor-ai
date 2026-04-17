import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AuthModule } from '../auth/auth.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { NotesModule } from '../notes/notes.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { MemoryModule } from '../memory/memory.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { WebSearchModule } from '../web-search/web-search.module';
import { ExecutionModule } from '../execution/execution.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AgentExecutionModule } from '../agent-execution/agent-execution.module';
import { MaturityModule } from '../maturity/maturity.module';
import { VaultModule } from '../vault/vault.module';
import { ConversationHooksService } from '../vault/conversation-hooks.service';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ConversationGateway } from './conversation.gateway';
import { ConceptPlanService } from './concept-plan.service';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    AiGatewayModule,
    TenantModule,
    NotesModule,
    KnowledgeModule,
    MemoryModule,
    WorkflowModule,
    WebSearchModule,
    ExecutionModule,
    AttachmentsModule,
    AgentExecutionModule,
    MaturityModule,
    VaultModule, // Provides ConversationHooksService for prompt enrichment + crystallization
  ],
  controllers: [ConversationController],
  providers: [
    ConversationService,
    ConversationGateway,
    ConceptPlanService,
    { provide: 'ConversationHooksService', useExisting: ConversationHooksService },
  ],
  exports: [ConversationService],
})
export class ConversationModule {}
