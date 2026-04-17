import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

// Retry cadence for transient DB connection failures.
//
// CRITICAL: this is the INTERVAL between individual retries, not the total
// budget. Set it too high (e.g. 30 minutes) and any single transient hiccup
// blocks every subsequent DB query for that long — the entire UI hangs
// because every API request is waiting on a Prisma query that is sleeping
// in the retry loop. Keep this short (seconds) so recovery is near-instant
// on flaps, and rely on DB_RETRY_MAX_MS as the "be patient" ceiling.
const DB_RETRY_INTERVAL_MS = 5_000;           // 5 seconds between retries
const DB_RETRY_MAX_MS = 30 * 60 * 1000;       // 30 minute total retry window (patient ceiling)
const RETRYABLE_ERRORS = [
  'Can\'t reach database server',
  'Connection refused',
  'Connection timed out',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'connection is not allowed',
  'too many connections',
  'server closed the connection unexpectedly',
];

@Injectable()
export class PlatformPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlatformPrismaService.name);

  constructor(configService: ConfigService) {
    const databaseUrl = configService.get<string>('DATABASE_URL');

    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL environment variable is required but not set. ' +
        'Please configure DATABASE_URL in your .env file. ' +
        'Example: DATABASE_URL=postgresql://user:password@localhost:5432/mentor_ai_platform'
      );
    }

    super({
      datasources: {
        db: { url: databaseUrl },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    // Add retry middleware for all Prisma operations
    this.$use(async (params, next) => {
      const start = Date.now();
      let attempt = 0;

      while (true) {
        try {
          return await next(params);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const isRetryable = RETRYABLE_ERRORS.some((e) => msg.includes(e));
          const elapsed = Date.now() - start;

          if (!isRetryable || elapsed >= DB_RETRY_MAX_MS) {
            throw err; // Non-retryable or timeout exceeded
          }

          attempt++;
          this.logger.warn({
            message: `DB connection failed, retry ${attempt} in ${DB_RETRY_INTERVAL_MS / 1000}s`,
            model: params.model,
            action: params.action,
            error: msg.substring(0, 100),
            elapsedMs: elapsed,
          });

          // Reconnect and wait
          try { await this.$disconnect(); } catch { /* ignore */ }
          await new Promise((r) => setTimeout(r, DB_RETRY_INTERVAL_MS));
          try { await this.$connect(); } catch { /* will retry on next iteration */ }
        }
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
