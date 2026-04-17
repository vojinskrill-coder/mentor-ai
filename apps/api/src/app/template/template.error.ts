/**
 * Thrown when a template contains unresolved {{placeholders}} after variable substitution.
 */
export class TemplateResolutionError extends Error {
  public readonly unresolvedPlaceholders: string[];

  constructor(templateName: string, unresolvedPlaceholders: string[]) {
    const list = unresolvedPlaceholders.join(', ');
    super(
      `Template "${templateName}" has unresolved placeholders: ${list}`,
    );
    this.name = 'TemplateResolutionError';
    this.unresolvedPlaceholders = unresolvedPlaceholders;
  }
}
