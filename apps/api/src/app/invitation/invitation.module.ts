import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailModule } from '@mentor-ai/shared/email';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';

@Module({
  imports: [ConfigModule, EmailModule, TenantModule, KnowledgeModule],
  controllers: [InvitationController],
  providers: [InvitationService],
  exports: [InvitationService],
})
export class InvitationModule {}
