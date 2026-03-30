import { Injectable, inject, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Subject } from 'rxjs';
import { ChatWebsocketService } from '../chat/services/chat-websocket.service';

export interface GraphNode {
  id: string;
  name: string;
  category: string;
  status: string; // PENDING | IN_PROGRESS | COMPLETED
  personaType: string;
  aiScore: number | null;
  noteId: string;
  // d3-force simulation fields
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  // computed
  connectionCount?: number;
  // animation flags
  isNew?: boolean;
  isPulsing?: boolean;
}

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string; // PREREQUISITE | RELATED | ADVANCED
  isNew?: boolean;
}

export interface ActiveAgent {
  agentType: string;
  conceptId: string;
  personaType: string;
  status: string;
}

export const OPENCLAW_NODE_ID = '__openclaw__';

export const PERSONA_COLORS: Record<string, string> = {
  CFO: '#10B981',
  CMO: '#F59E0B',
  CTO: '#6366F1',
  OPERATIONS: '#EF4444',
  LEGAL: '#8B5CF6',
  CREATIVE: '#EC4899',
  CSO: '#14B8A6',
  SALES: '#F97316',
};

@Injectable({ providedIn: 'root' })
export class GraphStateService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly wsService = inject(ChatWebsocketService);

  private readonly _nodes = new BehaviorSubject<Map<string, GraphNode>>(new Map());
  private readonly _edges = new BehaviorSubject<Map<string, GraphEdge>>(new Map());
  private readonly _activeAgents = new BehaviorSubject<ActiveAgent[]>([]);
  private readonly _graphUpdated = new Subject<{ type: string; id?: string }>();

  readonly nodes$ = this._nodes.asObservable();
  readonly edges$ = this._edges.asObservable();
  readonly activeAgents$ = this._activeAgents.asObservable();
  readonly graphUpdated$ = this._graphUpdated.asObservable();

  private unsubFns: Array<() => void> = [];
  private loaded = false;

  loadGraph(stage?: string): void {
    const params = stage ? `?stage=${stage}` : '';
    this.http.get<{ data: {
      nodes: Array<Omit<GraphNode, 'x' | 'y' | 'vx' | 'vy' | 'fx' | 'fy' | 'isNew' | 'isPulsing' | 'connectionCount'>>;
      edges: Array<{ source: string; target: string; type: string }>;
      activeAgents: ActiveAgent[];
    } }>(`/api/v1/maturity/graph${params}`).subscribe({
      next: (res) => {
        // Count connections per node
        const connCount = new Map<string, number>();
        for (const e of res.data.edges) {
          connCount.set(e.source, (connCount.get(e.source) ?? 0) + 1);
          connCount.set(e.target, (connCount.get(e.target) ?? 0) + 1);
        }

        const nodeMap = new Map<string, GraphNode>();
        for (const n of res.data.nodes) {
          nodeMap.set(n.id, { ...n, connectionCount: connCount.get(n.id) ?? 0, isNew: !this.loaded });
        }

        // Find root node (most connections) for orphan linking
        let rootId = '';
        let maxConn = 0;
        for (const [id, count] of connCount) {
          if (count > maxConn) { maxConn = count; rootId = id; }
        }

        const edgeMap = new Map<string, GraphEdge>();
        for (const e of res.data.edges) {
          const key = `${e.source}:${e.target}:${e.type}`;
          edgeMap.set(key, { ...e, isNew: !this.loaded });
        }

        // Connect orphan nodes (0 connections) to root node
        if (rootId) {
          for (const [id, node] of nodeMap) {
            if ((node.connectionCount ?? 0) === 0 && id !== rootId) {
              const key = `${rootId}:${id}:RELATED`;
              if (!edgeMap.has(key)) {
                edgeMap.set(key, { source: rootId, target: id, type: 'RELATED', isNew: !this.loaded });
                node.connectionCount = 1;
                const rootNode = nodeMap.get(rootId);
                if (rootNode) rootNode.connectionCount = (rootNode.connectionCount ?? 0) + 1;
              }
            }
          }
        }

        // Inject OpenClaw hub node — always present, connected to all concepts
        const openClawNode: GraphNode = {
          id: OPENCLAW_NODE_ID,
          name: 'AI Agent',
          category: 'AI',
          status: 'PENDING',
          personaType: 'OPENCLAW',
          aiScore: null,
          noteId: '',
          connectionCount: nodeMap.size,
          isNew: !this.loaded,
        };
        nodeMap.set(OPENCLAW_NODE_ID, openClawNode);

        // Connect OpenClaw to every concept node (invisible edges for physics layout)
        for (const [id] of nodeMap) {
          if (id === OPENCLAW_NODE_ID) continue;
          const key = `${OPENCLAW_NODE_ID}:${id}:OPENCLAW`;
          edgeMap.set(key, { source: OPENCLAW_NODE_ID, target: id, type: 'OPENCLAW', isNew: !this.loaded });
        }

        this._nodes.next(nodeMap);
        this._edges.next(edgeMap);
        this._activeAgents.next(res.data.activeAgents);
        this._graphUpdated.next({ type: 'full-load' });
        this.loaded = true;
      },
      error: () => { /* silent — graph is non-critical */ },
    });
  }

  subscribeToEvents(): void {
    // Agent concept activity (start/stop working on concept)
    this.unsubFns.push(
      this.wsService.onAgentConceptActivity?.((data: { agentType: string; conceptId: string; status: string }) => {
        const agents = [...this._activeAgents.value];
        if (data.status === 'started') {
          // Find persona from node
          const node = this._nodes.value.get(data.conceptId);
          agents.push({
            agentType: data.agentType,
            conceptId: data.conceptId,
            personaType: node?.personaType ?? '',
            status: 'EXECUTING',
          });
          // Mark node as pulsing
          if (node) {
            node.isPulsing = true;
            this._nodes.next(new Map(this._nodes.value));
          }
        } else {
          // Remove agent from active list
          const idx = agents.findIndex(
            (a) => a.agentType === data.agentType && a.conceptId === data.conceptId
          );
          if (idx >= 0) agents.splice(idx, 1);
          // Stop pulsing if no more agents on this concept
          const stillActive = agents.some((a) => a.conceptId === data.conceptId);
          if (!stillActive) {
            const node = this._nodes.value.get(data.conceptId);
            if (node) {
              node.isPulsing = false;
              this._nodes.next(new Map(this._nodes.value));
            }
          }
        }
        this._activeAgents.next(agents);
        this._graphUpdated.next({ type: 'agent-activity', id: data.conceptId });
      }) ?? (() => { /* noop */ })
    );

    // Execution progress — update node status
    this.unsubFns.push(
      this.wsService.onExecutionProgress?.((data: any) => {
        if (data.current?.conceptId) {
          const node = this._nodes.value.get(data.current.conceptId);
          if (node) {
            node.status = 'IN_PROGRESS';
            node.isPulsing = true;
            this._nodes.next(new Map(this._nodes.value));
            this._graphUpdated.next({ type: 'node-update', id: data.current.conceptId });
          }
        }
      }) ?? (() => { /* noop */ })
    );

    // Execution complete — stop all animations, reload
    this.unsubFns.push(
      this.wsService.onExecutionComplete?.(() => {
        // Stop all pulsing
        const nodes = this._nodes.value;
        for (const node of nodes.values()) {
          node.isPulsing = false;
        }
        this._nodes.next(new Map(nodes));
        this._activeAgents.next([]);
        // Reload to get final states
        this.loadGraph();
      }) ?? (() => { /* noop */ })
    );

    // Bridge events — reload graph when tree structure changes
    this.unsubFns.push(
      this.wsService.onBridgeTreeUpdated(() => {
        this.loadGraph();
      })
    );
    this.unsubFns.push(
      this.wsService.onBridgeTaskComplete(() => {
        this.loadGraph();
      })
    );
    this.unsubFns.push(
      this.wsService.onBridgeTaskCreated(() => {
        this.loadGraph();
      })
    );
  }

  addNode(node: GraphNode): void {
    const nodes = this._nodes.value;
    if (!nodes.has(node.id)) {
      node.isNew = true;
      nodes.set(node.id, node);
      this._nodes.next(new Map(nodes));
      this._graphUpdated.next({ type: 'node-added', id: node.id });
    }
  }

  addEdge(edge: GraphEdge): void {
    const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
    const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
    const key = `${sourceId}:${targetId}:${edge.type}`;
    const edges = this._edges.value;
    if (!edges.has(key)) {
      edge.isNew = true;
      edges.set(key, edge);
      this._edges.next(new Map(edges));
      this._graphUpdated.next({ type: 'edge-added', id: key });
    }
  }

  getPersonaColor(personaType: string): string {
    return PERSONA_COLORS[personaType] ?? '#6B7280';
  }

  ngOnDestroy(): void {
    for (const unsub of this.unsubFns) {
      try { unsub(); } catch { /* */ }
    }
  }
}
