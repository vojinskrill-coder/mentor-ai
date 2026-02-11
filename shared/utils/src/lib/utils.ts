/**
 * Shared utility functions for Mentor AI
 * These utilities are used across both frontend (Angular) and backend (NestJS)
 */

/** Generate a unique ID */
export function generateId(): string {
  return crypto.randomUUID();
}

/** Check if a value is defined (not null or undefined) */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/** Safely parse JSON with error handling */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/** Delay execution for specified milliseconds */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Truncate string to specified length with ellipsis */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}
