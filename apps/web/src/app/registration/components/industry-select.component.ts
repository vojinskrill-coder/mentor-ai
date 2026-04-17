import { Component, forwardRef, Input, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-industry-select',
  standalone: true,
  imports: [FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => IndustrySelectComponent),
      multi: true,
    },
  ],
  styles: [
    `
      :host {
        display: block;
        position: relative;
      }
      .select-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid #21262D;
        background: #0D1117;
        color: #E6EDF3;
        font-size: 14px;
        font-family: inherit;
        cursor: pointer;
        text-align: left;
        transition: border-color 0.15s;
      }
      .select-trigger:focus {
        outline: none;
        border-color: #58A6FF;
      }
      .select-trigger.open {
        border-color: #58A6FF;
      }
      .placeholder {
        color: #9e9e9e;
      }
      .chevron {
        width: 16px;
        height: 16px;
        color: #9e9e9e;
        transition: transform 0.15s;
        flex-shrink: 0;
      }
      .chevron.open {
        transform: rotate(180deg);
      }

      /* Dropdown */
      .dropdown {
        position: absolute;
        z-index: 10;
        margin-top: 4px;
        width: 100%;
        max-height: 240px;
        overflow: auto;
        border-radius: 8px;
        border: 1px solid #21262D;
        background: #161B22;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      }
      .search-wrapper {
        padding: 8px;
        border-bottom: 1px solid #21262D;
      }
      .search-input {
        width: 100%;
        padding: 8px 10px;
        border-radius: 6px;
        border: 1px solid #21262D;
        background: #0D1117;
        color: #E6EDF3;
        font-size: 13px;
        font-family: inherit;
        box-sizing: border-box;
      }
      .search-input:focus {
        outline: none;
        border-color: #58A6FF;
      }
      .options-list {
        list-style: none;
        padding: 4px 0;
        margin: 0;
      }
      .option-btn {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 8px 12px;
        border: none;
        background: transparent;
        color: #E6EDF3;
        font-size: 14px;
        font-family: inherit;
        cursor: pointer;
        text-align: left;
      }
      .option-btn:hover {
        background: #1C2128;
      }
      .option-btn.selected {
        background: #1C2128;
      }
      .check-icon {
        width: 16px;
        height: 16px;
        color: #58A6FF;
      }
      .empty-text {
        padding: 8px 12px;
        font-size: 13px;
        color: #9e9e9e;
      }

      /* Backdrop */
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: 0;
      }
    `,
  ],
  template: `
    <button type="button" class="select-trigger" [class.open]="isOpen()" (click)="toggleDropdown()">
      @if (value()) {
        <span>{{ value() }}</span>
      } @else {
        <span class="placeholder">Izaberite industriju</span>
      }
      <svg class="chevron" [class.open]="isOpen()" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    @if (isOpen()) {
      <div class="dropdown">
        <div class="search-wrapper">
          <input type="text" class="search-input" [(ngModel)]="searchQuery"
            (ngModelChange)="filterIndustries()" placeholder="Pretražite industrije..." />
        </div>
        <ul class="options-list">
          @for (industry of filteredIndustries(); track industry) {
            <li>
              <button type="button" class="option-btn" [class.selected]="value() === industry"
                (click)="selectIndustry(industry)">
                {{ industry }}
                @if (value() === industry) {
                  <svg class="check-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                }
              </button>
            </li>
          } @empty {
            <li class="empty-text">Nije pronađena industrija</li>
          }
        </ul>
      </div>
      <div class="backdrop" (click)="closeDropdown()"></div>
    }
  `,
})
export class IndustrySelectComponent implements ControlValueAccessor {
  @Input() industries: readonly string[] = [];

  readonly value = signal<string>('');
  readonly isOpen = signal(false);
  readonly filteredIndustries = signal<readonly string[]>([]);

  searchQuery = '';

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onChange: (value: string) => void = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onTouched: () => void = () => {};

  constructor() {
    this.filteredIndustries.set(this.industries);
  }

  writeValue(value: string): void {
    this.value.set(value || '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  toggleDropdown(): void {
    if (this.isOpen()) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  openDropdown(): void {
    this.filteredIndustries.set(this.industries);
    this.searchQuery = '';
    this.isOpen.set(true);
  }

  closeDropdown(): void {
    this.isOpen.set(false);
    this.onTouched();
  }

  selectIndustry(industry: string): void {
    this.value.set(industry);
    this.onChange(industry);
    this.closeDropdown();
  }

  filterIndustries(): void {
    const query = this.searchQuery.toLowerCase();
    this.filteredIndustries.set(
      this.industries.filter((i) => i.toLowerCase().includes(query))
    );
  }
}
