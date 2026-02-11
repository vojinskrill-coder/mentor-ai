import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QdrantClientService } from './qdrant-client.service';

/**
 * Global module for Qdrant vector database client.
 * Marked @Global so all modules can inject QdrantClientService
 * without explicit imports.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [QdrantClientService],
  exports: [QdrantClientService],
})
export class QdrantModule {}
