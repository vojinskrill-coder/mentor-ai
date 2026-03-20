import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AppEventBus } from './app-event-bus.service';
import { AppEventHandlers } from './event-handlers.service';
import { AgentExecutionModule } from '../agent-execution/agent-execution.module';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      // Use wildcards for flexible event matching
      wildcard: true,
      delimiter: '.',
      // Non-blocking by default
      maxListeners: 50,
    }),
    TenantModule,
    AgentExecutionModule,
  ],
  providers: [AppEventBus, AppEventHandlers],
  exports: [AppEventBus],
})
export class AppEventsModule {}
