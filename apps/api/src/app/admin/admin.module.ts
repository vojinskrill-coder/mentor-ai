import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { DataIntegrityController } from './data-integrity.controller';
import { DataIntegrityService } from './data-integrity.service';

@Module({
  imports: [TenantModule],
  controllers: [DataIntegrityController],
  providers: [DataIntegrityService],
})
export class AdminModule {}
