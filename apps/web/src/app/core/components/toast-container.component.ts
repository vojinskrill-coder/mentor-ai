import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      .toast-stack {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      }
      .toast {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        font-family: 'Inter', system-ui, sans-serif;
        color: var(--color-text-primary, #fafafa);
        background: var(--color-bg-elevated, #242424);
        border: 1px solid var(--color-border-subtle, #2a2a2a);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        pointer-events: auto;
        min-width: 260px;
        max-width: 400px;
        animation: toast-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      .toast-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }
      .toast.success .toast-icon { color: var(--color-success, #22c55e); }
      .toast.error .toast-icon { color: var(--color-error, #ef4444); }
      .toast.info .toast-icon { color: var(--color-info, #3b82f6); }
      .toast-msg {
        flex: 1;
        line-height: 1.4;
      }
      .toast-close {
        background: none;
        border: none;
        color: var(--color-text-muted, #9e9e9e);
        cursor: pointer;
        padding: 2px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .toast-close:hover {
        color: var(--color-text-primary, #fafafa);
        background: rgba(255, 255, 255, 0.05);
      }
      .toast-close svg {
        width: 14px;
        height: 14px;
      }
    `,
  ],
  template: `
    <div class="toast-stack">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast" [class]="toast.type">
          @if (toast.type === 'success') {
            <svg class="toast-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
          } @else if (toast.type === 'error') {
            <svg class="toast-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          } @else {
            <svg class="toast-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          }
          <span class="toast-msg">{{ toast.message }}</span>
          <button class="toast-close" (click)="toastService.dismiss(toast.id)">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  protected readonly toastService = inject(ToastService);
}
