import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import type { Request } from 'express';
import { TeamService } from './team.service';
import { RemoveMemberDto } from './dto/remove-member.dto';
import { DesignateBackupOwnerDto } from './dto/designate-backup-owner.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MfaRequiredGuard } from '../auth/guards/mfa-required.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentUserPayload } from '../auth/strategies/jwt.strategy';

@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get('members')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TENANT_OWNER', 'ADMIN')
  async getMembers(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    const members = await this.teamService.getTeamMembers(user.tenantId);

    return {
      status: 'success' as const,
      data: members,
      ...(correlationId && { correlationId }),
    };
  }

  @Post('members/:id/remove')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TENANT_OWNER')
  @HttpCode(HttpStatus.OK)
  async removeMember(
    @Param('id') memberId: string,
    @Body() dto: RemoveMemberDto,
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    await this.teamService.removeMember(
      memberId,
      user.tenantId,
      user.userId,
      dto.strategy
    );

    return {
      status: 'success' as const,
      data: null,
      message: 'Member removed',
      ...(correlationId && { correlationId }),
    };
  }

  @Get('backup-owner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TENANT_OWNER')
  async getBackupOwner(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    const backupOwner = await this.teamService.getBackupOwner(user.tenantId);

    return {
      status: 'success' as const,
      data: backupOwner,
      ...(correlationId && { correlationId }),
    };
  }

  @Get('backup-owner/eligible')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TENANT_OWNER')
  async getEligibleBackupOwners(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    const eligible = await this.teamService.getEligibleBackupOwners(
      user.tenantId
    );

    return {
      status: 'success' as const,
      data: eligible,
      ...(correlationId && { correlationId }),
    };
  }

  @Post('backup-owner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TENANT_OWNER')
  @HttpCode(HttpStatus.OK)
  async designateBackupOwner(
    @Body() dto: DesignateBackupOwnerDto,
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    const result = await this.teamService.designateBackupOwner(
      user.tenantId,
      dto.backupOwnerId,
      user.userId
    );

    return {
      status: 'success' as const,
      data: result,
      message: 'Backup owner designated',
      ...(correlationId && { correlationId }),
    };
  }

  @Delete('backup-owner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TENANT_OWNER')
  @HttpCode(HttpStatus.OK)
  async removeBackupDesignation(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    await this.teamService.removeBackupDesignation(user.tenantId);

    return {
      status: 'success' as const,
      data: null,
      message: 'Backup owner removed',
      ...(correlationId && { correlationId }),
    };
  }

  @Post('backup-owner/recovery')
  @UseGuards(JwtAuthGuard, MfaRequiredGuard)
  @HttpCode(HttpStatus.OK)
  async initiateRecovery(
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';

    const result = await this.teamService.initiateRecovery(
      user.tenantId,
      user.userId,
      ipAddress
    );

    return {
      status: 'success' as const,
      data: { recoveredUserId: result.recoveredUserId },
      message: result.message,
      ...(correlationId && { correlationId }),
    };
  }

  @Get('backup-owner/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TENANT_OWNER', 'ADMIN')
  async getBackupOwnerStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    const status = await this.teamService.getBackupOwnerStatus(user.tenantId);

    return {
      status: 'success' as const,
      data: status,
      ...(correlationId && { correlationId }),
    };
  }
}
