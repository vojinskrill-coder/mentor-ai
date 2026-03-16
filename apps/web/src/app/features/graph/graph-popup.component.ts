import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GraphViewComponent } from './graph-view.component';

@Component({
  selector: 'app-graph-popup',
  standalone: true,
  imports: [CommonModule, GraphViewComponent],
  styles: [`
    .backdrop {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(0, 0, 0, 0.7);
      display: flex; align-items: center; justify-content: center;
      animation: fadeIn 0.15s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .popup {
      width: 70vw; height: 70vh;
      background: #0D0D0D;
      border: 1px solid #2A2A2A;
      border-radius: 12px;
      overflow: hidden;
      position: relative;
      animation: scaleIn 0.2s ease;
    }
    @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }

    .close-btn {
      position: absolute; top: 12px; right: 12px; z-index: 10;
      width: 32px; height: 32px; border-radius: 8px;
      background: #1A1A1A; border: 1px solid #2A2A2A; color: #FAFAFA;
      font-size: 16px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
    }
    .close-btn:hover { background: #EF4444; border-color: #EF4444; }

    .title {
      position: absolute; top: 12px; left: 16px; z-index: 10;
      font-size: 14px; font-weight: 600; color: #FAFAFA;
      pointer-events: none;
    }
  `],
  template: `
    <div class="backdrop" (click)="onBackdropClick($event)">
      <div class="popup" (click)="$event.stopPropagation()">
        <span class="title">Knowledge Graph</span>
        <button class="close-btn" (click)="closed.emit()" title="Zatvori (Esc)">✕</button>
        <app-graph-view
          [embedded]="false"
          (noteActivated)="noteActivated.emit($event)">
        </app-graph-view>
      </div>
    </div>
  `,
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
})
export class GraphPopupComponent {
  @Output() closed = new EventEmitter<void>();
  @Output() noteActivated = new EventEmitter<{ noteId: string; conceptId: string }>();

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('backdrop')) {
      this.closed.emit();
    }
  }
}
