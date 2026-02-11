import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;

  const mockExecutionContext = () => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({}),
        getResponse: jest.fn().mockReturnValue({}),
      }),
      getType: jest.fn().mockReturnValue('http'),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    const mockConfigService = { get: jest.fn() } as unknown as ConfigService;
    guard = new JwtAuthGuard(reflector, mockConfigService);
  });

  describe('canActivate', () => {
    it('should allow access when route is marked as public', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const context = mockExecutionContext();

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should check public metadata from handler and class', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const context = mockExecutionContext();

      await guard.canActivate(context);

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith('isPublic', [
        context.getHandler(),
        context.getClass(),
      ]);
    });
  });

  describe('handleRequest', () => {
    it('should return user when authentication succeeds', () => {
      const user = { userId: 'usr_test123', email: 'test@example.com' };

      const result = guard.handleRequest(null, user, null as unknown as Error);

      expect(result).toBe(user);
    });

    it('should throw error when error is present', () => {
      const error = new Error('Auth failed');

      expect(() => guard.handleRequest(error, null, null as unknown as Error)).toThrow(error);
    });

    it('should throw UnauthorizedException when user is null', () => {
      expect(() => guard.handleRequest(null, null, null as unknown as Error)).toThrow(
        UnauthorizedException
      );
    });

    it('should include info message in UnauthorizedException', () => {
      const info = new Error('Token expired');

      try {
        guard.handleRequest(null, null, info);
        fail('Expected UnauthorizedException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        const response = (error as UnauthorizedException).getResponse();
        expect(response).toMatchObject({
          type: 'unauthorized',
          title: 'Authentication Required',
          detail: 'Token expired',
        });
      }
    });

    it('should use default message when info is not provided', () => {
      try {
        guard.handleRequest(null, null, null as unknown as Error);
        fail('Expected UnauthorizedException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        const response = (error as UnauthorizedException).getResponse();
        expect(response).toMatchObject({
          detail: 'You must be logged in to access this resource',
        });
      }
    });
  });
});
