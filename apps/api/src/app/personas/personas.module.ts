import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PersonasService } from './personas.service';
import { PersonasController } from './personas.controller';

/**
 * Module for department persona management.
 * Provides persona definitions and API endpoints for persona selection.
 */
@Module({
  imports: [AuthModule], // Provides AuthService for MfaRequiredGuard
  controllers: [PersonasController],
  providers: [PersonasService],
  exports: [PersonasService],
})
export class PersonasModule {}
