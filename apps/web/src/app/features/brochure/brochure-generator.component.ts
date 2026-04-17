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
            @if (generationStatus()) {
              <span class="generation-status">{{ generationStatus() }}</span>
            }
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

          <!-- Logo upload -->
          <div class="logo-upload">
            <span class="field-label">Logo kompanije</span>
            <div class="upload-row">
              @if (logoUrl()) {
                <img [src]="logoUrl()" class="logo-preview" alt="Logo" />
                <button class="btn-remove" (click)="logoUrl.set('')">Ukloni</button>
              } @else {
                <label class="upload-btn">
                  Uploaduj logo
                  <input type="file" accept="image/*" (change)="onLogoUpload($event)" hidden />
                </label>
              }
            </div>
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
    .title { color: #E6EDF3; font-size: 24px; font-weight: 700; margin: 0; }
    .header-actions { display: flex; gap: 8px; }
    .btn-generate {
      padding: 10px 24px; background: #C9A96E; color: #0D1117; border: none;
      border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
    }
    .btn-generate:disabled { opacity: 0.5; }
    .btn-pdf {
      padding: 10px 24px; background: #58A6FF; color: #E6EDF3; border: none;
      border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
    }

    .section { margin-bottom: 32px; }
    .section-title { color: #E6EDF3; font-size: 16px; font-weight: 600; margin: 0 0 12px; }

    .profiles { display: flex; gap: 8px; flex-wrap: wrap; }
    .profile-card {
      padding: 12px 16px; background: #161B22; border: 1px solid #21262D;
      border-radius: 8px; cursor: pointer; display: flex; flex-direction: column; gap: 4px;
    }
    .profile-card:hover { border-color: #C9A96E; }
    .profile-card.active { border-color: #C9A96E; background: #1A1A2A; }
    .pname { color: #E6EDF3; font-size: 13px; font-weight: 500; }
    .pmeta { color: #C9A96E; font-size: 11px; }

    .config-grid { display: grid; grid-template-columns: 1fr 1fr 100px; gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field-label { color: #9CA3AF; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .field-input {
      padding: 8px 12px; background: #1C2128; border: 1px solid #21262D;
      border-radius: 6px; color: #E6EDF3; font-size: 13px;
    }
    .field-input:focus { outline: none; border-color: #C9A96E; }

    .pages-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
    .page-card { background: #161B22; border: 1px solid #21262D; border-radius: 8px; padding: 12px; }

    .preview-frame { background: #161B22; border-radius: 8px; padding: 12px; }
    .preview-iframe { width: 100%; height: 600px; border: none; border-radius: 4px; background: #0D1117; }

    .slot-panel {
      position: fixed; bottom: 0; right: 0; width: 300px; background: #161B22;
      border: 1px solid #C9A96E40; border-radius: 8px 0 0 0; padding: 16px; z-index: 10;
    }
    .panel-title { color: #C9A96E; font-size: 14px; margin: 0 0 8px; }
    .panel-info { display: flex; flex-direction: column; gap: 4px; color: #9CA3AF; font-size: 12px; }

    .logo-upload { margin-top: 12px; }
    .upload-row { display: flex; align-items: center; gap: 12px; margin-top: 4px; }
    .logo-preview { height: 48px; max-width: 200px; object-fit: contain; background: #1C2128; border-radius: 6px; padding: 4px; }
    .upload-btn {
      padding: 8px 16px; background: #1C2128; border: 1px dashed #21262D;
      border-radius: 6px; color: #58A6FF; cursor: pointer; font-size: 13px;
    }
    .upload-btn:hover { border-color: #58A6FF; }
    .btn-remove { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 12px; }

    .generation-status { color: #C9A96E; font-size: 13px; margin-top: 8px; }

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
  generationStatus = signal('');
  previewPages = signal<PageLayout[]>([]);
  previewHtml = signal<string>('');
  selectedSlot = signal<PageComponent | null>(null);
  logoUrl = signal('');

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
    this.generationStatus.set('Generisem tekst pomocu AI...');

    // Step 1: Ask AI to generate text for all slots
    this.http.post<{ data: any }>(`${this.apiBase}/v1/brochure/generate-content`, {
      brandProfileId: profile.id,
      title: this.brochureTitle,
      targetAudience: this.targetAudience,
      logoUrl: this.logoUrl(),
      pages: this.previewPages().map(p => ({
        pageNumber: p.pageNumber,
        pageTitle: p.pageTitle,
        layoutType: p.layoutType,
        components: p.components.map(c => ({
          slotName: c.slotName,
          type: c.type,
          x: c.x, y: c.y, w: c.w, h: c.h,
          fontRole: c.fontRole,
          maxChars: c.maxChars,
          imageDescription: c.imageDescription,
        })),
      })),
    }).subscribe({
      next: (res) => {
        // Update pages with AI-generated content
        const generated = res.data.pages ?? [];
        const updated = this.previewPages().map(page => {
          const genPage = generated.find((g: any) => g.pageNumber === page.pageNumber);
          if (!genPage) return page;
          return {
            ...page,
            components: page.components.map(comp => {
              const genComp = genPage.components?.find((g: any) => g.slotName === comp.slotName);
              if (!genComp) return comp;
              return {
                ...comp,
                content: genComp.content ?? comp.content,
                imageUrl: genComp.imageUrl ?? comp.imageUrl,
                status: 'pending' as const,
              };
            }),
          };
        });
        this.previewPages.set(updated);

        // HTML is now included in the same response
        if (res.data.html) {
          this.previewHtml.set(res.data.html);
          this.generating.set(false);
          this.generationStatus.set('Gotovo!');
        } else {
          this.generating.set(false);
          this.generationStatus.set('Generisano, ali HTML renderovanje nije uspelo');
        }
      },
      error: (err) => {
        this.generating.set(false);
        const detail = err?.error?.detail ?? err?.message ?? 'Nepoznata greska';
        this.generationStatus.set('Greska pri generisanju: ' + detail);
        console.error('Brochure generate error:', err);
      },
    });
  }

  private renderHtml(profileId: string, pages: PageLayout[]): void {
    const apiPages = pages.map(p => ({
      pageNumber: p.pageNumber,
      layoutType: p.layoutType,
      components: p.components.map(c => ({
        slotName: c.slotName,
        type: c.type,
        x: c.x, y: c.y, w: c.w, h: c.h,
        fontRole: c.fontRole,
        content: c.content,
        imageUrl: c.imageUrl,
      })),
    }));

    // Use relative URL through Vite proxy instead of absolute URL
    const url = `${this.apiBase}/v1/brochure/preview`;
    const payload = { brandProfileId: profileId, pages: apiPages };
    console.log('[Brochure] POST', url, JSON.stringify(payload).slice(0, 200));

    this.http.post<{ data: { html: string } }>(url, payload).subscribe({
      next: (res) => {
        this.previewHtml.set(res.data.html);
        this.generating.set(false);
        this.generationStatus.set('Gotovo!');
      },
      error: (err) => {
        this.generating.set(false);
        const detail = err?.error?.detail ?? err?.message ?? JSON.stringify(err?.error ?? 'Unknown');
        this.generationStatus.set('Greska pri renderovanju: ' + detail);
        console.error('Brochure render error:', err);
      },
    });
  }

  downloadPdf(): void {
    const html = this.previewHtml();
    if (!html) return;
    this.generationStatus.set('Generisem PDF...');
    this.http.post(`${this.apiBase}/v1/brochure/pdf`, { html }, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `brochure-${Date.now()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        this.generationStatus.set('PDF preuzet!');
      },
      error: (err) => {
        console.error('PDF error:', err);
        // Fallback: download as HTML
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `brochure-${Date.now()}.html`;
        a.click();
        URL.revokeObjectURL(url);
        this.generationStatus.set('PDF nije dostupan — preuzet kao HTML');
      },
    });
  }

  onLogoUpload(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.logoUrl.set(reader.result as string);
    reader.readAsDataURL(file);
  }

  onSlotClicked(comp: PageComponent): void {
    this.selectedSlot.set(comp);
  }
}
