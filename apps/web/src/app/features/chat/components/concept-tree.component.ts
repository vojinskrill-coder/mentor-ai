import {
  Component,
  inject,
  signal,
  input,
  output,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConversationService } from '../services/conversation.service';
import type {
  ConceptTreeData,
  ConceptHierarchyNode,
  Conversation,
} from '@mentor-ai/shared/types';

/** Flattened tree row for rendering */
interface TreeRow {
  type: 'node' | 'conversation' | 'general-header' | 'general-conv';
  depth: number;
  node?: ConceptHierarchyNode;
  conversation?: Conversation;
  curriculumId?: string;
}

@Component({
  selector: 'app-concept-tree',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; flex: 1; overflow-y: auto; }
    .tree-container { padding: 4px 0; transition: opacity 0.2s; }
    .tree-container.locked { pointer-events: none; opacity: 0.5; }

    .tree-node {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 8px; cursor: pointer;
      font-size: 12px; font-weight: 500; color: #A1A1A1;
      border-radius: 4px; margin: 0 4px;
      background: none; border: none;
      width: calc(100% - 8px); text-align: left;
    }
    .tree-node:hover { background: #1A1A1A; color: #FAFAFA; }
    .tree-node.root-node {
      font-size: 11px; font-weight: 600;
      color: #6B6B6B; text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .chevron {
      width: 10px; height: 10px; transition: transform 0.15s;
      flex-shrink: 0;
    }
    .chevron.expanded { transform: rotate(90deg); }

    .node-label {
      flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .node-count {
      margin-left: auto;
      font-size: 10px; color: #4A4A4A; flex-shrink: 0;
    }

    .add-btn {
      width: 16px; height: 16px; color: #4A4A4A;
      opacity: 0; transition: opacity 0.15s;
      cursor: pointer; flex-shrink: 0;
      background: none; border: none; padding: 0;
    }
    .tree-node:hover .add-btn { opacity: 1; }
    .add-btn:hover { color: #3B82F6; }

    .conversation-item {
      display: block; width: calc(100% - 8px);
      padding: 6px 12px; margin: 0 4px 2px;
      border-radius: 4px; cursor: pointer;
      background: none; border: none;
      text-align: left; color: inherit;
    }
    .conversation-item:hover { background: #1A1A1A; }
    .conversation-item.active { background: #1A1A1A; border-left: 2px solid #3B82F6; }

    .conv-title {
      font-size: 12px; color: #A1A1A1;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .conversation-item.active .conv-title { color: #FAFAFA; }

    .conv-meta { font-size: 10px; color: #4A4A4A; margin-top: 2px; }

    .general-section { margin-top: 4px; border-top: 1px solid #2A2A2A; padding-top: 4px; }

    .general-header {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 12px; cursor: pointer;
      font-size: 11px; font-weight: 600;
      color: #6B6B6B; text-transform: uppercase;
      letter-spacing: 0.5px;
      background: none; border: none; width: 100%; text-align: left;
    }
    .general-header:hover { color: #A1A1A1; }

    .general-item {
      display: block; width: calc(100% - 8px);
      padding: 6px 12px 6px 24px; margin: 0 4px 2px;
      border-radius: 4px; cursor: pointer;
      background: none; border: none;
      text-align: left; color: inherit;
    }
    .general-item:hover { background: #1A1A1A; }
    .general-item.active { background: #1A1A1A; border-left: 2px solid #3B82F6; }
    .general-item.active .conv-title { color: #FAFAFA; }

    .skeleton {
      background: linear-gradient(90deg, #1A1A1A 25%, #242424 50%, #1A1A1A 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      height: 14px; border-radius: 4px; margin-bottom: 6px;
    }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .new-badge {
      width: 8px; height: 8px; border-radius: 50%;
      background: #3B82F6; flex-shrink: 0;
    }

    .node-label.clickable { cursor: pointer; }
    .node-label.clickable:hover { color: #3B82F6; }

    .tree-item-loading { opacity: 0.6; pointer-events: none; }
    .tree-item-spinner {
      display: inline-block; width: 12px; height: 12px;
      border: 2px solid #2A2A2A; border-top-color: #3B82F6;
      border-radius: 50%; animation: shimmer-spin 0.8s linear infinite;
      flex-shrink: 0;
    }
    @keyframes shimmer-spin { to { transform: rotate(360deg); } }

    .empty-state {
      padding: 32px 12px; text-align: center;
    }
    .empty-icon {
      width: 48px; height: 48px; margin: 0 auto 12px;
      background: #1A1A1A; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }
  `],
  template: `
    <div class="tree-container" [class.locked]="locked()">
      @if (isLoading$()) {
        <div style="padding: 0 12px;">
          @for (i of [1,2,3]; track i) {
            <div style="padding: 6px 0;">
              <div class="skeleton" style="width: 50%;"></div>
              <div class="skeleton" style="width: 70%; margin-left: 16px;"></div>
              <div class="skeleton" style="width: 80%; margin-left: 32px;"></div>
            </div>
          }
        </div>
      } @else if (treeData$()) {
        <!-- Hierarchical Tree -->
        @for (row of flatRows(); track trackRow(row)) {
          @if (row.type === 'node' && row.node) {
            <button
              class="tree-node"
              [class.root-node]="row.depth === 0"
              [style.padding-left.px]="12 + row.depth * 16"
              (click)="toggleNode(row.node!.curriculumId)"
            >
              <svg class="chevron" [class.expanded]="expandedNodes().has(row.node!.curriculumId)"
                   fill="none" stroke="currentColor" viewBox="0 0 24 24"
                   (click)="toggleNode(row.node!.curriculumId); $event.stopPropagation()">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
              <span class="node-label clickable"
                    (click)="onNodeClick($event, row.node!)">{{ row.node!.label }}</span>
              @if (hasNewConversations(row.node!.curriculumId)) {
                <span class="new-badge"></span>
              }
              @if (row.node!.conversationCount > 0) {
                <span class="node-count">{{ row.node!.conversationCount }}</span>
              }
              @if (row.node!.conceptId) {
                <button class="add-btn" (click)="onNewChat($event, row.node!.curriculumId, row.node!.label)"
                        title="New conversation">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 14px; height: 14px;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                  </svg>
                </button>
              }
            </button>
          }
          @if (row.type === 'conversation' && row.conversation) {
            <button
              class="conversation-item"
              [class.active]="activeConversationId() === row.conversation!.id"
              [class.tree-item-loading]="loadingItemId() === row.conversation!.id"
              [style.padding-left.px]="12 + row.depth * 16"
              (click)="onConversationSelect(row.conversation!.id)"
            >
              <div style="display: flex; align-items: center; gap: 6px;">
                @if (loadingItemId() === row.conversation!.id) {
                  <span class="tree-item-spinner"></span>
                } @else if (newConversationIds().has(row.conversation!.id)) {
                  <span class="new-badge"></span>
                }
                <div class="conv-title" style="flex: 1;">{{ row.conversation!.title || 'Untitled' }}</div>
              </div>
              <div class="conv-meta">{{ formatDate(row.conversation!.updatedAt) }}</div>
            </button>
          }
        }

        <!-- General (uncategorized) Section -->
        @if (treeData$()!.uncategorized.length > 0) {
          <div class="general-section">
            <button class="general-header" (click)="toggleGeneral()">
              <svg class="chevron" [class.expanded]="generalExpanded()"
                   fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 12px; height: 12px;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
              General
              <span class="node-count">{{ treeData$()!.uncategorized.length }}</span>
            </button>

            @if (generalExpanded()) {
              @for (conv of treeData$()!.uncategorized; track conv.id) {
                <button
                  class="general-item"
                  [class.active]="activeConversationId() === conv.id"
                  (click)="onConversationSelect(conv.id)"
                >
                  <div class="conv-title">{{ conv.title || 'Untitled Conversation' }}</div>
                  <div class="conv-meta">{{ formatDate(conv.updatedAt) }}</div>
                </button>
              }
            }
          </div>
        }

        <!-- Empty state -->
        @if (treeData$()!.tree.length === 0 && treeData$()!.uncategorized.length === 0) {
          <div class="empty-state">
            <div class="empty-icon">
              <svg style="width: 24px; height: 24px; color: #6B6B6B;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
              </svg>
            </div>
            <p style="font-size: 13px; color: #6B6B6B;">No conversations yet</p>
            <p style="font-size: 11px; color: #6B6B6B; margin-top: 4px;">Start a new conversation above</p>
          </div>
        }
      }
    </div>
  `,
})
export class ConceptTreeComponent implements OnInit {
  private readonly conversationService = inject(ConversationService);

  activeConversationId = input<string | null>(null);
  locked = input(false);
  newConversationIds = input<Set<string>>(new Set());
  loadingItemId = input<string | null>(null);
  conversationSelected = output<string>();
  newChatRequested = output<{ conceptId: string; conceptName: string }>();
  conceptSelected = output<{ conceptId: string | null; curriculumId: string; conceptName: string; isFolder: boolean; descendantConceptIds: string[]; descendantConversationIds: string[] }>();

  readonly treeData$ = signal<ConceptTreeData | null>(null);
  readonly isLoading$ = signal(false);
  readonly expandedNodes = signal<Set<string>>(new Set());
  readonly generalExpanded = signal(true);
  readonly flatRows = signal<TreeRow[]>([]);

  ngOnInit(): void {
    this.loadTree();
  }

  async loadTree(): Promise<void> {
    this.isLoading$.set(true);
    try {
      const data = await this.conversationService.getGroupedConversations();
      this.treeData$.set(data);
      // Auto-expand all nodes
      const expanded = new Set<string>();
      this.collectAllIds(data.tree, expanded);
      this.expandedNodes.set(expanded);
      this.rebuildFlatRows();
    } catch {
      // Tree will show empty
    } finally {
      this.isLoading$.set(false);
    }
  }

  toggleNode(curriculumId: string): void {
    this.expandedNodes.update((set) => {
      const next = new Set(set);
      if (next.has(curriculumId)) next.delete(curriculumId);
      else next.add(curriculumId);
      return next;
    });
    this.rebuildFlatRows();
  }

  toggleGeneral(): void {
    this.generalExpanded.update((v) => !v);
  }

  onConversationSelect(conversationId: string): void {
    this.conversationSelected.emit(conversationId);
  }

  onNewChat(event: Event, curriculumId: string, label: string): void {
    event.stopPropagation();
    this.newChatRequested.emit({ conceptId: curriculumId, conceptName: label });
  }

  onNodeClick(event: Event, node: ConceptHierarchyNode): void {
    event.stopPropagation();
    if (node.conceptId) {
      // Leaf concept
      this.conceptSelected.emit({
        conceptId: node.conceptId,
        curriculumId: node.curriculumId,
        conceptName: node.label,
        isFolder: false,
        descendantConceptIds: [node.conceptId],
        descendantConversationIds: node.conversations.map(c => c.id),
      });
      if (!this.expandedNodes().has(node.curriculumId)) {
        this.toggleNode(node.curriculumId);
      }
    } else {
      // Folder node — collect all descendant conceptIds and conversationIds
      const conceptIds = this.collectDescendantConceptIds(node);
      const conversationIds = this.collectDescendantConversationIds(node);
      this.conceptSelected.emit({
        conceptId: null,
        curriculumId: node.curriculumId,
        conceptName: node.label,
        isFolder: true,
        descendantConceptIds: conceptIds,
        descendantConversationIds: conversationIds,
      });
      if (!this.expandedNodes().has(node.curriculumId)) {
        this.toggleNode(node.curriculumId);
      }
    }
  }

  private collectDescendantConceptIds(node: ConceptHierarchyNode): string[] {
    const ids: string[] = [];
    if (node.conceptId) ids.push(node.conceptId);
    for (const child of node.children) {
      ids.push(...this.collectDescendantConceptIds(child));
    }
    return ids;
  }

  private collectDescendantConversationIds(node: ConceptHierarchyNode): string[] {
    const ids: string[] = [];
    for (const conv of node.conversations) {
      ids.push(conv.id);
    }
    for (const child of node.children) {
      ids.push(...this.collectDescendantConversationIds(child));
    }
    return ids;
  }

  hasNewConversations(curriculumId: string): boolean {
    const ids = this.newConversationIds();
    if (ids.size === 0) return false;
    const data = this.treeData$();
    if (!data) return false;
    return this.checkNodeForNew(data.tree, curriculumId, ids);
  }

  private checkNodeForNew(nodes: ConceptHierarchyNode[], targetId: string, newIds: Set<string>): boolean {
    for (const node of nodes) {
      if (node.curriculumId === targetId) {
        return node.conversations.some(c => newIds.has(c.id)) ||
               this.anyDescendantHasNew(node.children, newIds);
      }
      const found = this.checkNodeForNew(node.children, targetId, newIds);
      if (found) return true;
    }
    return false;
  }

  private anyDescendantHasNew(nodes: ConceptHierarchyNode[], newIds: Set<string>): boolean {
    for (const node of nodes) {
      if (node.conversations.some(c => newIds.has(c.id))) return true;
      if (this.anyDescendantHasNew(node.children, newIds)) return true;
    }
    return false;
  }

  trackRow(row: TreeRow): string {
    if (row.type === 'node' && row.node) return `node-${row.node.curriculumId}`;
    if (row.type === 'conversation' && row.conversation) return `conv-${row.conversation.id}`;
    return `${row.type}-${row.depth}`;
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  private collectAllIds(nodes: ConceptHierarchyNode[], set: Set<string>): void {
    for (const node of nodes) {
      set.add(node.curriculumId);
      this.collectAllIds(node.children, set);
    }
  }

  private rebuildFlatRows(): void {
    const data = this.treeData$();
    if (!data) {
      this.flatRows.set([]);
      return;
    }
    const rows: TreeRow[] = [];
    const expanded = this.expandedNodes();
    this.flattenTree(data.tree, 0, rows, expanded);
    this.flatRows.set(rows);
  }

  private flattenTree(
    nodes: ConceptHierarchyNode[],
    depth: number,
    rows: TreeRow[],
    expanded: Set<string>
  ): void {
    for (const node of nodes) {
      rows.push({ type: 'node', depth, node, curriculumId: node.curriculumId });
      if (expanded.has(node.curriculumId)) {
        // Show child nodes first
        this.flattenTree(node.children, depth + 1, rows, expanded);
        // Then show conversations at this node
        for (const conv of node.conversations) {
          rows.push({
            type: 'conversation',
            depth: depth + 1,
            conversation: conv,
            curriculumId: node.curriculumId,
          });
        }
      }
    }
  }
}
