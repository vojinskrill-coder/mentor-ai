import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { createId } from '@paralleldrive/cuid2';

interface FigmaTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface FigmaUser {
  id: string;
  email: string;
  handle: string;
}

export interface DesignTokens {
  colors: Record<string, { hex: string; usage: string[] }>;
  typography: Array<{
    name: string;
    fontFamily: string;
    fontWeight: number;
    fontSize: number;
    lineHeight: number | null;
    letterSpacing: number;
    role: string; // h1, h2, body, caption — auto-assigned by size
  }>;
  spacing: number[];
  grids: Array<{ pattern: string; count: number; gutterSize: number; offset: number }>;
  effects: Array<{ type: string; color: string; radius: number }>;
  layoutPatterns: Array<{
    pageName: string;
    pageIndex: number;
    width: number;
    height: number;
    components: Array<{
      name: string;
      type: 'text' | 'image' | 'shape' | 'frame';
      x: number; // percentage of page width
      y: number; // percentage of page height
      w: number; // percentage of page width
      h: number; // percentage of page height
      fontSize?: number;
      fontFamily?: string;
      textContent?: string;
      hasImageFill?: boolean;
    }>;
  }>;
}

@Injectable()
export class FigmaService {
  private readonly logger = new Logger(FigmaService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;

  private readonly personalToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PlatformPrismaService,
  ) {
    this.clientId = this.configService.get<string>('FIGMA_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('FIGMA_CLIENT_SECRET', '');
    this.personalToken = this.configService.get<string>('FIGMA_PERSONAL_TOKEN', '');
  }

  /**
   * Get the best available token — personal token or tenant OAuth token
   */
  async getAnyToken(tenantId?: string): Promise<string | null> {
    if (this.personalToken) return this.personalToken;
    if (tenantId) return this.getAccessToken(tenantId);
    return null;
  }

  /**
   * Generate Figma OAuth authorization URL
   */
  getAuthUrl(redirectUri: string, state: string): string {
    const params = [
      `client_id=${encodeURIComponent(this.clientId)}`,
      `redirect_uri=${encodeURIComponent(redirectUri)}`,
      `scope=files:read,file_variables:read,file_variables:write,file_comments:write,file_dev_resources:read,file_dev_resources:write,webhooks:write,library_analytics:read`,
      `state=${encodeURIComponent(state)}`,
      `response_type=code`,
    ].join('&');
    return `https://www.figma.com/oauth?${params}`;
  }

  /**
   * Exchange auth code for access token
   */
  async exchangeCode(code: string, redirectUri: string): Promise<FigmaTokenResponse> {
    const res = await fetch('https://api.figma.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Figma token exchange failed: ${res.status} ${err}`);
    }

    return res.json() as Promise<FigmaTokenResponse>;
  }

  /**
   * Save Figma connection for a tenant
   */
  async saveConnection(tenantId: string, tokens: FigmaTokenResponse): Promise<void> {
    // Get user info
    const userRes = await fetch('https://api.figma.com/v1/me', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });
    const user = userRes.ok ? (await userRes.json()) as FigmaUser : null;

    await this.prisma.figmaConnection.upsert({
      where: { tenantId },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        figmaUserId: user?.id ?? null,
        figmaEmail: user?.email ?? null,
      },
      create: {
        id: `fcon_${createId()}`,
        tenantId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        figmaUserId: user?.id ?? null,
        figmaEmail: user?.email ?? null,
      },
    });

    this.logger.log({ message: 'Figma connected', tenantId, email: user?.email });
  }

  /**
   * Get access token for a tenant (auto-refresh if expired)
   */
  async getAccessToken(tenantId: string): Promise<string | null> {
    const conn = await this.prisma.figmaConnection.findUnique({ where: { tenantId } });
    if (!conn) return null;

    // Check expiry and refresh if needed
    if (conn.expiresAt && conn.expiresAt < new Date() && conn.refreshToken) {
      const refreshed = await this.refreshToken(conn.refreshToken);
      await this.prisma.figmaConnection.update({
        where: { tenantId },
        data: {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token ?? conn.refreshToken,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        },
      });
      return refreshed.access_token;
    }

    return conn.accessToken;
  }

  private async refreshToken(refreshToken: string): Promise<FigmaTokenResponse> {
    const res = await fetch('https://api.figma.com/v1/oauth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) throw new Error('Figma token refresh failed');
    return res.json() as Promise<FigmaTokenResponse>;
  }

  /**
   * Read a Figma file and extract ALL design information
   */
  async readFile(accessToken: string, fileKey: string): Promise<any> {
    // Personal tokens use X-Figma-Token, OAuth tokens use Authorization: Bearer
    const isPersonalToken = accessToken.startsWith('figd_');
    const headers: Record<string, string> = {};
    if (isPersonalToken) {
      headers['X-Figma-Token'] = accessToken;
    } else {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const res = await fetch(`https://api.figma.com/v1/files/${fileKey}`, { headers });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Figma file read failed: ${res.status} ${err}`);
    }
    return res.json();
  }

  /**
   * Extract design tokens and layout patterns from a Figma file
   */
  extractDesignTokens(fileData: any): DesignTokens {
    const tokens: DesignTokens = {
      colors: {},
      typography: [],
      spacing: [],
      grids: [],
      effects: [],
      layoutPatterns: [],
    };

    const typographySet = new Set<string>();
    const spacingSet = new Set<number>();

    // Process each page as a layout pattern
    const pages = fileData.document?.children ?? [];
    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const page = pages[pageIdx];
      if (!page) continue;

      // Find top-level frames (each is a "page" of the brochure)
      const frames = (page.children ?? []).filter((c: any) => c.type === 'FRAME');

      for (const frame of frames) {
        const pageWidth = frame.absoluteBoundingBox?.width ?? 1;
        const pageHeight = frame.absoluteBoundingBox?.height ?? 1;
        const pageX = frame.absoluteBoundingBox?.x ?? 0;
        const pageY = frame.absoluteBoundingBox?.y ?? 0;

        const layoutPattern: DesignTokens['layoutPatterns'][0] = {
          pageName: frame.name,
          pageIndex: pageIdx,
          width: pageWidth,
          height: pageHeight,
          components: [],
        };

        // Walk all children to extract tokens + layout
        this.walkNode(frame, tokens, typographySet, spacingSet, layoutPattern, pageX, pageY, pageWidth, pageHeight);

        if (layoutPattern.components.length > 0) {
          tokens.layoutPatterns.push(layoutPattern);
        }
      }
    }

    // Deduplicate and sort
    tokens.spacing = [...spacingSet].sort((a, b) => a - b);
    tokens.typography = this.deduplicateTypography(tokens.typography);

    // Auto-assign roles to typography by size
    this.assignTypographyRoles(tokens.typography);

    this.logger.log({
      message: 'Design tokens extracted',
      colors: Object.keys(tokens.colors).length,
      typography: tokens.typography.length,
      spacing: tokens.spacing.length,
      pages: tokens.layoutPatterns.length,
    });

    return tokens;
  }

  private walkNode(
    node: any,
    tokens: DesignTokens,
    typographySet: Set<string>,
    spacingSet: Set<number>,
    layoutPattern: DesignTokens['layoutPatterns'][0],
    pageX: number,
    pageY: number,
    pageW: number,
    pageH: number,
  ): void {
    // Extract colors from fills
    if (node.fills) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID' && fill.color && fill.visible !== false) {
          const hex = this.rgbaToHex(fill.color.r, fill.color.g, fill.color.b);
          if (!tokens.colors[hex]) tokens.colors[hex] = { hex, usage: [] };
          if (tokens.colors[hex].usage.length < 5) {
            tokens.colors[hex].usage.push(node.name);
          }
        }
      }
    }

    // Extract typography from text nodes
    if (node.type === 'TEXT' && node.style) {
      const s = node.style;
      const key = `${s.fontFamily}-${s.fontWeight}-${Math.round(s.fontSize)}`;
      if (!typographySet.has(key)) {
        typographySet.add(key);
        tokens.typography.push({
          name: node.name,
          fontFamily: s.fontFamily ?? 'sans-serif',
          fontWeight: s.fontWeight ?? 400,
          fontSize: s.fontSize ?? 16,
          lineHeight: s.lineHeightPx ?? null,
          letterSpacing: s.letterSpacing ?? 0,
          role: '', // assigned later
        });
      }
    }

    // Extract spacing from auto-layout
    if (node.layoutMode) {
      if (node.itemSpacing != null) spacingSet.add(Math.round(node.itemSpacing));
      if (node.paddingTop != null) spacingSet.add(Math.round(node.paddingTop));
      if (node.paddingRight != null) spacingSet.add(Math.round(node.paddingRight));
      if (node.paddingBottom != null) spacingSet.add(Math.round(node.paddingBottom));
      if (node.paddingLeft != null) spacingSet.add(Math.round(node.paddingLeft));
    }

    // Extract layout grids
    if (node.layoutGrids) {
      for (const grid of node.layoutGrids) {
        tokens.grids.push({
          pattern: grid.pattern,
          count: grid.count ?? 0,
          gutterSize: grid.gutterSize ?? 0,
          offset: grid.offset ?? 0,
        });
      }
    }

    // Extract effects
    if (node.effects) {
      for (const effect of node.effects) {
        if (effect.visible !== false) {
          tokens.effects.push({
            type: effect.type,
            color: effect.color ? this.rgbaToHex(effect.color.r, effect.color.g, effect.color.b) : '',
            radius: effect.radius ?? 0,
          });
        }
      }
    }

    // Add to layout pattern (direct children of page frame)
    const box = node.absoluteBoundingBox;
    if (box && node.type !== 'DOCUMENT' && node.type !== 'CANVAS') {
      const relX = ((box.x - pageX) / pageW) * 100;
      const relY = ((box.y - pageY) / pageH) * 100;
      const relW = (box.width / pageW) * 100;
      const relH = (box.height / pageH) * 100;

      // Only add significant elements (>2% of page)
      if (relW > 2 && relH > 2) {
        const comp: any = {
          name: node.name,
          type: node.type === 'TEXT' ? 'text' : node.fills?.some((f: any) => f.type === 'IMAGE') ? 'image' : node.type === 'FRAME' || node.type === 'GROUP' ? 'frame' : 'shape',
          x: Math.round(relX * 10) / 10,
          y: Math.round(relY * 10) / 10,
          w: Math.round(relW * 10) / 10,
          h: Math.round(relH * 10) / 10,
        };

        if (node.type === 'TEXT') {
          comp.fontSize = node.style?.fontSize;
          comp.fontFamily = node.style?.fontFamily;
          comp.textContent = node.characters?.slice(0, 100);
        }
        if (node.fills?.some((f: any) => f.type === 'IMAGE')) {
          comp.hasImageFill = true;
        }

        layoutPattern.components.push(comp);
      }
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        this.walkNode(child, tokens, typographySet, spacingSet, layoutPattern, pageX, pageY, pageW, pageH);
      }
    }
  }

  private deduplicateTypography(typography: DesignTokens['typography']): DesignTokens['typography'] {
    const seen = new Map<string, DesignTokens['typography'][0]>();
    for (const t of typography) {
      const key = `${t.fontFamily}-${t.fontWeight}-${Math.round(t.fontSize)}`;
      if (!seen.has(key)) seen.set(key, t);
    }
    return [...seen.values()].sort((a, b) => b.fontSize - a.fontSize);
  }

  private assignTypographyRoles(typography: DesignTokens['typography']): void {
    // Sort by size descending, assign roles
    const sorted = [...typography].sort((a, b) => b.fontSize - a.fontSize);
    const roles = ['h1', 'h2', 'h3', 'subtitle', 'body', 'caption', 'fine-print'];
    for (let i = 0; i < sorted.length && i < roles.length; i++) {
      const t = typography.find(tt => tt === sorted[i]);
      if (t) t.role = roles[i] ?? `text-${i}`;
    }
  }

  /**
   * Generate CSS custom properties from extracted tokens
   */
  generateCss(tokens: DesignTokens): string {
    const lines: string[] = [':root {'];

    // Colors
    const colorEntries = Object.entries(tokens.colors);
    if (colorEntries.length > 0) {
      lines.push('  /* Colors */');
      // Sort by most used
      const sorted = colorEntries.sort((a, b) => b[1].usage.length - a[1].usage.length);
      const colorNames = ['primary', 'secondary', 'background', 'surface', 'text', 'accent', 'muted'];
      sorted.forEach(([hex, data], i) => {
        const name = colorNames[i] ?? `color-${i}`;
        lines.push(`  --color-${name}: ${hex};`);
      });
    }

    // Typography
    if (tokens.typography.length > 0) {
      lines.push('  /* Typography */');
      const families = [...new Set(tokens.typography.map(t => t.fontFamily))];
      families.forEach((f, i) => lines.push(`  --font-${i === 0 ? 'heading' : 'body'}: '${f}', sans-serif;`));
      for (const t of tokens.typography) {
        if (t.role) {
          lines.push(`  --font-size-${t.role}: ${t.fontSize}px;`);
          lines.push(`  --font-weight-${t.role}: ${t.fontWeight};`);
        }
      }
    }

    // Spacing
    if (tokens.spacing.length > 0) {
      lines.push('  /* Spacing */');
      const names = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
      tokens.spacing.slice(0, 8).forEach((s, i) => {
        lines.push(`  --spacing-${names[i] ?? i}: ${s}px;`);
      });
    }

    // Grids
    if (tokens.grids.length > 0) {
      const grid = tokens.grids[0]!;
      lines.push('  /* Grid */');
      lines.push(`  --grid-columns: ${grid.count};`);
      lines.push(`  --grid-gutter: ${grid.gutterSize}px;`);
      lines.push(`  --grid-margin: ${grid.offset}px;`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Save extracted profile to database
   */
  async saveDesignProfile(
    tenantId: string,
    fileKey: string,
    fileName: string,
    tokens: DesignTokens,
  ): Promise<string> {
    const css = this.generateCss(tokens);
    const id = `bdp_${createId()}`;

    await this.prisma.brandDesignProfile.create({
      data: {
        id,
        tenantId,
        name: fileName || `Design Profile — ${fileKey}`,
        figmaFileKey: fileKey,
        figmaFileName: fileName,
        colors: tokens.colors as any,
        typography: tokens.typography as any,
        spacing: tokens.spacing,
        grids: tokens.grids as any,
        effects: tokens.effects as any,
        layoutPatterns: tokens.layoutPatterns as any,
        pageCount: tokens.layoutPatterns.length,
        tokensCss: css,
      },
    });

    return id;
  }

  private rgbaToHex(r: number, g: number, b: number): string {
    const to255 = (v: number) => Math.round(v * 255);
    return `#${[r, g, b].map(v => to255(v).toString(16).padStart(2, '0')).join('')}`;
  }
}
