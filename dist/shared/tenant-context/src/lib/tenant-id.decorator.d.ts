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
export declare const TenantId: (...dataOrPipes: unknown[]) => ParameterDecorator;
