import { Component, OnInit, inject, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MaturityDashboardData } from '@mentor-ai/shared/types';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [
    `
      :host {
        display: block;
      }

      /* Main — fluid, fills available space */
      .main {
        max-width: min(95%, 1600px);
        margin: 0 auto;
        padding: 32px 24px;
      }
      @media (min-width: 1800px) {
        .main {
          max-width: min(90%, 1800px);
        }
      }

      /* Welcome Card */
      .welcome-card {
        background: #1a1a1a;
        border-radius: 12px;
        border: 1px solid #2a2a2a;
        padding: 24px;
        margin-bottom: 24px;
      }
      .welcome-card h2 {
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 12px;
      }
      .welcome-card p {
        font-size: 15px;
        color: #a1a1a1;
        line-height: 1.6;
        margin-bottom: 24px;
      }
      .action-row {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .action-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 500;
        text-decoration: none;
        transition: opacity 0.15s;
        border: none;
        cursor: pointer;
        font-family: inherit;
      }
      .action-btn:hover {
        opacity: 0.9;
      }
      .action-btn-primary {
        background: #3b82f6;
        color: white;
      }
      .action-btn-secondary {
        background: #242424;
        color: #fafafa;
        border: 1px solid #2a2a2a;
      }
      .action-btn svg {
        width: 20px;
        height: 20px;
      }

      /* Section Title */
      .section-title {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 16px;
      }

      /* Persona Grid */
      .persona-grid {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 12px;
        margin-bottom: 32px;
      }
      @media (max-width: 768px) {
        .persona-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      .persona-card {
        background: #1a1a1a;
        border-radius: 12px;
        border: 1px solid #2a2a2a;
        padding: 16px;
        text-align: center;
        transition: transform 0.15s;
      }
      .persona-card:hover {
        transform: scale(1.02);
      }
      .persona-avatar {
        width: 48px;
        height: 48px;
        margin: 0 auto 12px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: 16px;
      }
      .persona-name {
        font-size: 13px;
        font-weight: 500;
      }
      .persona-role {
        font-size: 11px;
        color: #9e9e9e;
        margin-top: 4px;
      }

      /* Admin Section */
      .admin-section {
        margin-top: 32px;
      }
      .admin-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      @media (max-width: 768px) {
        .admin-grid {
          grid-template-columns: 1fr;
        }
      }
      .admin-card {
        background: #1a1a1a;
        border-radius: 12px;
        border: 1px solid #2a2a2a;
        padding: 20px;
        display: flex;
        align-items: flex-start;
        gap: 16px;
        text-decoration: none;
        color: inherit;
        transition: border-color 0.2s;
      }
      .admin-card:hover {
        border-color: #3b82f6;
      }
      .admin-icon {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(59, 130, 246, 0.1);
        flex-shrink: 0;
      }
      .admin-icon svg {
        width: 20px;
        height: 20px;
        color: #3b82f6;
      }
      .admin-card-title {
        font-size: 15px;
        font-weight: 500;
        margin-bottom: 4px;
      }
      .admin-card-desc {
        font-size: 13px;
        color: #a1a1a1;
        line-height: 1.4;
      }

      /* Maturity Card */
      .maturity-section {
        margin-bottom: 32px;
      }
      .maturity-card {
        background: #1a1a1a;
        border-radius: 12px;
        border: 1px solid #2a2a2a;
        padding: 20px 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        text-decoration: none;
        color: inherit;
        transition: border-color 0.2s;
      }
      .maturity-card:hover {
        border-color: #3b82f6;
      }
      .maturity-left {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .maturity-icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .maturity-icon svg {
        width: 24px;
        height: 24px;
      }
      .maturity-title {
        font-size: 15px;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .maturity-subtitle {
        font-size: 13px;
        color: #a1a1a1;
      }
      .maturity-right {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .maturity-percent {
        font-size: 20px;
        font-weight: 700;
      }
      .maturity-stage-badge {
        display: inline-block;
        font-size: 12px;
        font-weight: 500;
        padding: 4px 10px;
        border-radius: 9999px;
      }
      .maturity-arrow {
        color: #888;
        font-size: 18px;
      }
    `,
  ],
  template: `
      <main class="main" role="main" aria-label="Kontrolna tabla">
        <!-- Welcome Card -->
        <div class="welcome-card">
          <h2>Dobrodošli u Mentor AI</h2>
          <p>
            Vaš AI poslovni partner sa ekspertizom u finansijama, marketingu, tehnologiji,
            operacijama, pravu i kreativnosti.
          </p>
          <div class="action-row">
            <a routerLink="/chat" class="action-btn action-btn-primary">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              Započni razgovor
            </a>
            <a
              routerLink="/chat"
              [queryParams]="{ tour: 'true' }"
              class="action-btn action-btn-secondary"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Brzi vodič
            </a>
          </div>
        </div>

        <!-- Personas -->
        <h3 class="section-title">Dostupne persone</h3>
        <div class="persona-grid">
          <div class="persona-card">
            <div class="persona-avatar" style="background-color: #3B82F6;">C</div>
            <div class="persona-name" style="color: #3B82F6;">CFO</div>
            <div class="persona-role">Finansije</div>
          </div>
          <div class="persona-card">
            <div class="persona-avatar" style="background-color: #8B5CF6;">C</div>
            <div class="persona-name" style="color: #8B5CF6;">CMO</div>
            <div class="persona-role">Marketing</div>
          </div>
          <div class="persona-card">
            <div class="persona-avatar" style="background-color: #10B981;">C</div>
            <div class="persona-name" style="color: #10B981;">CTO</div>
            <div class="persona-role">Tehnologija</div>
          </div>
          <div class="persona-card">
            <div class="persona-avatar" style="background-color: #F59E0B;">C</div>
            <div class="persona-name" style="color: #F59E0B;">COO</div>
            <div class="persona-role">Operacije</div>
          </div>
          <div class="persona-card">
            <div class="persona-avatar" style="background-color: #EF4444;">C</div>
            <div class="persona-name" style="color: #EF4444;">CLO</div>
            <div class="persona-role">Pravo</div>
          </div>
          <div class="persona-card">
            <div class="persona-avatar" style="background-color: #EC4899;">C</div>
            <div class="persona-name" style="color: #EC4899;">CCO</div>
            <div class="persona-role">Kreativa</div>
          </div>
          <div class="persona-card">
            <div class="persona-avatar" style="background-color: #06B6D4;">C</div>
            <div class="persona-name" style="color: #06B6D4;">CSO</div>
            <div class="persona-role">Strategija</div>
          </div>
          <div class="persona-card">
            <div class="persona-avatar" style="background-color: #F97316;">C</div>
            <div class="persona-name" style="color: #F97316;">CRO</div>
            <div class="persona-role">Prodaja</div>
          </div>
        </div>

        <!-- Maturity Engine Card -->
        <div class="maturity-section">
          <h3 class="section-title">Razvojni plan</h3>
          <a routerLink="/maturity" class="maturity-card">
            <div class="maturity-left">
              <div class="maturity-icon"
                   [style.background]="maturityData()?.currentStage ? getStageColor(maturityData()!.currentStage!) + '15' : 'rgba(59,130,246,0.1)'">
                <svg fill="none" [attr.stroke]="maturityData()?.currentStage ? getStageColor(maturityData()!.currentStage!) : '#3b82f6'"
                     viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <div class="maturity-title">Maturity Engine</div>
                <div class="maturity-subtitle" *ngIf="!maturityData()?.currentStage">
                  Pokrenite razvojni plan vašeg poslovanja
                </div>
                <div class="maturity-subtitle" *ngIf="maturityData()?.progress as p">
                  {{ p.completed }} od {{ p.totalAssignments }} koncepata završeno
                </div>
              </div>
            </div>
            <div class="maturity-right">
              <span *ngIf="maturityData()?.currentStage as stage"
                    class="maturity-stage-badge"
                    [style.background]="getStageColor(stage) + '20'"
                    [style.color]="getStageColor(stage)">
                {{ getStageLabel(stage) }}
              </span>
              <span *ngIf="maturityData()?.progress as p"
                    class="maturity-percent"
                    [style.color]="getStageColor(maturityData()!.currentStage!)">
                {{ p.completionPercent }}%
              </span>
              <span class="maturity-arrow">→</span>
            </div>
          </a>
        </div>

        <!-- Admin Section -->
        <div class="admin-section">
          <h3 class="section-title">Administracija platforme</h3>
          <div class="admin-grid">
            <a routerLink="/admin/llm-config" class="admin-card">
              <div class="admin-icon">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <div>
                <div class="admin-card-title">Konfiguracija AI provajdera</div>
                <div class="admin-card-desc">
                  Konfigurišite OpenRouter ili Local Llama kao AI provajder, postavite API ključeve
                  i izaberite modele.
                </div>
              </div>
            </a>
            <a routerLink="/team" class="admin-card">
              <div class="admin-icon">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <div>
                <div class="admin-card-title">Upravljanje timom</div>
                <div class="admin-card-desc">
                  Pozovite članove tima, upravljajte ulogama i konfigurišite rezervnog vlasnika.
                </div>
              </div>
            </a>
            <a routerLink="/account-settings" class="admin-card">
              <div class="admin-icon">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <div>
                <div class="admin-card-title">Podešavanja naloga</div>
                <div class="admin-card-desc">
                  Upravljajte podešavanjima radnog prostora, naplatom i preferencama podataka.
                </div>
              </div>
            </a>
            <a routerLink="/profile-settings" class="admin-card">
              <div class="admin-icon">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <div>
                <div class="admin-card-title">Podešavanja profila</div>
                <div class="admin-card-desc">
                  Ažurirajte profil, preferencije obaveštenja i bezbednosna podešavanja.
                </div>
              </div>
            </a>
          </div>
        </div>
      </main>
  `,
})
export class DashboardComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  maturityData = signal<MaturityDashboardData | null>(null);

  private readonly stageColors: Record<string, string> = {
    BASIC: '#10B981',
    ADVANCED: '#F59E0B',
    AUTONOMOUS: '#8B5CF6',
  };

  private readonly stageLabels: Record<string, string> = {
    BASIC: 'Basic',
    ADVANCED: 'Advanced',
    AUTONOMOUS: 'Autonomous',
  };

  ngOnInit(): void {
    this.http
      .get<{ data: MaturityDashboardData }>('/api/v1/maturity/stage')
      .pipe(map((r) => r.data), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.maturityData.set(data),
        error: () => {}, // silent — card just won't show details
      });
  }

  getStageColor(stage: string): string {
    return this.stageColors[stage] || '#3B82F6';
  }

  getStageLabel(stage: string): string {
    return this.stageLabels[stage] || stage;
  }
}
