import { IsIn } from 'class-validator';

export class RemoveMemberDto {
  @IsIn(['REASSIGN', 'ARCHIVE'], {
    message: 'Strategy must be one of: REASSIGN, ARCHIVE',
  })
  strategy!: 'REASSIGN' | 'ARCHIVE';
}
