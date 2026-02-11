// Tenant Context Library
// Provides multi-tenant database routing and context management

// Services
export { TenantPrismaService } from './lib/tenant-prisma.service';
export { PlatformPrismaService } from './lib/platform-prisma.service';

// Middleware
export { TenantMiddleware, TENANT_ID_HEADER, TENANT_ID_KEY } from './lib/tenant.middleware';

// Decorators
export { TenantId } from './lib/tenant-id.decorator';

// Module
export { TenantModule } from './lib/tenant.module';
