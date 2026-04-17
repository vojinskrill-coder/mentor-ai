import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetch as undiciFetch } from 'undici';

@Injectable()
export class NocoDbService {
  private readonly logger = new Logger(NocoDbService.name);
  private readonly baseUrl: string;
  private readonly apiToken: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('NOCODB_URL', 'http://91.98.231.87:8080');
    this.apiToken = this.config.get<string>('NOCODB_API_TOKEN', '');
  }

  /**
   * Read all records from a NocoDB table.
   * Uses the NocoDB v2 API: GET /api/v2/meta/bases/.../tables/.../records
   * Simplified: uses the table records endpoint directly.
   */
  async listRecords(
    tableId: string,
    options?: { where?: string; limit?: number },
  ): Promise<any[]> {
    const params = new URLSearchParams();
    if (options?.where) params.set('where', options.where);
    if (options?.limit) params.set('limit', String(options.limit));

    const url = `${this.baseUrl}/api/v2/tables/${tableId}/records?${params.toString()}`;
    this.logger.debug(`NocoDB listRecords: GET ${url}`);

    const response = await undiciFetch(url, {
      method: 'GET',
      headers: {
        'xc-token': this.apiToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`NocoDB listRecords failed: ${response.status} ${body}`);
      throw new Error(`NocoDB API error: ${response.status} — ${body}`);
    }

    const data = (await response.json()) as any;
    // NocoDB v2 returns { list: [...], pageInfo: {...} }
    return data.list ?? [];
  }

  /**
   * Create a single record in a NocoDB table.
   */
  async createRecord(
    tableId: string,
    data: Record<string, any>,
  ): Promise<any> {
    const url = `${this.baseUrl}/api/v2/tables/${tableId}/records`;
    this.logger.debug(`NocoDB createRecord: POST ${url}`);

    const response = await undiciFetch(url, {
      method: 'POST',
      headers: {
        'xc-token': this.apiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`NocoDB createRecord failed: ${response.status} ${body}`);
      throw new Error(`NocoDB API error: ${response.status} — ${body}`);
    }

    return response.json();
  }

  /**
   * Create multiple records in a NocoDB table (bulk insert).
   */
  async createRecords(
    tableId: string,
    records: Record<string, any>[],
  ): Promise<any> {
    const url = `${this.baseUrl}/api/v2/tables/${tableId}/records`;
    this.logger.debug(`NocoDB createRecords: POST ${url} (${records.length} records)`);

    const response = await undiciFetch(url, {
      method: 'POST',
      headers: {
        'xc-token': this.apiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(records),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`NocoDB createRecords failed: ${response.status} ${body}`);
      throw new Error(`NocoDB API error: ${response.status} — ${body}`);
    }

    return response.json();
  }

  /**
   * Map our internal lead format to NocoDB field names using adapter fieldMapping.
   * fieldMapping: { ourField: "NocoDB Title Field" }
   * Supports dot-notation for nested fields (e.g., "outreach.email" → lead.outreach.email)
   * Objects/arrays are JSON-stringified for NocoDB text columns.
   */
  mapToNocoDB(
    lead: Record<string, any>,
    fieldMapping: Record<string, string>,
  ): Record<string, any> {
    const mapped: Record<string, any> = {};
    for (const [ourField, nocoField] of Object.entries(fieldMapping)) {
      const value = this.resolveNestedValue(lead, ourField);
      if (value !== undefined && value !== null) {
        // NocoDB text fields can't store objects — stringify them
        mapped[nocoField] = typeof value === 'object' ? JSON.stringify(value) : value;
      }
    }
    return mapped;
  }

  /**
   * Resolve a potentially nested field path (e.g., "outreach.email") from an object.
   */
  private resolveNestedValue(obj: Record<string, any>, path: string): any {
    // First try direct key (e.g., lead['outreach.email'] — some formats use flat keys)
    if (obj[path] !== undefined) return obj[path];

    // Then try dot-notation traversal
    const parts = path.split('.');
    let current: any = obj;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return current;
  }

  /**
   * Map NocoDB record back to our internal format using adapter fieldMapping.
   * Reverses the fieldMapping: NocoDB field → our field.
   */
  mapFromNocoDB(
    record: Record<string, any>,
    fieldMapping: Record<string, string>,
  ): Record<string, any> {
    const mapped: Record<string, any> = {};
    for (const [ourField, nocoField] of Object.entries(fieldMapping)) {
      if (record[nocoField] === undefined || record[nocoField] === null) continue;

      let value = record[nocoField];

      // Try to parse JSON strings back to objects (we stringify on write)
      if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
        try { value = JSON.parse(value); } catch { /* keep as string */ }
      }

      // Reconstruct nested paths: "outreach.email" → { outreach: { email: value } }
      if (ourField.includes('.')) {
        const parts = ourField.split('.');
        let current: Record<string, any> = mapped;
        for (let i = 0; i < parts.length - 1; i++) {
          const key = parts[i] as string;
          if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
          }
          current = current[key] as Record<string, any>;
        }
        const lastKey = parts[parts.length - 1] as string;
        current[lastKey] = value;
      } else {
        mapped[ourField] = value;
      }
    }
    // Preserve the NocoDB row Id for reference
    if (record['Id']) {
      mapped['nocoDbId'] = record['Id'];
    }
    return mapped;
  }
}
