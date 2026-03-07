import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AuthModule } from '../auth/auth.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { NotesModule } from '../notes/notes.module';
import { AgentExecutionService } from './agent-execution.service';
import { AgentExecutionController } from './agent-execution.controller';
import { OpenClawClientService } from './openclaw-client.service';
import { AgentRegistryService } from './agent-registry.service';
import { AgentRecommenderService } from './agent-recommender.service';
import { AgentPromptService } from './agent-prompt.service';
import { BudgetService } from './budget.service';

@Module({
  imports: [ConfigModule, TenantModule, AuthModule, AiGatewayModule, NotesModule],
  controllers: [AgentExecutionController],
  providers: [
    AgentExecutionService,
    OpenClawClientService,
    AgentRegistryService,
    AgentRecommenderService,
    AgentPromptService,
    BudgetService,
  ],
  exports: [AgentExecutionService],
})
export class AgentExecutionModule {}
