import { IsEmail, IsEnum } from 'class-validator';
import { Department } from '@mentor-ai/shared/prisma';

export class CreateInvitationDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @IsEnum(Department, { message: 'Department must be one of: FINANCE, MARKETING, TECHNOLOGY, OPERATIONS, LEGAL, CREATIVE' })
  department!: Department;
}
