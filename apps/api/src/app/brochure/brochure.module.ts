import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { BrochureRendererService } from './brochure-renderer.service';
import { BrochureController } from './brochure.controller';

@Module({
  imports: [TenantModule],
  controllers: [BrochureController],
  providers: [BrochureRendererService],
  exports: [BrochureRendererService],
})
export class BrochureModule {}
