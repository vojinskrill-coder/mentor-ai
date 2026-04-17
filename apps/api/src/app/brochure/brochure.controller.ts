import { Controller, Post, Body, UseGuards, Get, Param, Logger, StreamableFile, Res } from '@nestjs/common';
import type { Response } from 'express';
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

  /** Generate PDF from HTML */
  @Post('pdf')
  async generatePdf(
    @Body() body: { html: string },
    @Res() res: Response,
  ) {
    try {
      const pdfBuffer = await this.renderer.renderPdfBuffer(body.html);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="brochure-${Date.now()}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.end(pdfBuffer);
    } catch (err) {
      this.logger.error(`PDF generation failed: ${err}`);
      res.status(500).json({ error: 'PDF generation failed' });
    }
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

    // Load tenant info for brand context
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: profile?.tenantId ?? '' },
      select: { name: true },
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

    const brandName = tenant?.name || 'the brand';
    const prompt = `You are a luxury brand copywriter creating brochure text for "${body.title}" targeting ${body.targetAudience}.
Brand: ${brandName} — a premium atelier creating monumental sculptures (180-250cm) from steel, bronze, and mixed media. Each piece is hand-crafted, taking weeks of skilled metalwork. The brand embodies artistic excellence, architectural integration, and timeless elegance.

Generate text for EACH slot below. Return ONLY valid JSON array, no markdown:
[{ "pageNumber": N, "slotName": "xxx", "content": "generated text" }, ...]

Slots to fill:
${textSlots.join('\n')}

RULES:
- h1 = bold heading, 3-6 words, impactful and evocative. Use poetic, aspirational language.
- h2 = subheading, 8-15 words, expands on the heading's promise
- subtitle = tagline, 1 elegant sentence that draws the reader in
- body = RICH descriptive paragraphs. Be specific about materials (brushed steel, patinated bronze), craftsmanship processes, the emotional impact of monumental art in living spaces. Use sensory language. FILL the available space — aim for 80-100% of maxChars. Do NOT write generic filler — every sentence must add value.
- caption = short contextual label
- quote = compelling pull-quote with attribution (name + role, e.g. "— Marina Petrović, Interior Architect")
- numberedItem = concise process step with descriptive detail
- RESPECT maxChars — never exceed the limit, but AIM to use at least 80% of it
- Each text must be UNIQUE, contextually relevant to the page title, and specific to this brand
- Write in the language matching the brochure title (Serbian/Croatian if title is in that language, English otherwise)`;

    this.logger.log({ message: 'Generating brochure text', slots: textSlots.length });

    const result = await this.openClaw.executeAgent(prompt, {
      agentId: 'main',
      timeoutSeconds: 3600,
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

    // Generate images using FAL.ai Kontext compositing with REAL sculpture photos
    this.logger.log({ message: 'Generating brochure images' });
    const imageResults: Array<{ pageNumber: number; slotName: string; imageUrl: string }> = [];
    const sculptureFiles = ['Eterna Harmonija Statua.png', 'Nebeski Uzlazak Statua.png', 'Golden Flux Statue.png'];

    for (const page of body.pages) {
      for (const comp of page.components) {
        if (comp.type === 'image' && comp.slotName !== 'logo' && comp.slotName !== 'logo-left' && comp.slotName !== 'logo-right' && comp.slotName !== 'qr-code') {
          // Build rich contextual prompt so Prompt Optimizer understands what image to generate
          const pageCtx = page.pageTitle ? `Page context: "${page.pageTitle}".` : '';
          const slotCtx = `Slot: "${comp.slotName}".`;
          const scaleCtx = 'The sculpture is 180-250cm tall, monumental scale — ensure the human environment reflects this (high ceilings, spacious rooms, architectural context).';
          const baseDesc = comp.imageDescription || 'Luxury sculpture in architectural space';
          const scenePrompt = `${baseDesc}. ${pageCtx} ${slotCtx} ${scaleCtx} Style: professional brochure photography, dramatic lighting, dark moody tones.`;
          // Rotate through sculpture files
          const sculptureFile = sculptureFiles[page.pageNumber % sculptureFiles.length] as string;
          try {
            const imgResult = await this.falImage.generateComposite(sculptureFile, scenePrompt);
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

    // Also render HTML in the same request — avoids a second round-trip
    const renderPages = body.pages.map(page => {
      const rp = resultPages.find(r => r.pageNumber === page.pageNumber);
      return {
        pageNumber: page.pageNumber,
        layoutType: page.layoutType,
        components: page.components.map(comp => {
          const rc = rp?.components.find((c: any) => c.slotName === comp.slotName);
          return {
            slotName: comp.slotName,
            type: comp.type,
            x: comp.x, y: comp.y, w: comp.w, h: comp.h,
            fontRole: comp.fontRole,
            content: rc?.content,
            imageUrl: rc?.imageUrl,
          };
        }),
      };
    });

    let html = '';
    try {
      html = await this.renderer.renderHtml(renderPages as any, body.brandProfileId);
    } catch (e) {
      this.logger.warn(`HTML render failed: ${e}`);
    }

    return { data: { pages: resultPages, html } };
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
