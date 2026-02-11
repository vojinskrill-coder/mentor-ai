import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(
    req: Record<string, unknown>
  ): Promise<string> {
    const user = req['user'] as { userId?: string } | undefined;
    return user?.userId ?? (req['ip'] as string);
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // Only throttle POST requests (export creation), not GET (status/download)
    return request.method !== 'POST';
  }
}
