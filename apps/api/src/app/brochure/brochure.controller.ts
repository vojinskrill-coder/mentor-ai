import { Controller, Post, Body, UseGuards, Get, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { BrochureRendererService } from './brochure-renderer.service';

@Controller('v1/brochure')
@UseGuards(JwtAuthGuard)
export class BrochureController {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly renderer: BrochureRendererService,
  ) {}

  /** Generate HTML preview from brand profile + page specs */
  @Post('preview')
  async generatePreview(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { brandProfileId: string; pages: any[] },
  ) {
    const html = await this.renderer.renderHtml(body.pages, body.brandProfileId);
    return { data: { html } };
  }

  /** List brochure projects for tenant */
  @Get('projects')
  async listProjects(@CurrentUser() user: CurrentUserPayload) {
    const projects = await this.prisma.brochureProject.findMany({
      where: { tenantId: user.tenantId },
      include: { pages: { include: { components: true }, orderBy: { pageNumber: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return { data: projects };
  }

  /** Get single brochure project with all pages and components */
  @Get('projects/:id')
  async getProject(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const project = await this.prisma.brochureProject.findUnique({
      where: { id },
      include: {
        pages: {
          include: { components: { orderBy: { slotName: 'asc' } } },
          orderBy: { pageNumber: 'asc' },
        },
        brandProfile: true,
      },
    });
    if (!project || project.tenantId !== user.tenantId) {
      return { data: null };
    }
    return { data: project };
  }
}
