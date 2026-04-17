import { Injectable } from '@nestjs/common';
import { readFileSync, readdirSync } from 'fs';
import * as path from 'path';
import { TemplateResolutionError } from './template.error';

/** File names of all vault templates (with .template extension). */
const TEMPLATE_FILES = [
  'SCHEMA.template.md',
  'TENANT-PROTOCOL.template.md',
  'GUARDRAILS.template.md',
  'SOUL.template.md',
  'FLOW.template.md',
  'bootstrap.template.md',
] as const;

@Injectable()
export class TemplateService {
  private readonly templateDir: string;

  constructor() {
    this.templateDir = path.join(
      process.cwd(),
      'openclaw-config',
      'templates',
      'vault',
    );
  }

  /**
   * Resolve a single template by replacing all `{{key}}` placeholders
   * with the corresponding values from `variables`.
   *
   * @param templateName - file name inside the template directory, e.g. `SCHEMA.template.md`
   * @param variables    - key/value map; keys should match placeholder names (without braces)
   * @returns the fully-resolved template content
   * @throws TemplateResolutionError if any `{{…}}` placeholders remain after substitution
   */
  resolve(templateName: string, variables: Record<string, string>): string {
    const filePath = path.join(this.templateDir, templateName);
    let content = readFileSync(filePath, 'utf-8');

    // Replace all {{key}} occurrences with corresponding variable values.
    // Uses a global regex so every occurrence is replaced (deterministic).
    for (const [key, value] of Object.entries(variables)) {
      // Escape key for regex safety (keys are simple identifiers, but be safe).
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\{\\{${escaped}\\}\\}`, 'g');
      content = content.replace(pattern, value);
    }

    // Check for any remaining unresolved placeholders.
    const remaining: string[] = [];
    for (const m of content.matchAll(/\{\{([^}]+)\}\}/g)) {
      if (m[1]) remaining.push(m[1]);
    }
    if (remaining.length > 0) {
      const unique = [...new Set(remaining)];
      throw new TemplateResolutionError(templateName, unique);
    }

    return content;
  }

  /**
   * Resolve all 6 vault templates and return a Map of
   * output filename (without `.template`) to resolved content.
   *
   * Example entry: `'SCHEMA.md'` -> resolved content string
   */
  resolveAll(variables: Record<string, string>): Map<string, string> {
    const results = new Map<string, string>();

    for (const templateFile of TEMPLATE_FILES) {
      const resolved = this.resolve(templateFile, variables);
      // Strip ".template" from the filename: "SCHEMA.template.md" -> "SCHEMA.md"
      const outputName = templateFile.replace('.template', '');
      results.set(outputName, resolved);
    }

    return results;
  }
}
