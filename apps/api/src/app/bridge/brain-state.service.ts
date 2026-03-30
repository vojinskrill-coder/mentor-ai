import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { BrainState, BrainStateBlock } from '@mentor-ai/shared/types';

const ALL_CANVAS_BLOCKS: string[] = [
  'KEY_PARTNERS',
  'KEY_ACTIVITIES',
  'KEY_RESOURCES',
  'VALUE_PROPOSITION',
  'CUSTOMER_RELATIONSHIPS',
  'CHANNELS',
  'CUSTOMER_SEGMENTS',
  'REVENUE_STREAMS',
  'COST_STRUCTURE',
];
const STALE_THRESHOLD_HOURS = 48;

/**
 * Tracks the brain's scanning state across 9 Business Model Canvas blocks per tenant.
 * The brain scans one block per heartbeat cycle, targeting the most stale or at-risk block.
 */
@Injectable()
export class BrainStateService {
  private readonly logger = new Logger(BrainStateService.name);

  // In-memory cache per tenant (persisted on writes, loaded on reads)
  // Key: tenantId, Value: Map<canvasBlock, BrainStateBlock>
  private stateCache = new Map<string, Map<string, BrainStateBlock>>();

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Get the full brain state for a tenant.
   * Returns all 9 canvas blocks with scan status + summary counts.
   */
  async getState(tenantId: string): Promise<BrainState> {
    const blockMap = await this.ensureLoaded(tenantId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Run all independent DB queries in parallel
    const [pendingProposals, pendingConcepts, dailyBudget, lastRun] = await Promise.all([
      this.prisma.brainProposal.count({
        where: { tenantId, status: 'pending' },
      }),
      this.prisma.note.count({
        where: {
          tenantId,
          noteType: 'TASK',
          status: 'PENDING',
          parentNoteId: null,
        },
      }),
      this.prisma.agentDailyBudget.findUnique({
        where: { tenantId_date: { tenantId, date: today } },
      }),
      this.prisma.autonomousRun.findFirst({
        where: { tenantId },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true },
      }),
    ]);

    const dailyLimitEur = parseInt(process.env['AGENT_DAILY_BUDGET_EUR'] ?? '200', 10);
    const budgetRemaining = dailyLimitEur - (dailyBudget?.spentEur?.toNumber() ?? 0);

    const canvasBlocks = ALL_CANVAS_BLOCKS.map(
      (block) => blockMap.get(block) ?? this.defaultBlock(block),
    );

    return {
      canvasBlocks,
      pendingProposals,
      pendingConcepts,
      budgetRemaining: Math.max(0, budgetRemaining),
      lastHeartbeat: lastRun?.startedAt?.toISOString() ?? null,
    };
  }

  /**
   * Update a canvas block after the brain scans it.
   */
  async updateBlockScan(
    tenantId: string,
    canvasBlock: string,
    update: { risks?: number; status?: string },
  ): Promise<void> {
    const blockMap = await this.ensureLoaded(tenantId);

    // Count concepts in this canvas block for this tenant
    const conceptCount = await this.prisma.concept.count({
      where: {
        OR: [{ tenantId: null }, { tenantId }],
        canvasBlock,
      },
    });

    const existing = blockMap.get(canvasBlock) ?? this.defaultBlock(canvasBlock);
    const updated: BrainStateBlock = {
      ...existing,
      lastScan: new Date().toISOString(),
      conceptCount,
      risks: update.risks ?? existing.risks,
      status: update.status ?? 'ok',
    };

    blockMap.set(canvasBlock, updated);
    this.stateCache.set(tenantId, blockMap);

    this.logger.debug({
      message: 'Canvas block scan updated',
      tenantId,
      canvasBlock,
      conceptCount,
      status: updated.status,
    });
  }

  /**
   * Find the most stale canvas block for a tenant (used by heartbeat to decide what to scan).
   */
  async getMostStaleBlock(tenantId: string): Promise<string> {
    const blockMap = await this.ensureLoaded(tenantId);
    let oldestBlock: string = ALL_CANVAS_BLOCKS[0]!;
    let oldestTime = Infinity;

    for (const block of ALL_CANVAS_BLOCKS) {
      const state = blockMap.get(block);
      if (!state?.lastScan) {
        return block; // Never scanned = highest priority
      }
      const scanTime = new Date(state.lastScan).getTime();
      if (scanTime < oldestTime) {
        oldestTime = scanTime;
        oldestBlock = block;
      }
    }

    return oldestBlock;
  }

  /**
   * Mark staleness — called periodically to check if blocks need attention.
   */
  async refreshStaleness(tenantId: string): Promise<void> {
    const blockMap = await this.ensureLoaded(tenantId);
    const now = Date.now();
    const threshold = STALE_THRESHOLD_HOURS * 60 * 60 * 1000;

    for (const [block, state] of blockMap.entries()) {
      if (state.lastScan) {
        const age = now - new Date(state.lastScan).getTime();
        if (age > threshold && state.status !== 'scanning') {
          blockMap.set(block, { ...state, status: 'stale' });
        }
      }
    }

    this.stateCache.set(tenantId, blockMap);
  }

  // ── Internal Helpers ──

  private async ensureLoaded(tenantId: string): Promise<Map<string, BrainStateBlock>> {
    if (this.stateCache.has(tenantId)) {
      return this.stateCache.get(tenantId)!;
    }

    // Initialize with defaults — no DB persistence needed for scan state
    // (ephemeral, rebuilds on server restart, which is fine for scan tracking)
    const blockMap = new Map<string, BrainStateBlock>();
    for (const block of ALL_CANVAS_BLOCKS) {
      blockMap.set(block, this.defaultBlock(block));
    }

    this.stateCache.set(tenantId, blockMap);
    return blockMap;
  }

  private defaultBlock(block: string): BrainStateBlock {
    return {
      block,
      lastScan: null,
      conceptCount: 0,
      risks: 0,
      status: 'stale', // Never scanned = stale
    };
  }
}
