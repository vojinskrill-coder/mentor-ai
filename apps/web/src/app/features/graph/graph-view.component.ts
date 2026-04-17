import {
  Component, ElementRef, ViewChild, Input, Output, EventEmitter,
  OnInit, OnDestroy, AfterViewInit, inject, NgZone, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import * as d3Force from 'd3-force';
import { GraphStateService, GraphNode, GraphEdge, ActiveAgent, OPENCLAW_NODE_ID } from './graph-state.service';

interface Transform { x: number; y: number; scale: number; }

// ─── Neural Network Color System ───
// Cool palette with enough variety to distinguish domains — blue, teal, green, purple, white
const PREMIUM_PERSONA_COLORS: Record<string, { core: string; glow: string; dim: string }> = {
  CFO:        { core: '#4ADE80', glow: 'rgba(74,222,128,0.16)', dim: 'rgba(74,222,128,0.04)' },   // green
  CMO:        { core: '#38BDF8', glow: 'rgba(56,189,248,0.16)', dim: 'rgba(56,189,248,0.04)' },   // sky blue
  CTO:        { core: '#A78BFA', glow: 'rgba(167,139,250,0.16)', dim: 'rgba(167,139,250,0.04)' }, // violet
  OPERATIONS: { core: '#2DD4BF', glow: 'rgba(45,212,191,0.16)', dim: 'rgba(45,212,191,0.04)' },   // teal
  LEGAL:      { core: '#818CF8', glow: 'rgba(129,140,248,0.16)', dim: 'rgba(129,140,248,0.04)' }, // indigo
  CREATIVE:   { core: '#F0ABFC', glow: 'rgba(240,171,252,0.16)', dim: 'rgba(240,171,252,0.04)' }, // light purple
  CSO:        { core: '#67E8F9', glow: 'rgba(103,232,249,0.16)', dim: 'rgba(103,232,249,0.04)' }, // cyan
  SALES:      { core: '#FCD34D', glow: 'rgba(252,211,77,0.16)', dim: 'rgba(252,211,77,0.04)' },   // gold
};
const OPENCLAW_COLORS = { core: '#60A5FA', glow: 'rgba(96,165,250,0.20)', dim: 'rgba(96,165,250,0.06)' };
const DEFAULT_COLORS = { core: '#94A3B8', glow: 'rgba(148,163,184,0.12)', dim: 'rgba(148,163,184,0.03)' };

const EDGE_OPACITIES: Record<string, number> = {
  PREREQUISITE: 0.20,
  RELATED: 0.12,
  ADVANCED: 0.08,
  OPENCLAW: 0,
};

@Component({
  selector: 'app-graph-view',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; width: 100%; height: 100%; position: relative; background: #0D1117; }
    canvas { width: 100%; height: 100%; cursor: grab; }
    canvas.dragging { cursor: grabbing; }
    .controls {
      position: absolute; bottom: 12px; right: 12px;
      display: flex; gap: 2px; opacity: 0; transition: opacity 0.3s;
    }
    :host:hover .controls { opacity: 0.7; }
    .controls:hover { opacity: 1 !important; }
    .ctrl-btn {
      width: 26px; height: 26px; border-radius: 8px;
      background: rgba(15,17,23,0.85); border: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.5);
      font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(8px); transition: all 0.2s;
    }
    .ctrl-btn:hover { background: rgba(30,34,46,0.9); color: rgba(255,255,255,0.9); border-color: rgba(255,255,255,0.12); }
    .expand-btn {
      position: absolute; top: 10px; right: 10px;
      width: 26px; height: 26px; border-radius: 8px;
      background: rgba(15,17,23,0.7); border: 1px solid rgba(255,255,255,0.04); color: rgba(255,255,255,0.3);
      font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(8px); opacity: 0; transition: opacity 0.3s;
    }
    :host:hover .expand-btn { opacity: 1; }
    .expand-btn:hover { color: rgba(255,255,255,0.8); border-color: rgba(255,255,255,0.15); }
  `],
  template: `
    <canvas #graphCanvas
      (mousedown)="onMouseDown($event)"
      (mousemove)="onMouseMove($event)"
      (mouseup)="onMouseUp($event)"
      (mouseleave)="onMouseUp($event)"
      (wheel)="onWheel($event)"
      (dblclick)="onDoubleClick($event)"
      [class.dragging]="isDragging">
    </canvas>
    <button class="expand-btn" (click)="expandRequested.emit()" title="Proširi">⤢</button>
    <div class="controls">
      <button class="ctrl-btn" (click)="zoomIn()" title="Zoom in">+</button>
      <button class="ctrl-btn" (click)="zoomOut()" title="Zoom out">−</button>
      <button class="ctrl-btn" (click)="fitToView()" title="Prikaži sve">◎</button>
    </div>
  `,
})
export class GraphViewComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('graphCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @Input() embedded = true;
  @Output() noteActivated = new EventEmitter<{ noteId: string; conceptId: string }>();
  @Output() expandRequested = new EventEmitter<void>();

  private readonly graphState = inject(GraphStateService);
  private readonly zone = inject(NgZone);

  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private transform: Transform = { x: 0, y: 0, scale: 1 };
  private animFrame = 0;
  private simulation!: d3Force.Simulation<GraphNode, GraphEdge>;
  private neuronLogoImg: HTMLImageElement | null = null;
  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];
  private activeAgents: ActiveAgent[] = [];
  private subs: Subscription[] = [];

  isDragging = false;
  private dragNode: GraphNode | null = null;
  private dragStart = { x: 0, y: 0 };
  private hoveredNode: GraphNode | null = null;
  private mouseDownPos = { x: 0, y: 0 };
  private mouseDownTime = 0;

  private animTime = 0;
  private nodeCreationTimes = new Map<string, number>();
  private edgeCreationTimes = new Map<string, number>();
  private resizeObserver!: ResizeObserver;
  private _scheduleRender: () => void = () => {};
  private _hexRgbCache = new Map<string, string>();

  ngOnInit(): void {
    // Preload Neuron OS logo for graph node
    this.neuronLogoImg = new Image();
    this.neuronLogoImg.src = 'assets/images/neuron-os-logo.png';

    this.graphState.loadGraph();
    this.graphState.subscribeToEvents();

    this.subs.push(
      this.graphState.nodes$.subscribe((nodeMap) => {
        const newNodes = [...nodeMap.values()];
        const now = performance.now();
        for (const n of newNodes) {
          if (n.isNew && !this.nodeCreationTimes.has(n.id)) {
            this.nodeCreationTimes.set(n.id, now);
            n.isNew = false;
          }
        }
        this.nodes = newNodes;
        this.updateSimulation();
        this._scheduleRender();
      }),
      this.graphState.edges$.subscribe((edgeMap) => {
        const newEdges = [...edgeMap.values()];
        const now = performance.now();
        for (const e of newEdges) {
          const key = this.edgeKey(e);
          if (e.isNew && !this.edgeCreationTimes.has(key)) {
            this.edgeCreationTimes.set(key, now);
            e.isNew = false;
          }
        }
        this.edges = newEdges;
        this.updateSimulation();
        this._scheduleRender();
      }),
      this.graphState.activeAgents$.subscribe((agents) => {
        this.activeAgents = agents;
        this._scheduleRender();
      }),
    );
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement!);
    this.resize();

    // Obsidian-style physics: strong center gravity, moderate repulsion, slow elegant settling
    this.simulation = d3Force.forceSimulation<GraphNode, GraphEdge>()
      .force('charge', d3Force.forceManyBody().strength(-120).distanceMax(300))
      .force('center', d3Force.forceCenter(this.width / 2, this.height / 2).strength(0.08))
      .force('collide', d3Force.forceCollide<GraphNode>((d) => this.nodeRadius(d) + 6).strength(0.7))
      .force('x', d3Force.forceX(this.width / 2).strength(0.03))
      .force('y', d3Force.forceY(this.height / 2).strength(0.03))
      .alphaDecay(0.012)
      .velocityDecay(0.4)
      .on('tick', () => { this._scheduleRender(); });

    // Render loop: only runs when needed (simulation active, user interaction, or data change)
    this.zone.runOutsideAngular(() => {
      let renderScheduled = false;
      this._scheduleRender = () => {
        if (renderScheduled) return;
        renderScheduled = true;
        this.animFrame = requestAnimationFrame(() => {
          renderScheduled = false;
          this.animTime = performance.now();
          this.render();
          // Keep rendering while simulation is active
          if (this.simulation && this.simulation.alpha() > 0.005) {
            this._scheduleRender();
          }
        });
      };
      // Initial render
      this._scheduleRender();
    });

    // If nodes arrived before simulation was created, update now
    if (this.nodes.length > 0) {
      this.updateSimulation();
    }

    // Auto fit after initial stabilization
    setTimeout(() => this.fitToView(), 800);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animFrame);
    this.simulation?.stop();
    this.resizeObserver?.disconnect();
    for (const s of this.subs) s.unsubscribe();
  }

  // ─── Simulation ───

  private updateSimulation(): void {
    if (!this.simulation) return;
    this.simulation.nodes(this.nodes);
    this.simulation.force('link',
      d3Force.forceLink<GraphNode, GraphEdge>(this.edges)
        .id((d) => d.id)
        .distance((e) => (e as any).type === 'OPENCLAW' ? 120 : 70)
        .strength((e) => (e as any).type === 'OPENCLAW' ? 0.03 : 0.25)
    );
    this.simulation.force('center', d3Force.forceCenter(this.width / 2, this.height / 2).strength(0.08));
    this.simulation.force('x', d3Force.forceX(this.width / 2).strength(0.03));
    this.simulation.force('y', d3Force.forceY(this.height / 2).strength(0.03));
    this.simulation.alpha(0.25).restart();
  }

  // ─── Node Sizing (proportional to connections) ───

  private nodeRadius(node: GraphNode): number {
    if (node.id === OPENCLAW_NODE_ID) return 14; // Largest node in the graph
    const conn = node.connectionCount ?? 0;
    // Obsidian-style: small dots. Range: 1.5 (isolated) to 5 (hub with 20+ connections)
    const base = 1.5 + Math.log2(1 + conn) * 1;
    const completedBonus = node.status === 'COMPLETED' ? 0.5 : 0;
    return Math.min(6, base + completedBonus);
  }

  // ─── Premium Rendering ───

  private render(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    // Deep dark background
    ctx.fillStyle = '#0D1117';
    ctx.fillRect(0, 0, this.width, this.height);

    // Vignette only for small graphs (expensive gradient)
    if (this.nodes.length < 80) {
      const vignette = ctx.createRadialGradient(
        this.width / 2, this.height / 2, 0,
        this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.7
      );
      vignette.addColorStop(0, 'rgba(13,17,23,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    ctx.translate(this.transform.x, this.transform.y);
    ctx.scale(this.transform.scale, this.transform.scale);

    const isLargeGraph = this.nodes.length > 60;

    // Layer 1: Edges — batch non-hovered edges in a single path for performance
    const hoveredEdges: GraphEdge[] = [];
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(100,120,150,0.06)';
    ctx.lineWidth = 0.5;
    for (const edge of this.edges) {
      if ((edge as any).type === 'OPENCLAW') continue;
      const source = edge.source as GraphNode;
      const target = edge.target as GraphNode;
      if (!source.x || !target.x || !source.y || !target.y) continue;
      const isConnected = this.hoveredNode &&
        (source.id === this.hoveredNode.id || target.id === this.hoveredNode.id);
      if (isConnected) {
        hoveredEdges.push(edge);
      } else {
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
      }
    }
    ctx.stroke();
    // Draw hovered edges with gradients (only a few)
    for (const edge of hoveredEdges) {
      this.drawEdge(ctx, edge);
    }

    // Layer 2: Collaboration particles (skip for large graphs — too expensive)
    if (!isLargeGraph) {
      for (const edge of this.edges) {
        if ((edge as any).type !== 'OPENCLAW') this.drawCollaborationParticles(ctx, edge);
      }
    }

    // Layer 3: OpenClaw → active concept connection lines
    this.drawOpenClawConnections(ctx);

    // Layer 4: Node bloom (skip for large graphs — expensive blur)
    if (!isLargeGraph) {
      for (const node of this.nodes) this.drawNodeBloom(ctx, node);
    }

    // Layer 5: Nodes
    for (const node of this.nodes) {
      if (node.id === OPENCLAW_NODE_ID) {
        this.drawOpenClawNode(ctx, node);
      } else {
        this.drawNode(ctx, node);
      }
    }

    // Layer 6: Agent dots + particles
    for (const agent of this.activeAgents) this.drawAgentDot(ctx, agent);

    // Layer 7: Labels (for large graphs, only show labels for hovered + connected nodes)
    if (isLargeGraph) {
      const showLabels = new Set<string>();
      if (this.hoveredNode) {
        showLabels.add(this.hoveredNode.id);
        // Add connected nodes
        for (const e of this.edges) {
          const src = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id;
          const tgt = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id;
          if (src === this.hoveredNode.id) showLabels.add(tgt);
          if (tgt === this.hoveredNode.id) showLabels.add(src);
        }
      }
      // Always show OpenClaw and pulsing nodes
      for (const n of this.nodes) {
        if (n.id === OPENCLAW_NODE_ID || n.isPulsing) showLabels.add(n.id);
      }
      for (const node of this.nodes) {
        if (showLabels.has(node.id) || showLabels.size === 0) this.drawLabel(ctx, node);
      }
    } else {
      for (const node of this.nodes) this.drawLabel(ctx, node);
    }

    // Layer 8: Tooltip
    if (this.hoveredNode) this.drawTooltip(ctx, this.hoveredNode);

    ctx.restore();
  }

  private drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge): void {
    const source = edge.source as GraphNode;
    const target = edge.target as GraphNode;
    if (!source.x || !target.x || !source.y || !target.y) return;

    const isConnected = this.hoveredNode &&
      (source.id === this.hoveredNode.id || target.id === this.hoveredNode.id);

    if (isConnected) {
      // Full gradient rendering only for hovered edges (max ~20 per hover)
      const opacity = EDGE_OPACITIES[edge.type] ?? 0.08;
      const sourceColors = PREMIUM_PERSONA_COLORS[source.personaType] ?? DEFAULT_COLORS;
      const targetColors = PREMIUM_PERSONA_COLORS[(target as GraphNode).personaType] ?? DEFAULT_COLORS;
      const srcRgb = this.hexToRgbCached(sourceColors.core);
      const tgtRgb = this.hexToRgbCached(targetColors.core);
      const bo = Math.min(opacity * 8, 0.7);

      const grad = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
      grad.addColorStop(0, `rgba(${srcRgb},${bo})`);
      grad.addColorStop(0.5, `rgba(${srcRgb},${bo * 0.3})`);
      grad.addColorStop(1, `rgba(${tgtRgb},${bo})`);
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // Flat color for non-hovered edges (FAST — no gradient, no glow)
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = 'rgba(100,120,150,0.06)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  /** Cached hex→rgb conversion to avoid repeated regex parsing */
  private hexToRgbCached(hex: string): string {
    let cached = this._hexRgbCache.get(hex);
    if (!cached) {
      cached = this.hexToRgb(hex);
      this._hexRgbCache.set(hex, cached);
    }
    return cached;
  }

  private drawNodeBloom(ctx: CanvasRenderingContext2D, node: GraphNode): void {
    if (node.x == null || node.y == null) return;
    if (node.id === OPENCLAW_NODE_ID) return; // OpenClaw has its own glow in drawOpenClawNode

    const colors = PREMIUM_PERSONA_COLORS[node.personaType] ?? DEFAULT_COLORS;
    const isHovered = this.hoveredNode === node;
    const _isCompleted = node.status === 'COMPLETED';
    const nr = this.nodeRadius(node);

    // Soft ambient glow — subtle, not overpowering
    const bloomR = nr * 4;
    const glowGrad = ctx.createRadialGradient(node.x, node.y, nr * 0.5, node.x, node.y, bloomR);
    glowGrad.addColorStop(0, isHovered ? colors.glow : `rgba(${this.hexToRgb(colors.core)},0.12)`);
    glowGrad.addColorStop(0.5, `rgba(${this.hexToRgb(colors.core)},0.04)`);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(node.x, node.y, bloomR, 0, Math.PI * 2);
    ctx.fillStyle = glowGrad;
    ctx.fill();

    // Pulse bloom (when active)
    if (node.isPulsing) {
      const phase = (Math.sin(this.animTime / 800) + 1) / 2;
      const pulseR = nr * 4 + phase * nr * 3;
      const pulseGrad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, pulseR);
      pulseGrad.addColorStop(0, `rgba(${this.hexToRgb(colors.core)},${0.18 + phase * 0.12})`);
      pulseGrad.addColorStop(0.5, `rgba(${this.hexToRgb(colors.core)},${0.06 * (1 - phase)})`);
      pulseGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(node.x, node.y, pulseR, 0, Math.PI * 2);
      ctx.fillStyle = pulseGrad;
      ctx.fill();
    }
  }

  private drawNode(ctx: CanvasRenderingContext2D, node: GraphNode): void {
    if (node.x == null || node.y == null) return;

    const colors = PREMIUM_PERSONA_COLORS[node.personaType] ?? DEFAULT_COLORS;
    const _isHovered = this.hoveredNode === node;
    // Creation animation
    let scale = 1;
    const createdAt = this.nodeCreationTimes.get(node.id);
    if (createdAt) {
      const elapsed = this.animTime - createdAt;
      scale = elapsed < 300 ? this.easeOutBack(Math.min(1, elapsed / 300)) : 1;
      if (elapsed > 400) this.nodeCreationTimes.delete(node.id);
    }

    const r = this.nodeRadius(node) * scale;

    // Subtle sphere — soft highlight, not glaring
    const nodeGrad = ctx.createRadialGradient(
      node.x - r * 0.2, node.y - r * 0.2, 0,
      node.x, node.y, r
    );
    nodeGrad.addColorStop(0, `rgba(255,255,255,0.35)`);  // soft highlight
    nodeGrad.addColorStop(0.35, colors.core);
    nodeGrad.addColorStop(1, `rgba(${this.hexToRgb(colors.core)},0.6)`);
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = nodeGrad;
    ctx.fill();

    // Completed indicator — bright ring
    if (node.status === 'COMPLETED') {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(45,212,191,0.5)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  private drawLabel(ctx: CanvasRenderingContext2D, node: GraphNode): void {
    if (node.x == null || node.y == null) return;

    const isHovered = this.hoveredNode === node;
    const isOpenClaw = node.id === OPENCLAW_NODE_ID;
    const showLabel = isOpenClaw || !this.embedded || isHovered;
    if (!showLabel) return;

    const _colors = isOpenClaw ? OPENCLAW_COLORS : (PREMIUM_PERSONA_COLORS[node.personaType] ?? DEFAULT_COLORS);
    const label = node.name.length > 24 ? node.name.slice(0, 22) + '…' : node.name;
    const fontSize = this.embedded ? 8 : 9.5;

    ctx.font = `300 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif`;
    ctx.textAlign = 'center';

    const nr = this.nodeRadius(node);
    const labelY = node.y + nr + 10;

    // Text shadow for readability
    ctx.fillStyle = 'rgba(6,8,12,0.8)';
    ctx.fillText(label, node.x + 0.5, labelY + 0.5);

    // Label text — brighter for neural network style
    ctx.fillStyle = isHovered ? `rgba(255,255,255,0.95)` : `rgba(180,200,230,0.65)`;
    ctx.fillText(label, node.x, labelY);
  }

  private drawAgentDot(ctx: CanvasRenderingContext2D, agent: ActiveAgent): void {
    const node = this.nodes.find((n) => n.id === agent.conceptId);
    if (!node || node.x == null || node.y == null) return;

    const colors = PREMIUM_PERSONA_COLORS[agent.personaType] ?? DEFAULT_COLORS;
    const orbitR = this.nodeRadius(node) + 6;
    const agentIdx = this.activeAgents.filter((a) => a.conceptId === agent.conceptId).indexOf(agent);
    const angle = (this.animTime / 5000) * Math.PI * 2 + (agentIdx * Math.PI * 2 / 3);

    const ax = node.x + Math.cos(angle) * orbitR;
    const ay = node.y + Math.sin(angle) * orbitR;

    // Agent dot — small, clean
    ctx.beginPath();
    ctx.arc(ax, ay, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = colors.core;
    ctx.fill();

    // Particle stream toward node
    const count = 2;
    for (let i = 0; i < count; i++) {
      const phase = ((this.animTime / 1800 + i / count) % 1);
      const px = ax + (node.x - ax) * phase;
      const py = ay + (node.y - ay) * phase;
      const particleAlpha = (1 - phase) * 0.4;
      const particleR = 0.5 + (1 - phase) * 0.5;

      ctx.beginPath();
      ctx.arc(px, py, particleR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.hexToRgb(colors.core)},${particleAlpha})`;
      ctx.fill();
    }
  }

  /** Draw the OpenClaw central node — largest, digital brain icon, orbiting job circles */
  private drawOpenClawNode(ctx: CanvasRenderingContext2D, node: GraphNode): void {
    if (node.x == null || node.y == null) return;

    const r = this.nodeRadius(node); // 14px — largest
    const isActive = this.activeAgents.length > 0;
    const x = node.x;
    const y = node.y;

    // Outer ambient glow
    const ambientR = r * 3;
    const ambGrad = ctx.createRadialGradient(x, y, 0, x, y, ambientR);
    ambGrad.addColorStop(0, isActive ? 'rgba(96,165,250,0.12)' : 'rgba(96,165,250,0.04)');
    ambGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(x, y, ambientR, 0, Math.PI * 2);
    ctx.fillStyle = ambGrad;
    ctx.fill();

    // Outer hexagonal ring (digital feel)
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI * 2 / 6) - Math.PI / 6;
      const hx = x + Math.cos(a) * (r + 3);
      const hy = y + Math.sin(a) * (r + 3);
      if (i === 0) { ctx.moveTo(hx, hy); } else { ctx.lineTo(hx, hy); }
    }
    ctx.closePath();
    ctx.strokeStyle = isActive ? 'rgba(96,165,250,0.5)' : 'rgba(96,165,250,0.18)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Neuron OS logo — transparent PNG, no background needed
    // Invisible hit area for drag (transparent fill)
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.01)'; // nearly invisible but clickable
    ctx.fill();

    // Draw logo
    if (this.neuronLogoImg?.complete && this.neuronLogoImg.naturalWidth > 0) {
      const imgSize = r * 1.96;
      ctx.drawImage(this.neuronLogoImg, x - imgSize / 2, y - imgSize / 2, imgSize, imgSize);
    }

    // Active pulse ring animation
    if (isActive) {
      const phase = (Math.sin(this.animTime / 600) + 1) / 2;
      const pulseR = r + 5 + phase * 8;
      ctx.beginPath();
      ctx.arc(x, y, pulseR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(96,165,250,${0.1 + phase * 0.12})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Orbiting job circles — one per active agent job
    const jobCount = this.activeAgents.length;
    if (jobCount > 0) {
      const orbitR = r + 14;
      for (let i = 0; i < jobCount; i++) {
        const agent = this.activeAgents[i]!;
        const angle = (this.animTime / 3000) * Math.PI * 2 + (i * Math.PI * 2 / jobCount);
        const jx = x + Math.cos(angle) * orbitR;
        const jy = y + Math.sin(angle) * orbitR;

        // Job dot with persona color
        const agentColors = PREMIUM_PERSONA_COLORS[agent.personaType] ?? DEFAULT_COLORS;
        ctx.beginPath();
        ctx.arc(jx, jy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = agentColors.core;
        ctx.fill();

        // Tiny glow
        const dotGlow = ctx.createRadialGradient(jx, jy, 0, jx, jy, 6);
        dotGlow.addColorStop(0, `rgba(${this.hexToRgb(agentColors.core)},0.35)`);
        dotGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(jx, jy, 6, 0, Math.PI * 2);
        ctx.fillStyle = dotGlow;
        ctx.fill();
      }
    }
  }

  /** Draw subtle lines from OpenClaw to concepts it's actively working on */
  private drawOpenClawConnections(ctx: CanvasRenderingContext2D): void {
    const ocNode = this.nodes.find((n) => n.id === OPENCLAW_NODE_ID);
    if (!ocNode || ocNode.x == null || ocNode.y == null) return;

    // Get unique concept IDs that have active agents
    const activeConceptIds = new Set(this.activeAgents.map((a) => a.conceptId));

    for (const conceptId of activeConceptIds) {
      const concept = this.nodes.find((n) => n.id === conceptId);
      if (!concept || concept.x == null || concept.y == null) continue;

      // Animated dashed line from OpenClaw to active concept
      const grad = ctx.createLinearGradient(ocNode.x, ocNode.y, concept.x, concept.y);
      grad.addColorStop(0, 'rgba(96,165,250,0.35)');
      grad.addColorStop(1, 'rgba(96,165,250,0.08)');

      ctx.beginPath();
      ctx.moveTo(ocNode.x, ocNode.y);
      ctx.lineTo(concept.x, concept.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -(this.animTime / 100);
      ctx.stroke();
      ctx.setLineDash([]);

      // Particle flowing from OpenClaw to concept
      const phase = ((this.animTime / 2000) % 1);
      const px = ocNode.x + (concept.x - ocNode.x) * phase;
      const py = ocNode.y + (concept.y - ocNode.y) * phase;
      const alpha = Math.sin(phase * Math.PI) * 0.5;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(96,165,250,${alpha})`;
      ctx.fill();
    }
  }

  private drawCollaborationParticles(ctx: CanvasRenderingContext2D, edge: GraphEdge): void {
    const source = edge.source as GraphNode;
    const target = edge.target as GraphNode;
    if (!source.x || !target.x || !source.y || !target.y) return;

    const sourceActive = this.activeAgents.some((a) => a.conceptId === source.id);
    const targetActive = this.activeAgents.some((a) => a.conceptId === target.id);
    if (!sourceActive || !targetActive) return;

    const count = 4;
    for (let i = 0; i < count; i++) {
      const phase = ((this.animTime / 3000 + i / count) % 1);
      const px = source.x + (target.x - source.x) * phase;
      const py = source.y + (target.y - source.y) * phase;
      const alpha = Math.sin(phase * Math.PI) * 0.35;

      const glowGrad = ctx.createRadialGradient(px, py, 0, px, py, 4);
      glowGrad.addColorStop(0, `rgba(130,170,255,${alpha})`);
      glowGrad.addColorStop(1, 'rgba(130,170,255,0)');
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();
    }
  }

  private drawTooltip(ctx: CanvasRenderingContext2D, node: GraphNode): void {
    if (node.x == null || node.y == null) return;
    const colors = PREMIUM_PERSONA_COLORS[node.personaType] ?? DEFAULT_COLORS;

    const lines: string[] = [
      node.name,
      node.category,
      `${node.personaType} · ${node.status}`,
      node.aiScore ? `Ocena: ${node.aiScore}/100` : '',
    ].filter((l): l is string => !!l);

    const padding = 10;
    const lineH = 17;
    ctx.font = '300 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    const maxWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const boxW = maxWidth + padding * 2;
    const boxH = lines.length * lineH + padding * 2;
    const bx = node.x + 16;
    const by = node.y - boxH / 2;

    // Frosted glass tooltip
    ctx.fillStyle = 'rgba(12,14,20,0.92)';
    ctx.strokeStyle = `rgba(${this.hexToRgb(colors.core)},0.15)`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, 8);
    else ctx.rect(bx, by, boxW, boxH);
    ctx.fill();
    ctx.stroke();

    // Title (first line — brighter)
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'left';
    ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fillText(lines[0] ?? '', bx + padding, by + padding + 12);

    // Rest — dimmer
    ctx.font = '300 10px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    ctx.fillStyle = 'rgba(180,185,195,0.7)';
    for (let i = 1; i < lines.length; i++) {
      ctx.fillText(lines[i] ?? '', bx + padding, by + padding + 12 + i * lineH);
    }
  }

  // ─── Color Utilities ───

  private hexToRgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
  }

  private lighten(hex: string, pct: number): string {
    const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + pct);
    const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + pct);
    const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + pct);
    return `rgb(${r},${g},${b})`;
  }

  private darken(hex: string, pct: number): string {
    const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - pct);
    const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - pct);
    const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - pct);
    return `rgb(${r},${g},${b})`;
  }

  // ─── Easing Functions ───

  private easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
  private easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  // ─── Interaction (unchanged) ───

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.transform.x) / this.transform.scale,
      y: (sy - this.transform.y) / this.transform.scale,
    };
  }

  private hitTest(wx: number, wy: number): GraphNode | null {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i]!;
      if (n == null || n.x == null || n.y == null) continue;
      // OpenClaw node is draggable but not clickable for navigation (handled in onMouseUp)
      const r = this.nodeRadius(n) + 3; // extra 3px for easier click target
      const dx = wx - n.x;
      const dy = wy - n.y;
      if (dx * dx + dy * dy < r * r) return n;
    }
    return null;
  }

  onMouseDown(event: MouseEvent): void {
    this.mouseDownPos = { x: event.clientX, y: event.clientY };
    this.mouseDownTime = performance.now();

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const { x: wx, y: wy } = this.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    const hit = this.hitTest(wx, wy);
    if (hit) {
      this.dragNode = hit;
      hit.fx = hit.x;
      hit.fy = hit.y;
      this.simulation.alphaTarget(0.3).restart();
    } else {
      this.isDragging = true;
      this.dragStart = { x: event.clientX - this.transform.x, y: event.clientY - this.transform.y };
    }
  }

  onMouseMove(event: MouseEvent): void {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const { x: wx, y: wy } = this.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    if (this.dragNode) {
      this.dragNode.fx = wx;
      this.dragNode.fy = wy;
    } else if (this.isDragging) {
      this.transform.x = event.clientX - this.dragStart.x;
      this.transform.y = event.clientY - this.dragStart.y;
    } else {
      this.hoveredNode = this.hitTest(wx, wy);
      this.canvasRef.nativeElement.style.cursor = this.hoveredNode ? 'pointer' : 'grab';
    }
    this._scheduleRender();
  }

  onMouseUp(event: MouseEvent): void {
    const wasClick = this.dragNode &&
      Math.abs(event.clientX - this.mouseDownPos.x) < 4 &&
      Math.abs(event.clientY - this.mouseDownPos.y) < 4 &&
      (performance.now() - this.mouseDownTime) < 300;

    if (this.dragNode) {
      // If it was a click (not drag), navigate — but not for Neuron Agent node
      if (wasClick && this.dragNode.id !== OPENCLAW_NODE_ID) {
        this.noteActivated.emit({ noteId: this.dragNode.noteId, conceptId: this.dragNode.id });
      }
      this.dragNode.fx = null;
      this.dragNode.fy = null;
      this.simulation.alphaTarget(0);
      this.dragNode = null;
    }
    this.isDragging = false;
  }

  onDoubleClick(_event: MouseEvent): void {
    // Navigation handled by single click in onMouseUp
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const factor = event.deltaY > 0 ? 0.92 : 1.08;
    const newScale = Math.max(0.1, Math.min(5, this.transform.scale * factor));
    this.transform.x = mx - (mx - this.transform.x) * (newScale / this.transform.scale);
    this.transform.y = my - (my - this.transform.y) * (newScale / this.transform.scale);
    this.transform.scale = newScale;
    this._scheduleRender();
  }

  zoomIn(): void { this.transform.scale = Math.min(5, this.transform.scale * 1.15); this._scheduleRender(); }
  zoomOut(): void { this.transform.scale = Math.max(0.1, this.transform.scale / 1.15); this._scheduleRender(); }

  fitToView(): void {
    if (this.nodes.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of this.nodes) {
      if (n.x == null || n.y == null) continue;
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    }
    const pad = 50;
    const graphW = maxX - minX + pad * 2;
    const graphH = maxY - minY + pad * 2;
    const scale = Math.min(this.width / graphW, this.height / graphH, 2.5);
    this.transform.scale = scale;
    this.transform.x = (this.width - graphW * scale) / 2 - minX * scale + pad * scale;
    this.transform.y = (this.height - graphH * scale) / 2 - minY * scale + pad * scale;
    this._scheduleRender();
  }

  private resize(): void {
    const canvas = this.canvasRef.nativeElement;
    const parent = canvas.parentElement!;
    this.width = parent.clientWidth;
    this.height = parent.clientHeight;
    canvas.width = this.width * this.dpr;
    canvas.height = this.height * this.dpr;
    canvas.style.width = `${this.width}px`;
    canvas.style.height = `${this.height}px`;
    if (this.simulation) {
      this.simulation.force('center', d3Force.forceCenter(this.width / 2, this.height / 2));
    }
    this._scheduleRender();
  }

  private edgeKey(e: GraphEdge): string {
    const s = typeof e.source === 'string' ? e.source : e.source.id;
    const t = typeof e.target === 'string' ? e.target : e.target.id;
    return `${s}:${t}:${e.type}`;
  }
}
