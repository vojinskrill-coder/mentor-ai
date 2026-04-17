export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly entryId: string,
    public readonly currentState: string,
    public readonly targetState: string,
  ) {
    super(
      `Invalid state transition for entry ${entryId}: ${currentState} -> ${targetState}`,
    );
    this.name = 'InvalidStateTransitionError';
  }
}
