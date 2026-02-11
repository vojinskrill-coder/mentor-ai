import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageComponent } from './chat-message.component';
import { MessageRole, type Message } from '@mentor-ai/shared/types';

describe('ChatMessageComponent', () => {
  let component: ChatMessageComponent;
  let fixture: ComponentFixture<ChatMessageComponent>;

  const mockUserMessage: Message = {
    id: 'msg_user1',
    conversationId: 'sess_1',
    role: MessageRole.USER,
    content: 'Hello, how are you?',
    createdAt: '2026-02-06T10:30:00.000Z',
    confidenceScore: null,
    confidenceFactors: null,
  };

  const mockAssistantMessage: Message = {
    id: 'msg_ai1',
    conversationId: 'sess_1',
    role: MessageRole.ASSISTANT,
    content: 'I am doing great, thank you for asking!',
    createdAt: '2026-02-06T10:30:05.000Z',
    confidenceScore: null,
    confidenceFactors: null,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatMessageComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatMessageComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.componentRef.setInput('message', mockUserMessage);
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  describe('user message', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('message', mockUserMessage);
      fixture.detectChanges();
    });

    it('should display user message content', () => {
      const messageEl = fixture.nativeElement.querySelector('.text-sm');
      expect(messageEl.textContent).toContain('Hello, how are you?');
    });

    it('should apply user message styling (right-aligned)', () => {
      const container = fixture.nativeElement.querySelector('.flex');
      expect(container.classList.contains('justify-end')).toBe(true);
    });
  });

  describe('assistant message', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('message', mockAssistantMessage);
      fixture.detectChanges();
    });

    it('should display assistant message content', () => {
      const messageEl = fixture.nativeElement.querySelector('.whitespace-pre-wrap');
      expect(messageEl.textContent).toContain(
        'I am doing great, thank you for asking!'
      );
    });

    it('should apply assistant message styling (left-aligned)', () => {
      const container = fixture.nativeElement.querySelector('.flex');
      expect(container.classList.contains('justify-start')).toBe(true);
    });

    it('should display AI avatar', () => {
      const avatar = fixture.nativeElement.querySelector('.rounded-full');
      expect(avatar).toBeTruthy();
      expect(avatar.textContent).toContain('AI');
    });
  });

  describe('streaming state', () => {
    it('should show cursor when streaming', () => {
      fixture.componentRef.setInput('message', mockAssistantMessage);
      fixture.componentRef.setInput('isStreaming', true);
      fixture.detectChanges();

      const cursor = fixture.nativeElement.querySelector('.animate-pulse');
      expect(cursor).toBeTruthy();
    });

    it('should not show cursor when not streaming', () => {
      fixture.componentRef.setInput('message', mockAssistantMessage);
      fixture.componentRef.setInput('isStreaming', false);
      fixture.detectChanges();

      const cursor = fixture.nativeElement.querySelector('.animate-pulse');
      expect(cursor).toBeFalsy();
    });
  });

  describe('formatTime', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('message', mockUserMessage);
      fixture.detectChanges();
    });

    it('should format timestamp correctly', () => {
      const result = component.formatTime('2026-02-06T10:30:00.000Z');
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });

    it('should return empty string for empty input', () => {
      const result = component.formatTime('');
      expect(result).toBe('');
    });
  });
});
