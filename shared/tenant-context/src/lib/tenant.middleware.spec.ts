import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantMiddleware, TENANT_ID_HEADER } from './tenant.middleware';
import { PlatformPrismaService } from './platform-prisma.service';
import { TenantStatus } from '@prisma/client';

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;
  let platformPrismaService: jest.Mocked<PlatformPrismaService>;

  const mockPlatformPrismaService = {
    tenantRegistry: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantMiddleware,
        { provide: PlatformPrismaService, useValue: mockPlatformPrismaService },
      ],
    }).compile();

    middleware = module.get<TenantMiddleware>(TenantMiddleware);
    platformPrismaService = module.get(PlatformPrismaService);
  });

  const createMockRequest = (headers: Record<string, string> = {}, path = '/api/test'): Partial<Request> => ({
    headers,
    path,
  });

  const createMockResponse = (): Partial<Response> => ({});

  const createMockNext = (): jest.Mock => jest.fn();

  describe('use', () => {
    it('should skip validation for excluded paths', async () => {
      const req = createMockRequest({}, '/health');
      const res = createMockResponse();
      const next = createMockNext();

      await middleware.use(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(platformPrismaService.tenantRegistry.findUnique).not.toHaveBeenCalled();
    });

    it('should skip validation for /api/health path', async () => {
      const req = createMockRequest({}, '/api/health');
      const res = createMockResponse();
      const next = createMockNext();

      await middleware.use(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when X-Tenant-Id header is missing', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();
      const next = createMockNext();

      await expect(middleware.use(req as Request, res as Response, next)).rejects.toThrow(ForbiddenException);
      expect(next).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when tenant ID format is invalid', async () => {
      const req = createMockRequest({ [TENANT_ID_HEADER]: 'invalid_format' });
      const res = createMockResponse();
      const next = createMockNext();

      await expect(middleware.use(req as Request, res as Response, next)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when tenant is not found', async () => {
      mockPlatformPrismaService.tenantRegistry.findUnique.mockResolvedValue(null);

      const req = createMockRequest({ [TENANT_ID_HEADER]: 'tnt_notfound123' });
      const res = createMockResponse();
      const next = createMockNext();

      await expect(middleware.use(req as Request, res as Response, next)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when tenant is SUSPENDED', async () => {
      mockPlatformPrismaService.tenantRegistry.findUnique.mockResolvedValue({
        id: 'tnt_suspended123',
        name: 'Suspended Tenant',
        dbUrl: 'postgresql://...',
        status: TenantStatus.SUSPENDED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = createMockRequest({ [TENANT_ID_HEADER]: 'tnt_suspended123' });
      const res = createMockResponse();
      const next = createMockNext();

      await expect(middleware.use(req as Request, res as Response, next)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when tenant is PENDING', async () => {
      mockPlatformPrismaService.tenantRegistry.findUnique.mockResolvedValue({
        id: 'tnt_pending123',
        name: 'Pending Tenant',
        dbUrl: 'postgresql://...',
        status: TenantStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = createMockRequest({ [TENANT_ID_HEADER]: 'tnt_pending123' });
      const res = createMockResponse();
      const next = createMockNext();

      try {
        await middleware.use(req as Request, res as Response, next);
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const response = (error as ForbiddenException).getResponse() as Record<string, unknown>;
        expect(response['detail']).toContain('pending');
      }
    });

    it('should throw ForbiddenException when tenant is DELETED', async () => {
      mockPlatformPrismaService.tenantRegistry.findUnique.mockResolvedValue({
        id: 'tnt_deleted123',
        name: 'Deleted Tenant',
        dbUrl: 'postgresql://...',
        status: TenantStatus.DELETED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = createMockRequest({ [TENANT_ID_HEADER]: 'tnt_deleted123' });
      const res = createMockResponse();
      const next = createMockNext();

      try {
        await middleware.use(req as Request, res as Response, next);
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const response = (error as ForbiddenException).getResponse() as Record<string, unknown>;
        expect(response['detail']).toContain('deleted');
      }
    });

    it('should attach tenantId to request and call next for valid tenant', async () => {
      const tenantId = 'tnt_valid123';
      mockPlatformPrismaService.tenantRegistry.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Valid Tenant',
        dbUrl: 'postgresql://...',
        status: TenantStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = createMockRequest({ [TENANT_ID_HEADER]: tenantId });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware.use(req as Request, res as Response, next);

      expect(req.tenantId).toBe(tenantId);
      expect(next).toHaveBeenCalled();
    });

    it('should include correlationId in error response when provided', async () => {
      const correlationId = 'corr_test123';
      const req = createMockRequest({ 'x-correlation-id': correlationId });
      const res = createMockResponse();
      const next = createMockNext();

      try {
        await middleware.use(req as Request, res as Response, next);
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const response = (error as ForbiddenException).getResponse() as Record<string, unknown>;
        expect(response['correlationId']).toBe(correlationId);
      }
    });
  });

  describe('RFC 7807 Error Format', () => {
    it('should return RFC 7807 compliant error for missing tenant', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();
      const next = createMockNext();

      try {
        await middleware.use(req as Request, res as Response, next);
      } catch (error) {
        const response = (error as ForbiddenException).getResponse() as Record<string, unknown>;
        expect(response).toMatchObject({
          type: 'tenant_id_missing',
          title: 'Tenant ID Required',
          status: 403,
          detail: expect.any(String),
        });
      }
    });

    it('should return RFC 7807 compliant error for invalid format', async () => {
      const req = createMockRequest({ [TENANT_ID_HEADER]: 'bad_format' });
      const res = createMockResponse();
      const next = createMockNext();

      try {
        await middleware.use(req as Request, res as Response, next);
      } catch (error) {
        const response = (error as ForbiddenException).getResponse() as Record<string, unknown>;
        expect(response).toMatchObject({
          type: 'invalid_tenant_id_format',
          title: 'Invalid Tenant ID Format',
          status: 403,
        });
      }
    });
  });
});
