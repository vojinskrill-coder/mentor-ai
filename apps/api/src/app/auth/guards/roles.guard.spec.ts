import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { CurrentUserPayload } from '../strategies/jwt.strategy';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  const mockExecutionContext = (user?: CurrentUserPayload) => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new RolesGuard(reflector);
  });

  it('should allow access when no roles are required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = mockExecutionContext();

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should allow access when empty roles array', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const context = mockExecutionContext();

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw ForbiddenException when no user present', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    const context = mockExecutionContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    try {
      guard.canActivate(context);
    } catch (error) {
      const response = (error as ForbiddenException).getResponse();
      expect(response).toMatchObject({ title: 'Access Denied' });
    }
  });

  it('should allow access when user has required role', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    const user: CurrentUserPayload = {
      userId: 'usr_test123',
      tenantId: 'tnt_test123',
      role: 'ADMIN',
      email: 'admin@example.com',
      auth0Id: 'google-oauth2|123',
      department: null,
    };
    const context = mockExecutionContext(user);

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw ForbiddenException when user lacks required role', () => {
    reflector.getAllAndOverride.mockReturnValue(['PLATFORM_OWNER']);
    const user: CurrentUserPayload = {
      userId: 'usr_test123',
      tenantId: 'tnt_test123',
      role: 'MEMBER',
      email: 'member@example.com',
      auth0Id: 'google-oauth2|123',
      department: null,
    };
    const context = mockExecutionContext(user);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    try {
      guard.canActivate(context);
    } catch (error) {
      const response = (error as ForbiddenException).getResponse();
      expect(response).toMatchObject({ title: 'Insufficient Permissions' });
    }
  });

  it('should allow access when user has one of multiple required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN', 'TENANT_OWNER']);
    const user: CurrentUserPayload = {
      userId: 'usr_test123',
      tenantId: 'tnt_test123',
      role: 'TENANT_OWNER',
      email: 'owner@example.com',
      auth0Id: 'google-oauth2|123',
      department: null,
    };
    const context = mockExecutionContext(user);

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should deny access when user role not in required roles list', () => {
    reflector.getAllAndOverride.mockReturnValue(['PLATFORM_OWNER', 'ADMIN']);
    const user: CurrentUserPayload = {
      userId: 'usr_test123',
      tenantId: 'tnt_test123',
      role: 'MEMBER',
      email: 'member@example.com',
      auth0Id: 'google-oauth2|123',
      department: null,
    };
    const context = mockExecutionContext(user);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
