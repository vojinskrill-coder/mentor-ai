import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { WebCrawlerService } from './web-crawler.service';
import { BusinessProfileService } from './business-profile.service';
import { SoulGeneratorService } from './soul-generator.service';
import { OpenClawTenantService } from './openclaw-tenant.service';
import { OpenClawTenantController } from './openclaw-tenant.controller';

@Module({
  imports: [TenantModule, AiGatewayModule],
  controllers: [OpenClawTenantController],
  providers: [
    WebCrawlerService,
    BusinessProfileService,
    SoulGeneratorService,
    OpenClawTenantService,
  ],
  exports: [
    WebCrawlerService,
    BusinessProfileService,
    SoulGeneratorService,
    OpenClawTenantService,
  ],
})
export class OpenClawTenantModule {}
