import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { ToolkitModule } from '../toolkit/toolkit.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [ConfigModule, TenantModule, ToolkitModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
