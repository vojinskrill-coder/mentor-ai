import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { TemplateResolutionError } from './template.error';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);
  private readonly templateDir: string;

  constructor() {
    this.templateDir = path.resolve(
      process.cwd(),
      'openclaw-config',
      'templates',
    );
  }

  /**
   * Resolve a template file with the given variables.
   * Throws TemplateResolutionError if any placeholders remain unresolved.
   */
  resolve(
    templateName: string,
    vars: Record<string, string>,
  ): string {
    const templatePath = path.join(this.templateDir, templateName);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templateName}`);
    }
    const template = fs.readFileSync(templatePath, 'utf-8');
    return this.resolveContent(template, vars);
  }

  /**
   * Resolve template content (string) with variables.
   */
  resolveContent(
    content: string,
    vars: Record<string, string>,
  ): string {
    let resolved = content;
    for (const [key, value] of Object.entries(vars)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      resolved = resolved.replace(pattern, value);
    }

    // Check for unresolved placeholders
    const unresolved = resolved.match(/\{\{[A-Z_]+\}\}/g);
    if (unresolved && unresolved.length > 0) {
      const unique = [...new Set(unresolved)];
      throw new TemplateResolutionError(
        `Unresolved placeholders: ${unique.join(', ')}`,
        unique,
      );
    }

    return resolved;
  }

  /**
   * Resolve all templates in a directory with the given variables.
   */
  resolveAll(
    vars: Record<string, string>,
    subDir?: string,
  ): Map<string, string> {
    const dir = subDir
      ? path.join(this.templateDir, subDir)
      : this.templateDir;

    if (!fs.existsSync(dir)) {
      throw new Error(`Template directory not found: ${dir}`);
    }

    const results = new Map<string, string>();
    const files = this.getAllFiles(dir);

    for (const file of files) {
      const relativePath = path.relative(this.templateDir, file);
      const content = fs.readFileSync(file, 'utf-8');
      results.set(relativePath, this.resolveContent(content, vars));
    }

    return results;
  }

  private getAllFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.getAllFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }
}
