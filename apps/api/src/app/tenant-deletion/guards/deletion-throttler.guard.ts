import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limiting guard for tenant deletion endpoints.
 * Limits deletion requests to 3 per day per user to prevent abuse.
 * Only applies to POST requests (deletion/cancellation), not GET (status).
 */
@Injectable()
export class DeletionThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(
    req: Record<string, unknown>
  ): Promise<string> {
    const user = req['user'] as { userId?: string } | undefined;
    return user?.userId ?? (req['ip'] as string);
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // Only throttle POST requests (deletion/cancellation), not GET (status check)
    return request.method !== 'POST';
  }
}
