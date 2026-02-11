import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class RequestDeletionDto {
  @IsString({ message: 'Workspace name must be a string' })
  @IsNotEmpty({ message: 'Workspace name is required' })
  @MinLength(1, { message: 'Workspace name cannot be empty' })
  workspaceName!: string;
}
