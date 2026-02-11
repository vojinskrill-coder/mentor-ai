/**
 * Entity ID generators with prefixes
 * Uses cuid2 for collision-resistant, URL-safe IDs
 * Prefixes identify entity types: usr_ (user), tnt_ (tenant)
 */
/** Entity ID prefixes */
export declare const ID_PREFIX: {
    readonly USER: "usr_";
    readonly TENANT: "tnt_";
    readonly INVITATION: "inv_";
};
/** Generate a user ID with usr_ prefix */
export declare function generateUserId(): string;
/** Generate a tenant ID with tnt_ prefix */
export declare function generateTenantId(): string;
/** Generate an invitation ID with inv_ prefix */
export declare function generateInvitationId(): string;
/** Generate a URL-safe invite token (no prefix, used in invite links) */
export declare function generateInviteToken(): string;
/** Validate that an ID has the expected prefix */
export declare function hasValidPrefix(id: string, prefix: (typeof ID_PREFIX)[keyof typeof ID_PREFIX]): boolean;
/** Extract the raw ID without prefix */
export declare function stripPrefix(id: string): string;
