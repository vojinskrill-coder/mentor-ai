import { Injectable, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

/**
 * Base WebSocket service for managing Socket.io connections.
 * Provides common connection logic with authentication.
 */
@Injectable({ providedIn: 'root' })
export class WebsocketService {
  private socket: Socket | null = null;
  private readonly authService = inject(AuthService);

  /**
   * Connects to a WebSocket namespace.
   * @param namespace - The namespace to connect to (e.g., '/ws/chat')
   * @returns The connected socket instance
   */
  async connect(namespace: string): Promise<Socket | null> {
    if (this.socket?.connected) return this.socket;

    const token = this.authService.getAccessToken();
    if (!token) {
      return null;
    }

    const wsUrl = environment.apiUrl.replace(/^http/, 'ws');

    this.socket = io(`${wsUrl}${namespace}`, {
      auth: { token },
      query: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    return this.socket;
  }

  /**
   * Disconnects from the WebSocket server.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Gets the current socket instance.
   * @returns The socket or null if not connected
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Checks if the socket is currently connected.
   * @returns true if connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}
