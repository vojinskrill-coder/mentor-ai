import { Module } from '@nestjs/common';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';
import { FileUploadModule } from '../file-upload/file-upload.module';
import { TenantModule } from '@mentor-ai/shared/tenant-context';

@Module({
  imports: [FileUploadModule, TenantModule], // TenantModule provides PlatformPrismaService
  controllers: [RegistrationController],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}
