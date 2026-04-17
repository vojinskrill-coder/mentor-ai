import { Injectable, inject, signal } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { finalize } from 'rxjs/operators';

/**
 * BusyIndicatorService — tracks active HTTP requests.
 * Injectable across the app. Signal-based for Angular reactivity.
 */
@Injectable({ providedIn: 'root' })
export class BusyIndicatorService {
  private activeCount = 0;
  readonly isBusy = signal(false);

  start(): void {
    this.activeCount++;
    this.isBusy.set(true);
  }

  stop(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
    if (this.activeCount === 0) {
      this.isBusy.set(false);
    }
  }
}

/**
 * Functional HTTP interceptor.
 * Uses inject() to get BusyIndicatorService (Angular 17+ functional interceptor DI).
 * Skips health checks and WebSocket URLs.
 */
export const busyInterceptor: HttpInterceptorFn = (req, next) => {
  // Skip non-visual requests
  if (req.url.includes('/health') || req.url.includes('/ws/') || req.url.includes('socket.io')) {
    return next(req);
  }

  const busy = inject(BusyIndicatorService);
  busy.start();

  return next(req).pipe(
    finalize(() => busy.stop()),
  );
};
