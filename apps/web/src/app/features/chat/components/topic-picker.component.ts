import { Component, inject, signal, output, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { CurriculumNode } from '@mentor-ai/shared/types';

@Component({
  selector: 'app-topic-picker',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: block;
      }

      .overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .picker-panel {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        width: 480px;
        max-height: 520px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      }

      .picker-header {
        padding: 16px 20px 12px;
        border-bottom: 1px solid #2a2a2a;
      }
      .picker-title {
        font-size: 15px;
        font-weight: 600;
        color: #fafafa;
        margin-bottom: 12px;
      }

      .search-input {
        width: 100%;
        background: #0d0d0d;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        padding: 10px 12px 10px 36px;
        color: #fafafa;
        font-size: 13px;
        font-family: inherit;
      }
      .search-input:focus {
        outline: none;
        border-color: #3b82f6;
      }
      .search-input::placeholder {
        color: #707070;
      }

      .search-wrapper {
        position: relative;
      }
      .search-icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 16px;
        height: 16px;
        color: #707070;
      }

      .results-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }

      .result-item {
        display: block;
        width: 100%;
        text-align: left;
        padding: 10px 12px;
        border-radius: 6px;
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
      }
      .result-item:hover {
        background: #242424;
      }

      .result-label {
        font-size: 13px;
        color: #fafafa;
      }
      .result-path {
        font-size: 11px;
        color: #707070;
        margin-top: 2px;
      }

      .picker-footer {
        padding: 12px 20px;
        border-top: 1px solid #2a2a2a;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .skip-btn {
        background: none;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        padding: 8px 16px;
        color: #a1a1a1;
        font-size: 13px;
        cursor: pointer;
      }
      .skip-btn:hover {
        color: #fafafa;
        border-color: #707070;
      }

      .cancel-btn {
        background: none;
        border: none;
        color: #9e9e9e;
        font-size: 13px;
        cursor: pointer;
      }
      .cancel-btn:hover {
        color: #fafafa;
      }

      .empty-results {
        text-align: center;
        padding: 24px;
        color: #9e9e9e;
        font-size: 13px;
      }

      .loading-text {
        text-align: center;
        padding: 24px;
        color: #9e9e9e;
        font-size: 13px;
      }
    `,
  ],
  template: `
    <div
      class="overlay"
      (click)="onOverlayClick($event)"
      role="dialog"
      aria-modal="true"
      aria-label="Izbor teme"
    >
      <div class="picker-panel" (click)="$event.stopPropagation()">
        <div class="picker-header">
          <div class="picker-title">Izaberite temu za vašu konverzaciju</div>
          <div class="search-wrapper">
            <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              class="search-input"
              placeholder="Pretraži teme..."
              [value]="searchQuery()"
              (input)="onSearchInput($event)"
              autofocus
              role="searchbox"
              aria-label="Pretraži teme"
            />
          </div>
        </div>

        <div class="results-list">
          @if (isLoading()) {
            <div class="loading-text">Učitavanje tema...</div>
          } @else if (results().length === 0) {
            <div class="empty-results">
              @if (searchQuery()) {
                Nema rezultata za "{{ searchQuery() }}"
              } @else {
                Ukucajte da pretražite teme
              }
            </div>
          } @else {
            @for (node of results(); track node.id) {
              <button class="result-item" (click)="selectTopic(node)">
                <div class="result-label">{{ node.label }}</div>
                @if (getParentPath(node)) {
                  <div class="result-path">{{ getParentPath(node) }}</div>
                }
              </button>
            }
          }
        </div>

        <div class="picker-footer">
          <button class="cancel-btn" (click)="cancelled.emit()">Otkaži</button>
          <button class="skip-btn" (click)="topicSelected.emit(null)">
            Preskoči — Opšti razgovor
          </button>
        </div>
      </div>
    </div>
  `,
})
export class TopicPickerComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/api/v1/knowledge/curriculum`;

  topicSelected = output<CurriculumNode | null>();
  cancelled = output<void>();

  readonly searchQuery = signal('');
  readonly results = signal<CurriculumNode[]>([]);
  readonly isLoading = signal(false);
  private allNodes: CurriculumNode[] = [];
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadTopLevelNodes();
  }

  onSearchInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.searchQuery.set(query);

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    this.searchTimeout = setTimeout(() => {
      this.search(query);
    }, 200);
  }

  selectTopic(node: CurriculumNode): void {
    this.topicSelected.emit(node);
  }

  onOverlayClick(event: Event): void {
    if ((event.target as HTMLElement).classList.contains('overlay')) {
      this.cancelled.emit();
    }
  }

  getParentPath(node: CurriculumNode): string {
    if (!node.parentId) return '';
    const parent = this.allNodes.find((n) => n.id === node.parentId);
    if (!parent) return '';
    const grandparent = parent.parentId
      ? this.allNodes.find((n) => n.id === parent.parentId)
      : null;
    if (grandparent) return `${grandparent.label} > ${parent.label}`;
    return parent.label;
  }

  private async loadTopLevelNodes(): Promise<void> {
    this.isLoading.set(true);
    try {
      // Load the full curriculum for path lookups
      const fullRes = await firstValueFrom(this.http.get<{ data: CurriculumNode[] }>(this.apiUrl));
      this.allNodes = fullRes.data;

      // Show top-level by default
      const topLevel = await firstValueFrom(
        this.http.get<{ data: CurriculumNode[] }>(`${this.apiUrl}/search`)
      );
      this.results.set(topLevel.data);
    } catch {
      this.results.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async search(query: string): Promise<void> {
    if (!query) {
      const topLevel = this.allNodes.filter((n) => !n.parentId);
      this.results.set(topLevel);
      return;
    }

    try {
      const res = await firstValueFrom(
        this.http.get<{ data: CurriculumNode[] }>(
          `${this.apiUrl}/search?q=${encodeURIComponent(query)}`
        )
      );
      this.results.set(res.data);
    } catch {
      this.results.set([]);
    }
  }
}
