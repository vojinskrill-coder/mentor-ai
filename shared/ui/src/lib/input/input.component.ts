import { Component, computed, input, output, signal, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

export type InputType = 'text' | 'password' | 'email' | 'number' | 'tel' | 'url' | 'search';
export type InputState = 'default' | 'error' | 'success';

@Component({
  selector: 'ui-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true,
    },
  ],
  template: `
    <div class="flex flex-col gap-1.5">
      @if (label()) {
        <label
          [for]="inputId()"
          class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          [class.text-destructive]="state() === 'error'"
        >
          {{ label() }}
          @if (required()) {
            <span class="text-destructive" aria-hidden="true">*</span>
          }
        </label>
      }

      <div class="relative">
        <input
          [id]="inputId()"
          [type]="currentType()"
          [class]="inputClasses()"
          [placeholder]="placeholder()"
          [disabled]="isDisabled()"
          [readonly]="readonly()"
          [required]="required()"
          [attr.aria-invalid]="state() === 'error'"
          [attr.aria-describedby]="describedBy()"
          [attr.aria-label]="ariaLabel() || label()"
          [attr.autocomplete]="autocomplete()"
          [(ngModel)]="internalValue"
          (ngModelChange)="onValueChange($event)"
          (blur)="onTouched()"
          (focus)="onFocus()"
        />

        @if (type() === 'password') {
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            (click)="togglePasswordVisibility()"
            [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
          >
            @if (showPassword()) {
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            } @else {
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            }
          </button>
        }
      </div>

      @if (helperText() && state() !== 'error') {
        <p
          [id]="helperId()"
          class="text-sm text-muted-foreground"
        >
          {{ helperText() }}
        </p>
      }

      @if (errorMessage() && state() === 'error') {
        <p
          [id]="errorId()"
          class="text-sm text-destructive"
          role="alert"
        >
          {{ errorMessage() }}
        </p>
      }

      @if (successMessage() && state() === 'success') {
        <p
          [id]="successId()"
          class="text-sm text-green-500"
        >
          {{ successMessage() }}
        </p>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `],
})
export class InputComponent implements ControlValueAccessor {
  private static idCounter = 0;

  // Inputs using Angular Signals
  readonly type = input<InputType>('text');
  readonly label = input<string>('');
  readonly placeholder = input<string>('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly required = input(false);
  readonly state = input<InputState>('default');
  readonly helperText = input<string>('');
  readonly errorMessage = input<string>('');
  readonly successMessage = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly autocomplete = input<string>('off');

  // Internal state
  readonly showPassword = signal(false);
  readonly inputId = signal(`ui-input-${++InputComponent.idCounter}`);
  private readonly _formDisabled = signal(false);
  internalValue = '';

  // Computed disabled state (combines input and form control)
  readonly isDisabled = computed(() => this.disabled() || this._formDisabled());

  // Outputs
  readonly valueChange = output<string>();
  readonly inputFocus = output<void>();
  readonly inputBlur = output<void>();

  // ControlValueAccessor callbacks
  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  // Computed IDs for accessibility
  readonly helperId = computed(() => `${this.inputId()}-helper`);
  readonly errorId = computed(() => `${this.inputId()}-error`);
  readonly successId = computed(() => `${this.inputId()}-success`);

  readonly describedBy = computed(() => {
    const ids: string[] = [];
    if (this.helperText() && this.state() !== 'error') {
      ids.push(this.helperId());
    }
    if (this.errorMessage() && this.state() === 'error') {
      ids.push(this.errorId());
    }
    if (this.successMessage() && this.state() === 'success') {
      ids.push(this.successId());
    }
    return ids.length > 0 ? ids.join(' ') : null;
  });

  readonly currentType = computed(() => {
    if (this.type() === 'password') {
      return this.showPassword() ? 'text' : 'password';
    }
    return this.type();
  });

  // Computed classes
  readonly inputClasses = computed(() => {
    const base = [
      'flex',
      'h-10',
      'w-full',
      'rounded-lg',
      'border',
      'bg-transparent',
      'px-3',
      'py-2',
      'text-sm',
      'transition-colors',
      'file:border-0',
      'file:bg-transparent',
      'file:text-sm',
      'file:font-medium',
      'placeholder:text-muted-foreground',
      'focus-visible:outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-ring',
      'focus-visible:ring-offset-2',
      'focus-visible:ring-offset-background',
      'disabled:cursor-not-allowed',
      'disabled:opacity-50',
    ].join(' ');

    const states: Record<InputState, string> = {
      default: 'border-input',
      error: 'border-destructive focus-visible:ring-destructive',
      success: 'border-green-500 focus-visible:ring-green-500',
    };

    const passwordPadding = this.type() === 'password' ? 'pr-10' : '';

    return `${base} ${states[this.state()]} ${passwordPadding}`;
  });

  togglePasswordVisibility(): void {
    this.showPassword.update((show) => !show);
  }

  onValueChange(value: string): void {
    this.internalValue = value;
    this.onChange(value);
    this.valueChange.emit(value);
  }

  onFocus(): void {
    this.inputFocus.emit();
  }

  // ControlValueAccessor implementation
  writeValue(value: string): void {
    this.internalValue = value ?? '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this._formDisabled.set(isDisabled);
  }
}
