import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

/**
 * Parameter decorator to extract the tenant ID from the request context.
 * The tenant ID is set by TenantMiddleware after validation.
 *
 * @example
 * ```typescript
 * @Get('data')
 * getData(@TenantId() tenantId: string) {
 *   return this.myService.getData(tenantId);
 * }
 * ```
 */
export const TenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const tenantId = request.tenantId;

    if (!tenantId) {
      throw new ForbiddenException({
        type: 'tenant_context_missing',
        title: 'Tenant Context Missing',
        status: 403,
        detail: 'Tenant context not available. Ensure TenantMiddleware is configured.',
      });
    }

    return tenantId;
  }
);
