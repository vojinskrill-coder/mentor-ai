import { Component, HostListener, OnDestroy, OnInit, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TourStep {
  target: string; // CSS selector for the target element
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STORAGE_KEY = 'mentor_ai_feature_tour_v1';

const TOUR_STEPS: TourStep[] = [
  {
    target: '.sidebar',
    title: 'Navigacija razgovora',
    description:
      'Ovde nalazite sve vaše razgovore organizovane po poslovnim konceptima. Kliknite na razgovor da ga otvorite.',
    position: 'right',
  },
  {
    target: '.new-chat-btn',
    title: 'Novi razgovor',
    description: 'Kliknite ovde da započnete novi razgovor sa vašim AI poslovnim savetnikom.',
    position: 'right',
  },
  {
    target: '.chat-main',
    title: 'Prostor za razgovor',
    description:
      'Ovde se prikazuju poruke — vaša pitanja i odgovori AI-a sa citiranjima i ocenama pouzdanosti.',
    position: 'left',
  },
  {
    target: 'app-chat-input',
    title: 'Unos poruke',
    description:
      'Postavite pitanja, zatražite analize ili pokrenite zadatke. AI će automatski kreirati i izvršiti poslovne zadatke.',
    position: 'top',
  },
  {
    target: '.auto-ai-toggle',
    title: 'Automatski AI režim',
    description:
      'Kada je uključen, AI autonomno popunjava i ocenjuje sve kreirane zadatke bez čekanja na vašu potvrdu.',
    position: 'bottom',
  },
  {
    target: '.sidebar-footer',
    title: 'Podešavanja',
    description:
      'Pristupite konfiguraciji AI provajdera, upravljanju timom i podešavanjima naloga.',
    position: 'right',
  },
];

@Component({
  selector: 'app-feature-tour',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      :host {
        display: block;
      }

      .tour-overlay {
        position: fixed;
        inset: 0;
        z-index: 9998;
        background: transparent;
      }

      .tour-spotlight {
        position: fixed;
        z-index: 9999;
        border-radius: 8px;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6);
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: none;
      }

      .tour-tooltip {
        position: fixed;
        z-index: 10000;
        width: 340px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        font-family: 'Inter', system-ui, sans-serif;
        color: #fafafa;
        animation: tooltipFadeIn 0.3s ease-out;
      }
      @keyframes tooltipFadeIn {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .tooltip-arrow {
        position: absolute;
        width: 12px;
        height: 12px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        transform: rotate(45deg);
      }
      .arrow-top {
        top: -7px;
        left: 24px;
        border-bottom: none;
        border-right: none;
      }
      .arrow-bottom {
        bottom: -7px;
        left: 24px;
        border-top: none;
        border-left: none;
      }
      .arrow-left {
        left: -7px;
        top: 24px;
        border-top: none;
        border-right: none;
      }
      .arrow-right {
        right: -7px;
        top: 24px;
        border-bottom: none;
        border-left: none;
      }

      .tooltip-step {
        font-size: 11px;
        font-weight: 600;
        color: #3b82f6;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 8px;
      }
      .tooltip-title {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .tooltip-desc {
        font-size: 13px;
        color: #a1a1a1;
        line-height: 1.5;
        margin-bottom: 20px;
      }

      .tooltip-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .tooltip-progress {
        display: flex;
        gap: 4px;
      }
      .progress-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #2a2a2a;
        transition: background 0.2s;
      }
      .progress-dot.active {
        background: #3b82f6;
      }
      .progress-dot.completed {
        background: #22c55e;
      }

      .tooltip-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .tour-btn {
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        border: none;
        transition: background 0.15s;
      }
      .tour-btn-skip {
        background: transparent;
        color: #9e9e9e;
        padding: 8px 12px;
      }
      .tour-btn-skip:hover {
        color: #fafafa;
      }
      .tour-btn-prev {
        background: #242424;
        color: #fafafa;
        border: 1px solid #2a2a2a;
      }
      .tour-btn-prev:hover {
        background: #2a2a2a;
      }
      .tour-btn-next {
        background: #3b82f6;
        color: white;
      }
      .tour-btn-next:hover {
        background: #2563eb;
      }

      /* Welcome screen */
      .welcome-overlay {
        position: fixed;
        inset: 0;
        z-index: 9998;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.7);
        animation: tooltipFadeIn 0.3s ease-out;
      }
      .welcome-card {
        width: 100%;
        max-width: 420px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 16px;
        padding: 32px;
        text-align: center;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
        font-family: 'Inter', system-ui, sans-serif;
        color: #fafafa;
        z-index: 9999;
      }
      .welcome-icon {
        width: 56px;
        height: 56px;
        margin: 0 auto 20px;
        color: #3b82f6;
      }
      .welcome-card h2 {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 12px;
      }
      .welcome-card p {
        font-size: 14px;
        color: #a1a1a1;
        line-height: 1.6;
        margin-bottom: 24px;
      }
      .welcome-actions {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .welcome-start-btn {
        padding: 12px 24px;
        border-radius: 8px;
        border: none;
        background: #3b82f6;
        color: white;
        font-size: 15px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .welcome-start-btn:hover {
        background: #2563eb;
      }
      .welcome-skip-btn {
        background: none;
        border: none;
        color: #9e9e9e;
        font-size: 13px;
        cursor: pointer;
        font-family: inherit;
      }
      .welcome-skip-btn:hover {
        color: #fafafa;
      }
    `,
  ],
  template: `
    @if (showWelcome$()) {
      <div class="welcome-overlay">
        <div class="welcome-card" role="dialog" aria-label="Dobrodošli u vodič">
          <svg class="welcome-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <h2>Upoznajte Mentor AI</h2>
          <p>
            Brzi vodič kroz ključne funkcije platforme. Naučite kako da koristite AI poslovnog
            savetnika, upravljate razgovorima i pratite napredak vašeg tima.
          </p>
          <div class="welcome-actions">
            <button class="welcome-start-btn" (click)="startTour()">Započni vodič</button>
            <button class="welcome-skip-btn" (click)="skipTour()">Preskoči za sada</button>
          </div>
        </div>
      </div>
    }

    @if (isActive$() && !showWelcome$()) {
      <div class="tour-overlay" (click)="skipTour()"></div>

      <div
        class="tour-spotlight"
        [style.top.px]="spotlightRect$().top"
        [style.left.px]="spotlightRect$().left"
        [style.width.px]="spotlightRect$().width"
        [style.height.px]="spotlightRect$().height"
      ></div>

      <div
        class="tour-tooltip"
        role="dialog"
        aria-label="Vodič kroz funkcije"
        [style.top.px]="tooltipPos$().top"
        [style.left.px]="tooltipPos$().left"
      >
        <div
          class="tooltip-arrow"
          [class.arrow-top]="currentStep$().position === 'bottom'"
          [class.arrow-bottom]="currentStep$().position === 'top'"
          [class.arrow-left]="currentStep$().position === 'right'"
          [class.arrow-right]="currentStep$().position === 'left'"
        ></div>
        <div class="tooltip-step">Korak {{ currentIndex$() + 1 }} od {{ steps.length }}</div>
        <div class="tooltip-title">{{ currentStep$().title }}</div>
        <div class="tooltip-desc">{{ currentStep$().description }}</div>
        <div class="tooltip-footer">
          <div class="tooltip-progress">
            @for (step of steps; track $index) {
              <div
                class="progress-dot"
                [class.active]="$index === currentIndex$()"
                [class.completed]="$index < currentIndex$()"
              ></div>
            }
          </div>
          <div class="tooltip-actions">
            <button class="tour-btn tour-btn-skip" (click)="skipTour()">Preskoči</button>
            @if (currentIndex$() > 0) {
              <button class="tour-btn tour-btn-prev" (click)="prevStep()">Nazad</button>
            }
            <button class="tour-btn tour-btn-next" (click)="nextStep()">
              {{ currentIndex$() === steps.length - 1 ? 'Završi' : 'Dalje' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class FeatureTourComponent implements OnInit, OnDestroy {
  readonly tourComplete = output<void>();

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isActive$() || this.showWelcome$()) {
      this.skipTour();
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.isActive$()) {
      this.positionTooltip();
    }
  }

  readonly steps = TOUR_STEPS;
  readonly showWelcome$ = signal(false);
  readonly isActive$ = signal(false);
  readonly currentIndex$ = signal(0);
  readonly currentStep$ = signal<TourStep>(TOUR_STEPS[0]!);
  readonly spotlightRect$ = signal({ top: 0, left: 0, width: 0, height: 0 });
  readonly tooltipPos$ = signal({ top: 0, left: 0 });

  private resizeObserver?: ResizeObserver;

  ngOnInit(): void {
    // Show welcome screen if tour hasn't been completed
    if (!this.isTourCompleted()) {
      // Small delay to let the chat UI render first
      setTimeout(() => this.showWelcome$.set(true), 800);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  /** Called externally when user clicks "Brzi vodič" */
  launchTour(): void {
    this.currentIndex$.set(0);
    this.currentStep$.set(TOUR_STEPS[0]!);
    this.showWelcome$.set(true);
  }

  startTour(): void {
    this.showWelcome$.set(false);
    this.isActive$.set(true);
    this.currentIndex$.set(0);
    this.currentStep$.set(TOUR_STEPS[0]!);
    this.positionTooltip();
    this.listenForResize();
  }

  skipTour(): void {
    this.isActive$.set(false);
    this.showWelcome$.set(false);
    this.markTourCompleted();
    this.resizeObserver?.disconnect();
    this.tourComplete.emit();
  }

  nextStep(): void {
    const next = this.currentIndex$() + 1;
    if (next >= this.steps.length) {
      this.isActive$.set(false);
      this.markTourCompleted();
      this.resizeObserver?.disconnect();
      this.tourComplete.emit();
      return;
    }
    this.currentIndex$.set(next);
    this.currentStep$.set(this.steps[next]!);
    this.positionTooltip();
  }

  prevStep(): void {
    const prev = this.currentIndex$() - 1;
    if (prev < 0) return;
    this.currentIndex$.set(prev);
    this.currentStep$.set(this.steps[prev]!);
    this.positionTooltip();
  }

  private positionTooltip(): void {
    const step = this.currentStep$();
    const el = document.querySelector(step.target);

    if (!el) {
      // Target not found — skip to next viable step
      const next = this.currentIndex$() + 1;
      if (next < this.steps.length) {
        this.currentIndex$.set(next);
        this.currentStep$.set(this.steps[next]!);
        setTimeout(() => this.positionTooltip(), 50);
      } else {
        // All steps exhausted with no visible targets
        this.skipTour();
      }
      return;
    }

    const rect = el.getBoundingClientRect();
    const padding = 8;

    this.spotlightRect$.set({
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });

    const tooltipW = 340;
    const tooltipH = 200; // Approximate
    const gap = 16;

    let top = 0;
    let left = 0;

    switch (step.position) {
      case 'right':
        top = rect.top;
        left = rect.right + gap;
        if (left + tooltipW > window.innerWidth) {
          // Fall back to bottom
          left = Math.max(16, rect.left);
          top = rect.bottom + gap;
        }
        break;
      case 'left':
        top = rect.top;
        left = rect.left - tooltipW - gap;
        if (left < 16) {
          left = Math.max(16, rect.left);
          top = rect.bottom + gap;
        }
        break;
      case 'bottom':
        top = rect.bottom + gap;
        left = Math.max(16, rect.left + rect.width / 2 - tooltipW / 2);
        break;
      case 'top':
        top = rect.top - tooltipH - gap;
        left = Math.max(16, rect.left + rect.width / 2 - tooltipW / 2);
        if (top < 16) {
          top = rect.bottom + gap;
        }
        break;
    }

    // Clamp to viewport
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipW - 16));
    top = Math.max(16, top);

    this.tooltipPos$.set({ top, left });
  }

  private listenForResize(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      if (this.isActive$()) {
        this.positionTooltip();
      }
    });
    this.resizeObserver.observe(document.body);
  }

  private isTourCompleted(): boolean {
    try {
      return localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private markTourCompleted(): void {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch {
      // localStorage unavailable
    }
  }
}
