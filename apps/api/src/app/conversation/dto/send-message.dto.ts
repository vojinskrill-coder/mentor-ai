import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * DTO for sending a message in a conversation.
 */
export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32000) // Reasonable limit for message content
  content!: string;
}
