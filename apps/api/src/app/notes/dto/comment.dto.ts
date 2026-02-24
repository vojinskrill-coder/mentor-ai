import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * DTO for creating a comment on a task or workflow step.
 */
export class CreateCommentDto {
  @IsString()
  @IsNotEmpty({ message: 'Comment content must not be empty' })
  @MaxLength(5000, { message: 'Comment content must be at most 5000 characters' })
  content!: string;
}

/**
 * DTO for updating a comment's content.
 */
export class UpdateCommentDto {
  @IsString()
  @IsNotEmpty({ message: 'Comment content must not be empty' })
  @MaxLength(5000, { message: 'Comment content must be at most 5000 characters' })
  content!: string;
}
