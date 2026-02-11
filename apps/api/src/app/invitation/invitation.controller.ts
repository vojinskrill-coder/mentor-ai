import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentUserPayload } from '../auth/strategies/jwt.strategy';

@Controller('invitations')
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TENANT_OWNER')
  @HttpCode(HttpStatus.CREATED)
  async createInvitation(
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    const result = await this.invitationService.createInvitation(
      dto,
      user.userId,
      user.tenantId
    );

    return {
      status: 'success' as const,
      message: 'Invitation sent successfully',
      data: result,
      ...(correlationId && { correlationId }),
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TENANT_OWNER', 'ADMIN')
  async listInvitations(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    const invitations = await this.invitationService.getInvitationsByTenant(
      user.tenantId
    );

    return {
      status: 'success' as const,
      data: invitations,
      ...(correlationId && { correlationId }),
    };
  }

  @Get('validate/:token')
  async validateToken(
    @Param('token') token: string,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    const invitation = await this.invitationService.validateInviteToken(token);

    return {
      status: 'success' as const,
      data: {
        id: invitation.id,
        email: invitation.email,
        department: invitation.department,
        role: invitation.role,
        tenantName: invitation.tenant.name,
        expiresAt: invitation.expiresAt,
      },
      ...(correlationId && { correlationId }),
    };
  }

  @Post('accept/:token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(
    @Param('token') token: string,
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    const result = await this.invitationService.acceptInvitation(
      token,
      user.userId,
      user.email
    );

    return {
      status: 'success' as const,
      message: 'Invitation accepted. Welcome to the team!',
      data: result,
      ...(correlationId && { correlationId }),
    };
  }

  @Post(':id/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TENANT_OWNER')
  @HttpCode(HttpStatus.OK)
  async revokeInvitation(
    @Param('id') invitationId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    await this.invitationService.revokeInvitation(
      invitationId,
      user.tenantId
    );

    return {
      status: 'success' as const,
      message: 'Invitation revoked',
      ...(correlationId && { correlationId }),
    };
  }
}
