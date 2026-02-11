import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantPrismaService } from './tenant-prisma.service';
import { PlatformPrismaService } from './platform-prisma.service';
import { TenantMiddleware } from './tenant.middleware';

@Module({
  imports: [ConfigModule],
  providers: [TenantPrismaService, PlatformPrismaService, TenantMiddleware],
  exports: [TenantPrismaService, PlatformPrismaService],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
