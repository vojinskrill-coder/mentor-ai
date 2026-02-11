import { Controller, Get } from '@nestjs/common';
import { DataIntegrityService, DataIntegrityReport } from './data-integrity.service';

@Controller('v1/admin')
export class DataIntegrityController {
  constructor(private readonly integrityService: DataIntegrityService) {}

  @Get('data-integrity')
  async checkIntegrity(): Promise<DataIntegrityReport> {
    return this.integrityService.runFullCheck();
  }
}
