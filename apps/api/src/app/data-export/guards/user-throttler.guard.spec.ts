import { ExecutionContext } from '@nestjs/common';
import { UserThrottlerGuard } from './user-throttler.guard';

describe('UserThrottlerGuard', () => {
  let guard: UserThrottlerGuard;

  beforeEach(() => {
    // Create instance without full DI (test protected methods directly)
    guard = Object.create(UserThrottlerGuard.prototype);
  });

  describe('getTracker', () => {
    it('should return userId when user is present on request', async () => {
      const req = {
        user: { userId: 'usr_123' },
        ip: '192.168.1.1',
      };

      const tracker = await (guard as any).getTracker(req);

      expect(tracker).toBe('usr_123');
    });

    it('should fall back to IP when user is not present', async () => {
      const req = {
        ip: '192.168.1.1',
      };

      const tracker = await (guard as any).getTracker(req);

      expect(tracker).toBe('192.168.1.1');
    });

    it('should fall back to IP when userId is undefined', async () => {
      const req = {
        user: {},
        ip: '10.0.0.1',
      };

      const tracker = await (guard as any).getTracker(req);

      expect(tracker).toBe('10.0.0.1');
    });
  });

  describe('shouldSkip', () => {
    it('should NOT skip POST requests (they should be throttled)', async () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ method: 'POST' }),
        }),
      } as unknown as ExecutionContext;

      const result = await (guard as any).shouldSkip(context);

      expect(result).toBe(false);
    });

    it('should skip GET requests (no throttling for status/download)', async () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ method: 'GET' }),
        }),
      } as unknown as ExecutionContext;

      const result = await (guard as any).shouldSkip(context);

      expect(result).toBe(true);
    });
  });
});
