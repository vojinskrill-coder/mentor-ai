import {
  Component,
  Input,
  Output,
  EventEmitter,
  computed,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Generic results viewer for builder-generated processes.
 *
 * Shows an array of items as a dynamic table (columns derived from
 * the first item's keys, max 6). Each row has a checkbox and the
 * user can approve selected rows — emitting the selected items to
 * the parent which persists them to the per-process Notion database.
 *
 * This is the builder equivalent of `app-lead-row` (for leads) or
 * the post-card list (for content).
 */
@Component({
  selector: 'app-builder-results',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="builder-results">
      @if (!items || items.length === 0) {
        <div class="empty-state">
          No items produced by this run yet.
        </div>
      } @else {
        <div class="stats-bar">
          <div class="stat">
            <span class="stat-val">{{ items.length }}</span>
            <span class="stat-label">Items</span>
          </div>
          @if (!readonly) {
            <div class="stat">
              <span class="stat-val">{{ selectedIds().size }}</span>
              <span class="stat-label">Selected</span>
            </div>
          }
        </div>

        <div class="results-table-wrap">
          <table class="results-table">
            <thead>
              <tr>
                @if (!readonly) {
                  <th class="th-check">
                    <input
                      type="checkbox"
                      [checked]="allSelected()"
                      (change)="toggleSelectAll()"
                    />
                  </th>
                }
                <th class="th-expand"></th>
                @for (col of columns(); track col) {
                  <th>{{ col }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (item of items; track $index; let i = $index) {
                <tr
                  [class.selected]="selectedIds().has(i)"
                  [class.expanded]="expandedIds().has(i)"
                  (click)="toggleExpand(i, $event)"
                >
                  @if (!readonly) {
                    <td class="td-check" (click)="$event.stopPropagation()">
                      <input
                        type="checkbox"
                        [checked]="selectedIds().has(i)"
                        (change)="toggleRow(i)"
                      />
                    </td>
                  }
                  <td class="td-expand">
                    <span class="expand-chevron" [class.open]="expandedIds().has(i)">
                      ▸
                    </span>
                  </td>
                  @for (col of columns(); track col) {
                    <td class="td-cell">
                      <span class="cell-value">
                        {{ cellPreview(item, col) }}
                      </span>
                    </td>
                  }
                </tr>
                @if (expandedIds().has(i)) {
                  <tr class="detail-row">
                    <td [attr.colspan]="columns().length + (readonly ? 1 : 2)">
                      <div class="detail-panel">
                        <div class="detail-grid">
                          @for (key of allKeys(item); track key) {
                            <div class="detail-field">
                              <div class="detail-key">{{ key }}</div>
                              <div class="detail-value">
                                @if (isUrl(item[key])) {
                                  <a [href]="item[key]" target="_blank" rel="noopener">{{ item[key] }}</a>
                                } @else {
                                  {{ fullValue(item, key) }}
                                }
                              </div>
                            </div>
                          }
                        </div>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        @if (!readonly) {
          <div class="action-bar">
            <button
              class="approve-btn"
              [disabled]="selectedIds().size === 0 || approving"
              (click)="approveSelected()"
            >
              @if (approving) {
                <span class="spinner-sm"></span> Saving {{ selectedIds().size }} to Notion…
              } @else {
                ✓ Approve {{ selectedIds().size || '' }} and save to Notion
              }
            </button>
            <button
              class="skip-btn"
              [disabled]="selectedIds().size === 0"
              (click)="clearSelection()"
            >
              Clear selection
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .builder-results {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .empty-state {
        padding: 48px 16px;
        text-align: center;
        color: #6B7280;
        font-size: 13px;
      }

      .stats-bar {
        display: flex;
        gap: 16px;
        padding: 12px;
        background: #161B22;
        border-radius: 8px;
        border: 1px solid #21262D;
      }
      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 70px;
      }
      .stat-val {
        color: #E6EDF3;
        font-size: 20px;
        font-weight: 700;
      }
      .stat-label {
        color: #6B7280;
        font-size: 11px;
      }

      .results-table-wrap {
        border: 1px solid #21262D;
        border-radius: 8px;
        max-height: 60vh;
        overflow-x: auto;
        overflow-y: auto;
      }
      .results-table {
        min-width: 100%;
        width: max-content;
        border-collapse: collapse;
        background: #0D1117;
        font-size: 13px;
      }
      .results-table th,
      .results-table td {
        white-space: nowrap;
      }
      .td-cell {
        min-width: 120px;
        max-width: 320px;
      }
      .results-table thead {
        position: sticky;
        top: 0;
        z-index: 1;
        background: #161B22;
      }
      .results-table th {
        color: #6B7280;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        padding: 10px 12px;
        text-align: left;
        border-bottom: 1px solid #21262D;
        letter-spacing: 0.5px;
      }
      .th-check {
        width: 32px;
      }
      .th-check input {
        accent-color: #58A6FF;
        cursor: pointer;
      }
      .th-actions {
        width: 48px;
      }
      .th-expand {
        width: 24px;
      }

      .results-table tbody tr {
        border-bottom: 1px solid #21262D;
        transition: background 0.1s;
        cursor: pointer;
      }
      .results-table tbody tr:hover {
        background: #1C2128;
      }
      .results-table tbody tr.selected {
        background: #1C2128;
      }
      .results-table tbody tr.expanded {
        background: #1C2128;
      }
      .td-expand {
        text-align: center;
        padding: 10px 4px;
      }
      .expand-chevron {
        display: inline-block;
        color: #6B7280;
        transition: transform 0.15s;
        font-size: 11px;
      }
      .expand-chevron.open {
        transform: rotate(90deg);
        color: #58A6FF;
      }
      .detail-row {
        cursor: default !important;
        background: #0D1117 !important;
      }
      .detail-row:hover {
        background: #0D1117 !important;
      }
      .detail-panel {
        padding: 16px 24px;
        border-top: 1px solid #21262D;
        border-bottom: 2px solid #58A6FF40;
      }
      .detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px 24px;
      }
      .detail-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .detail-key {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #6B7280;
      }
      .detail-value {
        font-size: 12px;
        color: #C9D1D9;
        word-break: break-word;
        white-space: pre-wrap;
        line-height: 1.5;
      }
      .detail-value a {
        color: #58A6FF;
        text-decoration: none;
      }
      .detail-value a:hover { text-decoration: underline; }
      .td-check {
        text-align: center;
      }
      .td-check input {
        accent-color: #58A6FF;
        cursor: pointer;
      }
      .td-cell {
        padding: 10px 12px;
        color: #C9D1D9;
        vertical-align: top;
        max-width: 260px;
      }
      .cell-value {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .td-actions {
        text-align: center;
      }
      .link-btn {
        background: transparent;
        border: none;
        color: #58A6FF;
        cursor: pointer;
        font-size: 14px;
      }

      .action-bar {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .approve-btn {
        padding: 10px 20px;
        background: #238636;
        color: #E6EDF3;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .approve-btn:hover:not(:disabled) {
        background: #2EA043;
      }
      .approve-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .skip-btn {
        padding: 10px 16px;
        background: transparent;
        border: 1px solid #21262D;
        color: #8B949E;
        border-radius: 8px;
        font-size: 13px;
        cursor: pointer;
      }
      .skip-btn:hover:not(:disabled) {
        border-color: #58A6FF;
        color: #E6EDF3;
      }
      .spinner-sm {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid #E6EDF340;
        border-top-color: #E6EDF3;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class BuilderResultsComponent {
  @Input() items: Record<string, unknown>[] = [];
  @Input() approving = false;
  @Input() readonly = false;

  @Output() approve = new EventEmitter<Record<string, unknown>[]>();
  @Output() expand = new EventEmitter<{
    index: number;
    item: Record<string, unknown>;
  }>();

  selectedIds = signal<Set<number>>(new Set());
  expandedIds = signal<Set<number>>(new Set());

  columns = computed<string[]>(() => {
    if (!this.items || this.items.length === 0) return [];
    const first = this.items[0];
    if (!first || typeof first !== 'object') return [];
    // Prefer common display fields, fall back to whatever the first
    // item has, max 6 columns.
    const preferred = [
      'name',
      'title',
      'company',
      'topic',
      'headline',
      'score',
      'url',
      'email',
      'description',
      'published',
      'siteName',
    ];
    const keys = Object.keys(first);
    const picked: string[] = [];
    for (const p of preferred) {
      if (keys.includes(p) && picked.length < 6) picked.push(p);
    }
    for (const k of keys) {
      if (picked.length >= 6) break;
      if (!picked.includes(k)) picked.push(k);
    }
    return picked;
  });

  allSelected = computed(() => {
    return this.items.length > 0 && this.selectedIds().size === this.items.length;
  });

  toggleExpand(index: number, event: Event): void {
    // Don't toggle when clicking a link or input inside the row
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'A' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'BUTTON'
    ) {
      return;
    }
    this.expandedIds.update((s) => {
      const next = new Set(s);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  allKeys(item: Record<string, unknown>): string[] {
    if (!item || typeof item !== 'object') return [];
    return Object.keys(item);
  }

  isUrl(v: unknown): boolean {
    return (
      typeof v === 'string' &&
      (v.startsWith('http://') || v.startsWith('https://'))
    );
  }

  toggleRow(index: number): void {
    this.selectedIds.update((s) => {
      const next = new Set(s);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  toggleSelectAll(): void {
    if (this.allSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(this.items.map((_, i) => i)));
    }
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  approveSelected(): void {
    const ids = this.selectedIds();
    const chosen = this.items.filter((_, i) => ids.has(i));
    if (chosen.length === 0) return;
    this.approve.emit(chosen);
  }

  cellPreview(item: Record<string, unknown>, col: string): string {
    const v = item[col];
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '…' : v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return `[${v.length}]`;
    try {
      const s = JSON.stringify(v);
      return s.length > 60 ? s.slice(0, 60) + '…' : s;
    } catch {
      return '';
    }
  }

  fullValue(item: Record<string, unknown>, col: string): string {
    const v = item[col];
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return '';
    }
  }
}
