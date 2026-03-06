import {
  Component,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
  ViewEncapsulation,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { NoteItem } from '@mentor-ai/shared/types';

@Component({
  selector: 'app-pdf-reorder-dialog',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styles: [
    `
      .pdf-dialog-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }

      .pdf-dialog {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        width: 480px;
        max-width: 90vw;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      }

      .pdf-dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #2a2a2a;
      }
      .pdf-dialog-header h3 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        color: #fafafa;
      }
      .pdf-dialog-close {
        background: none;
        border: none;
        color: #9e9e9e;
        font-size: 18px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
      }
      .pdf-dialog-close:hover {
        color: #fafafa;
      }

      .pdf-dialog-body {
        flex: 1;
        overflow-y: auto;
        padding: 12px 20px;
      }

      .pdf-dialog-hint {
        font-size: 12px;
        color: #9e9e9e;
        margin-bottom: 12px;
      }

      .pdf-reorder-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .pdf-reorder-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: #242424;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        cursor: grab;
        user-select: none;
        transition:
          border-color 0.15s,
          background 0.15s;
      }
      .pdf-reorder-item:active {
        cursor: grabbing;
      }
      .pdf-reorder-item.dragging {
        opacity: 0.5;
        border-color: #3b82f6;
      }
      .pdf-reorder-item.drag-over {
        border-color: #3b82f6;
        background: #1e293b;
      }

      .pdf-item-handle {
        color: #666;
        font-size: 14px;
        flex-shrink: 0;
        cursor: grab;
      }

      .pdf-item-number {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #3b82f6;
        color: #fff;
        font-size: 11px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .pdf-item-title {
        flex: 1;
        font-size: 13px;
        color: #e0e0e0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .pdf-item-score {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 4px;
        flex-shrink: 0;
      }
      .pdf-item-score.score-high {
        color: #22c55e;
        background: rgba(34, 197, 94, 0.1);
      }
      .pdf-item-score.score-medium {
        color: #eab308;
        background: rgba(234, 179, 8, 0.1);
      }
      .pdf-item-score.score-low {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
      }

      .pdf-item-arrows {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex-shrink: 0;
      }
      .pdf-arrow-btn {
        background: none;
        border: 1px solid #2a2a2a;
        color: #9e9e9e;
        width: 22px;
        height: 18px;
        border-radius: 3px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        padding: 0;
      }
      .pdf-arrow-btn:hover:not(:disabled) {
        color: #fafafa;
        border-color: #3b82f6;
      }
      .pdf-arrow-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }

      .pdf-dialog-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px 20px;
        border-top: 1px solid #2a2a2a;
      }
      .pdf-btn-cancel {
        background: none;
        border: 1px solid #2a2a2a;
        color: #9e9e9e;
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 13px;
        cursor: pointer;
      }
      .pdf-btn-cancel:hover {
        border-color: #555;
        color: #fafafa;
      }
      .pdf-btn-export {
        background: #3b82f6;
        border: none;
        color: #fafafa;
        border-radius: 6px;
        padding: 8px 20px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .pdf-btn-export:hover {
        background: #2563eb;
      }
    `,
  ],
  template: `
    <div class="pdf-dialog-overlay" (click)="onOverlayClick($event)">
      <div class="pdf-dialog">
        <div class="pdf-dialog-header">
          <h3>Redosled izveštaja u PDF-u</h3>
          <button class="pdf-dialog-close" (click)="cancel.emit()">&times;</button>
        </div>
        <div class="pdf-dialog-body">
          <div class="pdf-dialog-hint">
            Prevucite stavke ili koristite strelice da promenite redosled
          </div>
          <div class="pdf-reorder-list">
            @for (note of orderedNotes(); track note.id; let i = $index) {
              <div
                class="pdf-reorder-item"
                [class.dragging]="dragIndex() === i"
                [class.drag-over]="dragOverIndex() === i"
                draggable="true"
                (dragstart)="onDragStart(i)"
                (dragover)="onDragOver($event, i)"
                (dragleave)="onDragLeave()"
                (drop)="onDrop(i)"
                (dragend)="onDragEnd()"
              >
                <span class="pdf-item-handle">&#x2630;</span>
                <span class="pdf-item-number">{{ i + 1 }}</span>
                <span class="pdf-item-title">{{ note.title }}</span>
                @if (note.aiScore != null) {
                  <span
                    class="pdf-item-score"
                    [class.score-high]="note.aiScore >= 80"
                    [class.score-medium]="note.aiScore >= 50 && note.aiScore < 80"
                    [class.score-low]="note.aiScore < 50"
                    >{{ note.aiScore }}/100</span
                  >
                }
                <div class="pdf-item-arrows">
                  <button
                    class="pdf-arrow-btn"
                    [disabled]="i === 0"
                    (click)="moveUp(i); $event.stopPropagation()"
                  >
                    &#9650;
                  </button>
                  <button
                    class="pdf-arrow-btn"
                    [disabled]="i === orderedNotes().length - 1"
                    (click)="moveDown(i); $event.stopPropagation()"
                  >
                    &#9660;
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
        <div class="pdf-dialog-footer">
          <button class="pdf-btn-cancel" (click)="cancel.emit()">Otkaži</button>
          <button class="pdf-btn-export" (click)="onExport()">Eksportuj PDF</button>
        </div>
      </div>
    </div>
  `,
})
export class PdfReorderDialogComponent implements OnInit {
  notes = input.required<NoteItem[]>();
  exportOrder = output<string[]>();
  cancel = output<void>();

  readonly orderedNotes = signal<NoteItem[]>([]);
  readonly dragIndex = signal<number | null>(null);
  readonly dragOverIndex = signal<number | null>(null);

  ngOnInit(): void {
    this.orderedNotes.set([...this.notes()]);
  }

  onDragStart(index: number): void {
    this.dragIndex.set(index);
  }

  onDragOver(event: DragEvent, index: number): void {
    event.preventDefault();
    this.dragOverIndex.set(index);
  }

  onDragLeave(): void {
    this.dragOverIndex.set(null);
  }

  onDrop(targetIndex: number): void {
    const sourceIndex = this.dragIndex();
    if (sourceIndex == null || sourceIndex === targetIndex) {
      this.dragIndex.set(null);
      this.dragOverIndex.set(null);
      return;
    }
    this.orderedNotes.update((list) => {
      const next = [...list];
      const removed = next.splice(sourceIndex, 1);
      if (removed.length > 0) {
        next.splice(targetIndex, 0, removed[0]!);
      }
      return next;
    });
    this.dragIndex.set(null);
    this.dragOverIndex.set(null);
  }

  onDragEnd(): void {
    this.dragIndex.set(null);
    this.dragOverIndex.set(null);
  }

  moveUp(index: number): void {
    if (index === 0) return;
    this.orderedNotes.update((list) => {
      const next = [...list];
      const temp = next[index]!;
      next[index] = next[index - 1]!;
      next[index - 1] = temp;
      return next;
    });
  }

  moveDown(index: number): void {
    const list = this.orderedNotes();
    if (index >= list.length - 1) return;
    this.orderedNotes.update((l) => {
      const next = [...l];
      const temp = next[index]!;
      next[index] = next[index + 1]!;
      next[index + 1] = temp;
      return next;
    });
  }

  onExport(): void {
    const ids = this.orderedNotes().map((n) => n.id);
    this.exportOrder.emit(ids);
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('pdf-dialog-overlay')) {
      this.cancel.emit();
    }
  }
}
