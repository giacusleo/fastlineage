export type NodeKind = 'model' | 'source' | 'seed' | 'snapshot';

export type LineageNodeId = `${NodeKind}:${string}`;

export type LineageNode = {
  id: LineageNodeId;
  kind: NodeKind;
  label: string;
  filePath?: string;
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
  depth: number;
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
