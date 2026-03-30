import { Component, input, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';

export interface CalendarItem {
  date: string; // ISO date
  title: string;
  channel: string;
  status: 'published' | 'scheduled' | 'draft';
  url?: string;
}

interface CalendarDay {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  items: CalendarItem[];
}

@Component({
  selector: 'app-content-calendar',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="calendar">
      <div class="calendar-header">
        <button class="nav-btn" (click)="prevMonth()">&larr;</button>
        <span class="month-label">{{ monthLabel() }}</span>
        <button class="nav-btn" (click)="nextMonth()">&rarr;</button>
      </div>

      <div class="weekday-row">
        @for (day of weekdays; track day) {
          <div class="weekday">{{ day }}</div>
        }
      </div>

      <div class="days-grid">
        @for (day of calendarDays(); track day.date.toISOString()) {
          <div class="day-cell" [class.other-month]="!day.isCurrentMonth" [class.has-items]="day.items.length > 0"
               (click)="selectedDate.set(day.date)">
            <span class="day-num">{{ day.day }}</span>
            <div class="day-dots">
              @for (item of day.items; track item.title) {
                <span class="dot" [class]="'dot-' + item.status" [title]="item.title"></span>
              }
            </div>
          </div>
        }
      </div>

      @if (selectedDayItems().length > 0) {
        <div class="day-detail">
          <h4 class="detail-date">{{ selectedDate() | date:'d. MMMM' }}</h4>
          @for (item of selectedDayItems(); track item.title) {
            <div class="detail-item">
              <span class="detail-status" [class]="'status-' + item.status">{{ item.status }}</span>
              <span class="detail-channel">{{ item.channel }}</span>
              <span class="detail-title">{{ item.title }}</span>
              @if (item.url) {
                <a class="detail-link" [href]="item.url" target="_blank">Otvori</a>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .calendar { display: flex; flex-direction: column; gap: 8px; }

    .calendar-header { display: flex; align-items: center; justify-content: space-between; }
    .nav-btn {
      background: none; border: none; color: #3B82F6; cursor: pointer;
      font-size: 16px; padding: 4px 8px;
    }
    .month-label { color: #FAFAFA; font-size: 14px; font-weight: 600; }

    .weekday-row { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
    .weekday { color: #6B7280; font-size: 10px; text-align: center; padding: 4px; }

    .days-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
    .day-cell {
      aspect-ratio: 1; background: #1A1A1A; border-radius: 4px; padding: 4px;
      cursor: pointer; display: flex; flex-direction: column; align-items: center;
      border: 1px solid transparent; min-height: 40px;
    }
    .day-cell:hover { border-color: #2A2A2A; }
    .day-cell.has-items { border-color: #2A2A2A; }
    .day-cell.other-month { opacity: 0.3; }
    .day-num { color: #FAFAFA; font-size: 11px; }
    .day-dots { display: flex; gap: 2px; margin-top: 2px; }
    .dot { width: 6px; height: 6px; border-radius: 50%; }
    .dot-published { background: #22c55e; }
    .dot-scheduled { background: #C9A96E; }
    .dot-draft { background: #6B7280; }

    .day-detail {
      background: #242424; border-radius: 6px; padding: 12px; margin-top: 8px;
    }
    .detail-date { color: #FAFAFA; font-size: 13px; margin: 0 0 8px; }
    .detail-item { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
    .detail-status { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px; }
    .status-published { background: #22c55e20; color: #22c55e; }
    .status-scheduled { background: #C9A96E20; color: #C9A96E; }
    .status-draft { background: #6B728020; color: #6B7280; }
    .detail-channel { color: #3B82F6; font-size: 11px; font-weight: 600; }
    .detail-title { color: #FAFAFA; font-size: 12px; flex: 1; }
    .detail-link { color: #3B82F6; font-size: 11px; text-decoration: none; }
  `],
})
export class ContentCalendarComponent {
  items = input<CalendarItem[]>([]);
  weekdays = ['Pon', 'Uto', 'Sre', 'Cet', 'Pet', 'Sub', 'Ned'];

  currentMonth = signal(new Date());
  selectedDate = signal(new Date());

  monthLabel = computed(() => {
    const d = this.currentMonth();
    return d.toLocaleDateString('sr-Latn-RS', { month: 'long', year: 'numeric' });
  });

  calendarDays = computed<CalendarDay[]>(() => {
    const month = this.currentMonth();
    const year = month.getFullYear();
    const m = month.getMonth();
    const firstDay = new Date(year, m, 1);
    const lastDay = new Date(year, m + 1, 0);

    // Start from Monday of the week containing the 1st
    const startOffset = (firstDay.getDay() + 6) % 7;
    const start = new Date(year, m, 1 - startOffset);

    const days: CalendarDay[] = [];
    const items = this.items();

    for (let i = 0; i < 42; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const dateStr = date.toISOString().split('T')[0] ?? '';

      days.push({
        date: new Date(date),
        day: date.getDate(),
        isCurrentMonth: date.getMonth() === m,
        items: items.filter(item => item.date.startsWith(dateStr)),
      });
    }

    return days;
  });

  selectedDayItems = computed(() => {
    const sel = this.selectedDate();
    const dateStr = sel.toISOString().split('T')[0] ?? '';
    return this.items().filter(item => item.date.startsWith(dateStr));
  });

  prevMonth(): void {
    this.currentMonth.update(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  nextMonth(): void {
    this.currentMonth.update(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
}
