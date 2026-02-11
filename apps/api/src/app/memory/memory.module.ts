import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AuthModule } from '../auth/auth.module';
import { MemoryController } from './memory.controller';
import { MemoryService } from './services/memory.service';
import { MemoryExtractionService } from './services/memory-extraction.service';
import { MemoryEmbeddingService } from './services/memory-embedding.service';
import { MemoryContextBuilderService } from './services/memory-context-builder.service';
import { LlmConfigModule } from '../llm-config/llm-config.module';

/**
 * Module for persistent memory across conversations.
 * Provides services for creating, retrieving, and managing user memories.
 *
 * Story 2.7: Persistent Memory Across Conversations
 */
@Module({
  imports: [
    ConfigModule,
    TenantModule,
    AuthModule, // Provides AuthService for guards
    LlmConfigModule, // For LLM extraction calls
  ],
  controllers: [MemoryController],
  providers: [
    MemoryService,
    MemoryExtractionService,
    MemoryEmbeddingService,
    MemoryContextBuilderService,
  ],
  exports: [
    MemoryService,
    MemoryExtractionService,
    MemoryEmbeddingService,
    MemoryContextBuilderService,
  ],
})
export class MemoryModule {}
