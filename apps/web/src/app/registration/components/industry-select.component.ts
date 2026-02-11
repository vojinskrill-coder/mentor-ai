import { Component, forwardRef, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideCheck } from '@ng-icons/lucide';

@Component({
  selector: 'app-industry-select',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIcon],
  providers: [
    provideIcons({ lucideChevronDown, lucideCheck }),
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => IndustrySelectComponent),
      multi: true,
    },
  ],
  template: `
    <div class="relative">
      <button
        type="button"
        (click)="toggleDropdown()"
        [class.ring-2]="isOpen()"
        [class.ring-ring]="isOpen()"
        class="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
      >
        <span [class.text-muted-foreground]="!value()">
          {{ value() || 'Select an industry' }}
        </span>
        <ng-icon
          name="lucideChevronDown"
          class="h-4 w-4 text-muted-foreground transition-transform"
          [class.rotate-180]="isOpen()"
        />
      </button>

      @if (isOpen()) {
        <div
          class="absolute z-10 mt-1 w-full rounded-md border border-input bg-background shadow-lg max-h-60 overflow-auto"
        >
          <!-- Search input -->
          <div class="p-2 border-b border-input">
            <input
              type="text"
              [(ngModel)]="searchQuery"
              (ngModelChange)="filterIndustries()"
              placeholder="Search industries..."
              class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <!-- Options list -->
          <ul class="py-1">
            @for (industry of filteredIndustries(); track industry) {
              <li>
                <button
                  type="button"
                  (click)="selectIndustry(industry)"
                  class="w-full flex items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-accent"
                  [class.bg-accent]="value() === industry"
                >
                  {{ industry }}
                  @if (value() === industry) {
                    <ng-icon name="lucideCheck" class="h-4 w-4 text-primary" />
                  }
                </button>
              </li>
            } @empty {
              <li class="px-3 py-2 text-sm text-muted-foreground">
                No industries found
              </li>
            }
          </ul>
        </div>
      }
    </div>

    <!-- Backdrop to close dropdown -->
    @if (isOpen()) {
      <div
        class="fixed inset-0 z-0"
        (click)="closeDropdown()"
      ></div>
    }
  `,
})
export class IndustrySelectComponent implements ControlValueAccessor {
  @Input() industries: readonly string[] = [];

  readonly value = signal<string>('');
  readonly isOpen = signal(false);
  readonly filteredIndustries = signal<readonly string[]>([]);

  searchQuery = '';

  private onChange: (value: string) => void = () => {};
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
