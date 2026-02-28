import { Controller, Get, Patch, Body, UseGuards, Logger } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';

export class UpdateBrainConfigDto {
  @IsBoolean()
  @IsOptional()
  autoAiPopuni?: boolean;
}

@Controller('admin/brain-config')
@UseGuards(JwtAuthGuard)
export class BrainConfigController {
  private readonly logger = new Logger(BrainConfigController.name);

  constructor(private readonly prisma: PlatformPrismaService) {}

  @Get()
  async getBrainConfig(
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{ data: { autoAiPopuni: boolean } }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { autoAiPopuni: true },
    });

    return { data: { autoAiPopuni: tenant?.autoAiPopuni ?? false } };
  }

  @Patch()
  async updateBrainConfig(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateBrainConfigDto
  ): Promise<{ data: { autoAiPopuni: boolean } }> {
    this.logger.log({
      message: 'Updating brain config',
      tenantId: user.tenantId,
      userId: user.userId,
      autoAiPopuni: dto.autoAiPopuni,
    });

    const updated = await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        ...(typeof dto.autoAiPopuni === 'boolean' && { autoAiPopuni: dto.autoAiPopuni }),
      },
      select: { autoAiPopuni: true },
    });

    return { data: { autoAiPopuni: updated.autoAiPopuni } };
  }
}
