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
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ConversationGateway } from './conversation.gateway';

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
  ],
  controllers: [ConversationController],
  providers: [ConversationService, ConversationGateway],
  exports: [ConversationService],
})
export class ConversationModule {}
