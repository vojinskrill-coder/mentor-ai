import { Component, input, output, signal } from '@angular/core';

export interface PageComponent {
  slotName: string;
  name?: string;
  type: 'text' | 'image';
  x: number; // percentage
  y: number;
  w: number;
  h: number;
  fontRole?: string;
  maxChars?: number;
  content?: string;
  imageUrl?: string;
  imageDescription?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'regenerating';
  feedback?: string;
}

export interface PageLayout {
  pageNumber: number;
  pageTitle?: string;
  layoutType: string;
  components: PageComponent[];
}

@Component({
  selector: 'app-brochure-page-viewer',
  standalone: true,
  template: `
    <div class="page-viewer">
      <div class="page-header">
        <span class="page-num">Stranica {{ page().pageNumber }}</span>
        <span class="page-type">{{ page().layoutType }}</span>
        @if (page().pageTitle) {
          <span class="page-title">{{ page().pageTitle }}</span>
        }
      </div>

      <div class="page-frame" [class.wireframe]="mode() === 'wireframe'" [class.content]="mode() === 'content'">
        @for (comp of page().components; track comp.slotName) {
          <div class="slot"
            [class.text-slot]="comp.type === 'text'"
            [class.image-slot]="comp.type === 'image'"
            [class.approved]="comp.status === 'approved'"
            [class.rejected]="comp.status === 'rejected'"
            [class.selected]="selectedSlot() === comp.slotName"
            [style.left.%]="comp.x"
            [style.top.%]="comp.y"
            [style.width.%]="comp.w"
            [style.height.%]="comp.h"
            (click)="selectSlot(comp)">

            @if (mode() === 'wireframe') {
              <!-- Wireframe: empty slots with labels -->
              <div class="slot-label">
                <span class="slot-type">{{ comp.type === 'text' ? '📝' : '🖼️' }}</span>
                <span class="slot-name">{{ comp.slotName }}</span>
                @if (comp.fontRole) {
                  <span class="slot-role">{{ comp.fontRole }}</span>
                }
                @if (comp.maxChars) {
                  <span class="slot-chars">max {{ comp.maxChars }}</span>
                }
              </div>
            }

            @if (mode() === 'content') {
              <!-- Content: filled slots -->
              @if (comp.type === 'text' && comp.content) {
                <div class="slot-text" [class]="'role-' + (comp.fontRole ?? 'body')">
                  {{ comp.content }}
                </div>
              }
              @if (comp.type === 'image' && comp.imageUrl) {
                <img class="slot-image" [src]="comp.imageUrl" [alt]="comp.imageDescription ?? ''" />
              }
              @if (comp.type === 'image' && !comp.imageUrl) {
                <div class="slot-placeholder">
                  <span>🖼️</span>
                  <span class="ph-text">{{ comp.imageDescription ?? 'Slika' }}</span>
                </div>
              }
              @if (comp.type === 'text' && !comp.content) {
                <div class="slot-placeholder">
                  <span>📝</span>
                  <span class="ph-text">{{ comp.slotName }}</span>
                </div>
              }

              <!-- Status indicator -->
              @if (comp.status) {
                <div class="status-badge" [class]="'status-' + comp.status">
                  @if (comp.status === 'approved') { ✓ }
                  @if (comp.status === 'pending') { ⏳ }
                  @if (comp.status === 'rejected') { ✗ }
                  @if (comp.status === 'regenerating') { 🔄 }
                </div>
              }
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page-viewer { display: flex; flex-direction: column; gap: 8px; }

    .page-header { display: flex; align-items: center; gap: 8px; }
    .page-num { color: #E6EDF3; font-size: 13px; font-weight: 600; }
    .page-type { color: #C9A96E; font-size: 11px; background: #C9A96E15; padding: 2px 8px; border-radius: 4px; }
    .page-title { color: #6B7280; font-size: 12px; }

    .page-frame {
      width: 100%; aspect-ratio: 1.414 / 1; /* A4 landscape spread */
      background: #0D1117; border: 1px solid #21262D; border-radius: 6px;
      position: relative; overflow: hidden;
    }

    .slot {
      position: absolute; border-radius: 3px; cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .slot:hover { box-shadow: 0 0 0 2px #58A6FF40; z-index: 2; }
    .slot.selected { box-shadow: 0 0 0 2px #58A6FF; z-index: 3; }
    .slot.approved { box-shadow: 0 0 0 1px #22c55e40; }
    .slot.rejected { box-shadow: 0 0 0 1px #ef444440; }

    /* Wireframe mode */
    .wireframe .text-slot { border: 1px dashed #58A6FF40; background: #58A6FF08; }
    .wireframe .image-slot { border: 1px dashed #C9A96E40; background: #C9A96E08; }

    .slot-label {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100%; gap: 2px; padding: 4px;
    }
    .slot-type { font-size: 14px; }
    .slot-name { color: #6B7280; font-size: 8px; text-align: center; overflow: hidden; text-overflow: ellipsis; }
    .slot-role { color: #C9A96E; font-size: 7px; font-weight: 600; }
    .slot-chars { color: #58A6FF; font-size: 7px; }

    /* Content mode */
    .content .text-slot { border: 1px solid transparent; }
    .content .image-slot { border: 1px solid transparent; }

    .slot-text {
      padding: 3px; overflow: hidden; height: 100%;
      font-family: var(--font-body, 'Montserrat', sans-serif);
    }
    .role-h1 { color: #C9A96E; font-family: 'Playfair Display', serif; font-size: 11px; font-style: italic; text-transform: uppercase; letter-spacing: 1px; font-weight: 400; }
    .role-h2 { color: #FFFFFF; font-family: 'Playfair Display', serif; font-size: 9px; font-style: italic; }
    .role-subtitle { color: #FFFFFF; font-size: 7px; font-style: italic; font-weight: 300; }
    .role-body { color: #B0B0B0; font-size: 6px; line-height: 1.6; font-weight: 300; }
    .role-caption { color: #808080; font-size: 5px; }
    .role-quote { color: #808080; font-size: 5.5px; font-style: italic; }

    .slot-image { width: 100%; height: 100%; object-fit: cover; border-radius: 2px; }

    .slot-placeholder {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100%; background: #161B22; gap: 4px;
    }
    .ph-text { color: #6B7280; font-size: 7px; text-align: center; }

    .status-badge {
      position: absolute; top: 2px; right: 2px; width: 14px; height: 14px;
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 8px;
    }
    .status-approved { background: #22c55e; color: #0D1117; }
    .status-pending { background: #C9A96E; color: #0D1117; }
    .status-rejected { background: #ef4444; color: #E6EDF3; }
    .status-regenerating { background: #58A6FF; color: #E6EDF3; }
  `],
})
export class BrochurePageViewerComponent {
  page = input.required<PageLayout>();
  mode = input<'wireframe' | 'content'>('wireframe');
  selectedSlot = signal<string | null>(null);
  componentSelected = output<PageComponent>();

  selectSlot(comp: PageComponent): void {
    this.selectedSlot.set(comp.slotName);
    this.componentSelected.emit(comp);
  }
}
