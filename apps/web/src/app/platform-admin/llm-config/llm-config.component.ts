import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LlmConfigService } from '../services/llm-config.service';
import { LlmProviderType, type LlmProviderStatus } from '@mentor-ai/shared/types';

@Component({
  selector: 'app-llm-config',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  styles: [
    `
      :host {
        display: block;
      }
      .page {
        min-height: 100vh;
        background: #0d0d0d;
        color: #fafafa;
        font-family: 'Inter', system-ui, sans-serif;
      }

      /* Header */
      .page-header {
        border-bottom: 1px solid #2a2a2a;
        background: #1a1a1a;
      }
      .header-inner {
        max-width: 800px;
        margin: 0 auto;
        padding: 16px 24px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .back-link {
        color: #6b6b6b;
        text-decoration: none;
        display: flex;
        align-items: center;
      }
      .back-link:hover {
        color: #fafafa;
      }
      .back-link svg {
        width: 20px;
        height: 20px;
      }
      .header-icon svg {
        width: 24px;
        height: 24px;
        color: #3b82f6;
      }
      .page-title {
        font-size: 20px;
        font-weight: 600;
      }

      /* Main Content */
      .page-content {
        max-width: 800px;
        margin: 0 auto;
        padding: 32px 24px;
      }

      /* Loading */
      .loading-center {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 48px 0;
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #2a2a2a;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      /* Section Card */
      .section-card {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 24px;
      }
      .section-title {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .section-desc {
        font-size: 14px;
        color: #a1a1a1;
        margin-bottom: 24px;
        line-height: 1.5;
      }

      /* Provider Grid */
      .provider-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 24px;
      }
      .provider-btn {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        border-radius: 10px;
        border: 2px solid #2a2a2a;
        background: transparent;
        color: #fafafa;
        cursor: pointer;
        text-align: left;
        transition: border-color 0.2s;
      }
      .provider-btn:hover {
        border-color: rgba(59, 130, 246, 0.5);
      }
      .provider-btn.selected {
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.05);
      }
      .provider-icon {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(59, 130, 246, 0.1);
      }
      .provider-icon svg {
        width: 20px;
        height: 20px;
        color: #3b82f6;
      }
      .provider-info {
      }
      .provider-name {
        font-size: 15px;
        font-weight: 500;
      }
      .provider-desc {
        font-size: 12px;
        color: #a1a1a1;
        margin-top: 2px;
      }

      /* Form Fields */
      .form-group {
        margin-bottom: 16px;
      }
      .form-label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 6px;
        color: #fafafa;
      }
      .input-wrap {
        position: relative;
      }
      .form-input {
        width: 100%;
        padding: 10px 12px;
        background: #0d0d0d;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        color: #fafafa;
        font-size: 14px;
        font-family: inherit;
        outline: none;
        transition: border-color 0.2s;
      }
      .form-input:focus {
        border-color: #3b82f6;
      }
      .form-input::placeholder {
        color: #6b6b6b;
      }
      .form-input.has-toggle {
        padding-right: 40px;
      }
      .form-select {
        width: 100%;
        padding: 10px 12px;
        background: #0d0d0d;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        color: #fafafa;
        font-size: 14px;
        font-family: inherit;
        outline: none;
        appearance: auto;
        cursor: pointer;
      }
      .form-select:focus {
        border-color: #3b82f6;
      }
      .form-select option {
        background: #1a1a1a;
        color: #fafafa;
      }

      /* Eye toggle */
      .eye-toggle {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: #6b6b6b;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
      }
      .eye-toggle:hover {
        color: #fafafa;
      }
      .eye-toggle svg {
        width: 18px;
        height: 18px;
      }

      /* Buttons */
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: opacity 0.15s;
        font-family: inherit;
      }
      .btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .btn-outline {
        background: transparent;
        border: 1px solid #2a2a2a;
        color: #fafafa;
      }
      .btn-outline:hover:not(:disabled) {
        background: #242424;
      }
      .btn-primary {
        background: #3b82f6;
        color: white;
      }
      .btn-primary:hover:not(:disabled) {
        opacity: 0.9;
      }
      .btn-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      /* Validation Status */
      .validation-status {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        margin-top: 12px;
      }
      .validation-status svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }
      .validation-success {
        color: #22c55e;
      }
      .validation-error {
        color: #ef4444;
      }

      /* Resource Info */
      .resource-box {
        background: #242424;
        border-radius: 8px;
        padding: 12px 16px;
        margin-top: 12px;
      }
      .resource-title {
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 8px;
      }
      .resource-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .resource-list li {
        font-size: 13px;
        color: #a1a1a1;
        padding: 2px 0;
      }

      /* Fallback Header */
      .fallback-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #a1a1a1;
        cursor: pointer;
      }
      .checkbox-label input[type='checkbox'] {
        accent-color: #3b82f6;
        width: 16px;
        height: 16px;
        cursor: pointer;
      }

      /* Save Row */
      .save-row {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 16px;
        margin-top: 8px;
      }
      .msg-success {
        font-size: 13px;
        color: #22c55e;
      }
      .msg-error {
        font-size: 13px;
        color: #ef4444;
      }
    `,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <div class="header-inner">
          <a routerLink="/chat" class="back-link">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </a>
          <span class="header-icon">
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
          </span>
          <h1 class="page-title">AI Provider Configuration</h1>
        </div>
      </header>

      <div class="page-content">
        @if (isLoading$()) {
          <div class="loading-center">
            <div class="spinner"></div>
          </div>
        } @else {
          <!-- Primary Provider Section -->
          <div class="section-card">
            <h2 class="section-title">Primary Provider</h2>
            <p class="section-desc">
              Select the main AI provider for your platform. This is used for all AI operations.
            </p>

            <div class="provider-grid">
              <button
                type="button"
                class="provider-btn"
                [class.selected]="primaryProviderType$() === 'OPENAI'"
                (click)="selectPrimaryProvider(LlmProviderType.OPENAI)"
              >
                <div class="provider-icon">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div class="provider-info">
                  <div class="provider-name">OpenAI</div>
                  <div class="provider-desc">GPT-4o, GPT-4, GPT-3.5</div>
                </div>
              </button>
              <button
                type="button"
                class="provider-btn"
                [class.selected]="primaryProviderType$() === 'OPENROUTER'"
                (click)="selectPrimaryProvider(LlmProviderType.OPENROUTER)"
              >
                <div class="provider-icon">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                    />
                  </svg>
                </div>
                <div class="provider-info">
                  <div class="provider-name">OpenRouter</div>
                  <div class="provider-desc">Cloud-based, multiple models</div>
                </div>
              </button>
              <button
                type="button"
                class="provider-btn"
                [class.selected]="primaryProviderType$() === 'LOCAL_LLAMA'"
                (click)="selectPrimaryProvider(LlmProviderType.LOCAL_LLAMA)"
              >
                <div class="provider-icon">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                    />
                  </svg>
                </div>
                <div class="provider-info">
                  <div class="provider-name">Local Llama</div>
                  <div class="provider-desc">Self-hosted, Ollama</div>
                </div>
              </button>
              <button
                type="button"
                class="provider-btn"
                [class.selected]="primaryProviderType$() === 'LM_STUDIO'"
                (click)="selectPrimaryProvider(LlmProviderType.LM_STUDIO)"
              >
                <div class="provider-icon">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div class="provider-info">
                  <div class="provider-name">LM Studio</div>
                  <div class="provider-desc">Local AI, OpenAI-compatible</div>
                </div>
              </button>
            </div>

            <!-- OpenRouter Form -->
            @if (primaryProviderType$() === 'OPENROUTER') {
              <div class="form-group">
                <label class="form-label">API Key</label>
                <div class="input-wrap">
                  <input
                    [type]="showApiKey$() ? 'text' : 'password'"
                    [(ngModel)]="primaryApiKey"
                    class="form-input has-toggle"
                    placeholder="sk-or-..."
                  />
                  <button
                    type="button"
                    class="eye-toggle"
                    (click)="showApiKey$.set(!showApiKey$())"
                  >
                    @if (showApiKey$()) {
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        />
                      </svg>
                    } @else {
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    }
                  </button>
                </div>
              </div>

              <button
                type="button"
                class="btn btn-outline"
                (click)="validatePrimaryProvider()"
                [disabled]="isValidating$()"
              >
                @if (isValidating$()) {
                  <span class="btn-spinner"></span>
                  Validating...
                } @else {
                  Validate API Key
                }
              </button>

              @if (primaryValidation$()) {
                <div
                  class="validation-status"
                  [class.validation-success]="primaryValidation$()!.valid"
                  [class.validation-error]="!primaryValidation$()!.valid"
                >
                  @if (primaryValidation$()!.valid) {
                    <svg fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    API key is valid
                  } @else {
                    <svg fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    {{ primaryValidation$()!.errorMessage }}
                  }
                </div>
              }

              @if (primaryValidation$()?.valid && primaryValidation$()!.models.length > 0) {
                <div class="form-group" style="margin-top: 16px;">
                  <label class="form-label">Model</label>
                  <select [(ngModel)]="primaryModelId" class="form-select">
                    @for (model of primaryValidation$()!.models; track model.id) {
                      <option [value]="model.id">
                        {{ model.name }}
                        @if (model.costPer1kTokens !== null) {
                          ({{ model.costPer1kTokens | number: '1.4-4' }}/1K tokens)
                        }
                      </option>
                    }
                  </select>
                </div>
              }
            }

            <!-- OpenAI Form -->
            @if (primaryProviderType$() === 'OPENAI') {
              <div class="form-group">
                <label class="form-label">API Key</label>
                <div class="input-wrap">
                  <input
                    [type]="showApiKey$() ? 'text' : 'password'"
                    [(ngModel)]="primaryApiKey"
                    class="form-input has-toggle"
                    placeholder="sk-..."
                  />
                  <button
                    type="button"
                    class="eye-toggle"
                    (click)="showApiKey$.set(!showApiKey$())"
                  >
                    @if (showApiKey$()) {
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        />
                      </svg>
                    } @else {
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    }
                  </button>
                </div>
              </div>

              <button
                type="button"
                class="btn btn-outline"
                (click)="validatePrimaryProvider()"
                [disabled]="isValidating$()"
              >
                @if (isValidating$()) {
                  <span class="btn-spinner"></span>
                  Validating...
                } @else {
                  Validate API Key
                }
              </button>

              @if (primaryValidation$()) {
                <div
                  class="validation-status"
                  [class.validation-success]="primaryValidation$()!.valid"
                  [class.validation-error]="!primaryValidation$()!.valid"
                >
                  @if (primaryValidation$()!.valid) {
                    <svg fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    API key is valid
                  } @else {
                    <svg fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    {{ primaryValidation$()!.errorMessage }}
                  }
                </div>
              }

              @if (primaryValidation$()?.valid && primaryValidation$()!.models.length > 0) {
                <div class="form-group" style="margin-top: 16px;">
                  <label class="form-label">Model</label>
                  <select [(ngModel)]="primaryModelId" class="form-select">
                    @for (model of primaryValidation$()!.models; track model.id) {
                      <option [value]="model.id">{{ model.name }}</option>
                    }
                  </select>
                </div>
              }
            }

            <!-- Local Llama Form -->
            @if (primaryProviderType$() === 'LOCAL_LLAMA') {
              <div class="form-group">
                <label class="form-label">Endpoint URL</label>
                <input
                  type="text"
                  [(ngModel)]="primaryEndpoint"
                  class="form-input"
                  placeholder="http://localhost:11434"
                />
              </div>

              <button
                type="button"
                class="btn btn-outline"
                (click)="validatePrimaryProvider()"
                [disabled]="isValidating$()"
              >
                @if (isValidating$()) {
                  <span class="btn-spinner"></span>
                  Checking...
                } @else {
                  Check Connection
                }
              </button>

              @if (primaryValidation$()) {
                <div
                  class="validation-status"
                  [class.validation-success]="primaryValidation$()!.valid"
                  [class.validation-error]="!primaryValidation$()!.valid"
                >
                  @if (primaryValidation$()!.valid) {
                    <svg fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    Connection successful
                  } @else {
                    <svg fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    {{ primaryValidation$()!.errorMessage }}
                  }
                </div>
              }

              @if (primaryValidation$()?.valid && primaryValidation$()!.models.length > 0) {
                <div class="form-group" style="margin-top: 16px;">
                  <label class="form-label">Model</label>
                  <select [(ngModel)]="primaryModelId" class="form-select">
                    @for (model of primaryValidation$()!.models; track model.id) {
                      <option [value]="model.id">{{ model.name }}</option>
                    }
                  </select>
                </div>

                @if (primaryValidation$()!.resourceInfo) {
                  <div class="resource-box">
                    <p class="resource-title">Resource Requirements:</p>
                    <ul class="resource-list">
                      @if (primaryValidation$()!.resourceInfo!.gpuRequired) {
                        <li>
                          GPU: {{ primaryValidation$()!.resourceInfo!.gpuMemoryGb }} GB VRAM
                          recommended
                        </li>
                      }
                      <li>CPU: {{ primaryValidation$()!.resourceInfo!.cpuCores }} cores minimum</li>
                      <li>RAM: {{ primaryValidation$()!.resourceInfo!.ramGb }} GB minimum</li>
                    </ul>
                  </div>
                }
              }
            }

            <!-- LM Studio Form -->
            @if (primaryProviderType$() === 'LM_STUDIO') {
              <div class="form-group">
                <label class="form-label">Endpoint URL</label>
                <input
                  type="text"
                  [(ngModel)]="primaryEndpoint"
                  class="form-input"
                  placeholder="http://localhost:1234"
                />
              </div>

              <button
                type="button"
                class="btn btn-outline"
                (click)="validatePrimaryProvider()"
                [disabled]="isValidating$()"
              >
                @if (isValidating$()) {
                  <span class="btn-spinner"></span>
                  Checking...
                } @else {
                  Check Connection
                }
              </button>

              @if (primaryValidation$()) {
                <div
                  class="validation-status"
                  [class.validation-success]="primaryValidation$()!.valid"
                  [class.validation-error]="!primaryValidation$()!.valid"
                >
                  @if (primaryValidation$()!.valid) {
                    <svg fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    Connection successful
                  } @else {
                    <svg fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    {{ primaryValidation$()!.errorMessage }}
                  }
                </div>
              }

              @if (primaryValidation$()?.valid && primaryValidation$()!.models.length > 0) {
                <div class="form-group" style="margin-top: 16px;">
                  <label class="form-label">Model</label>
                  <select [(ngModel)]="primaryModelId" class="form-select">
                    @for (model of primaryValidation$()!.models; track model.id) {
                      <option [value]="model.id">{{ model.name }}</option>
                    }
                  </select>
                </div>
              }
            }
          </div>

          <!-- Fallback Provider Section -->
          <div class="section-card">
            <div class="fallback-header">
              <h2 class="section-title">Fallback Provider (Optional)</h2>
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="hasFallback" />
                Enable fallback
              </label>
            </div>
            <p class="section-desc">
              A fallback provider is used when the primary provider is unavailable.
            </p>

            @if (hasFallback) {
              <div class="provider-grid">
                <button
                  type="button"
                  class="provider-btn"
                  [class.selected]="fallbackProviderType$() === 'OPENAI'"
                  (click)="selectFallbackProvider(LlmProviderType.OPENAI)"
                >
                  <div class="provider-icon">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div class="provider-info">
                    <div class="provider-name">OpenAI</div>
                    <div class="provider-desc">GPT models</div>
                  </div>
                </button>
                <button
                  type="button"
                  class="provider-btn"
                  [class.selected]="fallbackProviderType$() === 'OPENROUTER'"
                  (click)="selectFallbackProvider(LlmProviderType.OPENROUTER)"
                >
                  <div class="provider-icon">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                      />
                    </svg>
                  </div>
                  <div class="provider-info">
                    <div class="provider-name">OpenRouter</div>
                    <div class="provider-desc">Cloud-based</div>
                  </div>
                </button>
                <button
                  type="button"
                  class="provider-btn"
                  [class.selected]="fallbackProviderType$() === 'LOCAL_LLAMA'"
                  (click)="selectFallbackProvider(LlmProviderType.LOCAL_LLAMA)"
                >
                  <div class="provider-icon">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                      />
                    </svg>
                  </div>
                  <div class="provider-info">
                    <div class="provider-name">Local Llama</div>
                    <div class="provider-desc">Self-hosted</div>
                  </div>
                </button>
                <button
                  type="button"
                  class="provider-btn"
                  [class.selected]="fallbackProviderType$() === 'LM_STUDIO'"
                  (click)="selectFallbackProvider(LlmProviderType.LM_STUDIO)"
                >
                  <div class="provider-icon">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div class="provider-info">
                    <div class="provider-name">LM Studio</div>
                    <div class="provider-desc">Local AI</div>
                  </div>
                </button>
              </div>

              <!-- Fallback OpenAI Form -->
              @if (fallbackProviderType$() === 'OPENAI') {
                <div class="form-group">
                  <label class="form-label">API Key</label>
                  <input
                    type="password"
                    [(ngModel)]="fallbackApiKey"
                    class="form-input"
                    placeholder="sk-..."
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Model ID</label>
                  <input
                    type="text"
                    [(ngModel)]="fallbackModelId"
                    class="form-input"
                    placeholder="gpt-4o"
                  />
                </div>
              }

              <!-- Fallback OpenRouter Form -->
              @if (fallbackProviderType$() === 'OPENROUTER') {
                <div class="form-group">
                  <label class="form-label">API Key</label>
                  <input
                    type="password"
                    [(ngModel)]="fallbackApiKey"
                    class="form-input"
                    placeholder="sk-or-..."
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Model ID</label>
                  <input
                    type="text"
                    [(ngModel)]="fallbackModelId"
                    class="form-input"
                    placeholder="meta-llama/llama-3.1-8b-instruct"
                  />
                </div>
              }

              <!-- Fallback Local Llama Form -->
              @if (fallbackProviderType$() === 'LOCAL_LLAMA') {
                <div class="form-group">
                  <label class="form-label">Endpoint URL</label>
                  <input
                    type="text"
                    [(ngModel)]="fallbackEndpoint"
                    class="form-input"
                    placeholder="http://localhost:11434"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Model ID</label>
                  <input
                    type="text"
                    [(ngModel)]="fallbackModelId"
                    class="form-input"
                    placeholder="llama3.1:8b"
                  />
                </div>
              }

              <!-- Fallback LM Studio Form -->
              @if (fallbackProviderType$() === 'LM_STUDIO') {
                <div class="form-group">
                  <label class="form-label">Endpoint URL</label>
                  <input
                    type="text"
                    [(ngModel)]="fallbackEndpoint"
                    class="form-input"
                    placeholder="http://localhost:1234"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Model ID</label>
                  <input
                    type="text"
                    [(ngModel)]="fallbackModelId"
                    class="form-input"
                    placeholder="model-name"
                  />
                </div>
              }
            }
          </div>

          <!-- Save Button -->
          <div class="save-row">
            @if (errorMessage$()) {
              <span class="msg-error">{{ errorMessage$() }}</span>
            }
            @if (successMessage$()) {
              <span class="msg-success">{{ successMessage$() }}</span>
            }
            <button
              type="button"
              class="btn btn-primary"
              (click)="saveConfiguration()"
              [disabled]="isSaving$() || !canSave()"
            >
              @if (isSaving$()) {
                <span class="btn-spinner"></span>
                Saving...
              } @else {
                Save Configuration
              }
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class LlmConfigComponent implements OnInit {
  private readonly llmConfigService = inject(LlmConfigService);
  private readonly destroyRef = inject(DestroyRef);

  // Expose enum for template use
  readonly LlmProviderType = LlmProviderType;

  // UI state signals
  readonly isLoading$ = signal(true);
  readonly isValidating$ = signal(false);
  readonly isSaving$ = signal(false);
  readonly showApiKey$ = signal(false);
  readonly errorMessage$ = signal('');
  readonly successMessage$ = signal('');

  // Primary provider state
  readonly primaryProviderType$ = signal<LlmProviderType>(LlmProviderType.OPENROUTER);
  readonly primaryValidation$ = signal<LlmProviderStatus | null>(null);

  // Fallback provider state
  readonly fallbackProviderType$ = signal<LlmProviderType>(LlmProviderType.LOCAL_LLAMA);

  // Form fields
  primaryApiKey = '';
  primaryEndpoint = 'http://localhost:11434';
  primaryModelId = '';

  fallbackApiKey = '';
  fallbackEndpoint = 'http://localhost:11434';
  fallbackModelId = '';
  hasFallback = false;

  ngOnInit(): void {
    this.loadConfig();
  }

  private loadConfig(): void {
    this.isLoading$.set(true);

    this.llmConfigService
      .getConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const config = response.data;

          if (config.primaryProvider) {
            this.primaryProviderType$.set(config.primaryProvider.providerType);
            this.primaryModelId = config.primaryProvider.modelId;
            if (config.primaryProvider.endpoint) {
              this.primaryEndpoint = config.primaryProvider.endpoint;
            }
          }

          if (config.fallbackProvider) {
            this.hasFallback = true;
            this.fallbackProviderType$.set(config.fallbackProvider.providerType);
            this.fallbackModelId = config.fallbackProvider.modelId;
            if (config.fallbackProvider.endpoint) {
              this.fallbackEndpoint = config.fallbackProvider.endpoint;
            }
          }

          this.isLoading$.set(false);
        },
        error: (err: Error) => {
          this.errorMessage$.set(err.message || 'Failed to load configuration');
          this.isLoading$.set(false);
        },
      });
  }

  selectPrimaryProvider(type: LlmProviderType): void {
    this.primaryProviderType$.set(type);
    this.primaryValidation$.set(null);
    this.primaryModelId = '';
  }

  selectFallbackProvider(type: LlmProviderType): void {
    this.fallbackProviderType$.set(type);
    this.fallbackModelId = '';
  }

  validatePrimaryProvider(): void {
    this.isValidating$.set(true);
    this.primaryValidation$.set(null);

    const type = this.primaryProviderType$();
    const apiKey =
      type === LlmProviderType.OPENROUTER || type === LlmProviderType.OPENAI
        ? this.primaryApiKey
        : undefined;
    const endpoint =
      type === LlmProviderType.LOCAL_LLAMA || type === LlmProviderType.LM_STUDIO
        ? this.primaryEndpoint
        : undefined;

    this.llmConfigService
      .validateProvider(type, apiKey, endpoint)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.primaryValidation$.set(response.data);
          const firstModel = response.data.models[0];
          if (response.data.valid && firstModel) {
            this.primaryModelId = firstModel.id;
          }
          this.isValidating$.set(false);
        },
        error: (err: Error) => {
          this.primaryValidation$.set({
            valid: false,
            models: [],
            resourceInfo: null,
            errorMessage: err.message || 'Validation failed',
          });
          this.isValidating$.set(false);
        },
      });
  }

  canSave(): boolean {
    // Must have valid primary provider
    if (!this.primaryModelId) return false;

    // If OpenRouter or OpenAI, need API key
    if (
      (this.primaryProviderType$() === LlmProviderType.OPENROUTER ||
        this.primaryProviderType$() === LlmProviderType.OPENAI) &&
      !this.primaryApiKey
    ) {
      return false;
    }

    // If fallback enabled, need model ID
    if (this.hasFallback && !this.fallbackModelId) {
      return false;
    }

    return true;
  }

  saveConfiguration(): void {
    this.isSaving$.set(true);
    this.errorMessage$.set('');
    this.successMessage$.set('');

    const config = {
      primaryProvider: {
        type: this.primaryProviderType$(),
        apiKey:
          this.primaryProviderType$() === LlmProviderType.OPENROUTER ||
          this.primaryProviderType$() === LlmProviderType.OPENAI
            ? this.primaryApiKey
            : undefined,
        endpoint:
          this.primaryProviderType$() === LlmProviderType.LOCAL_LLAMA ||
          this.primaryProviderType$() === LlmProviderType.LM_STUDIO
            ? this.primaryEndpoint
            : undefined,
        modelId: this.primaryModelId,
      },
      fallbackProvider: this.hasFallback
        ? {
            type: this.fallbackProviderType$(),
            apiKey:
              this.fallbackProviderType$() === LlmProviderType.OPENROUTER ||
              this.fallbackProviderType$() === LlmProviderType.OPENAI
                ? this.fallbackApiKey
                : undefined,
            endpoint:
              this.fallbackProviderType$() === LlmProviderType.LOCAL_LLAMA ||
              this.fallbackProviderType$() === LlmProviderType.LM_STUDIO
                ? this.fallbackEndpoint
                : undefined,
            modelId: this.fallbackModelId,
          }
        : null,
    };

    this.llmConfigService
      .updateConfig(config)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.successMessage$.set('Configuration saved successfully');
          this.isSaving$.set(false);
          // Clear success message after 3 seconds
          setTimeout(() => this.successMessage$.set(''), 3000);
        },
        error: (err: Error) => {
          this.errorMessage$.set(err.message || 'Failed to save configuration');
          this.isSaving$.set(false);
        },
      });
  }
}
