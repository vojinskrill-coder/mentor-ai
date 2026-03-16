import {
  Component, ElementRef, ViewChild, Input, Output, EventEmitter,
  OnInit, OnDestroy, AfterViewInit, inject, NgZone, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import * as d3Force from 'd3-force';
import { GraphStateService, GraphNode, GraphEdge, ActiveAgent, PERSONA_COLORS } from './graph-state.service';

interface Transform { x: number; y: number; scale: number; }

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#4B5563',
  IN_PROGRESS: '#3B82F6',
  COMPLETED: '#10B981',
  STALE: '#EF4444',
};

const EDGE_STYLES: Record<string, { dash: number[]; opacity: number }> = {
  PREREQUISITE: { dash: [], opacity: 0.4 },
  RELATED: { dash: [4, 4], opacity: 0.25 },
  ADVANCED: { dash: [2, 6], opacity: 0.2 },
};

@Component({
  selector: 'app-graph-view',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; width: 100%; height: 100%; position: relative; }
    canvas { width: 100%; height: 100%; cursor: grab; }
    canvas.dragging { cursor: grabbing; }
    .controls {
      position: absolute; bottom: 8px; right: 8px;
      display: flex; gap: 4px; opacity: 0.6; transition: opacity 0.15s;
    }
    .controls:hover { opacity: 1; }
    .ctrl-btn {
      width: 28px; height: 28px; border-radius: 6px;
      background: #1A1A1A; border: 1px solid #2A2A2A; color: #FAFAFA;
      font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .ctrl-btn:hover { background: #242424; border-color: #3B82F6; }
    .expand-btn {
      position: absolute; top: 8px; right: 8px;
      width: 28px; height: 28px; border-radius: 6px;
      background: #1A1A1A; border: 1px solid #2A2A2A; color: #FAFAFA;
      font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;
      opacity: 0.5; transition: opacity 0.15s;
    }
    .expand-btn:hover { opacity: 1; border-color: #3B82F6; }
  `],
  template: `
    <canvas #graphCanvas
      (mousedown)="onMouseDown($event)"
      (mousemove)="onMouseMove($event)"
      (mouseup)="onMouseUp($event)"
      (wheel)="onWheel($event)"
      (dblclick)="onDoubleClick($event)"
      [class.dragging]="isDragging">
    </canvas>
    <button class="expand-btn" (click)="expandRequested.emit()" title="Proširi">⤢</button>
    <div class="controls">
      <button class="ctrl-btn" (click)="zoomIn()" title="Zoom in">+</button>
      <button class="ctrl-btn" (click)="zoomOut()" title="Zoom out">−</button>
      <button class="ctrl-btn" (click)="fitToView()" title="Prikaži sve">⊡</button>
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

  // Interaction state
  isDragging = false;
  private dragNode: GraphNode | null = null;
  private dragStart = { x: 0, y: 0 };
  private hoveredNode: GraphNode | null = null;

  // Animation state
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
        // Track creation times for animation
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

    this.simulation = d3Force.forceSimulation<GraphNode, GraphEdge>()
      .force('charge', d3Force.forceManyBody().strength(-200))
      .force('center', d3Force.forceCenter(this.width / 2, this.height / 2))
      .force('collide', d3Force.forceCollide(35))
      .alphaDecay(0.02)
      .on('tick', () => { /* render in animFrame loop */ });

    this.zone.runOutsideAngular(() => {
      const loop = () => {
        this.animTime = performance.now();
        this.render();
        this.animFrame = requestAnimationFrame(loop);
      };
      this.animFrame = requestAnimationFrame(loop);
    });
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
        .distance(80)
        .strength(0.3)
    );
    this.simulation.force('center', d3Force.forceCenter(this.width / 2, this.height / 2));
    this.simulation.alpha(0.3).restart();
  }

  // ─── Rendering ───

  private render(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    // Background
    ctx.fillStyle = '#0D0D0D';
    ctx.fillRect(0, 0, this.width, this.height);

    // Apply camera transform
    ctx.translate(this.transform.x, this.transform.y);
    ctx.scale(this.transform.scale, this.transform.scale);

    // Draw edges
    for (const edge of this.edges) {
      this.drawEdge(ctx, edge);
    }

    // Draw collaboration particles
    for (const edge of this.edges) {
      this.drawCollaborationParticles(ctx, edge);
    }

    // Draw nodes
    for (const node of this.nodes) {
      this.drawNode(ctx, node);
    }

    // Draw agent dots
    for (const agent of this.activeAgents) {
      this.drawAgentDot(ctx, agent);
    }

    // Tooltip for hovered node
    if (this.hoveredNode && !this.embedded) {
      this.drawTooltip(ctx, this.hoveredNode);
    }

    ctx.restore();
  }

  private drawEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge): void {
    const source = edge.source as GraphNode;
    const target = edge.target as GraphNode;
    if (!source.x || !target.x) return;

    const style = EDGE_STYLES[edge.type] ?? { dash: [4, 4], opacity: 0.25 };
    const key = this.edgeKey(edge);
    const createdAt = this.edgeCreationTimes.get(key);

    // Creation animation: line draws itself
    let progress = 1;
    if (createdAt) {
      const elapsed = this.animTime - createdAt;
      if (elapsed < 800) {
        progress = Math.min(1, elapsed / 800);
      } else {
        this.edgeCreationTimes.delete(key);
      }
    }

    ctx.beginPath();
    ctx.strokeStyle = `rgba(100, 130, 180, ${style.opacity})`;
    ctx.lineWidth = 1;
    if (style.dash.length) ctx.setLineDash(style.dash);
    else ctx.setLineDash([]);

    const dx = target.x! - source.x!;
    const dy = target.y! - source.y!;
    ctx.moveTo(source.x!, source.y!);
    ctx.lineTo(source.x! + dx * progress, source.y! + dy * progress);
    ctx.stroke();
    ctx.setLineDash([]);

    // Blue pulse on creation
    if (createdAt && (this.animTime - createdAt) < 1200) {
      const pulseProgress = (this.animTime - createdAt) / 1200;
      const px = source.x! + dx * pulseProgress;
      const py = source.y! + dy * pulseProgress;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(59, 130, 246, ${1 - pulseProgress})`;
      ctx.fill();
    }
  }

  private drawNode(ctx: CanvasRenderingContext2D, node: GraphNode): void {
    if (node.x == null || node.y == null) return;

    const baseRadius = node.status === 'COMPLETED' ? 14 : 10;
    const color = PERSONA_COLORS[node.personaType] ?? '#6B7280';
    const statusColor: string = STATUS_COLORS[node.status] ?? '#4B5563';

    // Creation animation: scale-in
    let scale = 1;
    const createdAt = this.nodeCreationTimes.get(node.id);
    if (createdAt) {
      const elapsed = this.animTime - createdAt;
      if (elapsed < 250) {
        scale = Math.min(1, elapsed / 250);
        scale = 1 - Math.pow(1 - scale, 3); // ease-out
      } else {
        this.nodeCreationTimes.delete(node.id);
      }
    }

    const r = baseRadius * scale;

    // Pulse animation
    if (node.isPulsing) {
      const pulsePhase = (Math.sin(this.animTime / 500) + 1) / 2; // 0-1 oscillation
      const pulseR = r + 8 + pulsePhase * 8;
      ctx.beginPath();
      ctx.arc(node.x, node.y, pulseR, 0, Math.PI * 2);
      ctx.fillStyle = `${color}${Math.round(15 + pulsePhase * 20).toString(16).padStart(2, '0')}`;
      ctx.fill();
    }

    // Node circle (status ring + persona fill)
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = statusColor;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Hovered highlight
    if (this.hoveredNode === node) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#FAFAFA';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Label (popup mode or hover)
    if (!this.embedded || this.hoveredNode === node) {
      const label = node.name.length > 22 ? node.name.slice(0, 20) + '...' : node.name;
      ctx.font = `${this.embedded ? 9 : 11}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FAFAFA';
      ctx.fillText(label, node.x, node.y + r + 14);
    }
  }

  private drawAgentDot(ctx: CanvasRenderingContext2D, agent: ActiveAgent): void {
    const node = this.nodes.find((n) => n.id === agent.conceptId);
    if (!node || node.x == null) return;

    const color = PERSONA_COLORS[agent.personaType] ?? '#6B7280';
    const orbitR = 22;
    const agentIdx = this.activeAgents.filter((a) => a.conceptId === agent.conceptId).indexOf(agent);
    const angle = (this.animTime / 4000) * Math.PI * 2 + (agentIdx * Math.PI * 2 / 3);

    const ax = node.x! + Math.cos(angle) * orbitR;
    const ay = node.y! + Math.sin(angle) * orbitR;

    // Agent dot
    ctx.beginPath();
    ctx.arc(ax, ay, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#0D0D0D';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Particle toward concept
    const particlePhase = ((this.animTime % 1500) / 1500);
    const px = ax + (node.x! - ax) * particlePhase;
    const py = ay + (node.y! - ay) * particlePhase;
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fillStyle = `${color}${Math.round((1 - particlePhase) * 200).toString(16).padStart(2, '0')}`;
    ctx.fill();
  }

  private drawCollaborationParticles(ctx: CanvasRenderingContext2D, edge: GraphEdge): void {
    const source = edge.source as GraphNode;
    const target = edge.target as GraphNode;
    if (!source.x || !target.x) return;

    // Only draw if both endpoints have active agents
    const sourceActive = this.activeAgents.some((a) => a.conceptId === source.id);
    const targetActive = this.activeAgents.some((a) => a.conceptId === target.id);
    if (!sourceActive || !targetActive) return;

    // Flowing particles along edge
    const count = 3;
    for (let i = 0; i < count; i++) {
      const phase = ((this.animTime / 2000 + i / count) % 1);
      const px = source.x! + (target.x! - source.x!) * phase;
      const py = source.y! + (target.y! - source.y!) * phase;

      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(59, 130, 246, ${0.6 - phase * 0.4})`;
      ctx.fill();
    }
  }

  private drawTooltip(ctx: CanvasRenderingContext2D, node: GraphNode): void {
    if (node.x == null || node.y == null) return;
    const lines: string[] = [
      node.name,
      `Kategorija: ${node.category}`,
      `Persona: ${node.personaType}`,
      `Status: ${node.status}`,
      node.aiScore ? `Ocena: ${node.aiScore}/100` : '',
    ].filter((l): l is string => !!l);

    const padding = 8;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    const maxWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const boxW = maxWidth + padding * 2;
    const boxH = lines.length * 16 + padding * 2;
    const bx = node.x! + 20;
    const by = node.y! - boxH / 2;

    ctx.fillStyle = 'rgba(26, 26, 26, 0.95)';
    ctx.strokeStyle = '#2A2A2A';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bx, by, boxW, boxH, 6);
    } else {
      ctx.rect(bx, by, boxW, boxH);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FAFAFA';
    ctx.textAlign = 'left';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i] ?? '', bx + padding, by + padding + 12 + i * 16);
    }
  }

  // ─── Interaction ───

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
      const r = n.status === 'COMPLETED' ? 16 : 12;
      const dx = wx - n.x;
      const dy = wy - n.y;
      if (dx * dx + dy * dy < r * r) return n;
    }
    return null;
  }

  onMouseDown(event: MouseEvent): void {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);

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
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);

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

  onMouseUp(_event: MouseEvent): void {
    if (this.dragNode) {
      this.dragNode.fx = null;
      this.dragNode.fy = null;
      this.simulation.alphaTarget(0);
      this.dragNode = null;
    }
    this.isDragging = false;
  }

  onDoubleClick(event: MouseEvent): void {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);

    const hit = this.hitTest(wx, wy);
    if (hit) {
      this.noteActivated.emit({ noteId: hit.noteId, conceptId: hit.id });
    }
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;

    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, this.transform.scale * factor));

    // Zoom toward mouse position
    this.transform.x = mx - (mx - this.transform.x) * (newScale / this.transform.scale);
    this.transform.y = my - (my - this.transform.y) * (newScale / this.transform.scale);
    this.transform.scale = newScale;
  }

  // ─── Controls ───

  zoomIn(): void {
    this.transform.scale = Math.min(5, this.transform.scale * 1.2);
  }

  zoomOut(): void {
    this.transform.scale = Math.max(0.1, this.transform.scale / 1.2);
  }

  fitToView(): void {
    if (this.nodes.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of this.nodes) {
      if (n.x == null || n.y == null) continue;
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    }
    const padding = 40;
    const graphW = maxX - minX + padding * 2;
    const graphH = maxY - minY + padding * 2;
    const scale = Math.min(this.width / graphW, this.height / graphH, 2);
    this.transform.scale = scale;
    this.transform.x = (this.width - graphW * scale) / 2 - minX * scale + padding * scale;
    this.transform.y = (this.height - graphH * scale) / 2 - minY * scale + padding * scale;
  }

  // ─── Resize ───

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

  // ─── Utils ───

  private edgeKey(e: GraphEdge): string {
    const s = typeof e.source === 'string' ? e.source : e.source.id;
    const t = typeof e.target === 'string' ? e.target : e.target.id;
    return `${s}:${t}:${e.type}`;
  }
}
