import { Component, input, output, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface SchemaField {
  name: string;
  type: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  format?: string; // email, uri, date-time
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  description?: string;
}

@Component({
  selector: 'app-schema-editor',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="schema-editor">
      <div class="fields-list">
        @for (field of fields(); track field.name) {
          <div class="field-row">
            <input class="fname" [(ngModel)]="field.name" placeholder="field name" />
            <select class="ftype" [(ngModel)]="field.type" (ngModelChange)="emitSchema()">
              <option value="string">string</option>
              <option value="integer">integer</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="array">array</option>
              <option value="object">object</option>
            </select>
            <select class="fformat" [(ngModel)]="field.format" (ngModelChange)="emitSchema()">
              <option value="">—</option>
              <option value="email">email</option>
              <option value="uri">uri</option>
              <option value="date-time">date-time</option>
            </select>
            <label class="freq">
              <input type="checkbox" [(ngModel)]="field.required" (ngModelChange)="emitSchema()" />
              req
            </label>
            <button class="remove-field" (click)="removeField($index)">&times;</button>
          </div>
        }
      </div>
      <button class="add-field-btn" (click)="addField()">+ Polje</button>

      <!-- Preview -->
      <details class="schema-preview">
        <summary>JSON Schema preview</summary>
        <pre class="schema-json">{{ previewJson() }}</pre>
      </details>
    </div>
  `,
  styles: [`
    .schema-editor { display: flex; flex-direction: column; gap: 6px; }
    .fields-list { display: flex; flex-direction: column; gap: 4px; }
    .field-row { display: flex; gap: 4px; align-items: center; }
    .fname {
      flex: 1; background: #242424; border: 1px solid #2A2A2A; border-radius: 4px;
      color: #FAFAFA; padding: 4px 6px; font-size: 12px; font-family: monospace;
    }
    .ftype, .fformat {
      width: 80px; background: #242424; border: 1px solid #2A2A2A; border-radius: 4px;
      color: #FAFAFA; padding: 4px; font-size: 11px;
    }
    .freq { display: flex; align-items: center; gap: 2px; color: #6B7280; font-size: 10px; white-space: nowrap; }
    .freq input { accent-color: #3B82F6; }
    .remove-field {
      background: none; border: none; color: #ef4444; cursor: pointer; font-size: 16px; padding: 0 4px;
    }
    .add-field-btn {
      background: transparent; border: 1px dashed #2A2A2A; border-radius: 4px;
      color: #3B82F6; padding: 4px 8px; cursor: pointer; font-size: 11px; align-self: flex-start;
    }
    .schema-preview { margin-top: 8px; }
    .schema-preview summary { color: #6B7280; font-size: 11px; cursor: pointer; }
    .schema-json {
      background: #242424; border-radius: 4px; padding: 8px;
      color: #9CA3AF; font-size: 10px; font-family: monospace;
      max-height: 200px; overflow: auto; white-space: pre-wrap;
    }
    .fname:focus, .ftype:focus, .fformat:focus { outline: none; border-color: #3B82F6; }
  `],
})
export class SchemaEditorComponent {
  schema = input<Record<string, unknown>>({});
  schemaChange = output<Record<string, unknown>>();

  fields = signal<SchemaField[]>([]);

  private initialized = false;

  constructor() {
    // Use effect instead of ngOnChanges — signal inputs don't trigger ngOnChanges
    effect(() => {
      const schema = this.schema();
      if (!this.initialized) {
        this.fields.set(this.parseSchema(schema));
        this.initialized = true;
      }
    });
  }

  addField(): void {
    this.fields.update(f => [...f, {
      name: `field${f.length + 1}`,
      type: 'string',
      required: false,
    }]);
    this.emitSchema();
  }

  removeField(index: number): void {
    this.fields.update(f => f.filter((_, i) => i !== index));
    this.emitSchema();
  }

  emitSchema(): void {
    this.schemaChange.emit(this.buildSchema());
  }

  previewJson = computed(() => JSON.stringify(this.buildSchema(), null, 2));

  private buildSchema(): Record<string, unknown> {
    const f = this.fields();
    if (f.length === 0) return {};

    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const field of f) {
      const prop: Record<string, unknown> = { type: field.type };
      if (field.format) prop['format'] = field.format;
      if (field.description) prop['description'] = field.description;
      if (field.minLength !== undefined) prop['minLength'] = field.minLength;
      if (field.maxLength !== undefined) prop['maxLength'] = field.maxLength;
      if (field.minimum !== undefined) prop['minimum'] = field.minimum;
      if (field.maximum !== undefined) prop['maximum'] = field.maximum;
      properties[field.name] = prop;
      if (field.required) required.push(field.name);
    }

    const schema: Record<string, unknown> = {
      type: 'object',
      properties,
    };
    if (required.length > 0) schema['required'] = required;

    return schema;
  }

  private parseSchema(schema: Record<string, unknown>): SchemaField[] {
    if (!schema || !schema['properties']) return [];
    const properties = schema['properties'] as Record<string, Record<string, unknown>>;
    const required = (schema['required'] as string[]) ?? [];

    return Object.entries(properties).map(([name, prop]) => ({
      name,
      type: (prop['type'] as SchemaField['type']) ?? 'string',
      required: required.includes(name),
      format: prop['format'] as string | undefined,
      description: prop['description'] as string | undefined,
      minLength: prop['minLength'] as number | undefined,
      maxLength: prop['maxLength'] as number | undefined,
      minimum: prop['minimum'] as number | undefined,
      maximum: prop['maximum'] as number | undefined,
    }));
  }
}
