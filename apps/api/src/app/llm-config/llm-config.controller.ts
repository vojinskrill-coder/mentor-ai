import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { LlmConfigService } from './llm-config.service';
import { UpdateLlmConfigDto } from './dto/update-llm-config.dto';
import { ValidateProviderDto } from './dto/validate-provider.dto';

/**
 * Controller for platform-level LLM provider configuration.
 * All endpoints require PLATFORM_OWNER role (via JWT claims).
 */
@Controller('admin/llm-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LlmConfigController {
  constructor(private readonly llmConfigService: LlmConfigService) {}

  /**
   * Get current LLM provider configuration.
   * API keys are masked in the response.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @Roles('PLATFORM_OWNER')
  async getConfig() {
    const config = await this.llmConfigService.getConfig();
    return { data: config };
  }

  /**
   * Update LLM provider configuration.
   * API keys are encrypted before storage.
   * Changes are logged to audit trail.
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  @Roles('PLATFORM_OWNER')
  async updateConfig(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateLlmConfigDto
  ) {
    const config = await this.llmConfigService.updateConfig(
      user.userId,
      dto.primaryProvider,
      dto.fallbackProvider
    );

    return {
      data: config,
      message: 'LLM configuration updated successfully',
    };
  }

  /**
   * Validate provider credentials before saving.
   * For cloud providers, validates API key.
   * For local providers, checks endpoint health.
   */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @Roles('PLATFORM_OWNER')
  async validateProvider(@Body() dto: ValidateProviderDto) {
    const result = await this.llmConfigService.validateProvider(
      dto.type,
      dto.apiKey,
      dto.endpoint
    );

    return { data: result };
  }
}
