import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'JWT_SECRET':
            return 'test-jwt-secret-key-for-testing';
          default:
            return undefined;
        }
      }),
    } as unknown as jest.Mocked<ConfigService>;

    strategy = new JwtStrategy(mockConfigService);
  });

  describe('constructor', () => {
    it('should throw error when JWT_SECRET is not set', () => {
      const configWithoutSecret = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      expect(() => new JwtStrategy(configWithoutSecret)).toThrow(
        'JWT_SECRET environment variable is not set'
      );
    });
  });

  describe('validate', () => {
    const basePayload: JwtPayload = {
      sub: 'google-oauth2|123456',
      email: 'test@example.com',
      tenantId: '',
      role: '',
      userId: '',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    it('should throw UnauthorizedException when subject is missing', () => {
      const payloadWithoutSub = { ...basePayload, sub: '' };

      expect(() => strategy.validate(payloadWithoutSub)).toThrow(UnauthorizedException);
      expect(() => strategy.validate(payloadWithoutSub)).toThrow('Invalid token: missing subject');
    });

    it('should return user payload with direct claims', () => {
      const payload: JwtPayload = {
        ...basePayload,
        tenantId: 'tnt_test123',
        role: 'ADMIN',
        userId: 'usr_test123',
      };

      const result = strategy.validate(payload);

      expect(result).toEqual({
        userId: 'usr_test123',
        tenantId: 'tnt_test123',
        role: 'ADMIN',
        email: 'test@example.com',
        auth0Id: 'google-oauth2|123456',
        department: null,
      });
    });

    it('should use defaults when claims are missing', () => {
      const result = strategy.validate(basePayload);

      expect(result).toEqual({
        userId: 'google-oauth2|123456',
        tenantId: '',
        role: 'MEMBER',
        email: 'test@example.com',
        auth0Id: 'google-oauth2|123456',
        department: null,
      });
    });

    it('should handle PLATFORM_OWNER role', () => {
      const payload: JwtPayload = {
        ...basePayload,
        role: 'PLATFORM_OWNER',
      };

      const result = strategy.validate(payload);

      expect(result.role).toBe('PLATFORM_OWNER');
    });

    it('should handle TENANT_OWNER role', () => {
      const payload: JwtPayload = {
        ...basePayload,
        role: 'TENANT_OWNER',
      };

      const result = strategy.validate(payload);

      expect(result.role).toBe('TENANT_OWNER');
    });

    it('should handle MEMBER role explicitly', () => {
      const payload: JwtPayload = {
        ...basePayload,
        role: 'MEMBER',
      };

      const result = strategy.validate(payload);

      expect(result.role).toBe('MEMBER');
    });
  });
});
