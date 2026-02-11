import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsIn,
} from 'class-validator';
import { INDUSTRIES, Industry } from '@mentor-ai/shared/utils';

export class RegisterTenantDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @IsString()
  @MinLength(2, { message: 'Company name must be at least 2 characters' })
  @MaxLength(100, { message: 'Company name cannot exceed 100 characters' })
  companyName!: string;

  @IsString()
  @IsIn(INDUSTRIES, { message: 'Please select a valid industry' })
  industry!: Industry;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Business description cannot exceed 500 characters' })
  description?: string;
}
