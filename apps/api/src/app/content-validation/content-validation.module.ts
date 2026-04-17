import { Global, Module } from '@nestjs/common';
import { ContentValidationService } from './content-validation.service';

@Global()
@Module({
  providers: [ContentValidationService],
  exports: [ContentValidationService],
})
export class ContentValidationModule {}
