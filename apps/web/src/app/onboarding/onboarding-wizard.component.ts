import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OnboardingService } from './services/onboarding.service';
import { INDUSTRIES, Department } from '@mentor-ai/shared/types';

type Strategy = 'ANALYSE_BUSINESS' | 'CREATE_BUSINESS_BRAIN';

@Component({
  selector: 'app-onboarding-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [
    `
      :host {
        display: block;
      }
      .page {
        min-height: 100vh;
        background: #0a0a0a;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        font-family: 'Inter', system-ui, sans-serif;
        color: #fafafa;
      }
      .container {
        width: 100%;
        max-width: 720px;
      }

      .header {
        text-align: center;
        margin-bottom: 32px;
      }
      .header h1 {
        font-size: 28px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .header p {
        font-size: 15px;
        color: #a0a0a0;
      }

      .progress {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 32px;
      }
      .step-circle {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.3s;
      }
      .step-circle.active {
        background: #3b82f6;
        color: white;
      }
      .step-circle.inactive {
        background: #2a2a2a;
        color: #a0a0a0;
      }
      .step-circle svg {
        width: 20px;
        height: 20px;
      }
      .step-line {
        width: 48px;
        height: 4px;
        margin: 0 6px;
        transition: all 0.3s;
        border-radius: 2px;
      }
      .step-line.active {
        background: #3b82f6;
      }
      .step-line.inactive {
        background: #2a2a2a;
      }

      .card {
        background: #1a1a1a;
        border-radius: 12px;
        padding: 24px;
        border: 1px solid #2a2a2a;
      }
      .card h2 {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 12px;
      }
      .card-desc {
        font-size: 14px;
        color: #a0a0a0;
        margin-bottom: 24px;
        line-height: 1.5;
      }

      .form-group {
        margin-bottom: 20px;
      }
      .form-label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: #a0a0a0;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .form-input {
        width: 100%;
        padding: 12px;
        background: #0a0a0a;
        border: 1px solid #2a2a2a;
        border-radius: 10px;
        color: #fafafa;
        font-size: 15px;
        font-family: inherit;
        outline: none;
        box-sizing: border-box;
      }
      .form-input:focus {
        border-color: #3b82f6;
      }
      .form-input::placeholder {
        color: #666;
      }
      .form-textarea {
        width: 100%;
        padding: 12px;
        background: #0a0a0a;
        border: 1px solid #2a2a2a;
        border-radius: 10px;
        color: #fafafa;
        font-size: 14px;
        font-family: inherit;
        resize: none;
        outline: none;
        line-height: 1.5;
        box-sizing: border-box;
      }
      .form-textarea:focus {
        border-color: #3b82f6;
      }
      .form-textarea::placeholder {
        color: #666;
      }
      .form-hint {
        font-size: 12px;
        color: #666;
        margin-top: 6px;
      }

      /* Industry grid — 3 columns, scrollable */
      .industry-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        max-height: 320px;
        overflow-y: auto;
        padding-right: 4px;
      }
      .industry-grid::-webkit-scrollbar {
        width: 4px;
      }
      .industry-grid::-webkit-scrollbar-thumb {
        background: #2a2a2a;
        border-radius: 2px;
      }
      .industry-btn {
        padding: 12px;
        border-radius: 8px;
        border: 2px solid #2a2a2a;
        background: transparent;
        color: #fafafa;
        cursor: pointer;
        text-align: center;
        font-size: 13px;
        font-weight: 500;
        transition: border-color 0.2s;
        font-family: inherit;
      }
      .industry-btn:hover {
        border-color: rgba(59, 130, 246, 0.5);
      }
      .industry-btn.selected {
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.08);
      }

      /* Other industry input */
      .other-input {
        margin-top: 12px;
        width: 100%;
        padding: 10px 12px;
        background: #0a0a0a;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        color: #fafafa;
        font-size: 14px;
        font-family: inherit;
        outline: none;
        box-sizing: border-box;
      }
      .other-input:focus {
        border-color: #3b82f6;
      }
      .other-input::placeholder {
        color: #666;
      }

      /* Strategy cards */
      .strategy-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      .strategy-card {
        padding: 24px;
        border-radius: 12px;
        border: 2px solid #2a2a2a;
        background: transparent;
        color: #fafafa;
        cursor: pointer;
        text-align: left;
        transition: border-color 0.2s;
        font-family: inherit;
      }
      .strategy-card:hover {
        border-color: rgba(59, 130, 246, 0.5);
      }
      .strategy-card.selected {
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.08);
      }
      .strategy-icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        background: #242424;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 16px;
      }
      .strategy-icon svg {
        width: 24px;
        height: 24px;
        color: #3b82f6;
      }
      .strategy-name {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .strategy-desc {
        font-size: 13px;
        color: #a0a0a0;
        line-height: 1.5;
      }

      /* Department chips (company functions) */
      .dept-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .dept-btn {
        padding: 10px 16px;
        border-radius: 20px;
        border: 2px solid #2a2a2a;
        background: transparent;
        color: #fafafa;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s;
        font-family: inherit;
      }
      .dept-btn:hover {
        border-color: rgba(59, 130, 246, 0.5);
      }
      .dept-btn.selected {
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }

      /* User role/department selection (Story 3.2) */
      .role-section {
        margin-top: 24px;
        padding-top: 20px;
        border-top: 1px solid #2a2a2a;
      }
      .role-section-label {
        font-size: 13px;
        font-weight: 500;
        color: #a0a0a0;
        margin-bottom: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .role-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .role-btn {
        padding: 10px 18px;
        border-radius: 20px;
        border: 2px solid #2a2a2a;
        background: transparent;
        color: #fafafa;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s;
        font-family: inherit;
      }
      .role-btn:hover {
        border-color: rgba(59, 130, 246, 0.5);
      }
      .role-btn.selected {
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .role-hint {
        font-size: 12px;
        color: #666;
        margin-top: 8px;
        line-height: 1.4;
      }

      /* Generating state */
      .generating {
        text-align: center;
        padding: 32px 0;
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
      .gen-spinner {
        width: 48px;
        height: 48px;
        border: 3px solid #2a2a2a;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin: 0 auto 16px;
      }
      .gen-title {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .gen-sub {
        font-size: 14px;
        color: #a0a0a0;
      }
      .gen-timer {
        color: #3b82f6;
        margin-top: 16px;
        font-family: monospace;
        font-size: 15px;
      }

      /* Result */
      .result-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .result-header h2 {
        font-size: 20px;
        font-weight: 600;
      }
      .result-time {
        font-size: 13px;
        color: #3b82f6;
      }
      .result-box {
        background: #0a0a0a;
        border-radius: 10px;
        padding: 16px;
        border: 1px solid #2a2a2a;
        max-height: 400px;
        overflow-y: auto;
        white-space: pre-wrap;
        font-size: 14px;
        color: #e0e0e0;
        line-height: 1.6;
      }

      /* Celebration */
      .celebration {
        text-align: center;
        padding: 32px 0;
      }
      .celebration-emoji {
        font-size: 60px;
        margin-bottom: 16px;
      }
      .celebration h2 {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .celebration p {
        font-size: 14px;
        color: #a0a0a0;
        margin-bottom: 24px;
        line-height: 1.5;
      }

      /* Spinners */
      .saving-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        display: inline-block;
      }

      /* PDF Upload */
      .pdf-upload-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .btn-upload-pdf {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: transparent;
        color: #fafafa;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        font-family: inherit;
        transition: all 0.2s;
      }
      .btn-upload-pdf:hover:not(:disabled) {
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.08);
      }
      .btn-upload-pdf:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-upload-pdf svg {
        width: 16px;
        height: 16px;
      }
      .pdf-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        display: inline-block;
      }
      .pdf-success {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #22c55e;
        font-size: 13px;
        font-weight: 500;
      }
      .pdf-success svg {
        width: 16px;
        height: 16px;
      }
      .pdf-error-text {
        font-size: 12px;
        color: #ef4444;
        margin-top: 6px;
      }
      .pdf-hint {
        font-size: 12px;
        color: #666;
        margin-top: 6px;
      }

      /* Execution mode toggle */
      .mode-toggle-section {
        margin-top: 24px;
        padding-top: 20px;
        border-top: 1px solid #2a2a2a;
      }
      .mode-toggle-label {
        font-size: 13px;
        font-weight: 500;
        color: #a0a0a0;
        margin-bottom: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .mode-toggle {
        display: inline-flex;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        overflow: hidden;
      }
      .mode-toggle-btn {
        padding: 10px 24px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        background: transparent;
        color: #a0a0a0;
        font-family: inherit;
        transition: all 0.2s;
      }
      .mode-toggle-btn.active {
        background: #3b82f6;
        color: white;
      }
      .mode-toggle-btn:not(.active):hover {
        background: rgba(59, 130, 246, 0.08);
        color: #fafafa;
      }
      .mode-hint {
        font-size: 12px;
        color: #666;
        margin-top: 8px;
        line-height: 1.4;
      }

      /* Error */
      .error-box {
        margin-top: 16px;
        padding: 16px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 10px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      .error-box svg {
        width: 20px;
        height: 20px;
        color: #ef4444;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .error-title {
        font-size: 14px;
        font-weight: 500;
        color: #ef4444;
      }
      .error-detail {
        font-size: 13px;
        color: rgba(239, 68, 68, 0.8);
        margin-top: 4px;
      }

      /* Buttons */
      .btn-row {
        display: flex;
        justify-content: space-between;
        margin-top: 24px;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        font-family: inherit;
        transition: opacity 0.15s;
      }
      .btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .btn-secondary {
        background: transparent;
        border: 1px solid #2a2a2a;
        color: #fafafa;
      }
      .btn-secondary:hover:not(:disabled) {
        background: #1a1a1a;
      }
      .btn-primary {
        background: #3b82f6;
        color: white;
      }
      .btn-primary:hover:not(:disabled) {
        opacity: 0.9;
      }
      .btn-right {
        margin-left: auto;
      }
    `,
  ],
  template: `
    <div class="page">
      <div class="container">
        <div class="header">
          <h1>Dobrodošli u Mentor AI</h1>
          <p>Podesite radni prostor i vidite AI u akciji</p>
        </div>

        <div
          class="progress"
          role="progressbar"
          [attr.aria-valuenow]="currentStep$()"
          aria-valuemin="1"
          aria-valuemax="4"
          [attr.aria-label]="'Korak ' + currentStep$() + ' od 4'"
        >
          @for (stepNum of [1, 2, 3, 4]; track stepNum) {
            <div
              class="step-circle"
              [class.active]="currentStep$() >= stepNum"
              [class.inactive]="currentStep$() < stepNum"
              [attr.aria-label]="
                'Korak ' +
                stepNum +
                (currentStep$() > stepNum
                  ? ' — završen'
                  : currentStep$() === stepNum
                    ? ' — aktivan'
                    : ' — predstoji')
              "
            >
              @if (currentStep$() > stepNum) {
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              } @else {
                {{ stepNum }}
              }
            </div>
            @if (stepNum < 4) {
              <div
                class="step-line"
                [class.active]="currentStep$() > stepNum"
                [class.inactive]="currentStep$() <= stepNum"
              ></div>
            }
          }
        </div>

        <div class="card">
          <!-- Step 1: Company Setup -->
          @if (currentStep$() === 1) {
            <h2>Podesite vaš radni prostor</h2>
            <p class="card-desc">
              Recite nam o vašoj kompaniji da bismo prilagodili iskustvo vašim potrebama.
            </p>

            <div class="form-group">
              <label class="form-label">Naziv kompanije</label>
              <input
                class="form-input"
                type="text"
                [ngModel]="companyName$()"
                (ngModelChange)="companyName$.set($event)"
                placeholder="npr. Acme Corporation"
                maxlength="100"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Industrija</label>
              <div class="industry-grid">
                @for (industry of industries; track industry) {
                  <button
                    class="industry-btn"
                    [class.selected]="selectedIndustry$() === industry"
                    (click)="selectIndustry(industry)"
                  >
                    {{ industry }}
                  </button>
                }
              </div>
              @if (selectedIndustry$() === 'Other') {
                <input
                  class="other-input"
                  type="text"
                  [ngModel]="customIndustry$()"
                  (ngModelChange)="customIndustry$.set($event)"
                  placeholder="Unesite vašu industriju..."
                  maxlength="100"
                />
              }
            </div>

            <div class="form-group">
              <label class="form-label"
                >Opis poslovanja
                <span style="color:#666; text-transform:none; letter-spacing:0"
                  >(opciono ali preporučeno)</span
                ></label
              >
              <textarea
                class="form-textarea"
                [ngModel]="companyDescription$()"
                (ngModelChange)="companyDescription$.set($event)"
                placeholder="Opišite vaše poslovanje detaljno — čime se bavite, ko su vaši klijenti, trenutni proizvodi/usluge, model prihoda, itd. Više detalja znači bolju AI pomoć."
                maxlength="3000"
                rows="6"
              ></textarea>
              <div class="form-hint">{{ companyDescription$().length }}/3000 karaktera</div>
            </div>

            <div class="form-group">
              <label class="form-label"
                >URL sajta
                <span style="color:#666; text-transform:none; letter-spacing:0"
                  >(opciono — AI će analizirati vaš sajt za bolje preporuke)</span
                ></label
              >
              <input
                class="form-input"
                type="url"
                [ngModel]="websiteUrl$()"
                (ngModelChange)="websiteUrl$.set($event)"
                placeholder="https://www.example.com"
                maxlength="500"
              />
            </div>

            <div class="form-group">
              <label class="form-label"
                >PDF brošura
                <span style="color:#666; text-transform:none; letter-spacing:0"
                  >(opciono)</span
                ></label
              >
              <div class="pdf-upload-row">
                <button
                  class="btn-upload-pdf"
                  [disabled]="isUploadingPdf$()"
                  (click)="pdfInput.click()"
                >
                  @if (isUploadingPdf$()) {
                    <span class="pdf-spinner"></span> Obrađujem...
                  } @else {
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    Otpremi PDF
                  }
                </button>
                @if (pdfFileName$()) {
                  <span class="pdf-success">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {{ pdfFileName$() }}
                  </span>
                }
              </div>
              @if (pdfError$()) {
                <div class="pdf-error-text">{{ pdfError$() }}</div>
              }
              <div class="pdf-hint">
                PDF do 70MB. Tekst će biti ekstrahovan za obogaćivanje AI odgovora.
              </div>
            </div>
            <input
              #pdfInput
              type="file"
              accept="application/pdf"
              style="display:none"
              (change)="onPdfSelected($event)"
            />
          }

          <!-- Step 2: Choose Strategy -->
          @if (currentStep$() === 2) {
            <h2>Izaberite vaš put</h2>
            <p class="card-desc">Kako želite da vam AI pomogne da počnete?</p>

            <div class="strategy-grid">
              <button
                class="strategy-card"
                [class.selected]="selectedStrategy$() === 'ANALYSE_BUSINESS'"
                (click)="selectStrategy('ANALYSE_BUSINESS')"
              >
                <div class="strategy-icon">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <div class="strategy-name">Analiziraj moje poslovanje</div>
                <div class="strategy-desc">
                  Dobijte sveobuhvatnu AI analizu vašeg poslovanja — snage, prilike i strateške
                  preporuke.
                </div>
              </button>

              <button
                class="strategy-card"
                [class.selected]="selectedStrategy$() === 'CREATE_BUSINESS_BRAIN'"
                (click)="selectStrategy('CREATE_BUSINESS_BRAIN')"
              >
                <div class="strategy-icon">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <div class="strategy-name">Kreiraj moj poslovni mozak</div>
                <div class="strategy-desc">
                  Automatski generišite personalizovane zadatke i fokus oblasti na osnovu vašeg
                  poslovanja. Oni će se pojaviti u vašem radnom prostoru za razgovor.
                </div>
              </button>
            </div>

            @if (selectedStrategy$() === 'CREATE_BUSINESS_BRAIN') {
              <div class="mode-toggle-section">
                <div class="mode-toggle-label">Režim izvršavanja</div>
                <div class="mode-toggle">
                  <button
                    class="mode-toggle-btn"
                    [class.active]="executionMode$() === 'MANUAL'"
                    (click)="executionMode$.set('MANUAL')"
                  >
                    RUČNO
                  </button>
                  <button
                    class="mode-toggle-btn"
                    [class.active]="executionMode$() === 'YOLO'"
                    (click)="executionMode$.set('YOLO')"
                  >
                    YOLO
                  </button>
                </div>
                @if (executionMode$() === 'YOLO') {
                  <div class="mode-hint">
                    Svi zadaci će se izvršavati automatski bez ručne interakcije. Zadaci poštuju
                    redosled zavisnosti i izvršavaju se paralelno (do 3 istovremeno).
                  </div>
                } @else {
                  <div class="mode-hint">
                    Pregledaćete i odobriti svaki korak zadatka pre izvršavanja.
                  </div>
                }
              </div>
            }

            @if (selectedStrategy$()) {
              <div class="role-section">
                <div class="role-section-label">Vaša uloga u kompaniji</div>
                <div class="role-grid">
                  @for (role of userRoleOptions; track role.value) {
                    <button
                      class="role-btn"
                      [class.selected]="selectedUserRole$() === role.value"
                      (click)="selectUserRole(role.value)"
                    >
                      {{ role.label }}
                    </button>
                  }
                </div>
                <div class="role-hint">
                  Ovo određuje koje poslovne oblasti ćete videti u vašem Brain-u.
                </div>
              </div>
            }
          }

          <!-- Step 3: Business Context + Generate -->
          @if (currentStep$() === 3 && !isGenerating$() && !generatedOutput$()) {
            <h2>Recite nam više</h2>
            <p class="card-desc">
              Obezbedite kontekst o vašem poslovanju za najrelevantnije rezultate.
            </p>

            <div class="form-group">
              <label class="form-label">Gde se vaše poslovanje trenutno nalazi?</label>
              <textarea
                class="form-textarea"
                [ngModel]="businessState$()"
                (ngModelChange)="businessState$.set($event)"
                placeholder="Npr. mi smo startup star 2 godine sa 15 zaposlenih..."
                maxlength="1000"
                rows="4"
              ></textarea>
              <div class="form-hint">{{ businessState$().length }}/1000 karaktera</div>
            </div>

            <div class="form-group">
              <label class="form-label">Koje funkcije/odeljenja ima vaše poslovanje?</label>
              <div class="dept-grid">
                @for (dept of departments; track dept) {
                  <button
                    class="dept-btn"
                    [class.selected]="selectedDepartments$().has(dept)"
                    (click)="toggleDepartment(dept)"
                  >
                    {{ formatDepartment(dept) }}
                  </button>
                }
              </div>
            </div>
          }

          @if (isGenerating$()) {
            <div class="generating">
              <div class="gen-spinner"></div>
              <div class="gen-title">
                @if (selectedStrategy$() === 'ANALYSE_BUSINESS') {
                  Analiziram vaše poslovanje...
                } @else {
                  Kreiram vaš poslovni mozak...
                }
              </div>
              <div class="gen-sub">Ovo obično traje manje od 30 sekundi...</div>
              @if (generationTimer$() > 0) {
                <div class="gen-timer">{{ formatTime(generationTimer$()) }}</div>
              }
            </div>
          }

          @if (generatedOutput$() && !showCelebration$() && !isCompletingOnboarding$()) {
            <div class="result-header">
              <h2>
                @if (selectedStrategy$() === 'ANALYSE_BUSINESS') {
                  Vaša poslovna analiza
                } @else {
                  Vaš poslovni mozak
                }
              </h2>
              <span class="result-time">Generisano za {{ formatTime(generationTimeMs$()) }}</span>
            </div>
            <div class="result-box">{{ generatedOutput$() }}</div>
          }

          @if (isCompletingOnboarding$()) {
            <div class="generating">
              <div class="gen-spinner"></div>
              <div class="gen-title">Kreiramo vaš Poslovni Mozak...</div>
              <div class="gen-sub">
                Pripremamo personalizovane zadatke i fokus oblasti za vaše poslovanje
              </div>
            </div>
          }

          <!-- Step 4: Celebration -->
          @if (showCelebration$()) {
            <div class="celebration">
              <div class="celebration-emoji">&#127881;</div>
              <h2>{{ celebrationMessage$() }}</h2>
              @if (selectedStrategy$() === 'ANALYSE_BUSINESS') {
                <p>
                  Vaša poslovna analiza je sačuvana kao beleška. Sve je spremno za korišćenje Mentor
                  AI!
                </p>
              } @else {
                <p>
                  Vaš poslovni mozak je kreiran! Idite na razgovor da istražite personalizovane
                  zadatke i fokus oblasti.
                </p>
              }
            </div>
          }
        </div>

        @if (errorMessage$()) {
          <div class="error-box">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <div class="error-title">Nešto je pošlo naopako</div>
              <div class="error-detail">{{ errorMessage$() }}</div>
            </div>
          </div>
        }

        <div class="btn-row">
          @if (currentStep$() > 1 && !isGenerating$() && !showCelebration$()) {
            <button class="btn btn-secondary" (click)="previousStep()">&#8592; Nazad</button>
          } @else {
            <div></div>
          }

          @if (currentStep$() <= 2 && !generatedOutput$()) {
            <button
              class="btn btn-primary"
              (click)="nextStep()"
              [disabled]="!canProceed$() || isSavingCompany$()"
            >
              @if (isSavingCompany$()) {
                <span class="saving-spinner"></span> Čuvam...
              } @else {
                Nastavi &#8594;
              }
            </button>
          }

          @if (currentStep$() === 3 && !isGenerating$() && !generatedOutput$()) {
            <button class="btn btn-primary" (click)="generateOutput()" [disabled]="!canGenerate$()">
              Generiši
            </button>
          }

          @if (generatedOutput$() && !showCelebration$() && !isCompletingOnboarding$()) {
            <button class="btn btn-primary" (click)="saveAndComplete()">
              Sačuvaj i nastavi &#8594;
            </button>
          }

          @if (showCelebration$()) {
            <button class="btn btn-primary btn-right" (click)="goToChat()">
              Idi na razgovor &#8594;
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class OnboardingWizardComponent implements OnInit {
  private readonly onboardingService = inject(OnboardingService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentStep$ = signal(1);
  readonly selectedIndustry$ = signal<string | null>(null);
  readonly executionMode$ = signal<'MANUAL' | 'YOLO'>('MANUAL');
  readonly selectedStrategy$ = signal<Strategy | null>(null);
  readonly selectedDepartments$ = signal<Set<string>>(new Set());
  readonly selectedUserRole$ = signal<string | null>(null); // null = not yet selected, 'OWNER' = sees all, else Department enum

  /** Story 3.2: User role options for department selection */
  readonly userRoleOptions = [
    { label: 'Vlasnik / CEO', value: 'OWNER' },
    { label: 'Marketing', value: 'MARKETING' },
    { label: 'Finansije', value: 'FINANCE' },
    { label: 'Prodaja', value: 'SALES' },
    { label: 'Operacije', value: 'OPERATIONS' },
    { label: 'IT / Tehnologija', value: 'TECHNOLOGY' },
    { label: 'Menadžment / Strategija', value: 'STRATEGY' },
  ];

  readonly companyName$ = signal('');
  readonly companyDescription$ = signal('');
  readonly customIndustry$ = signal('');
  readonly websiteUrl$ = signal('');
  readonly businessState$ = signal('');
  readonly welcomeConversationId$ = signal<string | null>(null);
  readonly planId$ = signal<string | null>(null);

  readonly isUploadingPdf$ = signal(false);
  readonly pdfFileName$ = signal<string | null>(null);
  readonly pdfExtractedText$ = signal<string | null>(null);
  readonly pdfError$ = signal<string | null>(null);

  readonly isSavingCompany$ = signal(false);
  readonly isCompletingOnboarding$ = signal(false);
  readonly isGenerating$ = signal(false);
  readonly generationTimer$ = signal(0);
  private timerInterval?: ReturnType<typeof setInterval>;

  readonly industries = INDUSTRIES;
  readonly departments = Object.values(Department);

  readonly generatedOutput$ = signal<string | null>(null);
  readonly generationTimeMs$ = signal(0);

  readonly showCelebration$ = signal(false);
  readonly celebrationMessage$ = signal('');

  readonly errorMessage$ = signal<string | null>(null);

  readonly canProceed$ = computed(() => {
    const step = this.currentStep$();
    if (step === 1) {
      const hasName = this.companyName$().trim().length >= 2;
      const hasIndustry = this.selectedIndustry$() !== null;
      const otherValid =
        this.selectedIndustry$() !== 'Other' || this.customIndustry$().trim().length >= 2;
      return hasName && hasIndustry && otherValid;
    }
    if (step === 2) return this.selectedStrategy$() !== null && this.selectedUserRole$() !== null;
    return true;
  });

  readonly canGenerate$ = computed(() => {
    return this.businessState$().trim().length > 0 && this.selectedDepartments$().size > 0;
  });

  ngOnInit(): void {
    this.checkOnboardingStatus();
    this.destroyRef.onDestroy(() => {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = undefined;
      }
    });
  }

  private async checkOnboardingStatus(): Promise<void> {
    try {
      const status = await this.onboardingService.getStatus();
      if (status.currentStep === 'complete') {
        this.router.navigate(['/chat']);
      }
    } catch {
      // Continue with fresh onboarding
    }
  }

  formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  }

  formatDepartment(dept: string): string {
    return dept.charAt(0) + dept.slice(1).toLowerCase();
  }

  selectIndustry(industry: string): void {
    this.selectedIndustry$.set(industry);
  }

  selectStrategy(strategy: Strategy): void {
    this.selectedStrategy$.set(strategy);
  }

  selectUserRole(value: string): void {
    this.selectedUserRole$.set(value);
  }

  toggleDepartment(dept: string): void {
    const current = new Set(this.selectedDepartments$());
    if (current.has(dept)) {
      current.delete(dept);
    } else {
      current.add(dept);
    }
    this.selectedDepartments$.set(current);
  }

  async onPdfSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Reset file input so the same file can be re-selected
    input.value = '';

    // Client-side validation
    if (file.type !== 'application/pdf') {
      this.pdfError$.set('Izaberite PDF datoteku.');
      return;
    }
    if (file.size > 70 * 1024 * 1024) {
      this.pdfError$.set('Datoteka je prevelika. Maksimalna veličina je 70MB.');
      return;
    }

    this.pdfError$.set(null);
    this.pdfFileName$.set(null);
    this.pdfExtractedText$.set(null);
    this.isUploadingPdf$.set(true);

    try {
      const result = await this.onboardingService.uploadBrochure(file);
      this.pdfFileName$.set(file.name);
      this.pdfExtractedText$.set(result.extractedText);
    } catch (error: any) {
      const detail = error?.error?.detail || error?.error?.message || error?.message;
      this.pdfError$.set(detail || 'Obrada PDF-a nije uspela. Pokušajte ponovo.');
    } finally {
      this.isUploadingPdf$.set(false);
    }
  }

  async nextStep(): Promise<void> {
    const step = this.currentStep$();
    this.errorMessage$.set(null);

    if (step === 1 && this.selectedIndustry$() && this.companyName$().trim()) {
      const effectiveIndustry =
        this.selectedIndustry$() === 'Other'
          ? this.customIndustry$().trim()
          : this.selectedIndustry$()!;

      this.isSavingCompany$.set(true);
      try {
        const pdfText = this.pdfExtractedText$();
        const desc = this.companyDescription$().trim();
        const fullDescription = pdfText
          ? [desc, `\n\n--- PDF Brochure Content ---\n${pdfText}`].filter(Boolean).join('')
          : desc || undefined;

        await this.onboardingService.setupCompany(
          this.companyName$().trim(),
          effectiveIndustry,
          fullDescription,
          this.websiteUrl$().trim() || undefined
        );
      } catch (error) {
        console.warn('Failed to save company details:', error);
      } finally {
        this.isSavingCompany$.set(false);
      }
    }

    // Story 3.2: Save user department when leaving step 2
    if (step === 2 && this.selectedUserRole$() !== null) {
      const dept = this.selectedUserRole$() === 'OWNER' ? null : this.selectedUserRole$();
      try {
        await this.onboardingService.setDepartment(dept);
      } catch (err) {
        console.warn('Failed to save department:', err);
      }
    }

    this.currentStep$.update((s) => Math.min(s + 1, 4));
  }

  previousStep(): void {
    this.currentStep$.update((s) => Math.max(s - 1, 1));
    this.generatedOutput$.set(null);
  }

  async generateOutput(): Promise<void> {
    const strategy = this.selectedStrategy$();
    if (!strategy || !this.businessState$().trim() || this.selectedDepartments$().size === 0)
      return;

    this.isGenerating$.set(true);
    this.generationTimer$.set(0);
    this.errorMessage$.set(null);

    this.timerInterval = setInterval(() => {
      this.generationTimer$.update((t) => t + 1000);
    }, 1000);

    try {
      const depts = Array.from(this.selectedDepartments$());

      let result: { output: string; generationTimeMs: number };
      if (strategy === 'ANALYSE_BUSINESS') {
        result = await this.onboardingService.analyseBusiness(
          this.businessState$(),
          depts,
          strategy
        );
      } else {
        result = await this.onboardingService.createBusinessBrain(
          this.businessState$(),
          depts,
          strategy
        );
      }

      this.generatedOutput$.set(result.output);
      this.generationTimeMs$.set(result.generationTimeMs);
    } catch (error: any) {
      const detail = error?.error?.detail || error?.error?.message || error?.message;
      const message = detail || 'Generisanje sadržaja nije uspelo. Pokušajte ponovo.';
      console.error('Generate output error:', error);
      this.errorMessage$.set(message);
    } finally {
      this.isGenerating$.set(false);
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
      }
    }
  }

  async saveAndComplete(): Promise<void> {
    const strategy = this.selectedStrategy$();
    const output = this.generatedOutput$();
    if (!strategy || !output) return;

    this.errorMessage$.set(null);
    this.isCompletingOnboarding$.set(true);

    try {
      const result = await this.onboardingService.completeOnboarding(
        strategy,
        output,
        this.executionMode$()
      );
      this.celebrationMessage$.set(result.celebrationMessage);
      this.welcomeConversationId$.set(result.welcomeConversationId ?? null);
      this.planId$.set(result.planId ?? null);
      this.isCompletingOnboarding$.set(false);
      this.showCelebration$.set(true);
      this.currentStep$.set(4);
    } catch (error) {
      console.error('Failed to save onboarding completion:', error);
      this.isCompletingOnboarding$.set(false);
      this.celebrationMessage$.set('Čestitamo! Vaš radni prostor je spreman!');
      this.showCelebration$.set(true);
      this.currentStep$.set(4);
    }
  }

  goToChat(): void {
    const convId = this.welcomeConversationId$();
    const planId = this.planId$();
    const queryParams: Record<string, string> = {};
    if (this.executionMode$() === 'YOLO') queryParams['yolo'] = 'true';
    if (planId) queryParams['planId'] = planId;
    if (convId) {
      this.router.navigate(['/chat', convId], { queryParams });
    } else {
      this.router.navigate(['/chat'], { queryParams });
    }
  }
}
