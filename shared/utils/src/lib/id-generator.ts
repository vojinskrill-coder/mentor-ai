/**
 * Entity ID generators with prefixes
 * Uses cuid2 for collision-resistant, URL-safe IDs
 * Prefixes identify entity types: usr_ (user), tnt_ (tenant)
 */

import { createId } from '@paralleldrive/cuid2';

/** Entity ID prefixes */
export const ID_PREFIX = {
  USER: 'usr_',
  TENANT: 'tnt_',
  INVITATION: 'inv_',
} as const;

/** Generate a user ID with usr_ prefix */
export function generateUserId(): string {
  return `${ID_PREFIX.USER}${createId()}`;
}

/** Generate a tenant ID with tnt_ prefix */
export function generateTenantId(): string {
  return `${ID_PREFIX.TENANT}${createId()}`;
}

/** Generate an invitation ID with inv_ prefix */
export function generateInvitationId(): string {
  return `${ID_PREFIX.INVITATION}${createId()}`;
}

/** Generate a URL-safe invite token (no prefix, used in invite links) */
export function generateInviteToken(): string {
  return createId();
}

/** Validate that an ID has the expected prefix */
export function hasValidPrefix(
  id: string,
  prefix: (typeof ID_PREFIX)[keyof typeof ID_PREFIX]
): boolean {
  return id.startsWith(prefix);
}

/** Extract the raw ID without prefix */
export function stripPrefix(id: string): string {
  const prefixMatch = Object.values(ID_PREFIX).find((p) => id.startsWith(p));
  return prefixMatch ? id.slice(prefixMatch.length) : id;
}
