import { Test, TestingModule } from '@nestjs/testing';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';
import { FileUploadService } from '../file-upload/file-upload.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';

describe('RegistrationController', () => {
  let controller: RegistrationController;
  let registrationService: jest.Mocked<RegistrationService>;
  let fileUploadService: jest.Mocked<FileUploadService>;

  const mockRegistrationResult = {
    tenantId: 'tnt_test123',
    userId: 'usr_test456',
    email: 'test@example.com',
    companyName: 'Test Company',
  };

  beforeEach(async () => {
    const mockRegistrationService = {
      registerTenant: jest.fn(),
      updateTenantIcon: jest.fn(),
    };

    const mockFileUploadService = {
      validateFile: jest.fn(),
      saveFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RegistrationController],
      providers: [
        { provide: RegistrationService, useValue: mockRegistrationService },
        { provide: FileUploadService, useValue: mockFileUploadService },
      ],
    }).compile();

    controller = module.get<RegistrationController>(RegistrationController);
    registrationService = module.get(RegistrationService);
    fileUploadService = module.get(FileUploadService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    const validDto: RegisterTenantDto = {
      email: 'test@example.com',
      companyName: 'Test Company',
      industry: 'Technology',
    };

    it('should register a new tenant without icon', async () => {
      registrationService.registerTenant.mockResolvedValue(mockRegistrationResult);

      const result = await controller.register(validDto);

      expect(registrationService.registerTenant).toHaveBeenCalledWith(validDto);
      expect(result.status).toBe('success');
      expect(result.tenantId).toBe(mockRegistrationResult.tenantId);
      expect(result.userId).toBe(mockRegistrationResult.userId);
    });

    it('should include correlation ID in response when provided', async () => {
      registrationService.registerTenant.mockResolvedValue(mockRegistrationResult);
      const correlationId = 'corr_test789';

      const result = await controller.register(validDto, correlationId);

      expect(result.correlationId).toBe(correlationId);
    });

    it('should not include correlation ID when not provided', async () => {
      registrationService.registerTenant.mockResolvedValue(mockRegistrationResult);

      const result = await controller.register(validDto);

      expect(result.correlationId).toBeUndefined();
    });

    it('should handle file upload when icon is provided', async () => {
      const mockFile = {
        fieldname: 'icon',
        originalname: 'test.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: 1024,
        buffer: Buffer.from('test'),
      };

      const mockUploadResult = {
        filename: 'tnt_test123_abc.png',
        originalName: 'test.png',
        mimeType: 'image/png',
        size: 1024,
        url: '/uploads/icons/tnt_test123_abc.png',
      };

      registrationService.registerTenant.mockResolvedValue(mockRegistrationResult);
      fileUploadService.saveFile.mockResolvedValue(mockUploadResult);
      registrationService.updateTenantIcon.mockResolvedValue();

      const result = await controller.register(validDto, undefined, mockFile);

      expect(fileUploadService.validateFile).toHaveBeenCalledWith(mockFile);
      expect(fileUploadService.saveFile).toHaveBeenCalledWith(
        mockFile,
        mockRegistrationResult.tenantId,
        false
      );
      expect(registrationService.updateTenantIcon).toHaveBeenCalledWith(
        mockRegistrationResult.tenantId,
        mockUploadResult.url
      );
      expect(result.iconUrl).toBe(mockUploadResult.url);
    });
  });
});
