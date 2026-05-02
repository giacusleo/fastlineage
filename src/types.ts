export type NodeKind =
  | 'model'
  | 'source'
  | 'seed'
  | 'snapshot'
  | 'analysis'
  | 'exposure'
  | 'semantic_model'
  | 'metric'
  | 'saved_query'
  | 'overflow';

export type LineageNodeId = `${NodeKind}:${string}`;
export type LineageDirection = 'upstream' | 'downstream';
export type RefreshStage = 'idle' | 'active-project' | 'workspace';
export type DeprecationStatus = 'upcoming' | 'deprecated';

export type LineageNode = {
  id: LineageNodeId;
  kind: NodeKind;
  label: string;
  name?: string;
  filePath?: string;
  materialization?: string;
  deprecation?: {
    date: string;
    status: DeprecationStatus;
  };
  tags?: string[];
  canExpandUpstream?: boolean;
  canExpandDownstream?: boolean;
  canCollapseUpstream?: boolean;
  canCollapseDownstream?: boolean;
  expandUpstreamCount?: number;
  expandDownstreamCount?: number;
  hidden?: boolean;
  overflow?: {
    ownerId: LineageNodeId;
    direction: LineageDirection;
    hiddenCount: number;
    revealCount: number;
  };
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
  analyses: number;
  exposures: number;
  semanticModels: number;
  metrics: number;
  savedQueries: number;
  edges: number;
};

export type WebviewState = {
  refreshedAtMs: number | null;
  durationMs: number;
  workspaceName: string;
  dbtRootHint: string | null;
  refresh: {
    stage: RefreshStage;
    isRefreshing: boolean;
  };
  graphStats: GraphStats;
  focus: FocusPayload;
  subgraph: {
    nodes: LineageNode[];
    edges: LineageEdge[];
  };
  dirtySinceRefresh: boolean;
};
