import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface AgentEvent {
  tenantId: string;
  eventName: string;
  payload: unknown;
}

@Injectable()
export class AgentExecutionEventBus {
  private readonly logger = new Logger(AgentExecutionEventBus.name);
  private readonly emitter = new EventEmitter();
  private listenerCount = 0;

  constructor() {
    this.emitter.setMaxListeners(20);
  }

  emit(event: AgentEvent): void {
    if (event.eventName !== 'agent:text-chunk' && event.eventName !== 'agent:executing-heartbeat') {
      this.logger.debug({
        message: 'EventBus emit',
        eventName: event.eventName,
        tenantId: event.tenantId,
        listeners: this.listenerCount,
      });
    }
    try {
      this.emitter.emit('agent-event', event);
    } catch (err) {
      this.logger.error({
        message: 'EventBus listener threw',
        eventName: event.eventName,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  onEvent(handler: (event: AgentEvent) => void): void {
    this.listenerCount++;
    this.logger.log({ message: 'EventBus listener registered', totalListeners: this.listenerCount });
    this.emitter.on('agent-event', handler);
  }
}
