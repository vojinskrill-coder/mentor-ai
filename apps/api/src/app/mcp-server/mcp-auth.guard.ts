import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Guard that validates MCP Bearer token authentication.
 * Checks the Authorization header against MCP_AUTH_TOKEN env var.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      throw new UnauthorizedException('Invalid Authorization header format');
    }

    const token = parts[1];
    const expectedToken = this.configService.get<string>('MCP_AUTH_TOKEN');

    if (!expectedToken) {
      throw new ForbiddenException('MCP_AUTH_TOKEN not configured');
    }

    if (token !== expectedToken) {
      throw new ForbiddenException('Invalid MCP auth token');
    }

    return true;
  }
}
