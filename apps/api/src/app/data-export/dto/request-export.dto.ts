import { IsIn, IsArray, ArrayMinSize } from 'class-validator';

const VALID_FORMATS = ['PDF', 'MARKDOWN', 'JSON'] as const;
const VALID_DATA_TYPES = ['all', 'profile', 'invitations'] as const;

export class RequestExportDto {
  @IsIn(VALID_FORMATS, {
    message: `Format must be one of: ${VALID_FORMATS.join(', ')}`,
  })
  format!: 'PDF' | 'MARKDOWN' | 'JSON';

  @IsArray({ message: 'dataTypes must be an array' })
  @ArrayMinSize(1, { message: 'At least one data type must be selected' })
  @IsIn(VALID_DATA_TYPES, {
    each: true,
    message: `Each data type must be one of: ${VALID_DATA_TYPES.join(', ')}`,
  })
  dataTypes!: string[];
}
