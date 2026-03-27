import { Module, Global, forwardRef } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AppEventBus } from './app-event-bus.service';
import { AppEventHandlers } from './event-handlers.service';
import { AgentExecutionModule } from '../agent-execution/agent-execution.module';
import { MaturityModule } from '../maturity/maturity.module';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 50,
    }),
    TenantModule,
    AgentExecutionModule,
    forwardRef(() => MaturityModule),
  ],
  providers: [AppEventBus, AppEventHandlers],
  exports: [AppEventBus],
})
export class AppEventsModule {}
