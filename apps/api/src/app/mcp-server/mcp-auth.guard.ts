import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class McpAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    const expectedToken = process.env.MCP_AUTH_TOKEN;

    if (!expectedToken) {
      throw new UnauthorizedException('MCP_AUTH_TOKEN not configured');
    }

    if (token !== expectedToken) {
      throw new UnauthorizedException('Invalid MCP auth token');
    }

    return true;
  }
}
