import { Controller, Post, Body, UseGuards, Get, Param, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { BrochureRendererService } from './brochure-renderer.service';
import { OpenClawClientService } from '../agent-execution/openclaw-client.service';
import { FalImageService } from '../process/fal-image.service';

@Controller('v1/brochure')
@UseGuards(JwtAuthGuard)
export class BrochureController {
  private readonly logger = new Logger(BrochureController.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly renderer: BrochureRendererService,
    private readonly openClaw: OpenClawClientService,
    private readonly falImage: FalImageService,
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

  /** Generate AI content for all brochure slots */
  @Post('generate-content')
  async generateContent(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: {
      brandProfileId: string;
      title: string;
      targetAudience: string;
      logoUrl?: string;
      pages: Array<{
        pageNumber: number;
        pageTitle?: string;
        layoutType: string;
        components: Array<{
          slotName: string;
          type: string;
          x: number; y: number; w: number; h: number;
          fontRole?: string;
          maxChars?: number;
          imageDescription?: string;
        }>;
      }>;
    },
  ) {
    const profile = await this.prisma.brandDesignProfile.findUnique({
      where: { id: body.brandProfileId },
    });

    // Build prompt for OpenClaw to generate ALL text at once
    const textSlots: string[] = [];
    for (const page of body.pages) {
      for (const comp of page.components) {
        if (comp.type === 'text') {
          textSlots.push(
            `Page ${page.pageNumber} "${page.pageTitle ?? ''}" | slot "${comp.slotName}" | role: ${comp.fontRole ?? 'body'} | max: ${comp.maxChars ?? 200} chars`,
          );
        }
      }
    }

    const prompt = `You are writing brochure text for "${body.title}" targeting ${body.targetAudience}.
Brand: Luxury Statues Adria — luxury sculpture company. Brand voice: refined, understated, authoritative, gallery-curator tone.
Write in Serbian language.

Generate text for EACH slot below. Return ONLY valid JSON array, no markdown:
[{ "pageNumber": N, "slotName": "xxx", "content": "generated text" }, ...]

Slots to fill:
${textSlots.join('\n')}

RULES:
- h1 = gold heading, 3-6 words, uppercase feel, evocative
- h2 = white subheading, 8-15 words
- subtitle = tagline, italic feel, 1 sentence
- body = descriptive paragraph, weight 300
- caption = short label
- quote = italic pull-quote with attribution
- RESPECT maxChars — never exceed the limit
- Each text must be UNIQUE and relevant to the page title`;

    this.logger.log({ message: 'Generating brochure text', slots: textSlots.length });

    const result = await this.openClaw.executeAgent(prompt, {
      agentId: 'main',
      timeoutSeconds: 120,
    });

    // Parse AI response
    let generatedTexts: Array<{ pageNumber: number; slotName: string; content: string }> = [];
    if (result.success && result.output) {
      try {
        // Extract JSON from response
        const jsonMatch = result.output.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          generatedTexts = JSON.parse(jsonMatch[0]);
        }
      } catch {
        this.logger.warn('Failed to parse AI text response');
      }
    }

    // Generate images for image slots using FAL.ai
    this.logger.log({ message: 'Generating brochure images' });
    const imageResults: Array<{ pageNumber: number; slotName: string; imageUrl: string }> = [];

    for (const page of body.pages) {
      for (const comp of page.components) {
        if (comp.type === 'image' && comp.slotName !== 'logo' && comp.slotName !== 'logo-left' && comp.slotName !== 'logo-right' && comp.slotName !== 'qr-code') {
          const scenePrompt = comp.imageDescription ?? `Luxury sculpture in ${page.pageTitle ?? 'elegant interior'}`;
          try {
            const imgResult = await this.falImage.generateComposite(
              ['Eterna Harmonija Statua.png', 'Nebeski Uzlazak Statua.png', 'Golden Flux Statue.png'][page.pageNumber % 3] ?? 'Eterna Harmonija Statua.png',
              scenePrompt,
            );
            if (imgResult.success) {
              imageResults.push({ pageNumber: page.pageNumber, slotName: comp.slotName, imageUrl: imgResult.url });
            }
          } catch (err) {
            this.logger.warn(`Image gen failed for ${comp.slotName}: ${err}`);
          }
        }
      }
    }

    // Merge generated content back into pages
    const resultPages = body.pages.map(page => ({
      pageNumber: page.pageNumber,
      components: page.components.map(comp => {
        const genText = generatedTexts.find(t => t.pageNumber === page.pageNumber && t.slotName === comp.slotName);
        const genImage = imageResults.find(i => i.pageNumber === page.pageNumber && i.slotName === comp.slotName);

        // Logo slots get the uploaded logo
        if ((comp.slotName.includes('logo')) && body.logoUrl) {
          return { slotName: comp.slotName, type: comp.type, imageUrl: body.logoUrl };
        }

        return {
          slotName: comp.slotName,
          type: comp.type,
          content: genText?.content ?? undefined,
          imageUrl: genImage?.imageUrl ?? undefined,
        };
      }),
    }));

    return { data: { pages: resultPages } };
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
