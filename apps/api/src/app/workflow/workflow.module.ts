import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { NotesModule } from '../notes/notes.module';
import { WebSearchModule } from '../web-search/web-search.module';
import { ExecutionModule } from '../execution/execution.module';
import { WorkflowService } from './workflow.service';
import { YoloSchedulerService } from './yolo-scheduler.service';

@Module({
  imports: [
    TenantModule,
    KnowledgeModule,
    AiGatewayModule,
    NotesModule,
    WebSearchModule,
    ExecutionModule,
  ],
  providers: [WorkflowService, YoloSchedulerService],
  exports: [WorkflowService, YoloSchedulerService],
})
export class WorkflowModule {}
