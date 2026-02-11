import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { TenantId } from './tenant-id.decorator';

describe('TenantId Decorator', () => {
  function getParamDecoratorFactory() {
    class TestClass {
      testMethod(@TenantId() _tenantId: string): string {
        return _tenantId;
      }
    }

    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      TestClass,
      'testMethod'
    );

    return args[Object.keys(args)[0]].factory;
  }

  const createMockExecutionContext = (tenantId?: string): ExecutionContext => {
    const mockRequest = {
      tenantId,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  };

  describe('factory', () => {
    it('should extract tenantId from request', () => {
      const factory = getParamDecoratorFactory();
      const tenantId = 'tnt_test123';
      const ctx = createMockExecutionContext(tenantId);

      const result = factory(undefined, ctx);

      expect(result).toBe(tenantId);
    });

    it('should throw ForbiddenException when tenantId is missing', () => {
      const factory = getParamDecoratorFactory();
      const ctx = createMockExecutionContext(undefined);

      expect(() => factory(undefined, ctx)).toThrow(ForbiddenException);
    });

    it('should include RFC 7807 format in error response', () => {
      const factory = getParamDecoratorFactory();
      const ctx = createMockExecutionContext(undefined);

      try {
        factory(undefined, ctx);
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const response = (error as ForbiddenException).getResponse() as Record<string, unknown>;
        expect(response).toMatchObject({
          type: 'tenant_context_missing',
          title: 'Tenant Context Missing',
          status: 403,
          detail: expect.any(String),
        });
      }
    });
  });
});
