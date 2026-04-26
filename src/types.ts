export type NodeKind = 'model' | 'source' | 'seed' | 'snapshot';

export type LineageNodeId = `${NodeKind}:${string}`;
export type LineageDirection = 'upstream' | 'downstream';

export type LineageNode = {
  id: LineageNodeId;
  kind: NodeKind;
  label: string;
  filePath?: string;
  canExpandUpstream?: boolean;
  canExpandDownstream?: boolean;
};

export type LineageEdge = {
  from: LineageNodeId;
  to: LineageNodeId;
};

export type LineageGraph = {
  nodes: Map<LineageNodeId, LineageNode>;
  edges: LineageEdge[];
  deps: Map<LineageNodeId, Set<LineageNodeId>>;
  rdeps: Map<LineageNodeId, Set<LineageNodeId>>;
};

export type FocusPayload = {
  focusId: LineageNodeId | null;
  selectedId: LineageNodeId | null;
  upstreamDepth: number;
  downstreamDepth: number;
};

export type GraphStats = {
  models: number;
  sources: number;
  seeds: number;
  snapshots: number;
  edges: number;
};

export type WebviewState = {
  refreshedAtMs: number | null;
  durationMs: number;
  workspaceName: string;
  dbtRootHint: string | null;
  graphStats: GraphStats;
  focus: FocusPayload;
  subgraph: {
    nodes: LineageNode[];
    edges: LineageEdge[];
  };
  dirtySinceRefresh: boolean;
};
