import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Client as SshClient } from 'ssh2';
import { readFileSync } from 'fs';
import { VaultService } from './vault.service';
import { ConceptEnrichmentService } from './concept-enrichment.service';
import { SectionFilterService } from './section-filter.service';
import { RecommendationService } from './recommendation.service';
import { BrainMaintenanceService } from './brain-maintenance.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { createId } from '@paralleldrive/cuid2';

/**
 * Vault API endpoints for tenant knowledge vault management.
 *
 * All endpoints require tenantId from the authenticated session.
 * In DEV_MODE, tenantId is accepted as a query parameter.
 *
 * Provides:
 *   - Vault status and stats for the frontend
 *   - Manual vault creation trigger (normally done via onboarding)
 *   - Monitoring endpoint for vault operations (admin only)
 */
@Controller('v1/vault')
export class VaultController {
  private readonly logger = new Logger(VaultController.name);

  constructor(
    private readonly vaultService: VaultService,
    private readonly enrichmentService: ConceptEnrichmentService,
    private readonly sectionFilter: SectionFilterService,
    private readonly recommendations: RecommendationService,
    private readonly maintenance: BrainMaintenanceService,
    private readonly prisma: PlatformPrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * GET /api/v1/vault/media/:filename
   * Proxies images from OpenClaw relay media directory.
   * Concept enrichment stores images as MEDIA:/root/.openclaw/media/...
   */
  @Get('media/:filename')
  async proxyMedia(@Param('filename') filename: string, @Res() res: Response) {
    const relayUrl = (this.configService.get<string>('OPENCLAW_RELAY_URL') ?? 'http://91.98.231.87:3100').replace(/\/execute\/?$/, '').replace(/\/stream\/?$/, '');
    const relayToken = this.configService.get<string>('OPENCLAW_RELAY_TOKEN') ?? '';

    // Sanitize filename — only allow alphanumeric, dash, underscore, dot
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    if (!safe || safe.includes('..')) {
      return res.status(400).send('Invalid filename');
    }

    try {
      const mediaUrl = `${relayUrl}/media/${safe}`;
      const response = await fetch(mediaUrl, {
        headers: relayToken ? { 'Authorization': `Bearer ${relayToken}` } : {},
      });

      if (!response.ok) {
        return res.status(response.status).send('Media not found');
      }

      const contentType = response.headers.get('content-type') ?? 'image/png';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const buffer = Buffer.from(await response.arrayBuffer());
      return res.send(buffer);
    } catch (err) {
      this.logger.warn({ message: 'Media proxy failed', filename: safe, error: (err as Error).message });
      return res.status(502).send('Media proxy error');
    }
  }

  /**
   * GET /api/v1/vault/status?tenantId=
   * Returns vault creation status for the tenant.
   */
  @Get('status')
  async getVaultStatus(@Query('tenantId') tenantId: string) {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const vault = await this.vaultService.getVaultStatus(tenantId);
    return { data: vault };
  }

  /**
   * GET /api/v1/vault/stats?tenantId=
   * Returns vault statistics including enrichment progress.
   */
  @Get('stats')
  async getVaultStats(@Query('tenantId') tenantId: string) {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const stats = await this.vaultService.getVaultStats(tenantId);
    return { data: stats };
  }

  /**
   * POST /api/v1/vault/create
   * Body: { tenantId, tenantName, industry? }
   * Manually trigger vault creation (normally done during onboarding).
   */
  @Post('create')
  async createVault(
    @Body() body: { tenantId: string; tenantName: string; industry?: string },
  ) {
    if (!body.tenantId || !body.tenantName) {
      throw new BadRequestException('tenantId and tenantName are required');
    }

    // Verify tenant exists before creating vault
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: body.tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new BadRequestException(`Tenant not found: ${body.tenantId}`);
    }

    const result = await this.vaultService.createTenantVault(
      body.tenantId,
      body.tenantName,
      body.industry,
    );
    return { data: result };
  }

  /**
   * GET /api/v1/vault/operations?tenantId=&limit=
   * Returns recent vault operation logs for monitoring.
   * Admin-level endpoint — shows operations for specified tenant or all.
   */
  @Get('operations')
  async getVaultOperations(
    @Query('tenantId') tenantId?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(parseInt(limit ?? '20', 10), 100);
    const where = tenantId ? { tenantId } : {};

    const operations = await this.prisma.vaultOperationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });

    return { data: operations };
  }

  /**
   * GET /api/v1/vault/concept/:id?tenantId=&department=&role=
   * Returns concept content filtered by the user's department.
   * Sections tagged for other departments are stripped.
   */
  @Get('concept/:id')
  async getFilteredConcept(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
    @Query('department') department?: string,
    @Query('role') role?: string,
  ) {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const concept = await this.prisma.concept.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        definition: true,
        extendedDescription: true,
        departmentTags: true,
        confidence: true,
        tier: true,
        lastReinforced: true,
        sectionTags: true,
      },
    });

    if (!concept) throw new BadRequestException('Concept not found for this tenant');

    // Read content from Obsidian vault (source of truth) if available
    let vaultContent: string | null = null;
    if (concept.slug) {
      try {
        vaultContent = await this.readVaultFile(tenantId, concept.slug);
        this.logger.log({
          message: 'Vault read result',
          slug: concept.slug,
          tenantId,
          vaultLength: vaultContent?.length ?? 0,
          pgLength: concept.extendedDescription?.length ?? 0,
        });
      } catch (err) {
        this.logger.warn({ message: 'Vault read failed', slug: concept.slug, error: (err as Error).message });
      }
    }

    // Use vault content if available (source of truth), otherwise PostgreSQL
    const contentSource = (vaultContent && vaultContent.length > 500) ? vaultContent : concept.extendedDescription;

    // Filter content by department
    const filteredContent = contentSource
      ? this.sectionFilter.filterByDepartment(
          contentSource,
          department ?? null,
          role ?? 'TEAM_MEMBER',
        )
      : concept.definition;

    return {
      data: {
        ...concept,
        extendedDescription: filteredContent,
        _vaultReadLength: vaultContent?.length ?? -1,
        _contentSource: (vaultContent && vaultContent.length > 500) ? 'vault' : 'pg',
      },
    };
  }

  /**
   * POST /api/v1/vault/relationships
   * Body: { tenantId, sourceConceptId, targetConceptId, relationshipType }
   * Creates a new relationship between two concepts (for agent-driven relationship building).
   */
  @Post('relationships')
  async createRelationship(
    @Body() body: {
      tenantId: string;
      sourceConceptId: string;
      targetConceptId: string;
      relationshipType: 'RELATED' | 'PREREQUISITE' | 'ADVANCED';
    },
  ) {
    if (!body.tenantId || !body.sourceConceptId || !body.targetConceptId || !body.relationshipType) {
      throw new BadRequestException('tenantId, sourceConceptId, targetConceptId, and relationshipType are required');
    }
    if (!['RELATED', 'PREREQUISITE', 'ADVANCED'].includes(body.relationshipType)) {
      throw new BadRequestException('relationshipType must be RELATED, PREREQUISITE, or ADVANCED');
    }

    // Verify both concepts exist and belong to the tenant
    const [source, target] = await Promise.all([
      this.prisma.concept.findFirst({ where: { id: body.sourceConceptId, tenantId: body.tenantId }, select: { id: true } }),
      this.prisma.concept.findFirst({ where: { id: body.targetConceptId, tenantId: body.tenantId }, select: { id: true } }),
    ]);
    if (!source) throw new BadRequestException(`Source concept not found for this tenant`);
    if (!target) throw new BadRequestException(`Target concept not found for this tenant`);
    if (body.sourceConceptId === body.targetConceptId) throw new BadRequestException('Cannot create self-referencing relationship');

    // Check for duplicate
    const existing = await this.prisma.conceptRelationship.findFirst({
      where: { sourceConceptId: body.sourceConceptId, targetConceptId: body.targetConceptId },
    });
    if (existing) {
      return { data: existing, message: 'Relationship already exists' };
    }

    const relationship = await this.prisma.conceptRelationship.create({
      data: {
        id: `crel_${createId()}`,
        sourceConceptId: body.sourceConceptId,
        targetConceptId: body.targetConceptId,
        relationshipType: body.relationshipType,
      },
    });

    // Log to monitoring
    await this.prisma.vaultOperationLog.create({
      data: {
        id: `vlog_${createId()}`,
        tenantId: body.tenantId,
        operationType: 'update',
        conceptsAffected: 2,
        status: 'completed',
        details: {
          action: 'relationship_created',
          type: body.relationshipType,
          sourceId: body.sourceConceptId,
          targetId: body.targetConceptId,
        },
      },
    });

    return { data: relationship };
  }

  /**
   * GET /api/v1/vault/enrichment-progress?tenantId=
   * Returns enrichment progress: total, enriched, current concept, running status.
   */
  @Get('enrichment-progress')
  async getEnrichmentProgress(@Query('tenantId') tenantId: string) {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const progress = await this.enrichmentService.getEnrichmentProgress(tenantId);
    return { data: progress };
  }

  // ── Recommendation endpoints ──────────────────────────────────

  /**
   * GET /api/v1/vault/recommendations?tenantId=&department=
   * Returns all recommendation cards for the dashboard.
   */
  @Get('recommendations')
  async getRecommendations(
    @Query('tenantId') tenantId: string,
    @Query('department') department?: string,
  ) {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const cards = await this.recommendations.getAllRecommendations(tenantId, department ?? null);
    return { data: cards };
  }

  /**
   * GET /api/v1/vault/recommendations/mcp?tenantId=
   * Returns MCP tool configuration recommendations.
   */
  @Get('recommendations/mcp')
  async getMcpRecommendations(@Query('tenantId') tenantId: string) {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const cards = await this.recommendations.getMcpRecommendations(tenantId);
    return { data: cards };
  }

  /**
   * GET /api/v1/vault/recommendations/tasks?tenantId=&department=
   * Returns AI recommended task cards.
   */
  @Get('recommendations/tasks')
  async getTaskRecommendations(
    @Query('tenantId') tenantId: string,
    @Query('department') department?: string,
  ) {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const cards = await this.recommendations.getTaskRecommendations(tenantId, department ?? null);
    return { data: cards };
  }

  /**
   * POST /api/v1/vault/recommendations/process-suggestions
   * Body: { tenantId, conversationTopic }
   * Returns process suggestion cards based on conversation topic.
   */
  @Post('recommendations/process-suggestions')
  async getProcessSuggestions(
    @Body() body: { tenantId: string; conversationTopic: string },
  ) {
    if (!body.tenantId || !body.conversationTopic) {
      throw new BadRequestException('tenantId and conversationTopic are required');
    }
    const cards = await this.recommendations.getProcessSuggestions(body.tenantId, body.conversationTopic);
    return { data: cards };
  }

  /**
   * POST /api/v1/vault/recommendations/next-steps
   * Body: { tenantId, processName, resultCount }
   * Returns next-step cards after process completion.
   */
  /**
   * POST /api/v1/vault/recommendations/dismiss
   * Body: { tenantId, cardId }
   * Dismisses a card for 7 days.
   */
  @Post('recommendations/dismiss')
  async dismissRecommendation(
    @Body() body: { tenantId: string; cardId: string },
  ) {
    if (!body.tenantId || !body.cardId) {
      throw new BadRequestException('tenantId and cardId are required');
    }
    this.recommendations.dismissCard(body.tenantId, body.cardId);
    return { data: { dismissed: true, cardId: body.cardId } };
  }

  @Post('recommendations/next-steps')
  async getNextStepCards(
    @Body() body: { tenantId: string; processName: string; resultCount: number },
  ) {
    if (!body.tenantId || !body.processName) {
      throw new BadRequestException('tenantId and processName are required');
    }
    const cards = await this.recommendations.getNextStepCards(body.tenantId, body.processName, body.resultCount ?? 0);
    return { data: cards };
  }

  // ── Brain Maintenance endpoints ───────────────────────────────

  /**
   * POST /api/v1/vault/maintenance/lint?tenantId=
   * Run brain lint — detect problems and apply simple fixes.
   */
  @Post('maintenance/lint')
  async runLint(@Body() body: { tenantId: string }) {
    if (!body.tenantId) throw new BadRequestException('tenantId is required');
    const result = await this.maintenance.runLint(body.tenantId);
    return { data: result };
  }

  /**
   * POST /api/v1/vault/maintenance/dedup?tenantId=
   * Run concept deduplication.
   */
  @Post('maintenance/dedup')
  async runDedup(@Body() body: { tenantId: string }) {
    if (!body.tenantId) throw new BadRequestException('tenantId is required');
    const result = await this.maintenance.runDedup(body.tenantId);
    return { data: result };
  }

  /**
   * POST /api/v1/vault/maintenance/tiers?tenantId=
   * Run tier promotion and confidence decay.
   */
  @Post('maintenance/tiers')
  async runTierConsolidation(@Body() body: { tenantId: string }) {
    if (!body.tenantId) throw new BadRequestException('tenantId is required');
    const result = await this.maintenance.runTierConsolidation(body.tenantId);
    return { data: result };
  }

  /**
   * POST /api/v1/vault/maintenance/full?tenantId=
   * Run full maintenance cycle: lint + dedup + tiers.
   */
  @Post('maintenance/full')
  async runFullMaintenance(@Body() body: { tenantId: string }) {
    if (!body.tenantId) throw new BadRequestException('tenantId is required');
    const result = await this.maintenance.runFullMaintenance(body.tenantId);
    return { data: result };
  }

  /** Read a concept article from the Obsidian vault via SSH */
  private readVaultFile(tenantId: string, slug: string): Promise<string> {
    return new Promise((resolve) => {
      const vaultPath = `/root/.openclaw-${tenantId}/vault/wiki/concepts/${slug}.md`;
      const host = this.configService.get<string>('HETZNER_HOST') ?? '91.98.231.87';
      const keyPath = this.configService.get<string>('HETZNER_SSH_KEY') ?? '';

      if (!keyPath) {
        this.logger.warn({ message: 'No HETZNER_SSH_KEY configured' });
        return resolve('');
      }

      let privateKey: Buffer;
      try {
        privateKey = readFileSync(keyPath);
      } catch (e) {
        this.logger.error({ message: 'Cannot read SSH key', keyPath, error: (e as Error).message });
        return resolve('');
      }

      const conn = new SshClient();
      let output = '';

      // Timeout after 10s
      const timeout = setTimeout(() => {
        this.logger.warn({ message: 'SSH timeout reading vault file', vaultPath });
        conn.end();
        resolve('');
      }, 10000);

      conn.on('ready', () => {
        conn.exec(`cat '${vaultPath}' 2>/dev/null`, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            this.logger.warn({ message: 'SSH exec error', error: err.message });
            conn.end();
            return resolve('');
          }
          stream.on('data', (d: Buffer) => { output += d.toString(); });
          stream.stderr.on('data', () => {});
          stream.on('close', () => {
            clearTimeout(timeout);
            conn.end();
            resolve(output);
          });
        });
      });

      conn.on('error', (e) => {
        clearTimeout(timeout);
        this.logger.error({ message: 'SSH connection error reading vault', error: e.message, host });
        resolve('');
      });

      conn.connect({ host, port: 22, username: 'root', privateKey } as any);
    });
  }
}
