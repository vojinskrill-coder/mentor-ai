import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { marked, type Tokens } from 'marked';
import { ChatWebsocketService } from '../services/chat-websocket.service';

// Configure marked for discovery chat rendering
const discoveryRenderer = new marked.Renderer();
const originalLink = discoveryRenderer.link.bind(discoveryRenderer);
discoveryRenderer.link = (token: Tokens.Link) => {
  const html = originalLink(token);
  return html.replace('<a ', '<a target="_blank" rel="noopener noreferrer" ');
};
marked.use({ renderer: discoveryRenderer, gfm: true, breaks: true });

interface DiscoveryMessage {
  role: 'user' | 'assistant';
  content: string;
  html?: string;
}

@Component({
  selector: 'app-discovery-chat',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      :host {
        display: block;
      }
      .discovery-container {
        border-top: 1px solid #2a2a2a;
        display: flex;
        flex-direction: column;
        background: #0d0d0d;
      }
      .discovery-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        cursor: pointer;
        user-select: none;
      }
      .discovery-header:hover {
        background: #1a1a1a;
      }
      .header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .header-icon {
        width: 16px;
        height: 16px;
        color: #3b82f6;
        flex-shrink: 0;
      }
      .header-title {
        font-size: 12px;
        font-weight: 600;
        color: #a1a1a1;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .toggle-icon {
        width: 14px;
        height: 14px;
        color: #8b8b8b;
        transition: transform 0.2s;
        flex-shrink: 0;
      }
      .toggle-icon.expanded {
        transform: rotate(180deg);
      }
      .discovery-body {
        display: flex;
        flex-direction: column;
        max-height: 40vh;
      }
      .discovery-messages {
        flex: 1;
        overflow-y: auto;
        padding: 8px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 60px;
      }
      .discovery-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 60px;
        font-size: 11px;
        color: #707070;
      }
      .dmsg-user {
        align-self: flex-end;
        background: #3b82f6;
        color: #ffffff;
        padding: 6px 10px;
        border-radius: 10px 10px 2px 10px;
        font-size: 12px;
        line-height: 1.5;
        max-width: 90%;
        word-break: break-word;
        white-space: pre-wrap;
      }
      .dmsg-assistant {
        align-self: flex-start;
        background: #1a1a1a;
        border: 1px solid #242424;
        color: #fafafa;
        padding: 6px 10px;
        border-radius: 10px 10px 10px 2px;
        font-size: 12px;
        line-height: 1.5;
        max-width: 95%;
        word-break: break-word;
      }
      .dmsg-assistant :first-child {
        margin-top: 0;
      }
      .dmsg-assistant :last-child {
        margin-bottom: 0;
      }
      :host ::ng-deep .dmsg-assistant p {
        margin: 4px 0;
      }
      :host ::ng-deep .dmsg-assistant a {
        color: #60a5fa;
        text-decoration: underline;
      }
      :host ::ng-deep .dmsg-assistant a:hover {
        color: #93c5fd;
      }
      :host ::ng-deep .dmsg-assistant ul,
      :host ::ng-deep .dmsg-assistant ol {
        margin: 4px 0;
        padding-left: 16px;
      }
      :host ::ng-deep .dmsg-assistant li {
        margin: 2px 0;
      }
      :host ::ng-deep .dmsg-assistant strong {
        color: #fafafa;
      }
      :host ::ng-deep .dmsg-assistant h3 {
        font-size: 12px;
        font-weight: 600;
        margin: 6px 0 2px;
        color: #fafafa;
      }
      :host ::ng-deep .dmsg-assistant code {
        background: #242424;
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 11px;
      }
      .dmsg-streaming {
        border-color: #3b82f6;
      }
      .discovery-input-area {
        display: flex;
        gap: 6px;
        padding: 8px 12px;
        border-top: 1px solid #242424;
        background: #0d0d0d;
      }
      .discovery-input {
        flex: 1;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        color: #fafafa;
        font-size: 12px;
        font-family: inherit;
        padding: 6px 10px;
        resize: none;
        min-height: 32px;
        max-height: 80px;
        overflow-y: auto;
      }
      .discovery-input:focus {
        outline: none;
        border-color: #3b82f6;
      }
      .discovery-input::placeholder {
        color: #707070;
      }
      .discovery-send-btn {
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 6px;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;
        align-self: flex-end;
      }
      .discovery-send-btn:hover {
        background: #2563eb;
      }
      .discovery-send-btn:disabled {
        background: #242424;
        color: #707070;
        cursor: not-allowed;
      }
      .discovery-send-btn svg {
        width: 14px;
        height: 14px;
      }
      @keyframes pulse-dot {
        0%,
        100% {
          opacity: 0.4;
        }
        50% {
          opacity: 1;
        }
      }
      .streaming-dots {
        display: inline-flex;
        gap: 3px;
        padding: 4px 0;
      }
      .streaming-dots span {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: #3b82f6;
        animation: pulse-dot 1.2s ease-in-out infinite;
      }
      .streaming-dots span:nth-child(2) {
        animation-delay: 0.2s;
      }
      .streaming-dots span:nth-child(3) {
        animation-delay: 0.4s;
      }
    `,
  ],
  template: `
    <div class="discovery-container">
      <div class="discovery-header" (click)="toggleExpanded()">
        <div class="header-left">
          <svg class="header-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <span class="header-title">Discovery Chat</span>
        </div>
        <svg
          class="toggle-icon"
          [class.expanded]="isExpanded$()"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
        </svg>
      </div>

      @if (isExpanded$()) {
        <div class="discovery-body">
          <div class="discovery-messages" #messagesArea>
            @if (messages$().length === 0 && !isStreaming$()) {
              <div class="discovery-empty">Postavi pitanje za brzo istraživanje...</div>
            }
            @for (msg of messages$(); track $index) {
              @if (msg.role === 'user') {
                <div class="dmsg-user">{{ msg.content }}</div>
              } @else {
                <div
                  class="dmsg-assistant"
                  [class.dmsg-streaming]="$index === messages$().length - 1 && isStreaming$()"
                  [innerHTML]="msg.html ?? msg.content"
                ></div>
              }
            }
            @if (isStreaming$() && !streamingContent$()) {
              <div class="dmsg-assistant">
                <div class="streaming-dots"><span></span><span></span><span></span></div>
              </div>
            }
          </div>
          <div class="discovery-input-area">
            <textarea
              class="discovery-input"
              [value]="inputValue$()"
              (input)="onInput($event)"
              (keydown.enter)="onEnterKey($event)"
              placeholder="Pitaj nešto..."
              rows="1"
            ></textarea>
            <button class="discovery-send-btn" (click)="sendMessage()" [disabled]="!canSend$()">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 19V5m0 0l-7 7m7-7l7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class DiscoveryChatComponent implements OnInit, OnDestroy {
  private readonly chatWsService = inject(ChatWebsocketService);

  @ViewChild('messagesArea') messagesArea?: ElementRef<HTMLDivElement>;

  readonly isExpanded$ = signal(false);
  readonly messages$ = signal<DiscoveryMessage[]>([]);
  readonly isStreaming$ = signal(false);
  readonly streamingContent$ = signal('');
  readonly inputValue$ = signal('');
  readonly canSend$ = computed(() => !this.isStreaming$() && this.inputValue$().trim().length > 0);

  private unsubChunk?: () => void;
  private unsubComplete?: () => void;
  private unsubError?: () => void;

  ngOnInit(): void {
    this.unsubChunk = this.chatWsService.onDiscoveryChunk((data) => {
      this.streamingContent$.update((prev) => prev + data.chunk);
      // Update the last assistant message with streaming content
      this.messages$.update((msgs) => {
        const updated = [...msgs];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: this.streamingContent$(),
            html: marked.parse(this.streamingContent$(), { async: false }) as string,
          };
        }
        return updated;
      });
      this.scrollToBottom();
    });

    this.unsubComplete = this.chatWsService.onDiscoveryComplete((data) => {
      this.isStreaming$.set(false);
      this.streamingContent$.set('');
      // Final update with full content
      this.messages$.update((msgs) => {
        const updated = [...msgs];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: data.fullContent,
            html: marked.parse(data.fullContent, { async: false }) as string,
          };
        }
        return updated;
      });
      this.scrollToBottom();
    });

    this.unsubError = this.chatWsService.onDiscoveryError((_data) => {
      this.isStreaming$.set(false);
      this.streamingContent$.set('');
      this.messages$.update((msgs) => [
        ...msgs,
        {
          role: 'assistant' as const,
          content: 'Greška pri obradi. Pokušajte ponovo.',
          html: '<p style="color:#EF4444;">Greška pri obradi. Pokušajte ponovo.</p>',
        },
      ]);
    });
  }

  ngOnDestroy(): void {
    this.unsubChunk?.();
    this.unsubComplete?.();
    this.unsubError?.();
  }

  toggleExpanded(): void {
    this.isExpanded$.update((v) => !v);
    if (this.isExpanded$()) {
      setTimeout(() => this.scrollToBottom(), 50);
    }
  }

  onInput(event: Event): void {
    this.inputValue$.set((event.target as HTMLTextAreaElement).value);
  }

  onEnterKey(event: Event): void {
    const kev = event as KeyboardEvent;
    if (kev.shiftKey) return; // allow newlines with shift+enter
    kev.preventDefault();
    this.sendMessage();
  }

  sendMessage(): void {
    const content = this.inputValue$().trim();
    if (!content || !this.canSend$()) return;

    // Add user message
    this.messages$.update((msgs) => [...msgs, { role: 'user' as const, content }]);
    this.inputValue$.set('');
    this.isStreaming$.set(true);
    this.streamingContent$.set('');

    // Add empty assistant message placeholder
    this.messages$.update((msgs) => [
      ...msgs,
      { role: 'assistant' as const, content: '', html: '' },
    ]);

    // Emit to backend
    this.chatWsService.emitDiscoveryMessage(content);
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.messagesArea?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 30);
  }
}
