import { Module, Global } from '@nestjs/common';
import { PlatformConfigService } from './platform-config.service';

/**
 * Global module for centralized platform configuration.
 * Loads openclaw-config/platform-config.yaml, merges env var overrides,
 * and exposes typed accessors via PlatformConfigService.
 */
@Global()
@Module({
  providers: [PlatformConfigService],
  exports: [PlatformConfigService],
})
export class PlatformConfigModule {}
