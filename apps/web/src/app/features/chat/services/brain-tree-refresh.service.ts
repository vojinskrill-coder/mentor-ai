import { Injectable, signal } from '@angular/core';

/**
 * Architecture: a single, app-wide refresh signal for the concept tree.
 *
 * Why: previously the chat component called `this.conceptTree?.loadTree()`
 * directly via @ViewChild, which (a) couples chat to the tree's internals,
 * (b) silently no-ops if the ViewChild isn't bound yet (which happens when
 * `openProposalChat` runs from `queryParams.subscribe()` during ngOnInit
 * BEFORE ngAfterViewInit fires), and (c) only refreshes the tree in this
 * one browser tab — events from other code paths that change tree-relevant
 * data don't propagate.
 *
 * The fix: a single counter signal that anyone can bump. The concept-tree
 * component subscribes via an effect, and reloads whenever the counter
 * changes. Decoupled, deterministic, no ViewChild timing dependency.
 *
 * Bump it from any code path that mutates tree-relevant data:
 *   - new conversation created
 *   - new task created
 *   - task status change
 *   - concept added/removed
 */
@Injectable({ providedIn: 'root' })
export class BrainTreeRefreshService {
  /** Monotonic counter — every increment triggers subscribers to reload. */
  readonly counter = signal(0);

  /** Bump the counter to request a tree reload. Idempotent and cheap. */
  request(): void {
    this.counter.update((n) => n + 1);
  }
}
