import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

interface PoolConfig {
  max: number;
  idleTimeoutMs: number;
  acquireTimeoutMs: number;
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  max: 10,
  idleTimeoutMs: 30000,
  acquireTimeoutMs: 5000,
};

interface TenantConnection {
  client: PrismaClient;
  lastUsed: number;
}

@Injectable()
export class TenantPrismaService implements OnModuleDestroy {
  private readonly clients = new Map<string, TenantConnection>();
  private readonly poolConfig: PoolConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {
    this.poolConfig = {
      max: this.configService.get<number>('TENANT_DB_POOL_MAX') ?? DEFAULT_POOL_CONFIG.max,
      idleTimeoutMs: this.configService.get<number>('TENANT_DB_IDLE_TIMEOUT_MS') ?? DEFAULT_POOL_CONFIG.idleTimeoutMs,
      acquireTimeoutMs: this.configService.get<number>('TENANT_DB_ACQUIRE_TIMEOUT_MS') ?? DEFAULT_POOL_CONFIG.acquireTimeoutMs,
    };

    this.startIdleCleanup();
  }

  /**
   * Get or create a PrismaClient for the given tenant
   * Uses lazy initialization and connection pooling
   */
  async getClient(tenantId: string): Promise<PrismaClient> {
    const existing = this.clients.get(tenantId);

    if (existing) {
      existing.lastUsed = Date.now();
      return existing.client;
    }

    return this.createClient(tenantId);
  }

  /**
   * Get a PrismaClient synchronously (for middleware use)
   * Note: Will create connection if not exists
   */
  getClientSync(tenantId: string): PrismaClient {
    const existing = this.clients.get(tenantId);

    if (existing) {
      existing.lastUsed = Date.now();
      return existing.client;
    }

    const client = this.createClientSync(tenantId);
    return client;
  }

  private async createClient(tenantId: string): Promise<PrismaClient> {
    const dbUrl = this.getTenantDbUrl(tenantId);

    const client = new PrismaClient({
      datasources: {
        db: { url: dbUrl },
      },
    });

    try {
      // Connect with timeout
      const connectPromise = client.$connect();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Connection acquisition timeout after ${this.poolConfig.acquireTimeoutMs}ms for tenant ${tenantId}`));
        }, this.poolConfig.acquireTimeoutMs);
      });

      await Promise.race([connectPromise, timeoutPromise]);

      this.clients.set(tenantId, {
        client,
        lastUsed: Date.now(),
      });

      return client;
    } catch (error) {
      // Clean up the client on connection failure to prevent memory leak
      await client.$disconnect().catch(() => {
        // Ignore disconnect errors during cleanup
      });
      throw error;
    }
  }

  private createClientSync(tenantId: string): PrismaClient {
    const dbUrl = this.getTenantDbUrl(tenantId);

    const client = new PrismaClient({
      datasources: {
        db: { url: dbUrl },
      },
    });

    this.clients.set(tenantId, {
      client,
      lastUsed: Date.now(),
    });

    // Connect in background - client will auto-connect on first query
    return client;
  }

  private getTenantDbUrl(tenantId: string): string {
    // Dev mode: use the platform DATABASE_URL for all tenants (single-database mode)
    const devMode = this.configService.get<string>('DEV_MODE') === 'true';
    if (devMode) {
      const platformUrl = this.configService.get<string>('DATABASE_URL');
      if (platformUrl) {
        return platformUrl;
      }
    }

    const host = this.configService.get<string>('TENANT_DB_HOST') ?? 'localhost';
    const port = this.configService.get<number>('TENANT_DB_PORT') ?? 5432;
    const user = this.configService.get<string>('TENANT_DB_USER') ?? 'postgres';
    const password = this.configService.get<string>('TENANT_DB_PASSWORD') ?? 'postgres';

    // Tenant database name follows convention: tenant_{tenantId without prefix}
    const dbName = `tenant_${tenantId.replace('tnt_', '')}`;

    // URL-encode credentials to handle special characters (e.g., @, :, /)
    const encodedUser = encodeURIComponent(user);
    const encodedPassword = encodeURIComponent(password);

    return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${dbName}?connection_limit=${this.poolConfig.max}`;
  }

  private startIdleCleanup(): void {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, 60000);
  }

  private cleanupIdleConnections(): void {
    const now = Date.now();

    for (const [tenantId, connection] of this.clients.entries()) {
      if (now - connection.lastUsed > this.poolConfig.idleTimeoutMs) {
        connection.client.$disconnect().catch(() => {
          // Ignore disconnect errors during cleanup
        });
        this.clients.delete(tenantId);
      }
    }
  }

  /**
   * Disconnect a specific tenant's client
   */
  async disconnectTenant(tenantId: string): Promise<void> {
    const connection = this.clients.get(tenantId);
    if (connection) {
      await connection.client.$disconnect();
      this.clients.delete(tenantId);
    }
  }

  /**
   * Get the number of active connections
   */
  getActiveConnectionCount(): number {
    return this.clients.size;
  }

  /**
   * Check if a tenant has an active connection
   */
  hasConnection(tenantId: string): boolean {
    return this.clients.has(tenantId);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Disconnect all clients
    const disconnectPromises = Array.from(this.clients.values()).map(
      (connection) => connection.client.$disconnect()
    );

    await Promise.all(disconnectPromises);
    this.clients.clear();
  }
}
