import {
  Component, ElementRef, ViewChild, Input, Output, EventEmitter,
  OnInit, OnDestroy, AfterViewInit, inject, NgZone, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import * as d3Force from 'd3-force';
import { GraphStateService, GraphNode, GraphEdge, ActiveAgent, PERSONA_COLORS } from './graph-state.service';

interface Transform { x: number; y: number; scale: number; }

// ─── Premium Color System ───
// Sophisticated, muted jewel tones — luxury feel against deep dark
const PREMIUM_PERSONA_COLORS: Record<string, { core: string; glow: string; dim: string }> = {
  CFO:        { core: '#6EE7B7', glow: 'rgba(110,231,183,0.18)', dim: 'rgba(110,231,183,0.05)' },  // soft emerald
  CMO:        { core: '#FCD34D', glow: 'rgba(252,211,77,0.18)', dim: 'rgba(252,211,77,0.05)' },    // warm gold
  CTO:        { core: '#A5B4FC', glow: 'rgba(165,180,252,0.18)', dim: 'rgba(165,180,252,0.05)' },  // soft lavender
  OPERATIONS: { core: '#FCA5A5', glow: 'rgba(252,165,165,0.18)', dim: 'rgba(252,165,165,0.05)' },  // soft coral
  LEGAL:      { core: '#C4B5FD', glow: 'rgba(196,181,253,0.18)', dim: 'rgba(196,181,253,0.05)' },  // soft violet
  CREATIVE:   { core: '#F9A8D4', glow: 'rgba(249,168,212,0.18)', dim: 'rgba(249,168,212,0.05)' },  // soft rose
  CSO:        { core: '#99F6E4', glow: 'rgba(153,246,228,0.18)', dim: 'rgba(153,246,228,0.05)' },  // soft teal
  SALES:      { core: '#FDBA74', glow: 'rgba(253,186,116,0.18)', dim: 'rgba(253,186,116,0.05)' },  // soft amber
};
const DEFAULT_COLORS = { core: '#D1D5DB', glow: 'rgba(209,213,219,0.12)', dim: 'rgba(209,213,219,0.04)' };

const EDGE_OPACITIES: Record<string, number> = {
  PREREQUISITE: 0.18,
  RELATED: 0.08,
  ADVANCED: 0.06,
};

@Component({
  selector: 'app-graph-view',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; width: 100%; height: 100%; position: relative; background: #06080C; }
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

  ngOnInit(): void {
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
      }),
      this.graphState.activeAgents$.subscribe((agents) => {
        this.activeAgents = agents;
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
      .on('tick', () => { /* render in animFrame */ });

    this.zone.runOutsideAngular(() => {
      const loop = () => {
        this.animTime = performance.now();
        this.render();
        this.animFrame = requestAnimationFrame(loop);
      };
      this.animFrame = requestAnimationFrame(loop);
    });

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
        .distance(70)
        .strength(0.25)
    );
    this.simulation.force('center', d3Force.forceCenter(this.width / 2, this.height / 2).strength(0.08));
    this.simulation.force('x', d3Force.forceX(this.width / 2).strength(0.03));
    this.simulation.force('y', d3Force.forceY(this.height / 2).strength(0.03));
    this.simulation.alpha(0.25).restart();
  }

  // ─── Node Sizing (proportional to connections) ───

  private nodeRadius(node: GraphNode): number {
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

    // Deep dark background with subtle radial vignette
    ctx.fillStyle = '#06080C';
    ctx.fillRect(0, 0, this.width, this.height);
    const vignette = ctx.createRadialGradient(
      this.width / 2, this.height / 2, 0,
      this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.7
    );
    vignette.addColorStop(0, 'rgba(12,16,24,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.translate(this.transform.x, this.transform.y);
    ctx.scale(this.transform.scale, this.transform.scale);

    // Layer 1: Edge glow (behind everything)
    for (const edge of this.edges) this.drawEdge(ctx, edge);

    // Layer 2: Collaboration particles
    for (const edge of this.edges) this.drawCollaborationParticles(ctx, edge);

    // Layer 3: Node bloom (soft glow behind nodes)
    for (const node of this.nodes) this.drawNodeBloom(ctx, node);

    // Layer 4: Nodes
    for (const node of this.nodes) this.drawNode(ctx, node);

    // Layer 5: Agent dots + particles
    for (const agent of this.activeAgents) this.drawAgentDot(ctx, agent);

    // Layer 6: Labels (on top of everything)
    for (const node of this.nodes) this.drawLabel(ctx, node);

    // Layer 7: Tooltip
    if (this.hoveredNode) this.drawTooltip(ctx, this.hoveredNode);

    ctx.restore();
  }

  private drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge): void {
    const source = edge.source as GraphNode;
    const target = edge.target as GraphNode;
    if (!source.x || !target.x || !source.y || !target.y) return;

    const opacity = EDGE_OPACITIES[edge.type] ?? 0.08;
    const key = this.edgeKey(edge);
    const createdAt = this.edgeCreationTimes.get(key);

    let progress = 1;
    if (createdAt) {
      const elapsed = this.animTime - createdAt;
      progress = elapsed < 1000 ? this.easeOutCubic(Math.min(1, elapsed / 1000)) : 1;
      if (elapsed > 1200) this.edgeCreationTimes.delete(key);
    }

    // Hovered edge highlight
    const isConnected = this.hoveredNode &&
      (source.id === this.hoveredNode.id || target.id === this.hoveredNode.id);
    const finalOpacity = isConnected ? opacity * 4 : opacity;

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const ex = source.x + dx * progress;
    const ey = source.y + dy * progress;

    // Gradient line that fades at both ends
    const grad = ctx.createLinearGradient(source.x, source.y, ex, ey);
    const edgeColor = isConnected ? 'rgba(200,210,240,' : 'rgba(120,140,180,';
    grad.addColorStop(0, edgeColor + (finalOpacity * 0.3) + ')');
    grad.addColorStop(0.2, edgeColor + finalOpacity + ')');
    grad.addColorStop(0.8, edgeColor + finalOpacity + ')');
    grad.addColorStop(1, edgeColor + (finalOpacity * 0.3) + ')');

    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = grad;
    ctx.lineWidth = isConnected ? 0.8 : 0.5;
    ctx.stroke();

    // Creation glow pulse
    if (createdAt && (this.animTime - createdAt) < 1200) {
      const t = (this.animTime - createdAt) / 1200;
      const px = source.x + dx * t;
      const py = source.y + dy * t;
      const glowGrad = ctx.createRadialGradient(px, py, 0, px, py, 6);
      glowGrad.addColorStop(0, `rgba(130,170,255,${0.6 * (1 - t)})`);
      glowGrad.addColorStop(1, 'rgba(130,170,255,0)');
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();
    }
  }

  private drawNodeBloom(ctx: CanvasRenderingContext2D, node: GraphNode): void {
    if (node.x == null || node.y == null) return;

    const colors = PREMIUM_PERSONA_COLORS[node.personaType] ?? DEFAULT_COLORS;
    const isHovered = this.hoveredNode === node;
    const isCompleted = node.status === 'COMPLETED';
    const nr = this.nodeRadius(node);

    // Outer ambient glow — subtle, proportional
    const bloomR = nr * 4;
    const glowGrad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, bloomR);
    glowGrad.addColorStop(0, isHovered ? colors.glow : colors.dim);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(node.x, node.y, bloomR, 0, Math.PI * 2);
    ctx.fillStyle = glowGrad;
    ctx.fill();

    // Pulse bloom (when active)
    if (node.isPulsing) {
      const phase = (Math.sin(this.animTime / 800) + 1) / 2;
      const pulseR = nr * 3 + phase * nr * 2.5;
      const pulseGrad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, pulseR);
      pulseGrad.addColorStop(0, `rgba(${this.hexToRgb(colors.core)},${0.12 + phase * 0.08})`);
      pulseGrad.addColorStop(0.6, `rgba(${this.hexToRgb(colors.core)},${0.04 * (1 - phase)})`);
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
    const isHovered = this.hoveredNode === node;
    // Creation animation
    let scale = 1;
    const createdAt = this.nodeCreationTimes.get(node.id);
    if (createdAt) {
      const elapsed = this.animTime - createdAt;
      scale = elapsed < 300 ? this.easeOutBack(Math.min(1, elapsed / 300)) : 1;
      if (elapsed > 400) this.nodeCreationTimes.delete(node.id);
    }

    const r = this.nodeRadius(node) * scale;

    // Simple flat fill — clean, Obsidian-style
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = colors.core;
    ctx.fill();

    // Completed indicator — thin green ring
    if (node.status === 'COMPLETED') {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(110,231,183,0.45)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  private drawLabel(ctx: CanvasRenderingContext2D, node: GraphNode): void {
    if (node.x == null || node.y == null) return;

    const isHovered = this.hoveredNode === node;
    const showLabel = !this.embedded || isHovered;
    if (!showLabel) return;

    const colors = PREMIUM_PERSONA_COLORS[node.personaType] ?? DEFAULT_COLORS;
    const label = node.name.length > 24 ? node.name.slice(0, 22) + '…' : node.name;
    const fontSize = this.embedded ? 8 : 9.5;

    ctx.font = `300 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif`;
    ctx.textAlign = 'center';

    const nr = this.nodeRadius(node);
    const labelY = node.y + nr + 10;

    // Text shadow for readability
    ctx.fillStyle = 'rgba(6,8,12,0.8)';
    ctx.fillText(label, node.x + 0.5, labelY + 0.5);

    // Label text
    ctx.fillStyle = isHovered ? `rgba(255,255,255,0.9)` : `rgba(200,205,215,0.55)`;
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
  }

  onMouseUp(event: MouseEvent): void {
    const wasClick = this.dragNode &&
      Math.abs(event.clientX - this.mouseDownPos.x) < 4 &&
      Math.abs(event.clientY - this.mouseDownPos.y) < 4 &&
      (performance.now() - this.mouseDownTime) < 300;

    if (this.dragNode) {
      // If it was a click (not drag), navigate
      if (wasClick) {
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
  }

  zoomIn(): void { this.transform.scale = Math.min(5, this.transform.scale * 1.15); }
  zoomOut(): void { this.transform.scale = Math.max(0.1, this.transform.scale / 1.15); }

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
  }

  private edgeKey(e: GraphEdge): string {
    const s = typeof e.source === 'string' ? e.source : e.source.id;
    const t = typeof e.target === 'string' ? e.target : e.target.id;
    return `${s}:${t}:${e.type}`;
  }
}
