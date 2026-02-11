// Re-export Prisma client and types from @prisma/client
// This provides a clean import path: @mentor-ai/shared/prisma
// The Prisma client is generated from apps/api/prisma/schema.prisma

export {
  PrismaClient,
  Prisma,
  TenantStatus,
  UserRole,
  InvitationStatus,
  Department,
  NoteSource,
  NoteType,
  NoteStatus,
} from '@prisma/client';

// Export generated model types
export type { Platform, TenantRegistry, Tenant, User, Invitation, Note } from '@prisma/client';
