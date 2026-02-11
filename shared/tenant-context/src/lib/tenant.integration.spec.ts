/**
 * Integration Tests for Multi-Tenant Database Operations
 *
 * These tests require a running PostgreSQL database.
 * Set TEST_DATABASE_URL environment variable before running.
 *
 * To run: npm run test:integration (with database running)
 *
 * Test Configuration:
 * - Requires: PostgreSQL 16+
 * - Requires: TEST_DATABASE_URL environment variable
 * - Creates temporary test databases for each test suite
 * - Cleans up after test completion
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TenantPrismaService } from './tenant-prisma.service';
import { PlatformPrismaService } from './platform-prisma.service';
import { TenantMiddleware, TENANT_ID_HEADER } from './tenant.middleware';
import { TenantStatus } from '@prisma/client';
import { Request, Response } from 'express';

// Skip integration tests if no database URL is provided
const SKIP_INTEGRATION = !process.env['TEST_DATABASE_URL'];

const describeIntegration = SKIP_INTEGRATION ? describe.skip : describe;

describeIntegration('Tenant Integration Tests', () => {
  let tenantPrismaService: TenantPrismaService;
  let platformPrismaService: PlatformPrismaService;
  let tenantMiddleware: TenantMiddleware;
  let module: TestingModule;

  const testTenantId = 'tnt_integration_test_001';

  beforeAll(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string | number> = {
          DATABASE_URL: process.env['TEST_DATABASE_URL'] ?? '',
          TENANT_DB_HOST: 'localhost',
          TENANT_DB_PORT: 5432,
          TENANT_DB_USER: 'postgres',
          TENANT_DB_PASSWORD: 'postgres',
          TENANT_DB_POOL_MAX: 5,
          TENANT_DB_IDLE_TIMEOUT_MS: 30000,
          TENANT_DB_ACQUIRE_TIMEOUT_MS: 5000,
        };
        return config[key];
      }),
    };

    module = await Test.createTestingModule({
      providers: [
        TenantPrismaService,
        PlatformPrismaService,
        TenantMiddleware,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    tenantPrismaService = module.get<TenantPrismaService>(TenantPrismaService);
    platformPrismaService = module.get<PlatformPrismaService>(PlatformPrismaService);
    tenantMiddleware = module.get<TenantMiddleware>(TenantMiddleware);

    await platformPrismaService.onModuleInit();

    // Create test tenant in registry
    await platformPrismaService.tenantRegistry.upsert({
      where: { id: testTenantId },
      update: {},
      create: {
        id: testTenantId,
        name: 'Integration Test Tenant',
        dbUrl: `postgresql://postgres:postgres@localhost:5432/tenant_integration_test_001`,
        status: TenantStatus.ACTIVE,
      },
    });
  });

  afterAll(async () => {
    // Cleanup: Remove test tenant
    await platformPrismaService.tenantRegistry.deleteMany({
      where: { id: testTenantId },
    });

    await tenantPrismaService.onModuleDestroy();
    await platformPrismaService.onModuleDestroy();
    await module.close();
  });

  describe('Full Request Flow', () => {
    it('should process request through middleware → service → database', async () => {
      const mockRequest: Partial<Request> = {
        headers: {
          [TENANT_ID_HEADER]: testTenantId,
        },
        path: '/api/test',
      };
      const mockResponse: Partial<Response> = {};
      const mockNext = jest.fn();

      // Test middleware extracts tenant ID
      await tenantMiddleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.tenantId).toBe(testTenantId);
      expect(mockNext).toHaveBeenCalled();

      // Test service can get client for tenant
      const client = await tenantPrismaService.getClient(testTenantId);
      expect(client).toBeDefined();
    });
  });

  describe('Tenant Isolation', () => {
    const tenantAId = 'tnt_isolation_test_a';
    const tenantBId = 'tnt_isolation_test_b';

    beforeAll(async () => {
      // Create two test tenants
      await platformPrismaService.tenantRegistry.createMany({
        data: [
          {
            id: tenantAId,
            name: 'Isolation Test Tenant A',
            dbUrl: `postgresql://postgres:postgres@localhost:5432/tenant_isolation_a`,
            status: TenantStatus.ACTIVE,
          },
          {
            id: tenantBId,
            name: 'Isolation Test Tenant B',
            dbUrl: `postgresql://postgres:postgres@localhost:5432/tenant_isolation_b`,
            status: TenantStatus.ACTIVE,
          },
        ],
        skipDuplicates: true,
      });
    });

    afterAll(async () => {
      await platformPrismaService.tenantRegistry.deleteMany({
        where: { id: { in: [tenantAId, tenantBId] } },
      });

      await tenantPrismaService.disconnectTenant(tenantAId);
      await tenantPrismaService.disconnectTenant(tenantBId);
    });

    it('should create separate clients for different tenants', async () => {
      const clientA = await tenantPrismaService.getClient(tenantAId);
      const clientB = await tenantPrismaService.getClient(tenantBId);

      expect(clientA).not.toBe(clientB);
    });

    it('should maintain connection pool per tenant', async () => {
      await tenantPrismaService.getClient(tenantAId);
      await tenantPrismaService.getClient(tenantBId);

      expect(tenantPrismaService.hasConnection(tenantAId)).toBe(true);
      expect(tenantPrismaService.hasConnection(tenantBId)).toBe(true);
      expect(tenantPrismaService.getActiveConnectionCount()).toBe(2);
    });
  });
});

// Export test utilities for other integration tests
export const testUtils = {
  createTestTenant: async (
    platformPrisma: PlatformPrismaService,
    tenantId: string,
    dbUrl: string
  ) => {
    return platformPrisma.tenantRegistry.create({
      data: {
        id: tenantId,
        name: `Test Tenant ${tenantId}`,
        dbUrl,
        status: TenantStatus.ACTIVE,
      },
    });
  },

  deleteTestTenant: async (
    platformPrisma: PlatformPrismaService,
    tenantId: string
  ) => {
    return platformPrisma.tenantRegistry.delete({
      where: { id: tenantId },
    });
  },
};
