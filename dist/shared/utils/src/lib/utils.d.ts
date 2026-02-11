/**
 * Shared utility functions for Mentor AI
 * These utilities are used across both frontend (Angular) and backend (NestJS)
 */
/** Generate a unique ID */
export declare function generateId(): string;
/** Check if a value is defined (not null or undefined) */
export declare function isDefined<T>(value: T | null | undefined): value is T;
/** Safely parse JSON with error handling */
export declare function safeJsonParse<T>(json: string, fallback: T): T;
/** Delay execution for specified milliseconds */
export declare function delay(ms: number): Promise<void>;
/** Truncate string to specified length with ellipsis */
export declare function truncate(str: string, maxLength: number): string;
