export class TemplateResolutionError extends Error {
  constructor(
    message: string,
    public readonly unresolvedPlaceholders: string[],
  ) {
    super(message);
    this.name = 'TemplateResolutionError';
  }
}
