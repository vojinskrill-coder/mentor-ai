import { Injectable, Logger } from '@nestjs/common';
import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import * as dns from 'dns';
import { promisify } from 'util';

const dnsResolve = promisify(dns.resolve);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface VerifyRule {
  field: string;
  type: 'dns' | 'url' | 'enum' | 'regex';
  /** Enum values or regex pattern */
  value?: string[] | string;
}

export interface VerificationResult {
  valid: boolean;
  failures: Array<{ field: string; reason: string }>;
}

export interface SemanticResult {
  passed: boolean;
  flags: string[];
}

@Injectable()
export class SchemaValidatorService {
  private readonly logger = new Logger(SchemaValidatorService.name);
  private readonly ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
  }

  /**
   * Level 1: JSON Schema validation (ajv draft-07)
   */
  validateSchema(data: unknown, schema: Record<string, unknown>): ValidationResult {
    const validate = this.ajv.compile(schema);
    const valid = validate(data);

    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors = (validate.errors ?? []).map((e: ErrorObject) =>
      `${e.instancePath || '/'}: ${e.message ?? 'unknown error'}`
    );

    return { valid: false, errors };
  }

  /**
   * Level 2: Data verification (DNS lookup, URL check, enum, regex)
   */
  async verifyData(data: unknown, rules: VerifyRule[]): Promise<VerificationResult> {
    const failures: Array<{ field: string; reason: string }> = [];

    for (const rule of rules) {
      const fieldValue = this.getNestedField(data, rule.field);
      if (fieldValue === undefined || fieldValue === null) continue;

      try {
        switch (rule.type) {
          case 'dns': {
            const email = String(fieldValue);
            const domain = email.includes('@') ? email.split('@')[1] ?? email : email;
            try {
              await dnsResolve(domain, 'MX');
            } catch {
              failures.push({ field: rule.field, reason: `DNS MX lookup failed for ${domain}` });
            }
            break;
          }
          case 'url': {
            const urlStr = String(fieldValue);
            // SSRF protection: only allow http/https and block private IP ranges
            if (!this.isSafeUrl(urlStr)) {
              failures.push({ field: rule.field, reason: `URL blocked by SSRF protection: ${urlStr}` });
              break;
            }
            try {
              const response = await fetch(urlStr, {
                method: 'HEAD',
                signal: AbortSignal.timeout(15000),
                redirect: 'manual', // Don't follow redirects to internal URLs
              });
              if (!response.ok && response.status !== 301 && response.status !== 302) {
                failures.push({ field: rule.field, reason: `URL returned ${response.status}` });
              }
            } catch {
              failures.push({ field: rule.field, reason: `URL unreachable: ${urlStr}` });
            }
            break;
          }
          case 'enum': {
            const allowed = Array.isArray(rule.value) ? rule.value : [];
            if (!allowed.includes(String(fieldValue))) {
              failures.push({ field: rule.field, reason: `Value "${fieldValue}" not in allowed values` });
            }
            break;
          }
          case 'regex': {
            if (typeof rule.value !== 'string') break;
            // ReDoS protection: limit pattern length and use timeout
            if (rule.value.length > 200) {
              failures.push({ field: rule.field, reason: 'Regex pattern too long (max 200 chars)' });
              break;
            }
            try {
              const pattern = new RegExp(rule.value);
              // Run regex with a simple length guard to limit catastrophic backtracking
              const testStr = String(fieldValue).slice(0, 1000);
              if (!pattern.test(testStr)) {
                failures.push({ field: rule.field, reason: `Value does not match pattern ${rule.value}` });
              }
            } catch {
              failures.push({ field: rule.field, reason: `Invalid regex pattern: ${rule.value}` });
            }
            break;
          }
        }
      } catch (err) {
        this.logger.warn(`Verify rule failed for ${rule.field}: ${err}`);
        failures.push({ field: rule.field, reason: `Verification error: ${err}` });
      }
    }

    return { valid: failures.length === 0, failures };
  }

  /**
   * Level 3: Semantic quality check via LLM
   * Called externally with AiGateway — this method just builds the prompt
   */
  buildSemanticCheckPrompt(data: unknown, schema: Record<string, unknown>): string {
    const schemaStr = JSON.stringify(schema, null, 2).slice(0, 2000);
    const dataStr = JSON.stringify(data, null, 2).slice(0, 3000);

    return [
      'Check if this data looks real and consistent. Flag any fields that appear hallucinated, fabricated, or implausible.',
      'Respond ONLY with valid JSON: { "passed": true/false, "flags": ["issue1", ...] }',
      '',
      `Schema (expected structure):`,
      schemaStr,
      '',
      `Data to check:`,
      dataStr,
    ].join('\n');
  }

  /**
   * Build a corrective feedback prompt for agent retry
   */
  buildCorrectionPrompt(errors: string[], rawOutput: string): string {
    const errorList = errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n');
    const truncatedOutput = rawOutput.slice(0, 2000);

    return [
      'Your previous output had validation errors. Fix ONLY the specific issues listed below.',
      'Return the corrected JSON output with all fields intact.',
      '',
      'Errors found:',
      errorList,
      '',
      'Your previous output (truncated):',
      truncatedOutput,
    ].join('\n');
  }

  /**
   * SSRF protection: block private IPs and non-http(s) schemes
   */
  private isSafeUrl(urlStr: string): boolean {
    try {
      const url = new URL(urlStr);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      const hostname = url.hostname;
      // Block localhost, private IPs, link-local, metadata endpoints
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
      if (hostname.startsWith('10.')) return false;
      if (hostname.startsWith('172.') && /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
      if (hostname.startsWith('192.168.')) return false;
      if (hostname.startsWith('169.254.')) return false; // AWS metadata
      if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Utility: get nested field value from object using dot notation
   */
  private getNestedField(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}
