import { IsString, IsOptional, IsEnum, IsNotEmpty, IsUrl } from 'class-validator';
import { LlmProviderType } from '@mentor-ai/shared/types';

export class ValidateProviderDto {
  @IsEnum(LlmProviderType, { message: 'Invalid provider type' })
  @IsNotEmpty({ message: 'Provider type is required' })
  type!: LlmProviderType;

  @IsString({ message: 'API key must be a string' })
  @IsOptional()
  apiKey?: string;

  @IsUrl({}, { message: 'Endpoint must be a valid URL' })
  @IsOptional()
  endpoint?: string;
}
