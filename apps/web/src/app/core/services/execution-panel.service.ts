import { Injectable, signal, computed } from '@angular/core';
import type { NoteItem } from '@mentor-ai/shared/types';

export interface ExecutionPanelTask {
  note: NoteItem;
  conceptName?: string | null;
  conceptCategory?: string | null;
  conversationId?: string | null;
  agentJobs?: { id: string; agentType: string; status: string; order: number }[];
}

export type ActivityStatus = 'running' | 'completed' | 'error' | 'info';

export interface ActivityEntry {
  id: string;
  timestamp: Date;
  type: string;
  title: string;
  detail?: string;
  status: ActivityStatus;
  streamContent?: string;
  parentId?: string;
  isSubEntry?: boolean;
}

const MAX_ENTRIES = 100;
let entrySeq = 0;

@Injectable({ providedIn: 'root' })
export class ExecutionPanelService {
  /** Whether the panel is open (visible) — always open by default */
  readonly panelOpen = signal(true);

  /** The currently displayed task/note */
  readonly activeTask = signal<ExecutionPanelTask | null>(null);

  /** Real-time activity feed — most recent first */
  readonly activityFeed = signal<ActivityEntry[]>([]);

  /** Current streaming content (from active task-ai or agent) */
  readonly streamContent = signal('');

  /** Whether any agent is currently running */
  readonly isExecuting = computed(() =>
    this.activityFeed().some((e) => e.status === 'running')
  );

  /** Whether there is content to show */
  readonly hasContent = computed(
    () => this.activeTask() !== null || this.activityFeed().length > 0
  );

  /** Open the panel with a task */
  showTask(task: ExecutionPanelTask): void {
    this.activeTask.set(task);
    this.panelOpen.set(true);
  }

  /** Update the active task data (e.g., after reload) */
  updateTask(task: ExecutionPanelTask): void {
    this.activeTask.set(task);
  }

  /** Toggle panel visibility */
  toggle(): void {
    this.panelOpen.update((v) => !v);
  }

  /** Close the panel */
  close(): void {
    this.panelOpen.set(false);
  }

  /** Open the panel (without changing content) */
  open(): void {
    this.panelOpen.set(true);
  }

  /** Clear content and close */
  clear(): void {
    this.activeTask.set(null);
    this.panelOpen.set(false);
  }

  // ── Activity Feed Methods ──

  /** Add a new activity entry */
  addEntry(type: string, title: string, status: ActivityStatus, detail?: string): string {
    const id = `act-${++entrySeq}`;
    const entry: ActivityEntry = {
      id,
      timestamp: new Date(),
      type,
      title,
      status,
      detail,
    };
    this.activityFeed.update((feed) => {
      const updated = [entry, ...feed];
      return updated.length > MAX_ENTRIES ? updated.slice(0, MAX_ENTRIES) : updated;
    });
    return id;
  }

  /** Insert a sub-entry right after the given parent (or after last sibling sub-entry) */
  addEntryAfter(
    afterId: string,
    type: string,
    title: string,
    status: ActivityStatus,
    detail?: string,
    parentId?: string,
  ): string {
    const id = `act-${++entrySeq}`;
    const entry: ActivityEntry = {
      id,
      timestamp: new Date(),
      type,
      title,
      status,
      detail,
      parentId,
      isSubEntry: true,
    };
    this.activityFeed.update((feed) => {
      let insertIdx = feed.findIndex((e) => e.id === afterId);
      if (insertIdx === -1) {
        return [entry, ...feed].slice(0, MAX_ENTRIES);
      }
      // Walk past existing sub-entries of the same parent
      if (parentId) {
        while (insertIdx + 1 < feed.length && feed[insertIdx + 1]?.parentId === parentId) {
          insertIdx++;
        }
      }
      const updated = [...feed];
      updated.splice(insertIdx + 1, 0, entry);
      return updated.length > MAX_ENTRIES ? updated.slice(0, MAX_ENTRIES) : updated;
    });
    return id;
  }

  /** Mark all running sub-entries of a parent as error */
  failSubEntries(parentId: string, detail?: string): void {
    this.activityFeed.update((feed) =>
      feed.map((e) =>
        e.parentId === parentId && e.status === 'running'
          ? { ...e, status: 'error' as ActivityStatus, detail: detail || e.detail }
          : e
      )
    );
  }

  /** Update an existing entry by ID */
  updateEntry(id: string, patch: Partial<Pick<ActivityEntry, 'title' | 'detail' | 'status' | 'streamContent'>>): void {
    this.activityFeed.update((feed) =>
      feed.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );
  }

  /** Mark a running entry as completed */
  completeEntry(id: string, detail?: string): void {
    this.updateEntry(id, { status: 'completed', detail });
  }

  /** Mark a running entry as failed */
  failEntry(id: string, detail?: string): void {
    this.updateEntry(id, { status: 'error', detail });
  }

  /** Append streaming content (global) */
  appendStream(content: string): void {
    this.streamContent.update((c) => c + content);
  }

  /** Append streaming content to a specific activity entry */
  appendToEntryStream(id: string, chunk: string): void {
    this.activityFeed.update((feed) =>
      feed.map((e) => (e.id === id ? { ...e, streamContent: (e.streamContent || '') + chunk } : e))
    );
  }

  /** Reset streaming content */
  clearStream(): void {
    this.streamContent.set('');
  }

  /** Clear all activity entries */
  clearFeed(): void {
    this.activityFeed.set([]);
    this.streamContent.set('');
  }
}
