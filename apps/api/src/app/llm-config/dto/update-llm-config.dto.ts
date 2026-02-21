import { IsString, IsOptional, IsEnum, IsNotEmpty, IsUrl, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LlmProviderType } from '@mentor-ai/shared/types';

class ProviderConfigDto {
  @IsEnum(LlmProviderType, { message: 'Invalid provider type' })
  @IsNotEmpty({ message: 'Provider type is required' })
  type!: LlmProviderType;

  @IsString({ message: 'API key must be a string' })
  @IsOptional()
  apiKey?: string;

  @IsUrl({ require_tld: false }, { message: 'Endpoint must be a valid URL' })
  @IsOptional()
  endpoint?: string;

  @IsString({ message: 'Model ID must be a string' })
  @IsNotEmpty({ message: 'Model ID is required' })
  modelId!: string;
}

export class UpdateLlmConfigDto {
  @ValidateNested()
  @Type(() => ProviderConfigDto)
  @IsNotEmpty({ message: 'Primary provider is required' })
  primaryProvider!: ProviderConfigDto;

  @ValidateNested()
  @Type(() => ProviderConfigDto)
  @IsOptional()
  fallbackProvider?: ProviderConfigDto | null;
}
