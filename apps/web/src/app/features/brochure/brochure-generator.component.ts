import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { BrochurePageViewerComponent, PageLayout, PageComponent } from './components/brochure-page-viewer.component';

@Component({
  selector: 'app-brochure-generator',
  standalone: true,
  imports: [FormsModule, BrochurePageViewerComponent],
  template: `
    <div class="brochure-gen">
      <div class="header">
        <h1 class="title">Generisanje brosure</h1>
        <div class="header-actions">
          @if (selectedProfile()) {
            <button class="btn-generate" [disabled]="generating()" (click)="generatePreview()">
              @if (generating()) { Generisem... } @else { Generisi preview }
            </button>
          }
          @if (previewHtml()) {
            <button class="btn-pdf" (click)="downloadPdf()">Preuzmi PDF</button>
          }
        </div>
      </div>

      <!-- Step 1: Select brand profile -->
      <div class="section">
        <h2 class="section-title">1. Izaberi dizajn profil</h2>
        <div class="profiles">
          @for (profile of profiles(); track profile.id) {
            <div class="profile-card" [class.active]="selectedProfile()?.id === profile.id" (click)="selectProfile(profile)">
              <span class="pname">{{ profile.name }}</span>
              <span class="pmeta">{{ profile.pageCount }} paterna</span>
            </div>
          }
        </div>
      </div>

      <!-- Step 2: Configure brochure -->
      @if (selectedProfile()) {
        <div class="section">
          <h2 class="section-title">2. Konfigurisi brosuru</h2>
          <div class="config-grid">
            <label class="field">
              <span class="field-label">Naslov</span>
              <input class="field-input" [(ngModel)]="brochureTitle" placeholder="B2B Katalog za Arhitekte" />
            </label>
            <label class="field">
              <span class="field-label">Ciljna publika</span>
              <input class="field-input" [(ngModel)]="targetAudience" placeholder="Arhitekte, interijor dizajneri" />
            </label>
            <label class="field">
              <span class="field-label">Broj stranica</span>
              <input type="number" class="field-input" [(ngModel)]="pageCount" min="4" max="24" />
            </label>
          </div>
        </div>

        <!-- Step 3: Layout preview -->
        <div class="section">
          <h2 class="section-title">3. Layout preview</h2>
          <div class="pages-grid">
            @for (page of previewPages(); track page.pageNumber) {
              <div class="page-card">
                <app-brochure-page-viewer
                  [page]="page"
                  [mode]="previewHtml() ? 'content' : 'wireframe'"
                  (componentSelected)="onSlotClicked($event)"
                />
              </div>
            }
          </div>
          @if (previewPages().length === 0) {
            <div class="empty">Klikni "Generisi preview" da vidis layout.</div>
          }
        </div>
      }

      <!-- HTML Preview iframe -->
      @if (previewHtml()) {
        <div class="section">
          <h2 class="section-title">4. Kompletni preview</h2>
          <div class="preview-frame">
            <iframe [srcdoc]="previewHtml()" class="preview-iframe"></iframe>
          </div>
        </div>
      }

      <!-- Slot detail panel -->
      @if (selectedSlot()) {
        <div class="slot-panel">
          <h3 class="panel-title">{{ selectedSlot()!.slotName }}</h3>
          <div class="panel-info">
            <span>Tip: {{ selectedSlot()!.type }}</span>
            <span>Pozicija: {{ selectedSlot()!.x }}%, {{ selectedSlot()!.y }}%</span>
            <span>Dimenzije: {{ selectedSlot()!.w }}% x {{ selectedSlot()!.h }}%</span>
            @if (selectedSlot()!.fontRole) { <span>Font: {{ selectedSlot()!.fontRole }}</span> }
            @if (selectedSlot()!.maxChars) { <span>Max: {{ selectedSlot()!.maxChars }} chars</span> }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .brochure-gen { padding: 24px; max-width: 1200px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .title { color: #FAFAFA; font-size: 24px; font-weight: 700; margin: 0; }
    .header-actions { display: flex; gap: 8px; }
    .btn-generate {
      padding: 10px 24px; background: #C9A96E; color: #0D0D0D; border: none;
      border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
    }
    .btn-generate:disabled { opacity: 0.5; }
    .btn-pdf {
      padding: 10px 24px; background: #3B82F6; color: #FAFAFA; border: none;
      border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
    }

    .section { margin-bottom: 32px; }
    .section-title { color: #FAFAFA; font-size: 16px; font-weight: 600; margin: 0 0 12px; }

    .profiles { display: flex; gap: 8px; flex-wrap: wrap; }
    .profile-card {
      padding: 12px 16px; background: #1A1A1A; border: 1px solid #2A2A2A;
      border-radius: 8px; cursor: pointer; display: flex; flex-direction: column; gap: 4px;
    }
    .profile-card:hover { border-color: #C9A96E; }
    .profile-card.active { border-color: #C9A96E; background: #1A1A2A; }
    .pname { color: #FAFAFA; font-size: 13px; font-weight: 500; }
    .pmeta { color: #C9A96E; font-size: 11px; }

    .config-grid { display: grid; grid-template-columns: 1fr 1fr 100px; gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field-label { color: #9CA3AF; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .field-input {
      padding: 8px 12px; background: #242424; border: 1px solid #2A2A2A;
      border-radius: 6px; color: #FAFAFA; font-size: 13px;
    }
    .field-input:focus { outline: none; border-color: #C9A96E; }

    .pages-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
    .page-card { background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 8px; padding: 12px; }

    .preview-frame { background: #1A1A1A; border-radius: 8px; padding: 12px; }
    .preview-iframe { width: 100%; height: 600px; border: none; border-radius: 4px; background: #0D0D0D; }

    .slot-panel {
      position: fixed; bottom: 0; right: 0; width: 300px; background: #1A1A1A;
      border: 1px solid #C9A96E40; border-radius: 8px 0 0 0; padding: 16px; z-index: 10;
    }
    .panel-title { color: #C9A96E; font-size: 14px; margin: 0 0 8px; }
    .panel-info { display: flex; flex-direction: column; gap: 4px; color: #9CA3AF; font-size: 12px; }

    .empty { color: #6B7280; text-align: center; padding: 40px; }
  `],
})
export class BrochureGeneratorComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiUrl}/api`;

  profiles = signal<any[]>([]);
  selectedProfile = signal<any>(null);
  brochureTitle = 'B2B Katalog za Arhitekte';
  targetAudience = 'Arhitekte, interijor dizajneri';
  pageCount = 8;
  generating = signal(false);
  previewPages = signal<PageLayout[]>([]);
  previewHtml = signal<string>('');
  selectedSlot = signal<PageComponent | null>(null);

  ngOnInit(): void {
    this.http.get<{ data: any[] }>(`${this.apiBase}/v1/figma/profiles`).subscribe({
      next: (res) => this.profiles.set(res.data),
    });
  }

  selectProfile(profile: any): void {
    this.selectedProfile.set(profile);
    // Auto-generate wireframe from profile patterns
    this.generateWireframes(profile);
  }

  generateWireframes(profile: any): void {
    const patterns = profile.layoutPatterns ?? [];
    const pages: PageLayout[] = [];

    // Use patterns cyclically for the configured page count
    for (let i = 0; i < Math.min(this.pageCount, patterns.length); i++) {
      const p = patterns[i];
      pages.push({
        pageNumber: i + 1,
        pageTitle: p.pageName,
        layoutType: p.description?.slice(0, 40) ?? 'spread',
        components: (p.components ?? []).map((c: any) => ({
          slotName: c.name,
          type: c.type === 'image' || c.hasImageFill ? 'image' : 'text',
          x: c.x,
          y: c.y,
          w: c.w,
          h: c.h,
          fontRole: c.fontRole,
          maxChars: c.maxChars,
          imageDescription: c.imageDescription,
          status: 'pending' as const,
        })),
      });
    }

    this.previewPages.set(pages);
  }

  generatePreview(): void {
    const profile = this.selectedProfile();
    if (!profile) return;

    this.generating.set(true);

    const pages = this.previewPages().map(p => ({
      pageNumber: p.pageNumber,
      layoutType: p.layoutType,
      components: p.components.map(c => ({
        slotName: c.slotName,
        type: c.type,
        x: c.x,
        y: c.y,
        w: c.w,
        h: c.h,
        fontRole: c.fontRole,
        content: c.type === 'text' ? this.generatePlaceholder(c) : undefined,
        imageUrl: c.type === 'image' ? undefined : undefined,
      })),
    }));

    this.http.post<{ data: { html: string } }>(`${this.apiBase}/v1/brochure/preview`, {
      brandProfileId: profile.id,
      pages,
    }).subscribe({
      next: (res) => {
        this.previewHtml.set(res.data.html);
        this.generating.set(false);
      },
      error: () => this.generating.set(false),
    });
  }

  downloadPdf(): void {
    // For now, open HTML in new tab — PDF needs Puppeteer on server
    const blob = new Blob([this.previewHtml()], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  onSlotClicked(comp: PageComponent): void {
    this.selectedSlot.set(comp);
  }

  private generatePlaceholder(comp: PageComponent): string {
    const maxChars = comp.maxChars ?? 100;
    switch (comp.fontRole) {
      case 'h1': return this.brochureTitle.slice(0, maxChars);
      case 'h2': return 'Skulpture koje definisu prostor';
      case 'subtitle': return 'Jedinstvene prostorne statue za savremene enterijere';
      case 'body': return 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.'.slice(0, maxChars);
      case 'quote': return '"Nasa misija je da kreiramo umetnost koja je trajna i ambiciozna."';
      case 'caption': return 'Luxury Statues Adria';
      default: return comp.slotName;
    }
  }
}
