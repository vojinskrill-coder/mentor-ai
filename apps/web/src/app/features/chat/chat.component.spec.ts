import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { ChatComponent } from './chat.component';
import { ConversationService } from './services/conversation.service';
import { ChatWebsocketService } from './services/chat-websocket.service';

describe('ChatComponent', () => {
  let component: ChatComponent;
  let fixture: ComponentFixture<ChatComponent>;
  let mockConversationService: {
    getConversations: ReturnType<typeof vi.fn>;
    getConversation: ReturnType<typeof vi.fn>;
    createConversation: ReturnType<typeof vi.fn>;
    deleteConversation: ReturnType<typeof vi.fn>;
  };
  let mockChatWsService: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    onMessageReceived: ReturnType<typeof vi.fn>;
    onMessageChunk: ReturnType<typeof vi.fn>;
    onComplete: ReturnType<typeof vi.fn>;
    onError: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockConversationService = {
      getConversations: vi.fn().mockResolvedValue([]),
      getConversation: vi.fn(),
      createConversation: vi.fn(),
      deleteConversation: vi.fn(),
    };

    mockChatWsService = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      sendMessage: vi.fn(),
      onMessageReceived: vi.fn(),
      onMessageChunk: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ChatComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { params: of({}) },
        },
        { provide: ConversationService, useValue: mockConversationService },
        { provide: ChatWebsocketService, useValue: mockChatWsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should load conversations on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(mockConversationService.getConversations).toHaveBeenCalled();
  });

  it('should connect to WebSocket on init', () => {
    fixture.detectChanges();
    expect(mockChatWsService.connect).toHaveBeenCalled();
  });

  it('should disconnect WebSocket on destroy', () => {
    fixture.detectChanges();
    component.ngOnDestroy();
    expect(mockChatWsService.disconnect).toHaveBeenCalled();
  });

  it('should display empty state when no active conversation', () => {
    fixture.detectChanges();
    expect(component.activeConversation$()).toBeNull();
  });

  describe('createNewConversation', () => {
    it('should create and select new conversation', async () => {
      const mockConversation = {
        id: 'sess_new',
        userId: 'usr_test',
        title: null,
        createdAt: '2026-02-06T00:00:00.000Z',
        updatedAt: '2026-02-06T00:00:00.000Z',
      };
      mockConversationService.createConversation.mockResolvedValue(mockConversation);
      mockConversationService.getConversation.mockResolvedValue({
        ...mockConversation,
        messages: [],
      });

      fixture.detectChanges();
      await component.createNewConversation();

      expect(mockConversationService.createConversation).toHaveBeenCalled();
      expect(component.activeConversation$()?.id).toBe('sess_new');
    });
  });

  describe('sendMessage', () => {
    it('should send message via WebSocket', async () => {
      const mockConversation = {
        id: 'sess_1',
        userId: 'usr_test',
        title: 'Test',
        createdAt: '2026-02-06T00:00:00.000Z',
        updatedAt: '2026-02-06T00:00:00.000Z',
        messages: [],
      };
      // Set the active conversation using the signal's set method
      (component['activeConversation$'] as { set: (value: unknown) => void }).set(mockConversation);

      fixture.detectChanges();
      await component.sendMessage('Hello');

      expect(mockChatWsService.sendMessage).toHaveBeenCalledWith('sess_1', 'Hello');
      expect(component.isLoading$()).toBe(true);
    });

    it('should not send empty message', async () => {
      const mockConversation = {
        id: 'sess_1',
        userId: 'usr_test',
        title: 'Test',
        createdAt: '2026-02-06T00:00:00.000Z',
        updatedAt: '2026-02-06T00:00:00.000Z',
        messages: [],
      };
      (component['activeConversation$'] as { set: (value: unknown) => void }).set(mockConversation);

      fixture.detectChanges();
      await component.sendMessage('   ');

      expect(mockChatWsService.sendMessage).not.toHaveBeenCalled();
    });

    it('should not send when no active conversation', async () => {
      fixture.detectChanges();
      await component.sendMessage('Hello');

      expect(mockChatWsService.sendMessage).not.toHaveBeenCalled();
    });
  });
});
