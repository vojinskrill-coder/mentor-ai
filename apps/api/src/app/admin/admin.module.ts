import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AuthModule } from '../auth/auth.module';
import { DataIntegrityController } from './data-integrity.controller';
import { DataIntegrityService } from './data-integrity.service';
import { BrainConfigController } from './brain-config.controller';

@Module({
  imports: [TenantModule, AuthModule],
  controllers: [DataIntegrityController, BrainConfigController],
  providers: [DataIntegrityService],
})
export class AdminModule {}
