import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { TenantStatus, UserRole } from '@mentor-ai/shared/prisma';

describe('RegistrationService', () => {
  let service: RegistrationService;
  let mockPrisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    tenant: {
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      tenant: {
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RegistrationService>(RegistrationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkEmailExists', () => {
    it('should return true when email exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'usr_test',
        email: 'test@example.com',
        name: null,
        role: UserRole.MEMBER,
        tenantId: 'tnt_test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.checkEmailExists('test@example.com');

      expect(result).toBe(true);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should return false when email does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.checkEmailExists('new@example.com');

      expect(result).toBe(false);
    });

    it('should normalize email to lowercase', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await service.checkEmailExists('TEST@EXAMPLE.COM');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });
  });

  describe('registerTenant', () => {
    const validDto = {
      email: 'test@example.com',
      companyName: 'Test Company',
      industry: 'Technology' as const,
      description: 'A test company',
    };

    it('should throw ConflictException when email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'usr_existing',
        email: 'test@example.com',
        name: null,
        role: UserRole.MEMBER,
        tenantId: 'tnt_test',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.registerTenant(validDto)).rejects.toThrow(
        ConflictException
      );
    });

    it('should create tenant and user in transaction', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => Promise<void>) => {
        return callback(mockPrisma);
      });

      const result = await service.registerTenant(validDto);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result.email).toBe('test@example.com');
      expect(result.companyName).toBe('Test Company');
      expect(result.tenantId).toMatch(/^tnt_/);
      expect(result.userId).toMatch(/^usr_/);
    });

    it('should create tenant with DRAFT status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => Promise<void>) => {
        return callback(mockPrisma);
      });

      await service.registerTenant(validDto);

      expect(mockPrisma.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TenantStatus.DRAFT,
            industry: 'Technology',
          }),
        })
      );
    });

    it('should create user with TENANT_OWNER role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => Promise<void>) => {
        return callback(mockPrisma);
      });

      await service.registerTenant(validDto);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: UserRole.TENANT_OWNER,
          }),
        })
      );
    });
  });

  describe('updateTenantIcon', () => {
    it('should update tenant with icon URL', async () => {
      const tenantId = 'tnt_test123';
      const iconUrl = '/uploads/icons/test.png';

      await service.updateTenantIcon(tenantId, iconUrl);

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: tenantId },
        data: { iconUrl },
      });
    });
  });
});
