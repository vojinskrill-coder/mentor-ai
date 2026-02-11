import { IsString, Length, Matches, IsOptional } from 'class-validator';

export class EnrollMfaDto {
  @IsString()
  @Length(6, 6, { message: 'TOTP code must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'TOTP code must contain only digits' })
  code!: string;

  @IsOptional()
  @IsString()
  secret?: string;
}

export class VerifyRecoveryCodeDto {
  @IsString()
  @Length(10, 10, { message: 'Recovery code must be exactly 10 characters' })
  @Matches(/^[A-Z0-9]{10}$/, { message: 'Invalid recovery code format' })
  recoveryCode!: string;
}
