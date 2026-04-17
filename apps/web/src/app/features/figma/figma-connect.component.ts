import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { environment } from '../../../environments/environment';
import { BrochurePageViewerComponent, PageLayout, PageComponent } from '../brochure/components/brochure-page-viewer.component';

@Component({
  selector: 'app-figma-connect',
  standalone: true,
  template: `
    <div class="figma-page">
      <h1 class="page-title">Figma Integracija</h1>

      <!-- Connection status -->
      <div class="section">
        <h2 class="section-title">Konekcija</h2>
        @if (connected()) {
          <div class="status-badge connected">Povezano: {{ figmaEmail() }}</div>
        } @else {
          <button class="connect-btn" (click)="connectFigma()">Povezi Figma nalog</button>
        }
      </div>

      <!-- Extract from file -->
      @if (connected()) {
        <div class="section">
          <h2 class="section-title">Izvuci dizajn profil</h2>
          <p class="hint">Unesi URL Figma fajla iz kog zelis da izvuces stil brosure</p>
          <div class="input-row">
            <input class="url-input" [(ngModel)]="figmaUrl" placeholder="https://www.figma.com/design/sTjPUTmhrfvcKVdfMawdTa/..." />
            <button class="extract-btn" [disabled]="extracting()" (click)="extractProfile()">
              @if (extracting()) { Analiziram... } @else { Analiziraj }
            </button>
          </div>
        </div>
      }

      <!-- Extraction result -->
      @if (extractionResult()) {
        <div class="section result-section">
          <h2 class="section-title">{{ extractionResult()!.fileName }}</h2>
          <div class="stats-grid">
            <div class="stat"><span class="stat-val">{{ extractionResult()!.summary.colors }}</span><span class="stat-label">Boja</span></div>
            <div class="stat"><span class="stat-val">{{ extractionResult()!.summary.typography }}</span><span class="stat-label">Fontova</span></div>
            <div class="stat"><span class="stat-val">{{ extractionResult()!.summary.pages }}</span><span class="stat-label">Stranica</span></div>
            <div class="stat"><span class="stat-val">{{ extractionResult()!.summary.components }}</span><span class="stat-label">Komponenti</span></div>
            <div class="stat"><span class="stat-val">{{ extractionResult()!.summary.spacing }}</span><span class="stat-label">Spacing vrednosti</span></div>
          </div>

          <!-- Color palette -->
          <div class="subsection">
            <h3 class="subsection-title">Palete boja</h3>
            <div class="color-grid">
              @for (color of getColors(); track color.hex) {
                <div class="color-swatch" [style.background]="color.hex">
                  <span class="color-hex">{{ color.hex }}</span>
                </div>
              }
            </div>
          </div>

          <!-- Typography -->
          <div class="subsection">
            <h3 class="subsection-title">Tipografija</h3>
            @for (font of getTypography(); track font.fontFamily + font.fontSize) {
              <div class="type-sample" [style.font-family]="font.fontFamily" [style.font-size.px]="Math.min(font.fontSize, 32)" [style.font-weight]="font.fontWeight">
                {{ font.role }} — {{ font.fontFamily }} {{ font.fontWeight }} ({{ font.fontSize }}px)
              </div>
            }
          </div>

          <!-- Layout patterns -->
          <div class="subsection">
            <h3 class="subsection-title">Layout paterni ({{ extractionResult()!.summary.pages }} stranica)</h3>
            <div class="pages-grid">
              @for (page of getLayoutPatterns(); track page.pageName) {
                <div class="page-thumbnail">
                  <div class="page-frame">
                    @for (comp of page.components; track comp.name) {
                      <div class="comp-box"
                        [style.left.%]="comp.x" [style.top.%]="comp.y"
                        [style.width.%]="comp.w" [style.height.%]="comp.h"
                        [class]="'comp-' + comp.type"
                        [title]="comp.name">
                      </div>
                    }
                  </div>
                  <span class="page-name">{{ page.pageName }}</span>
                </div>
              }
            </div>
          </div>
        </div>
      }

      <!-- Saved profiles -->
      <div class="section">
        <h2 class="section-title">Sacuvani profili</h2>
        @for (profile of profiles(); track profile.id) {
          <div class="profile-card" [class.active]="selectedProfile()?.id === profile.id" (click)="selectProfile(profile)">
            <span class="profile-name">{{ profile.name }}</span>
            <span class="profile-meta">{{ profile.pageCount }} stranica</span>
            <span class="profile-date">{{ profile.createdAt | date:'d. MMM yyyy' }}</span>
          </div>
        }
        @if (profiles().length === 0) {
          <div class="empty">Nema sacuvanih profila. Analiziraj Figma fajl iznad.</div>
        }
      </div>

      <!-- Layout preview when profile selected -->
      @if (selectedProfile()) {
        <div class="section">
          <h2 class="section-title">Layout paterni — {{ selectedProfile()!.name }}</h2>
          <div class="layout-preview-grid">
            @for (page of getProfileLayouts(); track page.pageName; let i = $index) {
              <div class="layout-card">
                <app-brochure-page-viewer
                  [page]="toPageLayout(page, i)"
                  [mode]="'wireframe'"
                  (componentSelected)="onComponentClicked($event)"
                />
                <div class="layout-info">
                  <span class="layout-name">{{ page.pageName }}</span>
                  <span class="layout-desc">{{ page.description }}</span>
                </div>
              </div>
            }
          </div>
        </div>

        @if (clickedComponent()) {
          <div class="component-detail">
            <h3 class="section-title">Komponenta: {{ clickedComponent()!.slotName }}</h3>
            <div class="detail-grid">
              <div class="detail-item"><span class="dl">Tip</span><span>{{ clickedComponent()!.type }}</span></div>
              <div class="detail-item"><span class="dl">Pozicija</span><span>{{ clickedComponent()!.x }}%, {{ clickedComponent()!.y }}%</span></div>
              <div class="detail-item"><span class="dl">Dimenzije</span><span>{{ clickedComponent()!.w }}% x {{ clickedComponent()!.h }}%</span></div>
              @if (clickedComponent()!.fontRole) {
                <div class="detail-item"><span class="dl">Font uloga</span><span>{{ clickedComponent()!.fontRole }}</span></div>
              }
              @if (clickedComponent()!.maxChars) {
                <div class="detail-item"><span class="dl">Max karaktera</span><span>{{ clickedComponent()!.maxChars }}</span></div>
              }
              @if (clickedComponent()!.imageDescription) {
                <div class="detail-item"><span class="dl">Opis slike</span><span>{{ clickedComponent()!.imageDescription }}</span></div>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .figma-page { padding: 24px; max-width: 900px; }
    .page-title { color: #E6EDF3; font-size: 24px; font-weight: 700; margin: 0 0 24px; }

    .section { margin-bottom: 32px; }
    .section-title { color: #E6EDF3; font-size: 16px; font-weight: 600; margin: 0 0 12px; }
    .subsection { margin-top: 20px; }
    .subsection-title { color: #9CA3AF; font-size: 13px; font-weight: 600; text-transform: uppercase; margin: 0 0 8px; letter-spacing: 0.5px; }
    .hint { color: #6B7280; font-size: 13px; margin: 0 0 8px; }

    .status-badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; }
    .connected { background: #22c55e20; color: #22c55e; }

    .connect-btn {
      padding: 10px 24px; background: #7C3AED; color: #E6EDF3; border: none;
      border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
    }
    .connect-btn:hover { background: #6D28D9; }

    .input-row { display: flex; gap: 8px; }
    .url-input {
      flex: 1; padding: 10px 14px; background: #1C2128; border: 1px solid #21262D;
      border-radius: 8px; color: #E6EDF3; font-size: 13px; font-family: monospace;
    }
    .url-input:focus { outline: none; border-color: #7C3AED; }
    .extract-btn {
      padding: 10px 20px; background: #7C3AED; color: #E6EDF3; border: none;
      border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
    }
    .extract-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .result-section { background: #161B22; border: 1px solid #21262D; border-radius: 12px; padding: 20px; }

    .stats-grid { display: flex; gap: 16px; margin-bottom: 16px; }
    .stat { display: flex; flex-direction: column; align-items: center; min-width: 70px; }
    .stat-val { color: #E6EDF3; font-size: 24px; font-weight: 700; }
    .stat-label { color: #6B7280; font-size: 11px; }

    .color-grid { display: flex; flex-wrap: wrap; gap: 6px; }
    .color-swatch {
      width: 60px; height: 40px; border-radius: 6px; display: flex;
      align-items: flex-end; justify-content: center; padding: 2px;
      border: 1px solid #21262D;
    }
    .color-hex { font-size: 8px; color: #FFF; text-shadow: 0 0 3px #000; }

    .type-sample { color: #E6EDF3; margin-bottom: 6px; line-height: 1.3; }

    .pages-grid { display: flex; flex-wrap: wrap; gap: 12px; }
    .page-thumbnail { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .page-frame {
      width: 120px; height: 170px; background: #1C2128; border: 1px solid #21262D;
      border-radius: 4px; position: relative; overflow: hidden;
    }
    .comp-box { position: absolute; border: 1px solid #58A6FF40; border-radius: 2px; }
    .comp-text { background: #58A6FF10; }
    .comp-image { background: #C9A96E10; border-color: #C9A96E40; }
    .comp-frame { background: #22c55e08; border-color: #22c55e20; }
    .comp-shape { background: #9CA3AF10; border-color: #9CA3AF30; }
    .page-name { color: #6B7280; font-size: 10px; max-width: 120px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .profile-card {
      display: flex; align-items: center; gap: 12px; padding: 12px; cursor: pointer;
      background: #161B22; border: 1px solid #21262D; border-radius: 8px; margin-bottom: 8px;
      transition: border-color 0.15s;
    }
    .profile-card:hover { border-color: #58A6FF; }
    .profile-card.active { border-color: #C9A96E; background: #1A1A2A; }
    .profile-name { color: #E6EDF3; font-weight: 500; flex: 1; }
    .profile-meta { color: #C9A96E; font-size: 12px; }
    .profile-date { color: #6B7280; font-size: 11px; }

    .layout-preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 16px; }
    .layout-card { display: flex; flex-direction: column; gap: 8px; }
    .layout-info { display: flex; flex-direction: column; gap: 2px; }
    .layout-name { color: #E6EDF3; font-size: 12px; font-weight: 500; }
    .layout-desc { color: #6B7280; font-size: 11px; }

    .component-detail {
      background: #161B22; border: 1px solid #C9A96E40; border-radius: 8px;
      padding: 16px; margin-top: 16px;
    }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .detail-item { display: flex; flex-direction: column; gap: 2px; }
    .dl { color: #6B7280; font-size: 10px; text-transform: uppercase; font-weight: 600; }
    .detail-item span:last-child { color: #E6EDF3; font-size: 13px; }

    .empty { color: #6B7280; font-size: 13px; padding: 20px; text-align: center; }
  `],
  imports: [FormsModule, DatePipe, BrochurePageViewerComponent],
})
export class FigmaConnectComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly apiBase = `${environment.apiUrl}/api/v1/figma`;

  connected = signal(false);
  figmaEmail = signal('');
  figmaUrl = '';
  extracting = signal(false);
  extractionResult = signal<any>(null);
  profiles = signal<any[]>([]);
  selectedProfile = signal<any>(null);
  clickedComponent = signal<PageComponent | null>(null);

  Math = Math; // expose to template

  ngOnInit(): void {
    this.checkStatus();
    this.loadProfiles();

    // Handle OAuth callback
    const code = this.route.snapshot.queryParams['code'];
    if (code) {
      this.handleCallback(code);
    }
  }

  checkStatus(): void {
    this.http.get<{ data: any }>(`${this.apiBase}/status`).subscribe({
      next: (res) => {
        this.connected.set(res.data.connected);
        this.figmaEmail.set(res.data.email ?? '');
      },
    });
  }

  connectFigma(): void {
    const redirectUri = `${window.location.origin}/figma-callback`;
    this.http.get<{ data: { authUrl: string } }>(`${this.apiBase}/auth?redirectUri=${encodeURIComponent(redirectUri)}`).subscribe({
      next: (res) => window.location.href = res.data.authUrl,
    });
  }

  handleCallback(code: string): void {
    const redirectUri = `${window.location.origin}/figma-callback`;
    this.http.post<{ data: any }>(`${this.apiBase}/callback`, { code, redirectUri }).subscribe({
      next: () => {
        this.connected.set(true);
        this.checkStatus();
      },
    });
  }

  extractProfile(): void {
    const fileKey = this.extractFileKey(this.figmaUrl);
    if (!fileKey) {
      alert('Neispravan Figma URL. Koristi format: https://www.figma.com/design/FILE_KEY/...');
      return;
    }

    this.extracting.set(true);
    this.http.post<{ data: any }>(`${this.apiBase}/extract?fileKey=${fileKey}`, {}).subscribe({
      next: (res) => {
        this.extractionResult.set(res.data);
        this.extracting.set(false);
        this.loadProfiles();
      },
      error: () => this.extracting.set(false),
    });
  }

  loadProfiles(): void {
    this.http.get<{ data: any[] }>(`${this.apiBase}/profiles`).subscribe({
      next: (res) => this.profiles.set(res.data),
    });
  }

  getColors(): Array<{ hex: string }> {
    const colors = this.extractionResult()?.tokens?.colors ?? {};
    return Object.values(colors) as any[];
  }

  getTypography(): any[] {
    return this.extractionResult()?.tokens?.typography ?? [];
  }

  getLayoutPatterns(): any[] {
    return this.extractionResult()?.tokens?.layoutPatterns ?? [];
  }

  selectProfile(profile: any): void {
    this.selectedProfile.set(this.selectedProfile()?.id === profile.id ? null : profile);
    this.clickedComponent.set(null);
  }

  getProfileLayouts(): any[] {
    return this.selectedProfile()?.layoutPatterns ?? [];
  }

  toPageLayout(pattern: any, index: number): PageLayout {
    return {
      pageNumber: index + 1,
      pageTitle: pattern.pageName,
      layoutType: pattern.description?.slice(0, 30) ?? 'spread',
      components: (pattern.components ?? []).map((c: any) => ({
        slotName: c.name,
        type: c.type === 'image' || c.hasImageFill ? 'image' : 'text',
        x: c.x,
        y: c.y,
        w: c.w,
        h: c.h,
        fontRole: c.fontRole,
        maxChars: c.maxChars,
        imageDescription: c.imageDescription,
      })),
    };
  }

  onComponentClicked(comp: PageComponent): void {
    this.clickedComponent.set(comp);
  }

  private extractFileKey(url: string): string | null {
    // Figma URL: https://www.figma.com/design/FILE_KEY/name or /file/FILE_KEY/name
    const match = url.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/);
    if (match?.[1]) return match[1];
    // Maybe just the key directly
    if (/^[a-zA-Z0-9]{20,}$/.test(url.trim())) return url.trim();
    return null;
  }
}
