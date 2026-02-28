import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { ExecutionStateService } from './execution-state.service';

@Module({
  imports: [TenantModule],
  providers: [ExecutionStateService],
  exports: [ExecutionStateService],
})
export class ExecutionModule {}
