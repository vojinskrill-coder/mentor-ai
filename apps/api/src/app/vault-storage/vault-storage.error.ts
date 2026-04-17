export class VaultStorageError extends Error {
  constructor(
    message: string,
    public readonly tenantId: string,
    public readonly path: string,
    public readonly operation: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'VaultStorageError';
  }
}
