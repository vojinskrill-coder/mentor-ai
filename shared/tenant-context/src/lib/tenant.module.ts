import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
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
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'auth/(.*)', method: RequestMethod.ALL },
        { path: 'health/(.*)', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
        { path: 'registration', method: RequestMethod.ALL },
        { path: 'registration/(.*)', method: RequestMethod.ALL }
      )
      .forRoutes('*');
  }
}
