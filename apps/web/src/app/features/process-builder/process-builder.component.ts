import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { SchemaEditorComponent } from './components/schema-editor.component';
import type { ProcessWorkflowResponse, ProcessStepResponse, ProcessStepType } from '@mentor-ai/shared/types';

interface StepForm {
  id?: string;
  order: number;
  name: string;
  description: string;
  stepType: string;
  agentType: string;
  toolSkill: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  skillMdSection: string;
  retryPolicy: { maxRetries: number; backoffMs: number };
  verifyRules: Array<{ field: string; type: string; value?: string }>;
}

@Component({
  selector: 'app-process-builder',
  standalone: true,
  imports: [FormsModule, SchemaEditorComponent],
  template: `
    <div class="builder-layout">
      <!-- Left sidebar: workflow list -->
      <aside class="workflow-sidebar">
        <h2 class="sidebar-title">Procesi</h2>
        @for (wf of workflows(); track wf.id) {
          <div class="workflow-item" [class.active]="selectedWorkflowId() === wf.id" (click)="selectWorkflow(wf)">
            <span class="wf-name">{{ wf.name }}</span>
            <span class="wf-steps">{{ wf.steps?.length || 0 }} koraka</span>
            @if (wf.cronSchedule) {
              <span class="wf-cron">{{ wf.cronSchedule }}</span>
            }
          </div>
        }
        <button class="add-workflow-btn" (click)="startNewWorkflow()">+ Novi proces</button>
      </aside>

      <!-- Main: visual step flow -->
      <main class="builder-main">
        @if (selectedWorkflow()) {
          <div class="workflow-header">
            <div class="wf-header-info">
              <input class="wf-name-input" [(ngModel)]="workflowName" placeholder="Naziv procesa" />
              <input class="wf-slug-input" [(ngModel)]="workflowSlug" placeholder="slug" />
              <input class="wf-cron-input" [(ngModel)]="workflowCron" placeholder="Cron (opciono, npr. 0 9 * * 1)" />
            </div>
            <div class="wf-header-actions">
              <button class="autogen-btn" (click)="autoGenerateSkills()" [disabled]="generating()">
                {{ generating() ? 'Generisanje...' : '⚡ Auto-generisi instrukcije' }}
              </button>
              <button class="save-wf-btn" (click)="saveWorkflow()">Sačuvaj</button>
              <button class="delete-wf-btn" (click)="deleteWorkflow()">Obriši</button>
            </div>
          </div>

          <!-- Visual step flow -->
          <div class="step-flow">
            @for (step of steps(); track step.id ?? step.order) {
              <div class="step-box" [class.active]="editingStepIndex() === $index" (click)="editStep($index)">
                <div class="step-order">{{ step.order }}</div>
                <div class="step-info">
                  <span class="step-name">{{ step.name || 'Untitled' }}</span>
                  <span class="step-type" [class]="'type-' + step.stepType">{{ step.stepType }}</span>
                </div>
                <span class="step-agent">{{ step.agentType }}</span>
              </div>
              @if (!$last) {
                <div class="step-arrow">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#58A6FF" stroke-width="2"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                </div>
              }
            }
            <button class="add-step-btn" (click)="addStep()">+ Dodaj korak</button>
          </div>
        } @else {
          <div class="empty-state">Izaberite proces ili kreirajte novi.</div>
        }
      </main>

      <!-- Right panel: step editor -->
      @if (editingStep()) {
        <aside class="step-editor">
          <div class="editor-header">
            <h3 class="editor-title">Korak {{ editingStep()!.order }}</h3>
            <button class="close-editor" (click)="editingStepIndex.set(-1); editingStepForm.set(null)">&times;</button>
          </div>

          <div class="editor-fields">
            <label class="field">
              <span class="field-label">Naziv</span>
              <input [(ngModel)]="editingStep()!.name" class="field-input" />
            </label>

            <label class="field">
              <span class="field-label">Opis</span>
              <textarea [(ngModel)]="editingStep()!.description" class="field-textarea" rows="2"></textarea>
            </label>

            <label class="field">
              <span class="field-label">Tip</span>
              <select [(ngModel)]="editingStep()!.stepType" class="field-select">
                <option value="AUTOMATIC">AUTOMATIC</option>
                <option value="APPROVAL">APPROVAL</option>
                <option value="MANUAL">MANUAL</option>
              </select>
            </label>

            <label class="field">
              <span class="field-label">Agent</span>
              <select [(ngModel)]="editingStep()!.agentType" class="field-select">
                <option value="main">main</option>
                <option value="research">research</option>
                <option value="content">content</option>
                <option value="marketing">marketing</option>
                <option value="sales">sales</option>
                <option value="financial">financial</option>
                <option value="designer">designer</option>
                <option value="dev">dev</option>
                <option value="none">none</option>
              </select>
            </label>

            <label class="field">
              <span class="field-label">Tool/Skill</span>
              <input [(ngModel)]="editingStep()!.toolSkill" class="field-input" />
            </label>

            <div class="field">
              <span class="field-label">Output Schema</span>
              <app-schema-editor [schema]="editingStep()!.outputSchema" (schemaChange)="editingStep()!.outputSchema = $event" />
            </div>

            <label class="field">
              <span class="field-label">SKILL.md sekcija</span>
              <textarea [(ngModel)]="editingStep()!.skillMdSection" class="field-textarea code-textarea" rows="8" placeholder="Instrukcije za agenta..."></textarea>
            </label>

            <label class="field">
              <span class="field-label">Max Retries</span>
              <input type="number" [(ngModel)]="editingStep()!.retryPolicy.maxRetries" class="field-input" min="0" max="5" />
            </label>
          </div>

          <div class="editor-actions">
            <button class="save-step-btn" (click)="saveStep()">Sačuvaj korak</button>
            <button class="delete-step-btn" (click)="deleteStep()">Obriši korak</button>
          </div>
        </aside>
      }
    </div>
  `,
  styles: [`
    .builder-layout { display: flex; height: 100%; }

    .workflow-sidebar {
      width: 220px; flex-shrink: 0; background: #161B22; border-right: 1px solid #21262D;
      padding: 16px; overflow-y: auto;
    }
    .sidebar-title { color: #E6EDF3; font-size: 16px; font-weight: 700; margin: 0 0 16px; }
    .workflow-item {
      padding: 10px; border-radius: 6px; cursor: pointer; margin-bottom: 6px;
      border: 1px solid transparent; display: flex; flex-direction: column; gap: 2px;
    }
    .workflow-item:hover { border-color: #21262D; background: #1C2128; }
    .workflow-item.active { border-color: #58A6FF; background: #1C2128; }
    .wf-name { color: #E6EDF3; font-size: 13px; font-weight: 500; }
    .wf-steps { color: #6B7280; font-size: 11px; }
    .wf-cron { color: #C9A96E; font-size: 10px; font-family: monospace; }
    .add-workflow-btn {
      width: 100%; padding: 8px; margin-top: 8px; background: transparent;
      border: 1px dashed #21262D; border-radius: 6px; color: #58A6FF;
      cursor: pointer; font-size: 13px;
    }
    .add-workflow-btn:hover { border-color: #58A6FF; }

    .builder-main { flex: 1; padding: 24px; overflow-y: auto; }
    .workflow-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    .wf-header-info { display: flex; flex-direction: column; gap: 8px; }
    .wf-name-input {
      background: transparent; border: none; border-bottom: 1px solid #21262D;
      color: #E6EDF3; font-size: 20px; font-weight: 700; padding: 4px 0; width: 300px;
    }
    .wf-name-input:focus { outline: none; border-color: #58A6FF; }
    .wf-slug-input, .wf-cron-input {
      background: transparent; border: none; border-bottom: 1px solid #21262D;
      color: #9CA3AF; font-size: 12px; padding: 4px 0; width: 300px; font-family: monospace;
    }
    .wf-slug-input:focus, .wf-cron-input:focus { outline: none; border-color: #58A6FF; }
    .wf-header-actions { display: flex; gap: 8px; }
    .autogen-btn {
      padding: 8px 16px; background: #C9A96E; color: #0D1117; border: none;
      border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;
    }
    .autogen-btn:hover { background: #b8963e; }
    .autogen-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .save-wf-btn {
      padding: 8px 16px; background: #58A6FF; color: #E6EDF3; border: none;
      border-radius: 6px; cursor: pointer; font-size: 13px;
    }
    .delete-wf-btn {
      padding: 8px 16px; background: transparent; border: 1px solid #ef4444;
      color: #ef4444; border-radius: 6px; cursor: pointer; font-size: 13px;
    }

    .step-flow { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .step-box {
      width: 360px; padding: 14px; background: #161B22; border: 1px solid #21262D;
      border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 12px;
      transition: border-color 0.15s;
    }
    .step-box:hover { border-color: #58A6FF; }
    .step-box.active { border-color: #58A6FF; background: #1A1A2A; }
    .step-order {
      width: 28px; height: 28px; border-radius: 50%; background: #1C2128;
      display: flex; align-items: center; justify-content: center;
      color: #58A6FF; font-weight: 700; font-size: 13px; flex-shrink: 0;
    }
    .step-info { display: flex; flex-direction: column; flex: 1; }
    .step-name { color: #E6EDF3; font-size: 13px; font-weight: 500; }
    .step-type { font-size: 10px; font-weight: 600; }
    .type-AUTOMATIC { color: #58A6FF; }
    .type-APPROVAL { color: #C9A96E; }
    .type-MANUAL { color: #9CA3AF; }
    .step-agent { color: #6B7280; font-size: 11px; }
    .step-arrow { display: flex; justify-content: center; }
    .add-step-btn {
      padding: 8px 24px; margin-top: 8px; background: transparent;
      border: 1px dashed #21262D; border-radius: 6px; color: #58A6FF;
      cursor: pointer; font-size: 13px;
    }

    .step-editor {
      width: 360px; flex-shrink: 0; background: #161B22; border-left: 1px solid #21262D;
      padding: 16px; overflow-y: auto;
    }
    .editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .editor-title { color: #E6EDF3; font-size: 16px; margin: 0; }
    .close-editor { background: none; border: none; color: #6B7280; font-size: 20px; cursor: pointer; }

    .editor-fields { display: flex; flex-direction: column; gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field-label { color: #9CA3AF; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .field-input, .field-select, .field-textarea {
      background: #1C2128; border: 1px solid #21262D; border-radius: 6px;
      color: #E6EDF3; padding: 8px; font-size: 13px;
    }
    .field-input:focus, .field-select:focus, .field-textarea:focus { outline: none; border-color: #58A6FF; }
    .field-textarea { resize: vertical; }
    .code-textarea { font-family: monospace; font-size: 12px; }

    .editor-actions { display: flex; gap: 8px; margin-top: 16px; }
    .save-step-btn {
      flex: 1; padding: 8px; background: #58A6FF; color: #E6EDF3;
      border: none; border-radius: 6px; cursor: pointer; font-size: 13px;
    }
    .delete-step-btn {
      padding: 8px 12px; background: transparent; border: 1px solid #ef4444;
      color: #ef4444; border-radius: 6px; cursor: pointer; font-size: 13px;
    }

    .empty-state { color: #6B7280; text-align: center; padding: 60px; font-size: 14px; }
  `],
})
export class ProcessBuilderComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiUrl}/api/v1/processes`;

  workflows = signal<ProcessWorkflowResponse[]>([]);
  selectedWorkflowId = signal<string | null>(null);
  editingStepIndex = signal(-1);
  /** Writable copy of the step being edited — decoupled from computed (R5 fix) */
  editingStepForm = signal<StepForm | null>(null);

  generating = signal(false);

  workflowName = '';
  workflowSlug = '';
  workflowCron = '';

  selectedWorkflow = computed(() => this.workflows().find(w => w.id === this.selectedWorkflowId()));

  steps = computed<StepForm[]>(() => {
    const wf = this.selectedWorkflow();
    if (!wf?.steps) return [];
    return wf.steps.map(s => ({
      id: s.id,
      order: s.order,
      name: s.name,
      description: s.description ?? '',
      stepType: s.stepType,
      agentType: s.agentType,
      toolSkill: s.toolSkill,
      inputSchema: s.inputSchema as Record<string, unknown>,
      outputSchema: s.outputSchema as Record<string, unknown>,
      skillMdSection: s.skillMdSection ?? '',
      retryPolicy: (s.retryPolicy as any) ?? { maxRetries: 2, backoffMs: 2000 },
      verifyRules: ((s.verifyRules as any) ?? []),
    }));
  });

  /** Use editingStepForm (writable signal) instead of computed to avoid mutation issues */
  editingStep = this.editingStepForm;

  ngOnInit(): void {
    this.loadWorkflows();
  }

  private loadWorkflows(): void {
    this.http.get<{ data: ProcessWorkflowResponse[] }>(this.apiBase).subscribe({
      next: (res) => this.workflows.set(res.data),
    });
  }

  selectWorkflow(wf: ProcessWorkflowResponse): void {
    this.selectedWorkflowId.set(wf.id);
    this.workflowName = wf.name;
    this.workflowSlug = wf.slug;
    this.workflowCron = wf.cronSchedule ?? '';
    this.editingStepIndex.set(-1);
  }

  startNewWorkflow(): void {
    this.http.post<{ data: ProcessWorkflowResponse }>(this.apiBase, {
      name: 'Novi proces',
      slug: 'novi-proces-' + Date.now(),
    }).subscribe({
      next: (res) => {
        this.workflows.update(wfs => [...wfs, res.data]);
        this.selectWorkflow(res.data);
      },
    });
  }

  saveWorkflow(): void {
    const id = this.selectedWorkflowId();
    if (!id) return;
    this.http.patch<{ data: ProcessWorkflowResponse }>(`${this.apiBase}/${id}`, {
      name: this.workflowName,
      cronSchedule: this.workflowCron || null,
    }).subscribe({
      next: (res) => {
        this.workflows.update(wfs => wfs.map(w => w.id === id ? res.data : w));
      },
    });
  }

  deleteWorkflow(): void {
    const id = this.selectedWorkflowId();
    if (!id) return;
    this.http.delete(`${this.apiBase}/${id}`).subscribe({
      next: () => {
        this.workflows.update(wfs => wfs.filter(w => w.id !== id));
        this.selectedWorkflowId.set(null);
      },
    });
  }

  autoGenerateSkills(): void {
    const wfId = this.selectedWorkflowId();
    if (!wfId) return;
    this.generating.set(true);
    this.http.post<{ data: { generated: number } }>(`${this.apiBase}/${wfId}/auto-generate-skills`, {}).subscribe({
      next: () => {
        this.generating.set(false);
        this.loadWorkflows(); // Reload to show generated skills
      },
      error: () => this.generating.set(false),
    });
  }

  editStep(index: number): void {
    this.editingStepIndex.set(index);
    const step = this.steps()[index];
    // Deep copy into writable signal so ngModel mutations don't affect computed
    this.editingStepForm.set(step ? { ...step, retryPolicy: { ...step.retryPolicy }, verifyRules: [...step.verifyRules] } : null);
  }

  addStep(): void {
    const wfId = this.selectedWorkflowId();
    if (!wfId) return;
    const nextOrder = this.steps().length + 1;

    this.http.post<{ data: ProcessStepResponse }>(`${this.apiBase}/${wfId}/steps`, {
      order: nextOrder,
      name: `Korak ${nextOrder}`,
      stepType: 'AUTOMATIC',
      agentType: 'main',
      toolSkill: '',
      inputSchema: {},
      outputSchema: {},
    }).subscribe({
      next: () => this.loadWorkflows(),
    });
  }

  saveStep(): void {
    const step = this.editingStep();
    const wfId = this.selectedWorkflowId();
    if (!step?.id || !wfId) return;

    this.http.patch(`${this.apiBase}/${wfId}/steps/${step.id}`, {
      name: step.name,
      description: step.description || undefined,
      stepType: step.stepType,
      agentType: step.agentType,
      toolSkill: step.toolSkill,
      outputSchema: step.outputSchema,
      skillMdSection: step.skillMdSection || undefined,
      retryPolicy: step.retryPolicy,
      verifyRules: step.verifyRules.length > 0 ? step.verifyRules : undefined,
    }).subscribe({
      next: () => this.loadWorkflows(),
    });
  }

  deleteStep(): void {
    const step = this.editingStep();
    const wfId = this.selectedWorkflowId();
    if (!step?.id || !wfId) return;

    this.http.delete(`${this.apiBase}/${wfId}/steps/${step.id}`).subscribe({
      next: () => {
        this.editingStepIndex.set(-1);
        this.loadWorkflows();
      },
    });
  }
}
