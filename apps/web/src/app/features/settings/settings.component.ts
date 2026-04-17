import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { PageLoadingService } from '../../core/services/page-loading.service';

interface ConfigField {
  key: string;
  label: string;
  type: 'string' | 'url' | 'secret';
  required: boolean;
  placeholder: string;
  helpText: string;
}

interface ConfigSchema {
  toolDescription: string;
  fields: ConfigField[];
  docUrl?: string;
}

interface CatalogItem {
  id: string;
  type: 'process' | 'tool';
  name: string;
  slug: string;
  description: string;
  icon: string;
  category: string;
  requiredTier: string;
  creditCost: number;
  enabled: boolean;
  configured: boolean;
  configSchema: ConfigSchema | null;
  currentConfig: Record<string, string> | null;
  customConfig: unknown;
  enabledAt: string | null;
  enabledBy: string | null;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="settings-page">
      <div class="settings-header">
        <h1 class="settings-title">Settings</h1>
        <p class="settings-subtitle">Manage processes and tools for your team</p>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'process'"
          (click)="activeTab.set('process')"
        >
          Processes
          <span class="tab-count">{{ processItems().length }}</span>
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'tool'"
          (click)="activeTab.set('tool')"
        >
          Tools (MCP)
          <span class="tab-count">{{ toolItems().length }}</span>
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'integrations'"
          (click)="activeTab.set('integrations'); loadIntegrations()"
        >
          Integrations
          <span class="tab-count">{{ mcpTools().length }}</span>
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'images'"
          (click)="activeTab.set('images'); loadProductImages()"
        >
          Product Images
          <span class="tab-count">{{ productImages().length }}</span>
        </button>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Loading catalog...</p>
        </div>
      }

      <!-- Error -->
      @if (error()) {
        <div class="error-state">
          <p>{{ error() }}</p>
          <button class="retry-btn" (click)="loadCatalog()">Try again</button>
        </div>
      }

      <!-- Grid (only for Processes and Tools tabs) -->
      @if (!loading() && !error() && activeTab() !== 'images') {
        <div class="catalog-grid">
          @for (item of activeItems(); track item.id) {
            <div
              class="catalog-card"
              [class.enabled]="item.enabled"
              [class.locked]="isLocked(item)"
              (click)="onCardClick(item)"
            >
              <div class="card-header">
                <span class="card-icon">{{ item.icon }}</span>
                <div class="card-meta">
                  <h3 class="card-name">{{ item.name }}</h3>
                  <span class="card-category">{{ item.category }}</span>
                </div>
                <div class="card-toggle">
                  @if (isLocked(item)) {
                    <span class="lock-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </span>
                  } @else if (item.type === 'tool') {
                    @if (togglingId() === item.id) {
                      <span class="toggling-status">Connecting...</span>
                    } @else if (item.enabled && item.configured) {
                      <span class="connected-badge">Connected</span>
                    } @else {
                      <button class="configure-btn" (click)="openConfigModal(item); $event.stopPropagation()">
                        Configure
                      </button>
                    }
                  } @else {
                    @if (togglingId() === item.id) {
                      <span class="toggling-status">Connecting...</span>
                    } @else {
                      <label class="toggle" (click)="$event.stopPropagation()">
                        <input
                          type="checkbox"
                          [checked]="item.enabled"
                          (change)="toggleItem(item)"
                        />
                        <span class="toggle-slider"></span>
                      </label>
                    }
                  }
                </div>
              </div>

              <p class="card-description">{{ item.description }}</p>

              <div class="card-footer">
                <span class="tier-badge" [attr.data-tier]="item.requiredTier">
                  {{ tierLabel(item.requiredTier) }}
                </span>
                @if (item.creditCost > 0) {
                  <span class="credit-cost">{{ item.creditCost }} credits/run</span>
                } @else {
                  <span class="credit-cost free">Free</span>
                }
                @if (isLocked(item)) {
                  <span class="upgrade-hint">Upgrade to {{ tierLabel(item.requiredTier) }}</span>
                }
              </div>
            </div>
          }
        </div>

        @if (activeItems().length === 0) {
          <div class="empty-state">
            <p>No available items in this category.</p>
          </div>
        }
      }

      <!-- Integrations Tab -->
      @if (activeTab() === 'integrations') {
        <div class="integrations-section">
          @if (integrationsLoading()) {
            <div class="loading-state"><div class="spinner"></div><p>Loading integrations...</p></div>
          } @else {
            <div class="integrations-grid">
              @for (tool of mcpTools(); track tool.slug) {
                <div class="integration-card" [class.connected]="tool.connected" (click)="selectMcpTool(tool)">
                  <div class="integration-header">
                    <div class="tool-icon" [style.background]="tool.connected ? '#10B981' : '#374151'">
                      {{ tool.displayName.charAt(0) }}
                    </div>
                    <div class="tool-info">
                      <span class="tool-name">{{ tool.displayName }}</span>
                      <span class="tool-category">{{ tool.category }}</span>
                    </div>
                    <span class="connection-dot" [class.active]="tool.connected"></span>
                  </div>
                  <p class="tool-desc">{{ tool.description?.substring(0, 100) }}{{ (tool.description?.length || 0) > 100 ? '...' : '' }}</p>
                  <div class="tool-ops">{{ tool.operations?.length || 0 }} operations</div>
                </div>
              }
            </div>

            <!-- Connection panel -->
            @if (selectedMcpTool()) {
              <div class="connection-panel">
                <div class="panel-header">
                  <h3>{{ selectedMcpTool()!.displayName }}</h3>
                  <button class="close-btn" (click)="selectedMcpTool.set(null)">✕</button>
                </div>
                <p class="panel-desc">{{ selectedMcpTool()!.description }}</p>

                @if (!selectedMcpTool()!.connected) {
                  <div class="connect-form">
                    <label class="form-label">API Key</label>
                    <input type="password" class="form-input" [value]="mcpApiKeyInput()" (input)="mcpApiKeyInput.set($any($event.target).value)" placeholder="Enter your API key" />
                    <button class="connect-btn" [disabled]="mcpConnecting()" (click)="connectMcpTool()">
                      @if (mcpConnecting()) { Connecting... } @else { Connect }
                    </button>
                  </div>
                } @else {
                  <div class="connected-info">
                    <span class="status-badge connected">✓ Connected</span>
                    <div class="connected-actions">
                      <button class="test-btn" [disabled]="mcpTesting()" (click)="testMcpConnection()">
                        @if (mcpTesting()) { Testing... } @else { Test Connection }
                      </button>
                      <button class="disconnect-btn" (click)="disconnectMcpTool()">Disconnect</button>
                    </div>
                  </div>
                }

                @if (mcpConnectionMessage()) {
                  <div class="connection-message" [class.success]="mcpConnectionSuccess()" [class.error]="!mcpConnectionSuccess()">
                    {{ mcpConnectionMessage() }}
                  </div>
                }

                <div class="operations-list">
                  <h4>Operations</h4>
                  @for (op of selectedMcpTool()!.operations; track $index) {
                    <div class="operation-item">
                      <span class="op-badge" [class.search]="op.kind === 'search'" [class.write]="op.kind === 'write'" [class.read]="op.kind === 'read'">{{ op.kind }}</span>
                      <span class="op-name">{{ op.displayName || op.id }}</span>
                      @if (selectedMcpTool()!.verifiedOperations?.includes(op.id)) {
                        <span class="op-status verified">✓ Verified</span>
                      } @else if (selectedMcpTool()!.failedOperations?.includes(op.id)) {
                        <span class="op-status failed">✗ Not available</span>
                      } @else {
                        <span class="op-status unknown">? Not tested</span>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          }
        </div>
      }

      <!-- Product Images Tab -->
      @if (activeTab() === 'images') {
        <div class="images-section">
          <div class="images-header">
            <p class="images-desc">
              Upload images of your products and materials. The AI uses them as references when creating content.
            </p>
            <label class="upload-btn" [class.uploading]="imageUploading()">
              @if (imageUploading()) {
                <span class="btn-spinner"></span> Uploading...
              } @else {
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Upload image
              }
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple (change)="onImagesSelected($event)" hidden />
            </label>
          </div>

          @if (productImages().length === 0 && !imageUploading()) {
            <div class="empty-state">
              <p>No uploaded images. Add product images for better content.</p>
            </div>
          }

          <div class="images-list">
            @for (img of productImages(); track img.id) {
              <div class="image-card-wide">
                <div class="image-thumb">
                  <img [src]="'api/v1/product-images/' + img.id + '/file'" [alt]="img.label" loading="lazy" />
                </div>
                <div class="image-details">
                  <input
                    class="image-name-input"
                    [value]="img.label || img.originalName"
                    (blur)="updateImageLabel(img.id, $event)"
                    (keydown.enter)="$any($event.target).blur()"
                  />
                  <textarea
                    class="image-desc-input"
                    [value]="img.description || ''"
                    placeholder="Add a description (e.g. Gold sculpture, front view, studio lighting)"
                    (blur)="updateImageDescription(img.id, $event)"
                    rows="2"
                  ></textarea>
                  <span class="image-meta">{{ formatSize(img.size) }} · {{ img.mimeType }}</span>
                </div>
                <button class="image-delete-btn" (click)="deleteImage(img.id)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                  </svg>
                </button>
              </div>
            }
          </div>
        </div>
      }

      <!-- Config Modal -->
      @if (configModalItem()) {
        <div class="modal-overlay" (click)="closeConfigModal()">
          <div class="modal-content" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <div class="modal-title-row">
                <span class="modal-icon">{{ configModalItem()!.icon }}</span>
                <div>
                  <h2 class="modal-title">{{ configModalItem()!.name }}</h2>
                  <span class="modal-category">{{ configModalItem()!.category }}</span>
                </div>
              </div>
              <button class="modal-close" (click)="closeConfigModal()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            @if (configModalItem()!.configSchema?.toolDescription) {
              <p class="modal-description">{{ configModalItem()!.configSchema!.toolDescription }}</p>
            }

            <div class="config-form">
              @for (field of configModalItem()!.configSchema?.fields ?? []; track field.key) {
                <div class="form-group">
                  <label class="form-label" [for]="'field-' + field.key">
                    {{ field.label }}
                    @if (field.required) {
                      <span class="required-star">*</span>
                    }
                  </label>
                  <div class="input-wrapper">
                    @if (field.type === 'secret') {
                      <input
                        [id]="'field-' + field.key"
                        [type]="showSecrets()[field.key] ? 'text' : 'password'"
                        class="form-input"
                        [class.has-stored-value]="isSecretStored(field.key)"
                        [placeholder]="isSecretStored(field.key) ? '••••••• (saved — leave empty to keep)' : field.placeholder"
                        [ngModel]="formValues()[field.key] ?? ''"
                        (ngModelChange)="updateFormValue(field.key, $event)"
                      />
                      <button
                        class="secret-toggle"
                        type="button"
                        (click)="toggleSecretVisibility(field.key)"
                      >
                        {{ showSecrets()[field.key] ? 'Hide' : 'Show' }}
                      </button>
                    } @else {
                      <input
                        [id]="'field-' + field.key"
                        type="text"
                        class="form-input"
                        [placeholder]="field.placeholder"
                        [ngModel]="formValues()[field.key] ?? ''"
                        (ngModelChange)="updateFormValue(field.key, $event)"
                      />
                    }
                  </div>
                  <p class="form-help">{{ field.helpText }}</p>
                </div>
              }
            </div>

            @if (configModalItem()!.configSchema?.docUrl) {
              <a class="doc-link" [href]="configModalItem()!.configSchema!.docUrl" target="_blank" rel="noopener">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Documentation
              </a>
            }

            @if (configError()) {
              <div class="config-error">{{ configError() }}</div>
            }

            @if (configSuccess()) {
              <div class="config-success">Connection successful! Tool activated.</div>
            }

            <div class="modal-actions">
              <button class="btn-secondary" (click)="closeConfigModal()">Cancel</button>
              <button
                class="btn-test"
                [disabled]="configSaving()"
                (click)="testConnection()"
              >
                @if (configTesting()) {
                  <span class="btn-spinner"></span> Testing...
                } @else {
                  Test connection
                }
              </button>
              <button
                class="btn-primary"
                [disabled]="configSaving() || !isFormValid()"
                (click)="saveConfig()"
              >
                @if (configSaving()) {
                  <span class="btn-spinner"></span> Saving...
                } @else {
                  Save and connect
                }
              </button>
            </div>

            @if (configModalItem()!.enabled && configModalItem()!.configured) {
              <div class="disconnect-section">
                <button class="btn-disconnect" (click)="disconnectTool()">
                  Disconnect tool
                </button>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .settings-page {
      padding: 32px;
      min-height: 100vh;
      color: #E6EDF3;
    }

    .settings-header { margin-bottom: 32px; }

    .settings-title {
      font-size: 28px;
      font-weight: 700;
      margin: 0 0 8px 0;
      color: #E6EDF3;
    }

    .settings-subtitle {
      font-size: 14px;
      color: #8B949E;
      margin: 0;
    }

    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 24px;
      border-bottom: 1px solid #21262D;
      padding-bottom: 0;
    }

    .tab-btn {
      background: none;
      border: none;
      color: #8B949E;
      font-size: 14px;
      font-weight: 500;
      padding: 10px 20px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tab-btn:hover { color: #E6EDF3; }

    .tab-btn.active {
      color: #58A6FF;
      border-bottom-color: #58A6FF;
    }

    .tab-count {
      background: #1C2128;
      color: #8B949E;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 600;
    }

    .tab-btn.active .tab-count {
      background: rgba(88, 166, 255, 0.15);
      color: #58A6FF;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 0;
      gap: 16px;
      color: #8B949E;
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #21262D;
      border-top-color: #58A6FF;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .error-state {
      text-align: center;
      padding: 60px 0;
      color: #F85149;
    }

    .retry-btn {
      margin-top: 12px;
      background: #1C2128;
      border: 1px solid #21262D;
      color: #E6EDF3;
      padding: 8px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }

    .retry-btn:hover { background: #21262D; }

    .catalog-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    @media (max-width: 1024px) {
      .catalog-grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 640px) {
      .catalog-grid { grid-template-columns: 1fr; }
      .settings-page { padding: 16px; }
    }

    .catalog-card {
      background: #161B22;
      border: 1px solid #21262D;
      border-radius: 12px;
      padding: 20px;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 12px;
      cursor: pointer;
    }

    .catalog-card:hover {
      border-color: #58A6FF;
      box-shadow: 0 0 0 1px rgba(88, 166, 255, 0.1);
    }

    .catalog-card.enabled {
      border-color: rgba(88, 166, 255, 0.3);
      background: linear-gradient(135deg, #161B22 0%, rgba(88, 166, 255, 0.03) 100%);
    }

    .catalog-card.locked { opacity: 0.6; cursor: default; }
    .catalog-card.locked:hover { border-color: #21262D; box-shadow: none; }

    .card-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .card-icon { font-size: 28px; line-height: 1; flex-shrink: 0; }

    .card-meta { flex: 1; min-width: 0; }

    .card-name {
      font-size: 15px;
      font-weight: 600;
      margin: 0;
      color: #E6EDF3;
    }

    .card-category {
      font-size: 11px;
      color: #6E7681;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 500;
    }

    .card-toggle { flex-shrink: 0; }

    .lock-icon { color: #6E7681; display: flex; align-items: center; }

    .connected-badge {
      font-size: 11px;
      font-weight: 600;
      color: #3FB950;
      background: rgba(63, 185, 80, 0.1);
      padding: 4px 10px;
      border-radius: 4px;
    }

    .configure-btn {
      font-size: 12px;
      font-weight: 500;
      color: #58A6FF;
      background: rgba(88, 166, 255, 0.1);
      border: 1px solid rgba(88, 166, 255, 0.2);
      padding: 4px 12px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .configure-btn:hover {
      background: rgba(88, 166, 255, 0.2);
      border-color: rgba(88, 166, 255, 0.4);
    }

    .toggle {
      position: relative;
      display: inline-block;
      width: 40px;
      height: 22px;
      cursor: pointer;
    }

    .toggle input { opacity: 0; width: 0; height: 0; position: absolute; }

    .toggle-slider {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: #21262D;
      border-radius: 11px;
      transition: all 0.2s ease;
    }

    .toggle-slider::before {
      content: '';
      position: absolute;
      width: 16px; height: 16px;
      left: 3px; bottom: 3px;
      background: #6E7681;
      border-radius: 50%;
      transition: all 0.2s ease;
    }

    .toggle input:checked + .toggle-slider { background: #58A6FF; }

    .toggling-status {
      font-size: 11px;
      color: #58A6FF;
      animation: pulse 1s ease-in-out infinite;
    }

    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    .toggle input:checked + .toggle-slider::before {
      transform: translateX(18px);
      background: #E6EDF3;
    }

    .card-description {
      font-size: 13px;
      line-height: 1.5;
      color: #8B949E;
      margin: 0;
      flex: 1;
    }

    .card-footer {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 4px;
    }

    .tier-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .tier-badge[data-tier="starter"] { background: rgba(63, 185, 80, 0.1); color: #3FB950; }
    .tier-badge[data-tier="pro"] { background: rgba(88, 166, 255, 0.1); color: #58A6FF; }
    .tier-badge[data-tier="enterprise"] { background: rgba(188, 140, 255, 0.1); color: #BC8CFF; }

    .credit-cost { font-size: 12px; color: #8B949E; }
    .credit-cost.free { color: #3FB950; }

    .upgrade-hint {
      font-size: 11px;
      color: #BC8CFF;
      margin-left: auto;
      font-weight: 500;
    }

    .empty-state {
      text-align: center;
      padding: 60px 0;
      color: #6E7681;
    }

    /* ── Config Modal ── */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }

    .modal-content {
      background: #161B22;
      border: 1px solid #21262D;
      border-radius: 16px;
      padding: 28px;
      width: 100%;
      max-width: 520px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }

    .modal-title-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .modal-icon { font-size: 32px; }

    .modal-title {
      font-size: 20px;
      font-weight: 700;
      color: #E6EDF3;
      margin: 0;
    }

    .modal-category {
      font-size: 11px;
      color: #6E7681;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .modal-close {
      background: none;
      border: none;
      color: #6E7681;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      transition: color 0.2s;
    }

    .modal-close:hover { color: #E6EDF3; }

    .modal-description {
      font-size: 13px;
      line-height: 1.6;
      color: #8B949E;
      margin: 0 0 20px 0;
      padding: 12px;
      background: #0D1117;
      border-radius: 8px;
      border-left: 3px solid #58A6FF;
    }

    .config-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 16px;
    }

    .form-group { display: flex; flex-direction: column; gap: 4px; }

    .form-label {
      font-size: 13px;
      font-weight: 600;
      color: #E6EDF3;
    }

    .required-star { color: #F85149; margin-left: 2px; }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .form-input {
      width: 100%;
      background: #0D1117;
      border: 1px solid #21262D;
      border-radius: 8px;
      padding: 10px 12px;
      color: #E6EDF3;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s;
    }

    .form-input:focus { border-color: #58A6FF; }

    .form-input::placeholder { color: #555; }

    .form-input.has-stored-value {
      border-color: rgba(63, 185, 80, 0.3);
    }

    .form-input.has-stored-value::placeholder { color: #3FB950; font-size: 12px; }

    .secret-toggle {
      position: absolute;
      right: 8px;
      background: #1C2128;
      border: 1px solid #21262D;
      color: #8B949E;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
    }

    .secret-toggle:hover { color: #E6EDF3; background: #21262D; }

    .form-help {
      font-size: 11px;
      color: #6E7681;
      line-height: 1.4;
      margin: 2px 0 0 0;
    }

    .doc-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #58A6FF;
      text-decoration: none;
      margin-bottom: 16px;
    }

    .doc-link:hover { text-decoration: underline; }

    .config-error {
      background: rgba(248, 81, 73, 0.1);
      border: 1px solid rgba(248, 81, 73, 0.2);
      color: #F85149;
      font-size: 13px;
      padding: 10px 14px;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .config-success {
      background: rgba(63, 185, 80, 0.1);
      border: 1px solid rgba(63, 185, 80, 0.2);
      color: #3FB950;
      font-size: 13px;
      padding: 10px 14px;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .modal-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }

    .btn-secondary {
      background: #1C2128;
      border: 1px solid #21262D;
      color: #8B949E;
      padding: 9px 18px;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-secondary:hover { background: #21262D; color: #E6EDF3; }

    .btn-test {
      background: #1C2128;
      border: 1px solid #21262D;
      color: #E6EDF3;
      padding: 9px 18px;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }

    .btn-test:hover { background: #21262D; }
    .btn-test:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-primary {
      background: #58A6FF;
      border: none;
      color: #E6EDF3;
      padding: 9px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }

    .btn-primary:hover { background: #2563eb; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-spinner {
      display: inline-block;
      width: 14px; height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #E6EDF3;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    .disconnect-section {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #21262D;
      text-align: center;
    }

    .btn-disconnect {
      background: none;
      border: 1px solid rgba(248, 81, 73, 0.3);
      color: #F85149;
      font-size: 12px;
      padding: 6px 16px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-disconnect:hover {
      background: rgba(248, 81, 73, 0.1);
    }

    /* ── Product Images ── */
    /* ── Integrations ── */
    .integrations-section { margin-top: 8px; width: 100%; }
    .integrations-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .integration-card {
      background: #1A1A1A;
      border: 1px solid #2A2A2A;
      border-radius: 10px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .integration-card:hover { border-color: #3B82F6; }
    .integration-card.connected { border-color: #10B981; }
    .integration-header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .tool-icon {
      width: 40px; height: 40px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 18px; color: white;
    }
    .tool-info { flex: 1; display: flex; flex-direction: column; }
    .tool-name { font-weight: 600; color: #FAFAFA; font-size: 14px; }
    .tool-category { font-size: 11px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .connection-dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: #374151;
    }
    .connection-dot.active { background: #10B981; }
    .tool-desc { font-size: 13px; color: #9CA3AF; line-height: 1.4; margin-bottom: 8px; }
    .tool-ops { font-size: 12px; color: #6B7280; }

    .connection-panel {
      background: #1A1A1A;
      border: 1px solid #2A2A2A;
      border-radius: 12px;
      padding: 24px;
      margin-top: 8px;
    }
    .panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .panel-header h3 { color: #FAFAFA; font-size: 18px; margin: 0; }
    .close-btn { background: none; border: none; color: #6B7280; font-size: 18px; cursor: pointer; }
    .panel-desc { color: #9CA3AF; font-size: 13px; margin-bottom: 16px; line-height: 1.5; }

    .connect-form { display: flex; flex-direction: column; gap: 10px; }
    .form-label { font-size: 13px; color: #D1D5DB; font-weight: 500; }
    .form-input {
      background: #0D0D0D; border: 1px solid #2A2A2A; border-radius: 8px;
      padding: 10px 14px; color: #FAFAFA; font-size: 14px; outline: none;
    }
    .form-input:focus { border-color: #3B82F6; }
    .connect-btn {
      background: #3B82F6; color: white; border: none; border-radius: 8px;
      padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
      align-self: flex-start;
    }
    .connect-btn:disabled { opacity: 0.5; }
    .connect-btn:hover:not(:disabled) { background: #2563EB; }

    .connected-info { display: flex; flex-direction: column; gap: 12px; }
    .status-badge {
      font-size: 13px; font-weight: 600; padding: 4px 12px;
      border-radius: 20px; display: inline-block; width: fit-content;
    }
    .status-badge.connected { background: rgba(16,185,129,0.15); color: #10B981; }
    .connected-actions { display: flex; gap: 8px; }
    .test-btn {
      background: #242424; color: #D1D5DB; border: 1px solid #2A2A2A;
      border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer;
    }
    .test-btn:hover { border-color: #3B82F6; }
    .disconnect-btn {
      background: none; color: #EF4444; border: 1px solid rgba(239,68,68,0.3);
      border-radius: 8px; padding: 8px 16px; font-size: 13px; cursor: pointer;
    }
    .disconnect-btn:hover { border-color: #EF4444; }

    .connection-message {
      margin-top: 12px; padding: 10px 14px; border-radius: 8px; font-size: 13px;
    }
    .connection-message.success { background: rgba(16,185,129,0.1); color: #10B981; }
    .connection-message.error { background: rgba(239,68,68,0.1); color: #EF4444; }

    .operations-list { margin-top: 20px; }
    .operations-list h4 { color: #D1D5DB; font-size: 14px; margin: 0 0 12px 0; }
    .operation-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
    .op-badge {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      padding: 2px 8px; border-radius: 4px; letter-spacing: 0.5px;
      background: #242424; color: #9CA3AF;
    }
    .op-badge.search { background: rgba(59,130,246,0.15); color: #3B82F6; }
    .op-badge.write { background: rgba(16,185,129,0.15); color: #10B981; }
    .op-badge.read { background: rgba(168,85,247,0.15); color: #A855F7; }
    .op-name { font-size: 13px; color: #D1D5DB; flex: 1; }
    .op-status { font-size: 11px; font-weight: 600; margin-left: auto; }
    .op-status.verified { color: #10B981; }
    .op-status.failed { color: #EF4444; }
    .op-status.unknown { color: #6B7280; }

    .images-section { margin-top: 8px; width: 100%; }

    .images-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 20px;
    }

    .images-desc {
      font-size: 13px;
      color: #8B949E;
      margin: 0;
      flex: 1;
      line-height: 1.5;
    }

    .upload-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #58A6FF;
      color: #E6EDF3;
      border: none;
      padding: 9px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.2s;
    }

    .upload-btn:hover { background: #2563eb; }
    .upload-btn.uploading { opacity: 0.7; cursor: wait; }

    .images-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
    }

    .image-card {
      background: #161B22;
      border: 1px solid #21262D;
      border-radius: 10px;
      overflow: hidden;
      position: relative;
      transition: border-color 0.2s;
    }

    .image-card:hover { border-color: #58A6FF; }

    .image-preview {
      width: 100%;
      aspect-ratio: 1;
      background: #0D1117;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .image-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .image-info {
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .image-label {
      font-size: 12px;
      font-weight: 500;
      color: #E6EDF3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .image-size {
      font-size: 11px;
      color: #6E7681;
    }

    .image-delete {
      position: absolute;
      top: 6px;
      right: 6px;
      background: rgba(0,0,0,0.6);
      border: none;
      color: #8B949E;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: all 0.2s;
    }

    .image-card:hover .image-delete { opacity: 1; }
    .image-delete:hover { color: #F85149; background: rgba(0,0,0,0.8); }

    .images-list { display: flex; flex-direction: column; gap: 10px; }
    .image-card-wide {
      display: flex; gap: 16px; align-items: flex-start;
      background: #161B22; border: 1px solid #21262D; border-radius: 10px;
      padding: 14px; transition: border-color 0.2s;
    }
    .image-card-wide:hover { border-color: #30363D; }
    .image-thumb {
      width: 80px; height: 80px; flex-shrink: 0;
      border-radius: 8px; overflow: hidden; background: #0D1117;
    }
    .image-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .image-details { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .image-name-input {
      background: transparent; border: none; border-bottom: 1px solid transparent;
      color: #E6EDF3; font-size: 14px; font-weight: 500; padding: 2px 0;
      outline: none; transition: border-color 0.2s;
    }
    .image-name-input:focus { border-bottom-color: #58A6FF; }
    .image-desc-input {
      background: transparent; border: 1px solid transparent; border-radius: 6px;
      color: #8B949E; font-size: 12px; padding: 6px 8px; resize: vertical;
      outline: none; font-family: inherit; transition: border-color 0.2s;
    }
    .image-desc-input:focus { border-color: #21262D; color: #E6EDF3; }
    .image-desc-input::placeholder { color: #6E7681; }
    .image-meta { font-size: 11px; color: #6E7681; }
    .image-delete-btn {
      background: none; border: none; color: #6E7681; cursor: pointer;
      padding: 4px; border-radius: 4px; transition: color 0.2s;
    }
    .image-delete-btn:hover { color: #F85149; }
  `,
})
export class SettingsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;
  private readonly pageLoading = inject(PageLoadingService);

  private readonly currentTier = signal<string>('starter');

  readonly activeTab = signal<'process' | 'tool' | 'images' | 'integrations'>('process');
  readonly items = signal<CatalogItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly togglingId = signal<string | null>(null);

  // Config modal state
  readonly configModalItem = signal<CatalogItem | null>(null);
  readonly formValues = signal<Record<string, string>>({});
  readonly showSecrets = signal<Record<string, boolean>>({});
  readonly storedSecrets = signal<Record<string, boolean>>({}); // which secret fields have stored values
  readonly configSaving = signal(false);
  readonly configTesting = signal(false);
  readonly configError = signal<string | null>(null);
  readonly configSuccess = signal(false);

  // MCP Integrations
  readonly mcpTools = signal<any[]>([]);
  readonly integrationsLoading = signal(false);
  readonly selectedMcpTool = signal<any | null>(null);
  readonly mcpApiKeyInput = signal('');
  readonly mcpConnecting = signal(false);
  readonly mcpTesting = signal(false);
  readonly mcpConnectionMessage = signal('');
  readonly mcpConnectionSuccess = signal(false);

  // Product images
  readonly productImages = signal<any[]>([]);
  readonly imageUploading = signal(false);

  readonly processItems = computed(() =>
    this.items().filter((i) => i.type === 'process'),
  );

  readonly toolItems = computed(() =>
    this.items().filter((i) => i.type === 'tool'),
  );

  readonly activeItems = computed(() =>
    this.activeTab() === 'process' ? this.processItems() : this.toolItems(),
  );

  ngOnInit() {
    this.loadCatalog();
  }

  private isInitialLoad = true;

  loadCatalog() {
    this.loading.set(true);
    this.error.set(null);
    if (this.isInitialLoad) this.pageLoading.start();

    this.http
      .get<{ data: CatalogItem[] }>(`${this.apiUrl}/api/v1/catalog`)
      .subscribe({
        next: (res) => {
          this.items.set(res.data);
          this.loading.set(false);
          if (this.isInitialLoad) { this.pageLoading.stop(); this.isInitialLoad = false; }
        },
        error: (err) => {
          console.error('Failed to load catalog:', err);
          this.error.set('Error loading catalog. Check your connection.');
          this.loading.set(false);
          if (this.isInitialLoad) { this.pageLoading.stop(); this.isInitialLoad = false; }
        },
      });
  }

  isLocked(item: CatalogItem): boolean {
    const tierOrder: Record<string, number> = { starter: 0, pro: 1, enterprise: 2 };
    return (tierOrder[item.requiredTier] ?? 0) > (tierOrder[this.currentTier()] ?? 0);
  }

  tierLabel(tier: string): string {
    const labels: Record<string, string> = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };
    return labels[tier] ?? tier;
  }

  onCardClick(item: CatalogItem) {
    if (this.isLocked(item)) return;
    if (item.type === 'tool' && item.configSchema) {
      this.openConfigModal(item);
    }
  }

  // ── Toggle (for process items) ──

  toggleItem(item: CatalogItem) {
    if (this.isLocked(item) || this.togglingId()) return;

    const newEnabled = !item.enabled;
    const endpoint = newEnabled ? 'enable' : 'disable';

    this.togglingId.set(item.id);

    this.http
      .post(`${this.apiUrl}/api/v1/catalog/${item.id}/${endpoint}`, {})
      .subscribe({
        next: () => {
          this.items.update((items) =>
            items.map((i) => i.id === item.id ? { ...i, enabled: newEnabled } : i),
          );
          this.togglingId.set(null);
        },
        error: (err) => {
          console.error(`Failed to ${endpoint} item:`, err);
          this.togglingId.set(null);
        },
      });
  }

  // ── Config Modal ──

  openConfigModal(item: CatalogItem) {
    this.configModalItem.set(item);
    this.configError.set(null);
    this.configSuccess.set(false);

    // Pre-fill form with current config
    const values: Record<string, string> = {};
    const stored: Record<string, boolean> = {};
    if (item.currentConfig) {
      for (const [key, val] of Object.entries(item.currentConfig)) {
        if (val.includes('••')) {
          // Secret field has stored value — leave input empty, mark as stored
          values[key] = '';
          stored[key] = true;
        } else {
          values[key] = val;
        }
      }
    }
    this.formValues.set(values);
    this.storedSecrets.set(stored);
    this.showSecrets.set({});
  }

  isSecretStored(key: string): boolean {
    return this.storedSecrets()[key] === true && !this.formValues()[key]?.trim();
  }

  closeConfigModal() {
    this.configModalItem.set(null);
    this.configError.set(null);
    this.configSuccess.set(false);
  }

  updateFormValue(key: string, value: string) {
    this.formValues.update((v) => ({ ...v, [key]: value }));
  }

  toggleSecretVisibility(key: string) {
    this.showSecrets.update((s) => ({ ...s, [key]: !s[key] }));
  }

  isFormValid(): boolean {
    const item = this.configModalItem();
    if (!item?.configSchema?.fields) return false;
    const values = this.formValues();
    const stored = this.storedSecrets();
    return item.configSchema.fields
      .filter((f) => f.required)
      .every((f) => values[f.key]?.trim() || stored[f.key]);
  }

  testConnection() {
    const item = this.configModalItem();
    if (!item) return;

    this.configTesting.set(true);
    this.configError.set(null);
    this.configSuccess.set(false);

    // Build credentials — use form values, fall back to existing config for unchanged secrets
    const credentials = this.buildCredentials(item);

    this.http
      .post<{ data: { connected: boolean; error?: string } }>(
        `${this.apiUrl}/api/v1/catalog/${item.id}/test-connection`,
        { credentials },
      )
      .subscribe({
        next: (res) => {
          this.configTesting.set(false);
          if (res.data.connected) {
            this.configSuccess.set(true);
            this.configError.set(null);
          } else {
            this.configError.set(res.data.error ?? 'Connection failed');
            this.configSuccess.set(false);
          }
        },
        error: (err) => {
          this.configTesting.set(false);
          this.configError.set(err?.error?.message ?? 'Error testing connection');
        },
      });
  }

  saveConfig() {
    const item = this.configModalItem();
    if (!item || !this.isFormValid()) return;

    this.configSaving.set(true);
    this.configError.set(null);
    this.configSuccess.set(false);

    const credentials = this.buildCredentials(item);

    this.http
      .post<{ data: { configured: boolean; connected: boolean; error?: string } }>(
        `${this.apiUrl}/api/v1/catalog/${item.id}/configure`,
        { credentials },
      )
      .subscribe({
        next: (res) => {
          this.configSaving.set(false);
          if (res.data.connected) {
            this.configSuccess.set(true);
            this.configError.set(null);
            // Update item in list
            this.items.update((items) =>
              items.map((i) =>
                i.id === item.id ? { ...i, enabled: true, configured: true } : i,
              ),
            );
            // Close after brief delay so user sees success
            setTimeout(() => this.closeConfigModal(), 1200);
          } else {
            this.configError.set(
              res.data.error ?? 'Data saved, but connection failed. Check your credentials.',
            );
          }
        },
        error: (err) => {
          this.configSaving.set(false);
          this.configError.set(err?.error?.message ?? 'Error saving configuration');
        },
      });
  }

  disconnectTool() {
    const item = this.configModalItem();
    if (!item) return;

    this.configSaving.set(true);

    this.http
      .post(`${this.apiUrl}/api/v1/catalog/${item.id}/disable`, {})
      .subscribe({
        next: () => {
          this.configSaving.set(false);
          this.items.update((items) =>
            items.map((i) =>
              i.id === item.id ? { ...i, enabled: false } : i,
            ),
          );
          this.closeConfigModal();
        },
        error: (err) => {
          this.configSaving.set(false);
          console.error('Failed to disconnect:', err);
        },
      });
  }

  /**
   * Build credentials object from form values.
   * For secret fields that are empty (user didn't change), we don't send them
   * so the backend keeps the existing value.
   */
  private buildCredentials(item: CatalogItem): Record<string, string> {
    const values = this.formValues();
    const creds: Record<string, string> = {};
    for (const field of item.configSchema?.fields ?? []) {
      const val = values[field.key]?.trim();
      if (val) {
        creds[field.key] = val;
      }
    }
    return creds;
  }

  // ── Product Images ──

  loadProductImages() {
    this.http
      .get<{ data: any[] }>(`${this.apiUrl}/api/v1/product-images`)
      .subscribe({
        next: (res) => this.productImages.set(res.data),
        error: (err) => console.error('Failed to load product images:', err),
      });
  }

  onImagesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    this.imageUploading.set(true);
    let remaining = files.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      const formData = new FormData();
      formData.append('file', file);

      this.http
        .post<{ data: any }>(`${this.apiUrl}/api/v1/product-images/upload`, formData)
        .subscribe({
          next: (res) => {
            this.productImages.update((imgs) => [res.data, ...imgs]);
            remaining--;
            if (remaining === 0) { this.imageUploading.set(false); input.value = ''; }
          },
          error: (err) => {
            console.error('Upload failed:', err);
            remaining--;
            if (remaining === 0) { this.imageUploading.set(false); input.value = ''; }
          },
        });
    }
  }

  updateImageLabel(id: string, event: Event) {
    const value = (event.target as HTMLInputElement).value.trim();
    if (!value) return;
    this.http.patch(`${this.apiUrl}/api/v1/product-images/${id}`, { label: value }).subscribe({
      next: () => this.productImages.update(imgs => imgs.map(i => i.id === id ? { ...i, label: value } : i)),
    });
  }

  updateImageDescription(id: string, event: Event) {
    const value = (event.target as HTMLTextAreaElement).value.trim();
    this.http.patch(`${this.apiUrl}/api/v1/product-images/${id}`, { description: value }).subscribe({
      next: () => this.productImages.update(imgs => imgs.map(i => i.id === id ? { ...i, description: value } : i)),
    });
  }

  deleteImage(id: string) {
    this.http
      .delete(`${this.apiUrl}/api/v1/product-images/${id}`)
      .subscribe({
        next: () => {
          this.productImages.update((imgs) => imgs.filter((i) => i.id !== id));
        },
      });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // ─── MCP Integrations ──────────────────────────────────────────

  loadIntegrations(): void {
    this.integrationsLoading.set(true);
    this.http.get<{ data: any[] }>(`${this.apiUrl}/api/v1/mcp/tools`).subscribe({
      next: (res) => {
        this.mcpTools.set(res.data ?? []);
        this.integrationsLoading.set(false);
      },
      error: () => {
        this.integrationsLoading.set(false);
      },
    });
  }

  selectMcpTool(tool: any): void {
    this.selectedMcpTool.set(tool);
    this.mcpApiKeyInput.set('');
    this.mcpConnectionMessage.set('');
  }

  connectMcpTool(): void {
    const tool = this.selectedMcpTool();
    if (!tool || !this.mcpApiKeyInput()) return;
    this.mcpConnecting.set(true);
    this.mcpConnectionMessage.set('');
    this.http
      .post<{ data: { ok: boolean; message: string } }>(
        `${this.apiUrl}/api/v1/mcp/tools/${tool.slug}/connect`,
        { credentials: { apiKey: this.mcpApiKeyInput() } },
      )
      .subscribe({
        next: (res) => {
          this.mcpConnecting.set(false);
          this.mcpConnectionSuccess.set(res.data?.ok ?? false);
          this.mcpConnectionMessage.set(res.data?.message ?? 'Connected');
          if (res.data?.ok) {
            // Refresh tool list to update connected status
            this.loadIntegrations();
            this.selectedMcpTool.update((t: any) => t ? { ...t, connected: true, verified: true } : null);
          }
        },
        error: (err) => {
          this.mcpConnecting.set(false);
          this.mcpConnectionSuccess.set(false);
          this.mcpConnectionMessage.set(err.error?.detail ?? 'Connection failed');
        },
      });
  }

  testMcpConnection(): void {
    const tool = this.selectedMcpTool();
    if (!tool) return;
    this.mcpTesting.set(true);
    this.mcpConnectionMessage.set('');
    this.http
      .post<{ data: { ok: boolean; message: string } }>(
        `${this.apiUrl}/api/v1/mcp/tools/${tool.slug}/test`,
        {},
      )
      .subscribe({
        next: (res) => {
          this.mcpTesting.set(false);
          this.mcpConnectionSuccess.set(res.data?.ok ?? false);
          this.mcpConnectionMessage.set(res.data?.message ?? 'Test completed');
        },
        error: (err) => {
          this.mcpTesting.set(false);
          this.mcpConnectionSuccess.set(false);
          this.mcpConnectionMessage.set(err.error?.detail ?? 'Test failed');
        },
      });
  }

  disconnectMcpTool(): void {
    const tool = this.selectedMcpTool();
    if (!tool || !confirm(`Disconnect ${tool.displayName}?`)) return;
    this.http.delete(`${this.apiUrl}/api/v1/mcp/tools/${tool.slug}`).subscribe({
      next: () => {
        this.selectedMcpTool.set(null);
        this.loadIntegrations();
      },
    });
  }
}
