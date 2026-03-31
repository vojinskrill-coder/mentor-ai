import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { environment } from '../../../environments/environment';

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
          <div class="profile-card">
            <span class="profile-name">{{ profile.name }}</span>
            <span class="profile-meta">{{ profile.pageCount }} stranica</span>
            <span class="profile-date">{{ profile.createdAt | date:'d. MMM yyyy' }}</span>
          </div>
        }
        @if (profiles().length === 0) {
          <div class="empty">Nema sacuvanih profila. Analiziraj Figma fajl iznad.</div>
        }
      </div>
    </div>
  `,
  styles: [`
    .figma-page { padding: 24px; max-width: 900px; }
    .page-title { color: #FAFAFA; font-size: 24px; font-weight: 700; margin: 0 0 24px; }

    .section { margin-bottom: 32px; }
    .section-title { color: #FAFAFA; font-size: 16px; font-weight: 600; margin: 0 0 12px; }
    .subsection { margin-top: 20px; }
    .subsection-title { color: #9CA3AF; font-size: 13px; font-weight: 600; text-transform: uppercase; margin: 0 0 8px; letter-spacing: 0.5px; }
    .hint { color: #6B7280; font-size: 13px; margin: 0 0 8px; }

    .status-badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; }
    .connected { background: #22c55e20; color: #22c55e; }

    .connect-btn {
      padding: 10px 24px; background: #7C3AED; color: #FAFAFA; border: none;
      border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
    }
    .connect-btn:hover { background: #6D28D9; }

    .input-row { display: flex; gap: 8px; }
    .url-input {
      flex: 1; padding: 10px 14px; background: #242424; border: 1px solid #2A2A2A;
      border-radius: 8px; color: #FAFAFA; font-size: 13px; font-family: monospace;
    }
    .url-input:focus { outline: none; border-color: #7C3AED; }
    .extract-btn {
      padding: 10px 20px; background: #7C3AED; color: #FAFAFA; border: none;
      border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
    }
    .extract-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .result-section { background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 12px; padding: 20px; }

    .stats-grid { display: flex; gap: 16px; margin-bottom: 16px; }
    .stat { display: flex; flex-direction: column; align-items: center; min-width: 70px; }
    .stat-val { color: #FAFAFA; font-size: 24px; font-weight: 700; }
    .stat-label { color: #6B7280; font-size: 11px; }

    .color-grid { display: flex; flex-wrap: wrap; gap: 6px; }
    .color-swatch {
      width: 60px; height: 40px; border-radius: 6px; display: flex;
      align-items: flex-end; justify-content: center; padding: 2px;
      border: 1px solid #2A2A2A;
    }
    .color-hex { font-size: 8px; color: #FFF; text-shadow: 0 0 3px #000; }

    .type-sample { color: #FAFAFA; margin-bottom: 6px; line-height: 1.3; }

    .pages-grid { display: flex; flex-wrap: wrap; gap: 12px; }
    .page-thumbnail { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .page-frame {
      width: 120px; height: 170px; background: #242424; border: 1px solid #2A2A2A;
      border-radius: 4px; position: relative; overflow: hidden;
    }
    .comp-box { position: absolute; border: 1px solid #3B82F640; border-radius: 2px; }
    .comp-text { background: #3B82F610; }
    .comp-image { background: #C9A96E10; border-color: #C9A96E40; }
    .comp-frame { background: #22c55e08; border-color: #22c55e20; }
    .comp-shape { background: #9CA3AF10; border-color: #9CA3AF30; }
    .page-name { color: #6B7280; font-size: 10px; max-width: 120px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .profile-card {
      display: flex; align-items: center; gap: 12px; padding: 12px;
      background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 8px; margin-bottom: 8px;
    }
    .profile-name { color: #FAFAFA; font-weight: 500; flex: 1; }
    .profile-meta { color: #C9A96E; font-size: 12px; }
    .profile-date { color: #6B7280; font-size: 11px; }

    .empty { color: #6B7280; font-size: 13px; padding: 20px; text-align: center; }
  `],
  imports: [FormsModule, DatePipe],
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

  private extractFileKey(url: string): string | null {
    // Figma URL: https://www.figma.com/design/FILE_KEY/name or /file/FILE_KEY/name
    const match = url.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/);
    if (match?.[1]) return match[1];
    // Maybe just the key directly
    if (/^[a-zA-Z0-9]{20,}$/.test(url.trim())) return url.trim();
    return null;
  }
}
