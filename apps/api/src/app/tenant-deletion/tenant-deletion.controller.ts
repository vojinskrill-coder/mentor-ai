import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaRequiredGuard } from '../auth/guards/mfa-required.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { TenantDeletionService } from './tenant-deletion.service';
import { RequestDeletionDto } from './dto/request-deletion.dto';
import { DeletionThrottlerGuard } from './guards/deletion-throttler.guard';

/**
 * Controller for tenant deletion operations.
 * All endpoints require TENANT_OWNER role and MFA authentication.
 * POST endpoints are rate-limited to 3 requests per day.
 */
@Controller('tenant/deletion')
@UseGuards(JwtAuthGuard, MfaRequiredGuard, RolesGuard, DeletionThrottlerGuard)
export class TenantDeletionController {
  constructor(private readonly tenantDeletionService: TenantDeletionService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles('TENANT_OWNER')
  async requestDeletion(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RequestDeletionDto
  ) {
    const result = await this.tenantDeletionService.requestDeletion(
      user.userId,
      user.tenantId,
      dto.workspaceName
    );

    return {
      data: result,
      message: 'Workspace deletion initiated. You have 7 days to cancel.',
    };
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('TENANT_OWNER')
  async cancelDeletion(@CurrentUser() user: CurrentUserPayload) {
    const result = await this.tenantDeletionService.cancelDeletion(
      user.userId,
      user.tenantId
    );

    return {
      data: result,
      message: 'Workspace deletion cancelled. Your workspace has been restored.',
    };
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @Roles('TENANT_OWNER')
  async getDeletionStatus(@CurrentUser() user: CurrentUserPayload) {
    const result = await this.tenantDeletionService.getDeletionStatus(user.tenantId);

    return { data: result };
  }
}
