import { IsString, IsNotEmpty } from 'class-validator';

export class DesignateBackupOwnerDto {
  @IsString({ message: 'backupOwnerId must be a string' })
  @IsNotEmpty({ message: 'backupOwnerId is required' })
  backupOwnerId!: string;
}
