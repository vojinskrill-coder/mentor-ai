import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiscoveryChatComponent } from './discovery-chat.component';
import { ChatWebsocketService } from '../services/chat-websocket.service';

describe('DiscoveryChatComponent', () => {
  let component: DiscoveryChatComponent;
  let fixture: ComponentFixture<DiscoveryChatComponent>;
  let mockChatWsService: {
    onDiscoveryChunk: ReturnType<typeof vi.fn>;
    onDiscoveryComplete: ReturnType<typeof vi.fn>;
    onDiscoveryError: ReturnType<typeof vi.fn>;
    emitDiscoveryMessage: ReturnType<typeof vi.fn>;
  };

  let capturedChunkCb: ((data: { chunk: string }) => void) | undefined;
  let capturedCompleteCb: ((data: { fullContent: string }) => void) | undefined;
  let capturedErrorCb: ((data: unknown) => void) | undefined;

  beforeEach(async () => {
    capturedChunkCb = undefined;
    capturedCompleteCb = undefined;
    capturedErrorCb = undefined;

    const unsubFn = vi.fn();

    mockChatWsService = {
      onDiscoveryChunk: vi.fn().mockImplementation((cb) => {
        capturedChunkCb = cb;
        return unsubFn;
      }),
      onDiscoveryComplete: vi.fn().mockImplementation((cb) => {
        capturedCompleteCb = cb;
        return unsubFn;
      }),
      onDiscoveryError: vi.fn().mockImplementation((cb) => {
        capturedErrorCb = cb;
        return unsubFn;
      }),
      emitDiscoveryMessage: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DiscoveryChatComponent],
      providers: [{ provide: ChatWebsocketService, useValue: mockChatWsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(DiscoveryChatComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize as collapsed', () => {
    expect(component.isExpanded$()).toBe(false);
  });

  it('should start with empty messages', () => {
    expect(component.messages$()).toHaveLength(0);
  });

  it('should not be streaming initially', () => {
    expect(component.isStreaming$()).toBe(false);
  });

  describe('ngOnInit', () => {
    it('should register WebSocket callbacks', () => {
      fixture.detectChanges();

      expect(mockChatWsService.onDiscoveryChunk).toHaveBeenCalled();
      expect(mockChatWsService.onDiscoveryComplete).toHaveBeenCalled();
      expect(mockChatWsService.onDiscoveryError).toHaveBeenCalled();
    });
  });

  describe('toggleExpanded', () => {
    it('should toggle expanded state', () => {
      expect(component.isExpanded$()).toBe(false);

      component.toggleExpanded();
      expect(component.isExpanded$()).toBe(true);

      component.toggleExpanded();
      expect(component.isExpanded$()).toBe(false);
    });
  });

  describe('canSend$', () => {
    it('should be false when input is empty', () => {
      component.inputValue$.set('');
      expect(component.canSend$()).toBe(false);
    });

    it('should be false when input is whitespace only', () => {
      component.inputValue$.set('   ');
      expect(component.canSend$()).toBe(false);
    });

    it('should be true when input has content and not streaming', () => {
      component.inputValue$.set('Hello');
      expect(component.canSend$()).toBe(true);
    });

    it('should be false when streaming even with content', () => {
      component.inputValue$.set('Hello');
      component.isStreaming$.set(true);
      expect(component.canSend$()).toBe(false);
    });
  });

  describe('onInput', () => {
    it('should update input value from event', () => {
      const event = {
        target: { value: 'test input' },
      } as unknown as Event;

      component.onInput(event);

      expect(component.inputValue$()).toBe('test input');
    });
  });

  describe('onEnterKey', () => {
    it('should send message on Enter without Shift', () => {
      component.inputValue$.set('Hello');
      const sendSpy = vi.spyOn(component, 'sendMessage');
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      vi.spyOn(event, 'preventDefault');

      component.onEnterKey(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(sendSpy).toHaveBeenCalled();
    });

    it('should not send message on Shift+Enter', () => {
      const sendSpy = vi.spyOn(component, 'sendMessage');
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
      });

      component.onEnterKey(event);

      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should add user message and empty assistant placeholder', () => {
      component.inputValue$.set('Test question');

      component.sendMessage();

      const msgs = component.messages$();
      expect(msgs).toHaveLength(2);
      expect(msgs[0]).toEqual({
        role: 'user',
        content: 'Test question',
      });
      expect(msgs[1]).toEqual({
        role: 'assistant',
        content: '',
        html: '',
      });
    });

    it('should clear input and set streaming', () => {
      component.inputValue$.set('Test question');

      component.sendMessage();

      expect(component.inputValue$()).toBe('');
      expect(component.isStreaming$()).toBe(true);
    });

    it('should emit discovery message to WebSocket', () => {
      component.inputValue$.set('Test question');

      component.sendMessage();

      expect(mockChatWsService.emitDiscoveryMessage).toHaveBeenCalledWith('Test question');
    });

    it('should not send empty message', () => {
      component.inputValue$.set('');

      component.sendMessage();

      expect(component.messages$()).toHaveLength(0);
      expect(mockChatWsService.emitDiscoveryMessage).not.toHaveBeenCalled();
    });

    it('should not send whitespace-only message', () => {
      component.inputValue$.set('   ');

      component.sendMessage();

      expect(mockChatWsService.emitDiscoveryMessage).not.toHaveBeenCalled();
    });
  });

  describe('streaming callbacks', () => {
    beforeEach(() => {
      fixture.detectChanges();
      component.inputValue$.set('Question');
      component.sendMessage();
    });

    it('should update assistant message on chunk', () => {
      capturedChunkCb?.({ chunk: 'Hello ' });
      capturedChunkCb?.({ chunk: 'world' });

      const msgs = component.messages$();
      const lastMsg = msgs[msgs.length - 1];
      expect(lastMsg!.content).toContain('Hello world');
    });

    it('should finalize message on complete', () => {
      capturedCompleteCb?.({ fullContent: 'Complete response' });

      expect(component.isStreaming$()).toBe(false);
      const msgs = component.messages$();
      const lastMsg = msgs[msgs.length - 1];
      expect(lastMsg!.content).toBe('Complete response');
    });

    it('should show error message on error', () => {
      capturedErrorCb?.({ message: 'Something went wrong' });

      expect(component.isStreaming$()).toBe(false);
      const msgs = component.messages$();
      const lastMsg = msgs[msgs.length - 1];
      expect(lastMsg!.content).toContain('Greška');
    });
  });

  describe('ngOnDestroy', () => {
    it('should not throw when destroyed before init', () => {
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });
});
