import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { McpGatewayService } from './mcp-gateway.service';
import { McpGatewayController } from './mcp-gateway.controller';

@Module({
  imports: [TenantModule],
  controllers: [McpGatewayController],
  providers: [McpGatewayService],
  exports: [McpGatewayService],
})
export class McpModule {}
