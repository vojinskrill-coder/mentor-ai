import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { FigmaController } from './figma.controller';
import { FigmaService } from './figma.service';

@Module({
  imports: [ConfigModule, TenantModule],
  controllers: [FigmaController],
  providers: [FigmaService],
  exports: [FigmaService],
})
export class FigmaModule {}
