import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { existsSync } from 'fs';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { RegistrationModule } from './registration/registration.module';
import { AuthModule } from './auth/auth.module';
import { InvitationModule } from './invitation/invitation.module';
import { TeamModule } from './team/team.module';
import { DataExportModule } from './data-export/data-export.module';
import { TenantDeletionModule } from './tenant-deletion/tenant-deletion.module';
import { LlmConfigModule } from './llm-config/llm-config.module';
import { AiGatewayModule } from './ai-gateway/ai-gateway.module';
import { ConversationModule } from './conversation/conversation.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PersonasModule } from './personas/personas.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { MemoryModule } from './memory/memory.module';
import { QdrantModule } from './qdrant/qdrant.module';
import { WebSearchModule } from './web-search/web-search.module';
import { AdminModule } from './admin/admin.module';

// Serve Angular static files in production (combined deploy)
const staticPath = join(__dirname, '..', '..', 'web', 'browser');
const serveStaticImports = existsSync(staticPath)
  ? [ServeStaticModule.forRoot({
      rootPath: staticPath,
      exclude: ['/api/(.*)', '/ws/(.*)'],
    })]
  : [];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        'apps/api/.env.local',
        'apps/api/.env',
        '.env.local',
        '.env',
      ],
    }),
    ...serveStaticImports,
    QdrantModule,
    TenantModule,
    HealthModule,
    RegistrationModule,
    AuthModule,
    InvitationModule,
    TeamModule,
    // TODO: Enable when Redis is available (BullMQ dependency)
    // DataExportModule,
    // TenantDeletionModule,
    LlmConfigModule,
    AiGatewayModule,
    ConversationModule,
    OnboardingModule,
    PersonasModule,
    KnowledgeModule,
    MemoryModule,
    WebSearchModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
