import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { NocoDbService } from './nocodb.service';
import { ApolloLeadService } from '../apollo/apollo-lead.service';
import { McpController } from './nocodb.controller';

@Module({
  imports: [ConfigModule, TenantModule],
  controllers: [McpController],
  providers: [NocoDbService, ApolloLeadService],
  exports: [NocoDbService, ApolloLeadService],
})
export class NocoDbModule {}
