import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { MfaRequiredGuard } from './mfa-required.guard';
import { AuthService } from '../auth.service';
import { CurrentUserPayload } from '../strategies/jwt.strategy';

describe('MfaRequiredGuard', () => {
  let guard: MfaRequiredGuard;
  let reflector: jest.Mocked<Reflector>;
  let authService: jest.Mocked<AuthService>;

  const mockExecutionContext = (user?: CurrentUserPayload) => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  const mockUser: CurrentUserPayload = {
    userId: 'usr_test123',
    tenantId: 'tnt_test123',
    role: 'MEMBER',
    email: 'test@example.com',
    auth0Id: 'google-oauth2|123',
    department: null,
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    authService = {
      getMfaStatus: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    const mockConfigService = { get: jest.fn() } as unknown as ConfigService;
    guard = new MfaRequiredGuard(reflector, authService, mockConfigService);
  });

  it('should allow access when skipMfa decorator is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = mockExecutionContext(mockUser);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(authService.getMfaStatus).not.toHaveBeenCalled();
  });

  it('should allow access when no user present (let JwtAuthGuard handle)', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = mockExecutionContext(undefined);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(authService.getMfaStatus).not.toHaveBeenCalled();
  });

  it('should allow access when user has MFA enabled', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    authService.getMfaStatus.mockResolvedValue({ enabled: true });
    const context = mockExecutionContext(mockUser);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(authService.getMfaStatus).toHaveBeenCalledWith('usr_test123');
  });

  it('should throw ForbiddenException when MFA is not enabled', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    authService.getMfaStatus.mockResolvedValue({ enabled: false });
    const context = mockExecutionContext(mockUser);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should include redirect info in ForbiddenException', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    authService.getMfaStatus.mockResolvedValue({ enabled: false });
    const context = mockExecutionContext(mockUser);

    try {
      await guard.canActivate(context);
      fail('Expected ForbiddenException to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const response = (error as ForbiddenException).getResponse();
      expect(response).toMatchObject({
        type: 'mfa_required',
        title: 'Two-Factor Authentication Required',
        redirectTo: '/2fa-setup',
      });
    }
  });

  it('should check MFA status with correct user ID', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    authService.getMfaStatus.mockResolvedValue({ enabled: true });
    const customUser = { ...mockUser, userId: 'usr_custom456' };
    const context = mockExecutionContext(customUser);

    await guard.canActivate(context);

    expect(authService.getMfaStatus).toHaveBeenCalledWith('usr_custom456');
  });
});
