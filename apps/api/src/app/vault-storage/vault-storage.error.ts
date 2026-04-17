/**
 * Structured error for all vault storage operations.
 * Carries context (tenantId, path, operation) for diagnostics.
 */
export class VaultStorageError extends Error {
  constructor(
    message: string,
    public readonly tenantId: string,
    public readonly path: string,
    public readonly operation: 'read' | 'write' | 'exists' | 'list' | 'mkdir' | 'writeFiles',
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'VaultStorageError';
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, VaultStorageError.prototype);
  }
}
