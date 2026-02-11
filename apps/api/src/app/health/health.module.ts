import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaHealthIndicator } from './indicators/prisma.health';
import { MemoryHealthIndicator } from './indicators/memory.health';

@Module({
  imports: [TerminusModule, TenantModule], // TenantModule provides PlatformPrismaService
  controllers: [HealthController],
  providers: [HealthService, PrismaHealthIndicator, MemoryHealthIndicator],
})
export class HealthModule {}
