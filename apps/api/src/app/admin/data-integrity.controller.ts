import { Controller, Get, UseGuards } from '@nestjs/common';
import { DataIntegrityService, DataIntegrityReport } from './data-integrity.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DataIntegrityController {
  constructor(private readonly integrityService: DataIntegrityService) {}

  @Get('data-integrity')
  @Roles('PLATFORM_OWNER')
  async checkIntegrity(): Promise<DataIntegrityReport> {
    return this.integrityService.runFullCheck();
  }
}
