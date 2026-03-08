import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  readonly toasts = signal<Toast[]>([]);

  success(message: string): void {
    this.add(message, 'success', 4000);
  }

  error(message: string): void {
    this.add(message, 'error', 8000);
  }

  info(message: string): void {
    this.add(message, 'info', 4000);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private add(message: string, type: Toast['type'], duration: number): void {
    const id = ++this.nextId;
    const toast: Toast = { id, message, type };

    this.toasts.update((list) => {
      const next = [...list, toast];
      // max 3 visible
      return next.length > 3 ? next.slice(-3) : next;
    });

    setTimeout(() => this.dismiss(id), duration);
  }
}
