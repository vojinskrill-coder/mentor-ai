import { Module, forwardRef } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AgentExecutionModule } from '../agent-execution/agent-execution.module';
import { ProcessModule } from '../process/process.module';
import { BrochureRendererService } from './brochure-renderer.service';
import { BrochureController } from './brochure.controller';

@Module({
  imports: [
    TenantModule,
    forwardRef(() => AgentExecutionModule),
    forwardRef(() => ProcessModule),
  ],
  controllers: [BrochureController],
  providers: [BrochureRendererService],
  exports: [BrochureRendererService],
})
export class BrochureModule {}
