import { Component, input, output, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Chat input component with textarea and send button.
 * Supports Enter to send, Shift+Enter for newline.
 */
@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [
    `
      :host {
        display: block;
      }
      .input-wrapper {
        border-top: 1px solid #2a2a2a;
        padding: 16px;
        background: #0d0d0d;
      }
      .input-inner {
        max-width: 768px;
        margin: 0 auto;
      }
      .input-row {
        display: flex;
        align-items: flex-end;
        gap: 12px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 8px;
        transition: border-color 0.2s;
      }
      .input-row:focus-within {
        border-color: #3b82f6;
      }
      .textarea-wrap {
        flex: 1;
      }
      textarea {
        width: 100%;
        resize: none;
        background: transparent;
        border: none;
        outline: none;
        color: #fafafa;
        font-size: 15px;
        font-family: inherit;
        line-height: 1.5;
        padding: 6px 8px;
        max-height: 200px;
      }
      textarea::placeholder {
        color: #8b8b8b;
      }
      textarea:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .send-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        min-width: 40px;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: opacity 0.15s;
      }
      .send-btn:hover:not(:disabled) {
        opacity: 0.9;
      }
      .send-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .send-btn svg {
        width: 20px;
        height: 20px;
      }
      .hint {
        font-size: 11px;
        color: #8b8b8b;
        text-align: center;
        margin-top: 8px;
      }
      .hint kbd {
        display: inline-block;
        padding: 1px 6px;
        background: #242424;
        border-radius: 3px;
        font-size: 10px;
        font-family: monospace;
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
      .spin {
        animation: spin 1s linear infinite;
      }
    `,
  ],
  template: `
    <div class="input-wrapper">
      <div class="input-inner">
        <div class="input-row">
          <div class="textarea-wrap">
            <textarea
              #inputRef
              [(ngModel)]="inputValue"
              (keydown)="handleKeydown($event)"
              [disabled]="disabled()"
              placeholder="Pitajte Mentor AI bilo šta..."
              rows="1"
              (input)="autoResize()"
            ></textarea>
          </div>
          <button
            class="send-btn"
            (click)="send()"
            [disabled]="disabled() || !inputValue.trim()"
            title="Pošalji poruku"
          >
            @if (disabled()) {
              <svg class="spin" fill="none" viewBox="0 0 24 24">
                <circle
                  style="opacity: 0.25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                ></circle>
                <path
                  style="opacity: 0.75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            } @else {
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            }
          </button>
        </div>
        <p class="hint">
          Pritisnite <kbd>Enter</kbd> za slanje, <kbd>Shift+Enter</kbd> za novi red
        </p>
      </div>
    </div>
  `,
})
export class ChatInputComponent {
  readonly disabled = input(false);
  readonly messageSent = output<string>();

  @ViewChild('inputRef') inputRef!: ElementRef<HTMLTextAreaElement>;

  inputValue = '';

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  send(): void {
    const value = this.inputValue.trim();
    if (!value || this.disabled()) return;

    this.messageSent.emit(value);
    this.inputValue = '';

    // Reset textarea height
    if (this.inputRef?.nativeElement) {
      this.inputRef.nativeElement.style.height = 'auto';
    }
  }

  autoResize(): void {
    const textarea = this.inputRef?.nativeElement;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }
}
