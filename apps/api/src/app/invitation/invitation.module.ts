import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailModule } from '@mentor-ai/shared/email';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';

@Module({
  imports: [ConfigModule, EmailModule, TenantModule], // TenantModule provides PlatformPrismaService
  controllers: [InvitationController],
  providers: [InvitationService],
  exports: [InvitationService],
})
export class InvitationModule {}
