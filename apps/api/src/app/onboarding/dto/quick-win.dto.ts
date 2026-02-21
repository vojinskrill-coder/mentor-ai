import {
  IsString,
  IsNotEmpty,
  MaxLength,
  MinLength,
  IsOptional,
  IsArray,
  IsIn,
} from 'class-validator';

/**
 * DTO for setting up company details during onboarding step 1.
 */
export class SetupCompanyDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Company name must be at least 2 characters' })
  @MaxLength(100, { message: 'Company name must be 100 characters or less' })
  companyName!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Industry must be at least 2 characters' })
  @MaxLength(100, { message: 'Industry must be 100 characters or less' })
  industry!: string;

  @IsString()
  @IsOptional()
  @MaxLength(3000, { message: 'Description must be 3000 characters or less' })
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'Website URL must be 500 characters or less' })
  websiteUrl?: string;
}

/**
 * DTO for business context during onboarding step 3.
 */
export class BusinessContextDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000, { message: 'Business state must be 1000 characters or less' })
  businessState!: string;

  @IsArray()
  @IsString({ each: true })
  departments!: string[];

  @IsString()
  @IsNotEmpty()
  strategy!: string;
}

/**
 * DTO for executing a quick win task during onboarding.
 */
export class QuickWinDto {
  @IsString()
  @IsNotEmpty()
  taskId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(280, { message: 'Context must be 280 characters or less' })
  userContext!: string;

  @IsString()
  @IsNotEmpty()
  industry!: string;
}

/**
 * DTO for setting the user's department/role during onboarding (Story 3.2).
 */
export class SetDepartmentDto {
  @IsOptional()
  @IsIn(
    [
      'MARKETING',
      'FINANCE',
      'SALES',
      'OPERATIONS',
      'TECHNOLOGY',
      'STRATEGY',
      'LEGAL',
      'CREATIVE',
      null,
    ],
    { message: 'department must be a valid Department enum value or null' }
  )
  department?: string | null;
}

/**
 * DTO for completing onboarding and saving the first note.
 */
export class OnboardingCompleteDto {
  @IsString()
  @IsNotEmpty()
  taskId!: string;

  @IsString()
  @IsNotEmpty()
  generatedOutput!: string;

  @IsString()
  @IsOptional()
  executionMode?: string;
}
