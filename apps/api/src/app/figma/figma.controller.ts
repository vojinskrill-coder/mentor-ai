import {
  Controller, Get, Post, Body, Query, UseGuards, BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { FigmaService } from './figma.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

@Controller('v1/figma')
@UseGuards(JwtAuthGuard)
export class FigmaController {
  constructor(
    private readonly figmaService: FigmaService,
    private readonly prisma: PlatformPrismaService,
  ) {}

  /** Start Figma OAuth flow — returns auth URL for frontend to redirect to */
  @Get('auth')
  async startAuth(
    @CurrentUser() user: CurrentUserPayload,
    @Query('redirectUri') redirectUri: string,
  ) {
    if (!redirectUri) {
      throw new BadRequestException({ type: 'missing_redirect', title: 'Missing redirectUri', status: 400 });
    }
    // Validate redirect URI is our own domain
    const allowed = ['http://localhost:4200', 'https://mentor-ai-app-production.up.railway.app'];
    let origin: string;
    try { origin = new URL(redirectUri).origin; } catch {
      throw new BadRequestException({ type: 'invalid_redirect', title: 'Invalid redirect URI format', status: 400 });
    }
    if (!allowed.includes(origin)) {
      throw new BadRequestException({ type: 'invalid_redirect', title: 'Redirect URI not allowed', status: 400 });
    }

    const state = Buffer.from(JSON.stringify({ tenantId: user.tenantId, ts: Date.now() })).toString('base64');
    const authUrl = this.figmaService.getAuthUrl(redirectUri, state);
    return { data: { authUrl } };
  }

  /** Figma OAuth callback — frontend sends code + redirectUri in body */
  @Post('callback')
  async handleCallback(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { code: string; redirectUri: string; state?: string },
  ) {
    if (!body.code) throw new BadRequestException({ type: 'missing_code', title: 'Missing auth code', status: 400 });

    const tokens = await this.figmaService.exchangeCode(body.code, body.redirectUri);
    await this.figmaService.saveConnection(user.tenantId, tokens);
    return { data: { connected: true } };
  }

  /** Check Figma connection status */
  @Get('status')
  async getStatus(@CurrentUser() user: CurrentUserPayload) {
    const token = await this.figmaService.getAnyToken(user.tenantId);
    const conn = await this.prisma.figmaConnection.findUnique({
      where: { tenantId: user.tenantId },
      select: { figmaEmail: true, figmaUserId: true, expiresAt: true },
    });
    return { data: { connected: !!token, email: conn?.figmaEmail ?? (token ? 'Personal Token' : null), method: token?.startsWith('figd_') ? 'personal_token' : conn ? 'oauth' : 'none' } };
  }

  /** Extract design profile from a Figma file */
  @Post('extract')
  async extractDesignProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Query('fileKey') fileKey: string,
  ) {
    if (!fileKey) throw new BadRequestException({ type: 'missing_file_key', title: 'Missing Figma file key', status: 400 });

    const accessToken = await this.figmaService.getAnyToken(user.tenantId);
    if (!accessToken) throw new BadRequestException({ type: 'not_connected', title: 'Figma not connected. Set FIGMA_PERSONAL_TOKEN or connect via OAuth.', status: 400 });

    // Read the file
    const fileData = await this.figmaService.readFile(accessToken, fileKey);
    const fileName = fileData.name ?? fileKey;

    // Extract tokens
    const tokens = this.figmaService.extractDesignTokens(fileData);

    // Save profile
    const profileId = await this.figmaService.saveDesignProfile(user.tenantId, fileKey, fileName, tokens);

    return {
      data: {
        profileId,
        fileName,
        summary: {
          colors: Object.keys(tokens.colors).length,
          typography: tokens.typography.length,
          spacing: tokens.spacing.length,
          pages: tokens.layoutPatterns.length,
          components: tokens.layoutPatterns.reduce((sum, p) => sum + p.components.length, 0),
        },
        tokens,
      },
    };
  }

  /** List saved design profiles */
  @Get('profiles')
  async listProfiles(@CurrentUser() user: CurrentUserPayload) {
    const profiles = await this.prisma.brandDesignProfile.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: profiles };
  }
}
