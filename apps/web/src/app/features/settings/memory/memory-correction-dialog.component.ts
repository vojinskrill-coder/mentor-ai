import {
  Component,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Memory, MemoryType } from '@mentor-ai/shared/types';
import { MEMORY_TYPE_COLORS, MEMORY_TYPE_LABELS } from '@mentor-ai/shared/types';

/**
 * Result of memory correction dialog.
 */
export interface MemoryCorrectionResult {
  memoryId: string;
  newContent: string;
}

/**
 * Dialog component for correcting/updating memory content.
 * Displays original content and allows user to provide corrected version.
 *
 * @example
 * ```html
 * <app-memory-correction-dialog
 *   [memory]="selectedMemory"
 *   [isOpen]="showCorrectionDialog"
 *   (save)="onSaveCorrection($event)"
 *   (cancel)="closeCorrectionDialog()"
 * />
 * ```
 *
 * Story 2.7: Persistent Memory Across Conversations
 */
@Component({
  selector: 'app-memory-correction-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen()) {
      <div
        class="dialog-backdrop"
        role="presentation"
        (click)="onBackdropClick()"
      ></div>

      <div
        class="dialog-container"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'Correct memory about ' + (memory()?.subject ?? 'this topic')"
      >
        <div class="dialog-header">
          <h2 class="dialog-title">Correct Memory</h2>
          <button
            type="button"
            class="close-button"
            aria-label="Close dialog"
            (click)="onCancel()"
          >
            ✕
          </button>
        </div>

        <div class="dialog-content">
          @if (memory()) {
            <div class="memory-info">
              <span
                class="type-badge"
                [style.background-color]="getTypeColor(memory()!.type) + '20'"
                [style.color]="getTypeColor(memory()!.type)"
              >
                {{ getTypeLabel(memory()!.type) }}
              </span>
              @if (memory()!.subject) {
                <span class="subject">{{ memory()!.subject }}</span>
              }
            </div>

            <div class="form-group">
              <label for="original-content" class="form-label">
                Original Content
              </label>
              <div id="original-content" class="original-content">
                {{ memory()!.content }}
              </div>
            </div>

            <div class="form-group">
              <label for="corrected-content" class="form-label">
                Corrected Content
                <span class="required">*</span>
              </label>
              <textarea
                id="corrected-content"
                class="form-textarea"
                rows="4"
                placeholder="Enter the corrected information..."
                [(ngModel)]="correctedContent"
                [attr.aria-invalid]="hasError$()"
              ></textarea>
              @if (hasError$()) {
                <p class="error-text" role="alert">
                  Please provide the corrected content
                </p>
              }
            </div>

            <p class="info-text">
              Your correction will replace the AI-extracted memory with your
              updated information.
            </p>
          }
        </div>

        <div class="dialog-footer">
          <button
            type="button"
            class="btn btn-secondary"
            (click)="onCancel()"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="isSaving$() || !correctedContent.trim()"
            (click)="onSave()"
          >
            @if (isSaving$()) {
              <span class="spinner" aria-hidden="true"></span>
              Saving...
            } @else {
              Save Correction
            }
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.75);
      z-index: 1000;
    }

    .dialog-container {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 90%;
      max-width: 500px;
      max-height: 90vh;
      background-color: #1a1a1a;
      border: 1px solid #333;
      border-radius: 0.75rem;
      z-index: 1001;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #333;
    }

    .dialog-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #e5e5e5;
      margin: 0;
    }

    .close-button {
      width: 2rem;
      height: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: #737373;
      cursor: pointer;
      border-radius: 0.25rem;
      font-size: 1rem;
      transition: all 0.15s ease;
    }

    .close-button:hover {
      background-color: #262626;
      color: #e5e5e5;
    }

    .close-button:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px #3b82f6;
    }

    .dialog-content {
      padding: 1.5rem;
      overflow-y: auto;
      flex: 1;
    }

    .memory-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .type-badge {
      display: inline-flex;
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 500;
      border-radius: 0.25rem;
      text-transform: uppercase;
    }

    .subject {
      font-weight: 600;
      color: #e5e5e5;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: #a3a3a3;
      margin-bottom: 0.5rem;
    }

    .required {
      color: #ef4444;
    }

    .original-content {
      padding: 0.75rem;
      background-color: #0d0d0d;
      border: 1px solid #262626;
      border-radius: 0.375rem;
      color: #737373;
      font-size: 0.875rem;
      line-height: 1.5;
    }

    .form-textarea {
      width: 100%;
      padding: 0.75rem;
      background-color: #0d0d0d;
      border: 1px solid #333;
      border-radius: 0.375rem;
      color: #e5e5e5;
      font-size: 0.875rem;
      line-height: 1.5;
      resize: vertical;
      font-family: inherit;
    }

    .form-textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 1px #3b82f6;
    }

    .form-textarea[aria-invalid="true"] {
      border-color: #ef4444;
    }

    .error-text {
      margin: 0.5rem 0 0;
      font-size: 0.75rem;
      color: #ef4444;
    }

    .info-text {
      margin: 0;
      font-size: 0.75rem;
      color: #737373;
      font-style: italic;
    }

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      border-top: 1px solid #333;
    }

    .btn {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background-color: transparent;
      border: 1px solid #333;
      color: #a3a3a3;
    }

    .btn-secondary:hover:not(:disabled) {
      background-color: #262626;
      color: #e5e5e5;
    }

    .btn-primary {
      background-color: #3b82f6;
      border: 1px solid #3b82f6;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background-color: #2563eb;
      border-color: #2563eb;
    }

    .btn:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px #3b82f6;
    }

    .spinner {
      width: 1rem;
      height: 1rem;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
})
export class MemoryCorrectionDialogComponent {
  /** Memory to correct */
  memory = input<Memory | null>(null);

  /** Whether the dialog is open */
  isOpen = input<boolean>(false);

  /** Emitted when correction is saved */
  save = output<MemoryCorrectionResult>();

  /** Emitted when dialog is cancelled/closed */
  cancel = output<void>();

  /** Corrected content entered by user */
  correctedContent = '';

  /** Whether form has validation error */
  hasError$ = signal(false);

  /** Whether save is in progress */
  isSaving$ = signal(false);

  ngOnChanges(): void {
    // Reset form when memory changes
    const mem = this.memory();
    if (mem) {
      this.correctedContent = mem.content;
      this.hasError$.set(false);
    }
  }

  /**
   * Gets color for memory type.
   */
  getTypeColor(type: MemoryType): string {
    return MEMORY_TYPE_COLORS[type] ?? '#6b7280';
  }

  /**
   * Gets label for memory type.
   */
  getTypeLabel(type: MemoryType): string {
    return MEMORY_TYPE_LABELS[type] ?? 'Note';
  }

  /**
   * Handles backdrop click - closes dialog.
   */
  onBackdropClick(): void {
    this.onCancel();
  }

  /**
   * Handles cancel action.
   */
  onCancel(): void {
    this.correctedContent = '';
    this.hasError$.set(false);
    this.cancel.emit();
  }

  /**
   * Handles save action.
   */
  onSave(): void {
    const content = this.correctedContent.trim();
    const mem = this.memory();

    if (!content) {
      this.hasError$.set(true);
      return;
    }

    if (!mem) {
      return;
    }

    this.isSaving$.set(true);
    this.hasError$.set(false);

    // Emit save event
    this.save.emit({
      memoryId: mem.id,
      newContent: content,
    });

    // Reset state (parent should close dialog on success)
    this.isSaving$.set(false);
  }
}
