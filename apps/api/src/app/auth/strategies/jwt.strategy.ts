import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  userId: string;
  department?: string | null;
  iat: number;
  exp: number;
}

export interface CurrentUserPayload {
  userId: string;
  tenantId: string;
  role: 'PLATFORM_OWNER' | 'TENANT_OWNER' | 'ADMIN' | 'MEMBER';
  email: string;
  auth0Id: string;
  department: string | null; // Business Brain domain isolation (Story 3.2)
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    const jwtSecret = configService.get<string>('JWT_SECRET');

    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtSecret,
      algorithms: ['HS256'],
    });
  }

  validate(payload: JwtPayload): CurrentUserPayload {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token: missing subject');
    }

    return {
      userId: payload.userId || payload.sub,
      tenantId: payload.tenantId || '',
      role: (payload.role as CurrentUserPayload['role']) || 'MEMBER',
      email: payload.email,
      auth0Id: payload.sub,
      department: payload.department ?? null,
    };
  }
}
