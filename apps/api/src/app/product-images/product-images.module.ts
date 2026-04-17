import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { OpenClawTenantModule } from '../openclaw-tenant/openclaw-tenant.module';
import { ProductImagesController } from './product-images.controller';
import { ProductImagesService } from './product-images.service';

@Module({
  imports: [TenantModule, OpenClawTenantModule],
  controllers: [ProductImagesController],
  providers: [ProductImagesService],
  exports: [ProductImagesService],
})
export class ProductImagesModule {}
