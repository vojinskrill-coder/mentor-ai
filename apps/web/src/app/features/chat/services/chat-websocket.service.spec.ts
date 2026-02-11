import { TestBed } from '@angular/core/testing';
import { ChatWebsocketService } from './chat-websocket.service';
import { AuthService } from '../../../core/auth/auth.service';
import { of } from 'rxjs';

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn().mockReturnValue({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
  }),
}));

describe('ChatWebsocketService', () => {
  let service: ChatWebsocketService;
  let mockAuthService: {
    getAccessToken: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockAuthService = {
      getAccessToken: vi.fn().mockReturnValue(of('test-token')),
    };

    TestBed.configureTestingModule({
      providers: [
        ChatWebsocketService,
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    service = TestBed.inject(ChatWebsocketService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  describe('connect', () => {
    it('should get access token and connect', async () => {
      await service.connect();

      expect(mockAuthService.getAccessToken).toHaveBeenCalled();
    });

    it('should not reconnect if already connected', async () => {
      // First connection
      await service.connect();
      const firstCallCount = mockAuthService.getAccessToken.mock.calls.length;

      // Simulate connected state
      (service as unknown as { socket: { connected: boolean } | null }).socket = {
        connected: true,
      } as { connected: boolean };

      // Second connection attempt
      await service.connect();

      expect(mockAuthService.getAccessToken.mock.calls.length).toBe(
        firstCallCount
      );
    });
  });

  describe('disconnect', () => {
    it('should disconnect socket if connected', async () => {
      await service.connect();
      const socket = (service as unknown as { socket: { disconnect: ReturnType<typeof vi.fn> } }).socket;

      service.disconnect();

      expect(socket.disconnect).toHaveBeenCalled();
    });

    it('should handle disconnect when not connected', () => {
      // Should not throw
      expect(() => service.disconnect()).not.toThrow();
    });
  });

  describe('sendMessage', () => {
    it('should emit message when connected', async () => {
      await service.connect();
      const socket = (service as unknown as { socket: { emit: ReturnType<typeof vi.fn>; connected: boolean } }).socket;
      socket.connected = true;

      service.sendMessage('sess_1', 'Hello');

      expect(socket.emit).toHaveBeenCalledWith('chat:message-send', {
        conversationId: 'sess_1',
        content: 'Hello',
      });
    });

    it('should not emit when not connected', () => {
      // Service should silently return when not connected (no socket exists)
      expect(() => service.sendMessage('sess_1', 'Hello')).not.toThrow();
    });
  });

  describe('callbacks', () => {
    it('should register message received callback', () => {
      const callback = vi.fn();
      service.onMessageReceived(callback);

      // Verify callback is stored
      expect(
        (service as unknown as { messageReceivedCallbacks: unknown[] })
          .messageReceivedCallbacks
      ).toContain(callback);
    });

    it('should register message chunk callback', () => {
      const callback = vi.fn();
      service.onMessageChunk(callback);

      expect(
        (service as unknown as { messageChunkCallbacks: unknown[] })
          .messageChunkCallbacks
      ).toContain(callback);
    });

    it('should register complete callback', () => {
      const callback = vi.fn();
      service.onComplete(callback);

      expect(
        (service as unknown as { completeCallbacks: unknown[] })
          .completeCallbacks
      ).toContain(callback);
    });

    it('should register error callback', () => {
      const callback = vi.fn();
      service.onError(callback);

      expect(
        (service as unknown as { errorCallbacks: unknown[] }).errorCallbacks
      ).toContain(callback);
    });
  });
});
