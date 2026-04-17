import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { OpenClawTenantModule } from '../openclaw-tenant/openclaw-tenant.module';
import { ToolkitGeneratorService } from './toolkit-generator.service';
import { ToolkitDeployService } from './toolkit-deploy.service';

@Module({
  imports: [TenantModule, OpenClawTenantModule],
  providers: [ToolkitGeneratorService, ToolkitDeployService],
  exports: [ToolkitGeneratorService, ToolkitDeployService],
})
export class ToolkitModule {}
