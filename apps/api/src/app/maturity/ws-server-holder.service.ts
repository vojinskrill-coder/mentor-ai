import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Shared singleton that holds the socket.io Server reference.
 * ConversationGateway sets it in onModuleInit(); autonomous services read it for broadcasts.
 */
@Injectable()
export class WsServerHolder {
  server: Server | null = null;

  /**
   * Broadcast an event to all clients in a tenant room.
   * No-op if server is null or room is empty.
   */
  emitToTenant(tenantId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    const room = `tenant:${tenantId}`;
    this.server.to(room).emit(event, payload);
  }
}
