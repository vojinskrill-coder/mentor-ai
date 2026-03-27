import { Controller, Post, Body, Logger, Get, Param } from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { WebCrawlerService } from './web-crawler.service';
import { BusinessProfileService } from './business-profile.service';
import { SoulGeneratorService } from './soul-generator.service';
import { OpenClawTenantService } from './openclaw-tenant.service';

class ProvisionTenantDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  websiteUrl!: string;

  @IsString()
  @IsNotEmpty()
  companyName!: string;
}

@Controller('v1/openclaw-tenant')
export class OpenClawTenantController {
  private readonly logger = new Logger(OpenClawTenantController.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly webCrawler: WebCrawlerService,
    private readonly businessProfile: BusinessProfileService,
    private readonly soulGenerator: SoulGeneratorService,
    private readonly openClawTenant: OpenClawTenantService,
  ) {}

  /**
   * Full provisioning pipeline: crawl website → analyze → generate SOUL.MD → deploy to Hetzner.
   * Called during onboarding after tenant provides website URL.
   */
  @Post('provision')
  async provisionTenant(@Body() dto: ProvisionTenantDto) {
    const startTime = Date.now();
    this.logger.log({ message: 'Starting tenant provisioning', tenantId: dto.tenantId, url: dto.websiteUrl });

    // Step 1: Crawl website
    const crawlResult = await this.webCrawler.crawlWebsite(dto.websiteUrl);
    this.logger.log({ message: 'Crawl complete', pages: crawlResult.pages.length, chars: crawlResult.totalChars });

    // Step 2: Analyze and create business profile
    const profile = await this.businessProfile.analyzeWebsite(crawlResult, dto.companyName);
    this.logger.log({ message: 'Profile created', industry: profile.industry });

    // Step 3: Generate SOUL.MD for each agent
    const souls = await this.soulGenerator.generateAllSouls(profile);
    this.logger.log({ message: 'SOULs generated', agents: Object.keys(souls).length });

    // Step 4: Deploy to Hetzner
    const deployResult = await this.openClawTenant.provisionTenant(dto.tenantId, profile, souls);

    // Step 5: Save profile to tenant metadata in DB
    try {
      await this.prisma.tenant.update({
        where: { id: dto.tenantId },
        data: {
          description: profile.rawSummary.substring(0, 2000),
          industry: profile.industry,
        },
      });
    } catch (err) {
      this.logger.warn({
        message: 'Could not update tenant metadata',
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    const durationMs = Date.now() - startTime;

    return {
      success: deployResult.success,
      tenantId: dto.tenantId,
      profile: {
        companyName: profile.companyName,
        industry: profile.industry,
        description: profile.description,
        products: Array.isArray(profile.products) ? profile.products : [],
        services: Array.isArray(profile.services) ? profile.services : [],
        targetClients: Array.isArray(profile.targetClients) ? profile.targetClients : [],
      },
      crawl: {
        pages: crawlResult.pages.length,
        totalChars: crawlResult.totalChars,
      },
      deploy: {
        profilePath: deployResult.profilePath,
        error: deployResult.error,
      },
      durationMs,
    };
  }

  /**
   * Check if a tenant has been provisioned.
   */
  @Get('status/:tenantId')
  async checkStatus(@Param('tenantId') tenantId: string) {
    const exists = await this.openClawTenant.tenantExists(tenantId);
    return { tenantId, provisioned: exists };
  }
}
