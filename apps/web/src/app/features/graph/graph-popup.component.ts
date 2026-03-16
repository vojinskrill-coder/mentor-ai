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
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(12px);
      display: flex; align-items: center; justify-content: center;
      animation: fadeIn 0.25s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .popup {
      width: 75vw; height: 75vh;
      background: #06080C;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 16px;
      overflow: hidden;
      position: relative;
      box-shadow: 0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03);
      animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes scaleIn { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }

    .close-btn {
      position: absolute; top: 14px; right: 14px; z-index: 10;
      width: 30px; height: 30px; border-radius: 10px;
      background: rgba(15,17,23,0.8); border: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.4);
      font-size: 14px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(8px); transition: all 0.2s;
    }
    .close-btn:hover { background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.3); color: #F87171; }

    .title {
      position: absolute; top: 16px; left: 20px; z-index: 10;
      font: 500 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif;
      color: rgba(255,255,255,0.5);
      letter-spacing: 0.02em;
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
