import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RegistrationService, RegistrationResult } from './registration.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { FileUploadService, UploadedFileType } from '../file-upload/file-upload.service';

export interface RegistrationResponse extends RegistrationResult {
  status: 'success';
  message: string;
  correlationId?: string;
}

@Controller('registration')
export class RegistrationController {
  constructor(
    private readonly registrationService: RegistrationService,
    private readonly fileUploadService: FileUploadService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('icon'))
  async register(
    @Body() dto: RegisterTenantDto,
    @Headers('x-correlation-id') correlationId?: string,
    @UploadedFile() icon?: UploadedFileType
  ): Promise<RegistrationResponse> {
    // Validate file upfront if provided (saveFile also validates, but fail fast)
    if (icon) {
      this.fileUploadService.validateFile(icon);
    }

    const result = await this.registrationService.registerTenant(dto);

    // Save file after tenant is created (we need the tenant ID for filename)
    if (icon) {
      let uploadResult;
      try {
        uploadResult = await this.fileUploadService.saveFile(
          icon,
          result.tenantId,
          false // Skip validation since we already validated above
        );
        // Update tenant with icon URL
        await this.registrationService.updateTenantIcon(
          result.tenantId,
          uploadResult.url
        );
        result.iconUrl = uploadResult.url;
      } catch (error) {
        // Clean up orphaned file if icon update fails
        if (uploadResult?.filename) {
          await this.fileUploadService
            .deleteFile(uploadResult.filename)
            .catch(() => {
              /* Ignore cleanup errors */
            });
        }
        throw error;
      }
    }

    const response: RegistrationResponse = {
      status: 'success',
      message: 'Registration successful. Please complete OAuth authentication.',
      ...result,
    };

    if (correlationId) {
      response.correlationId = correlationId;
    }

    return response;
  }
}
