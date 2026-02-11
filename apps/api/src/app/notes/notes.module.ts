import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AuthModule } from '../auth/auth.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { NotesService } from './notes.service';
import { NotesController } from './notes.controller';

/**
 * Module for managing user notes.
 * Provides note creation, storage, and retrieval for AI-generated content.
 */
@Module({
  imports: [
    TenantModule,      // Provides PlatformPrismaService
    AuthModule,        // For JwtAuthGuard
    AiGatewayModule,   // For AI scoring
  ],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
