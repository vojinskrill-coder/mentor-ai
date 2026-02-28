import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { ExecutionStateService } from './execution-state.service';

@Controller('execution')
@UseGuards(JwtAuthGuard)
export class ExecutionController {
  constructor(private readonly executionStateService: ExecutionStateService) {}

  @Get('active')
  async getActive(@CurrentUser() user: CurrentUserPayload) {
    const active = await this.executionStateService.getActiveExecutions(user.tenantId);
    return { data: active };
  }
}
