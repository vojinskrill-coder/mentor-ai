import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AuthModule } from '../auth/auth.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { NotesModule } from '../notes/notes.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { WebSearchModule } from '../web-search/web-search.module';
import { AgentExecutionService } from './agent-execution.service';
import { AgentExecutionController } from './agent-execution.controller';
import { OpenClawClientService } from './openclaw-client.service';
import { AgentRegistryService } from './agent-registry.service';
import { AgentPromptService } from './agent-prompt.service';
import { JobPlannerService } from './job-planner.service';
import { BudgetService } from './budget.service';
import { AgentExecutionEventBus } from './agent-execution-event-bus.service';

@Module({
  imports: [ConfigModule, TenantModule, AuthModule, AiGatewayModule, NotesModule, forwardRef(() => KnowledgeModule), WebSearchModule],
  controllers: [AgentExecutionController],
  providers: [
    AgentExecutionService,
    OpenClawClientService,
    AgentRegistryService,
    AgentPromptService,
    JobPlannerService,
    BudgetService,
    AgentExecutionEventBus,
  ],
  exports: [AgentExecutionService, JobPlannerService, AgentExecutionEventBus, OpenClawClientService],
})
export class AgentExecutionModule {}
