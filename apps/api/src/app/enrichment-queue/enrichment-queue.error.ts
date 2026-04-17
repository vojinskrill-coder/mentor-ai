/**
 * Thrown when an enrichment queue entry attempts an invalid state transition.
 */
export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly entryId?: string,
  ) {
    super(
      `Invalid state transition from ${from} to ${to}${entryId ? ` (entry ${entryId})` : ''}`,
    );
    this.name = 'InvalidStateTransitionError';
  }
}
