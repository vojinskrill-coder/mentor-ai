import { Component, input, output, signal, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AttachmentService } from '../services/attachment.service';
import type { AttachmentItem } from '@mentor-ai/shared/types';

export interface ChatMessagePayload {
  content: string;
  attachmentIds: string[];
}

/**
 * Chat input component with textarea, send button, and file attachment.
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
      .file-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
      }
      .file-chip {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        font-size: 12px;
        color: #e0e0e0;
      }
      .file-chip-uploading {
        animation: pulse 1.5s ease-in-out infinite;
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }
      .file-chip-icon {
        font-size: 14px;
        flex-shrink: 0;
      }
      .file-chip-name {
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .file-chip-size {
        color: #9e9e9e;
        font-size: 11px;
        flex-shrink: 0;
      }
      .file-chip-remove {
        background: none;
        border: none;
        color: #9e9e9e;
        cursor: pointer;
        font-size: 14px;
        padding: 0 2px;
        line-height: 1;
      }
      .file-chip-remove:hover {
        color: #ef4444;
      }
      .input-row {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 8px;
        transition: border-color 0.2s;
      }
      .input-row:focus-within {
        border-color: #3b82f6;
      }
      .attach-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        min-width: 36px;
        background: none;
        border: none;
        color: #9e9e9e;
        cursor: pointer;
        border-radius: 6px;
        transition:
          color 0.15s,
          background 0.15s;
      }
      .attach-btn:hover {
        color: #fafafa;
        background: rgba(255, 255, 255, 0.06);
      }
      .attach-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .attach-btn svg {
        width: 20px;
        height: 20px;
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
        color: #9e9e9e;
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
        color: #9e9e9e;
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
        @if (attachedFiles().length > 0) {
          <div class="file-chips">
            @for (file of attachedFiles(); track file.name; let i = $index) {
              <div class="file-chip" [class.file-chip-uploading]="!uploadedIds()[i]">
                <span class="file-chip-icon">{{ getFileIcon(file.type) }}</span>
                <span class="file-chip-name">{{ file.name }}</span>
                <span class="file-chip-size">{{ formatSize(file.size) }}</span>
                <button class="file-chip-remove" (click)="removeFile(i)" title="Ukloni">
                  &#x2715;
                </button>
              </div>
            }
          </div>
        }
        <div class="input-row">
          <button
            class="attach-btn"
            (click)="fileInput.click()"
            [disabled]="disabled() || isUploading()"
            title="Priloži fajl"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
          </button>
          <input
            #fileInput
            type="file"
            [accept]="acceptedTypes"
            (change)="onFileSelected($event)"
            multiple
            style="display: none"
          />
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
            [disabled]="disabled() || isUploading() || !canSend()"
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
  readonly messageSent = output<ChatMessagePayload>();

  @ViewChild('inputRef') inputRef!: ElementRef<HTMLTextAreaElement>;

  private attachmentService = inject(AttachmentService);

  inputValue = '';
  readonly attachedFiles = signal<File[]>([]);
  readonly uploadedIds = signal<(string | null)[]>([]);
  readonly isUploading = signal(false);

  readonly acceptedTypes = [
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
  ].join(',');

  canSend(): boolean {
    return this.inputValue.trim().length > 0 || this.attachedFiles().length > 0;
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  send(): void {
    const value = this.inputValue.trim();
    if ((!value && this.attachedFiles().length === 0) || this.disabled() || this.isUploading())
      return;

    const attachmentIds = this.uploadedIds().filter((id): id is string => id !== null);

    this.messageSent.emit({
      content: value || '(fajl priložen)',
      attachmentIds,
    });

    this.inputValue = '';
    this.attachedFiles.set([]);
    this.uploadedIds.set([]);

    if (this.inputRef?.nativeElement) {
      this.inputRef.nativeElement.style.height = 'auto';
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const files = Array.from(input.files);
    const currentCount = this.attachedFiles().length;
    const maxFiles = 5;

    if (currentCount + files.length > maxFiles) {
      files.splice(maxFiles - currentCount);
    }

    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) continue;

      const idx = this.attachedFiles().length;
      this.attachedFiles.update((f) => [...f, file]);
      this.uploadedIds.update((ids) => [...ids, null]);

      this.isUploading.set(true);
      this.attachmentService.upload(file).subscribe({
        next: (result: AttachmentItem) => {
          this.uploadedIds.update((ids) => {
            const updated = [...ids];
            updated[idx] = result.id;
            return updated;
          });
          if (this.uploadedIds().every((id) => id !== null)) {
            this.isUploading.set(false);
          }
        },
        error: () => {
          this.removeFile(idx);
          if (this.uploadedIds().every((id) => id !== null) || this.attachedFiles().length === 0) {
            this.isUploading.set(false);
          }
        },
      });
    }

    input.value = '';
  }

  removeFile(index: number): void {
    this.attachedFiles.update((files) => files.filter((_, i) => i !== index));
    this.uploadedIds.update((ids) => ids.filter((_, i) => i !== index));
    if (this.attachedFiles().length === 0) {
      this.isUploading.set(false);
    }
  }

  getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return '\u{1F5BC}';
    if (mimeType === 'application/pdf') return '\u{1F4C4}';
    if (mimeType.includes('spreadsheet') || mimeType === 'text/csv') return '\u{1F4CA}';
    if (mimeType.includes('wordprocessing')) return '\u{1F4DD}';
    return '\u{1F4CE}';
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  autoResize(): void {
    const textarea = this.inputRef?.nativeElement;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }
}
