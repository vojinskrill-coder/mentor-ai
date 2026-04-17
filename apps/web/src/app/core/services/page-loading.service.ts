import { Injectable, signal } from '@angular/core';

/**
 * Global page loading service.
 *
 * Architecture (revised):
 *   - Reference-counted via `activeCount` so multiple concurrent loads can
 *     all show the indicator and the last one to finish hides it.
 *   - HARD GUARANTEE: the indicator can never stay on forever. Two safety
 *     mechanisms enforce this:
 *       1. `reset()` is called by app-shell on every NavigationEnd, so any
 *          leaked start() from a component that got unmounted mid-load
 *          (which would otherwise leave the counter > 0 forever) is
 *          cleared.
 *       2. A max 60-second auto-timeout: if isLoading stays true for 60s,
 *          force reset. Any legitimate page load that needs longer should
 *          show its own dedicated UI, not piggyback on the global bar.
 *
 * App-shell reads `isLoading` signal to show/hide the loading bar.
 * Safe for zoneless Angular — explicit calls only, no interceptor magic.
 */
@Injectable({ providedIn: 'root' })
export class PageLoadingService {
  private activeCount = 0;
  private maxLoadTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly MAX_LOAD_MS = 60_000;

  readonly isLoading = signal(false);

  start(): void {
    this.activeCount++;
    if (!this.isLoading()) {
      this.isLoading.set(true);
      this.armMaxLoadTimer();
    }
  }

  stop(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
    if (this.activeCount === 0) {
      this.isLoading.set(false);
      this.clearMaxLoadTimer();
    }
  }

  /**
   * Force the loading indicator off and reset the counter. Called by
   * app-shell on every router NavigationEnd to guarantee a clean slate
   * per navigation — no stuck spinners can carry across pages.
   */
  reset(): void {
    this.activeCount = 0;
    this.isLoading.set(false);
    this.clearMaxLoadTimer();
  }

  private armMaxLoadTimer(): void {
    this.clearMaxLoadTimer();
    this.maxLoadTimer = setTimeout(() => {
      // Hit the safety ceiling — something leaked, force reset.
      this.reset();
    }, this.MAX_LOAD_MS);
  }

  private clearMaxLoadTimer(): void {
    if (this.maxLoadTimer) {
      clearTimeout(this.maxLoadTimer);
      this.maxLoadTimer = null;
    }
  }
}
