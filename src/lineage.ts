import * as path from 'path';
import * as vscode from 'vscode';
import { parseDbtRefs } from './parser';
import { LineageDirection, LineageEdge, LineageGraph, LineageNode, LineageNodeId, NodeKind } from './types';

const TEXT_DECODER = new TextDecoder('utf-8');
const EXCLUDE_GLOB = '**/{target,dbt_packages,node_modules}/**';

type RelationInfo = {
  kind: NodeKind;
  filePath?: string;
  materialization?: string;
  tags?: string[];
};

type RelationMetadata = {
  materialization?: string;
  tags?: string[];
};

export type NodeExpansion = {
  upstream: number;
  downstream: number;
};

function nodeId(kind: NodeKind, name: string): LineageNodeId {
  return `${kind}:${name}` as const;
}

function addToMapSet<K, V>(map: Map<K, Set<V>>, key: K, value: V) {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
}

function fallbackMaterialization(kind: NodeKind, relation: string): string {
  if (kind === 'source') return 'source';
  if (kind === 'seed') return 'seed';
  if (kind === 'snapshot') return 'snapshot';
  if (relation.startsWith('stg_')) return 'view';
  if (relation.startsWith('int_') && relation.endsWith('_hub')) return 'incremental';
  if (relation.startsWith('int_')) return 'table';
  if (relation.startsWith('mart_')) return 'view';
  return 'table';
}

function parseYamlList(text: string, key: string): string[] {
  const lines = text.split(/\r?\n/);
  const values: string[] = [];
  let collecting = false;
  let baseIndent = 0;

  for (const line of lines) {
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.trim();

    if (!collecting) {
      if (trimmed === `${key}:`) {
        collecting = true;
        baseIndent = indent;
      }
      continue;
    }

    if (!trimmed) continue;
    if (indent <= baseIndent) break;

    const item = trimmed.match(/^-\s+(.+)$/);
    if (!item) break;
    values.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
  }

  return values;
}

function parseRelationMetadata(text: string, kind: NodeKind, relation: string): RelationMetadata {
  const materializedMatch = text.match(/^\s*materialized:\s*([A-Za-z0-9_-]+)/m);
  return {
    materialization: materializedMatch?.[1] ?? fallbackMaterialization(kind, relation),
    tags: parseYamlList(text, 'tags')
  };
}

async function readRelationMetadata(filePath: string, kind: NodeKind): Promise<RelationMetadata> {
  if (kind === 'source') {
    return { materialization: 'source', tags: [] };
  }

  const relation = relationNameFromPath(filePath);
  const sidecarUri = vscode.Uri.file(path.join(path.dirname(filePath), `${relation}.yml`));
  try {
    const text = await readWorkspaceText(sidecarUri);
    return parseRelationMetadata(text, kind, relation);
  } catch {
    return { materialization: fallbackMaterialization(kind, relation), tags: [] };
  }
}

export function relationNameFromPath(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

export function modelNameFromPath(filePath: string): string {
  return relationNameFromPath(filePath);
}

export function nodeKindFromPath(filePath: string): NodeKind {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('/snapshots/')) return 'snapshot';
  if (normalized.includes('/seeds/')) return 'seed';
  return 'model';
}

export type BuildResult = {
  graph: LineageGraph;
  refreshedAtMs: number;
  durationMs: number;
  dbtRootHint: string | null;
};

export async function findDbtRoot(): Promise<vscode.Uri | null> {
  const matches = await vscode.workspace.findFiles('**/dbt_project.yml', EXCLUDE_GLOB, 10);
  if (matches.length === 0) return null;
  return matches[0];
}

async function readWorkspaceText(uri: vscode.Uri): Promise<string> {
  const openDoc = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
  if (openDoc) return openDoc.getText();
  const bytes = await vscode.workspace.fs.readFile(uri);
  return TEXT_DECODER.decode(bytes);
}

function sortUris(uris: readonly vscode.Uri[]) {
  return [...uris].sort((a, b) => a.fsPath.localeCompare(b.fsPath));
}

export async function buildGraphFromWorkspace(): Promise<BuildResult> {
  const startedAt = Date.now();
  const dbtProject = await findDbtRoot();
  const dbtRoot = dbtProject ? vscode.Uri.file(path.dirname(dbtProject.fsPath)) : null;

  const modelPattern = dbtRoot ? new vscode.RelativePattern(dbtRoot, 'models/**/*.sql') : 'models/**/*.sql';
  const snapshotPattern = dbtRoot ? new vscode.RelativePattern(dbtRoot, 'snapshots/**/*.sql') : 'snapshots/**/*.sql';
  const seedPattern = dbtRoot ? new vscode.RelativePattern(dbtRoot, 'seeds/**/*.{csv,tsv}') : 'seeds/**/*.{csv,tsv}';

  const [modelFiles, snapshotFiles, seedFiles] = await Promise.all([
    vscode.workspace.findFiles(modelPattern, EXCLUDE_GLOB),
    vscode.workspace.findFiles(snapshotPattern, EXCLUDE_GLOB),
    vscode.workspace.findFiles(seedPattern, EXCLUDE_GLOB)
  ]);

  const sqlFiles = [...sortUris(modelFiles), ...sortUris(snapshotFiles)];
  const nodes = new Map<LineageNodeId, LineageNode>();
  const edges: LineageEdge[] = [];
  const deps = new Map<LineageNodeId, Set<LineageNodeId>>();
  const rdeps = new Map<LineageNodeId, Set<LineageNodeId>>();
  const relations = new Map<string, RelationInfo>();

  function upsertNode(id: LineageNodeId, kind: NodeKind, label: string, filePath?: string, metadata: RelationMetadata = {}) {
    const existing = nodes.get(id);
    if (existing) {
      if (filePath && !existing.filePath) existing.filePath = filePath;
      if (metadata.materialization && !existing.materialization) existing.materialization = metadata.materialization;
      if (metadata.tags?.length && !existing.tags?.length) existing.tags = [...metadata.tags];
      return;
    }
    nodes.set(id, {
      id,
      kind,
      label,
      filePath,
      materialization: metadata.materialization ?? fallbackMaterialization(kind, label),
      tags: metadata.tags?.length ? [...metadata.tags] : []
    });
  }

  function registerRelation(name: string, kind: NodeKind, filePath?: string, metadata: RelationMetadata = {}) {
    const existing = relations.get(name);
    relations.set(name, {
      kind: existing?.kind ?? kind,
      filePath: existing?.filePath ?? filePath,
      materialization: existing?.materialization ?? metadata.materialization,
      tags: existing?.tags?.length ? existing.tags : metadata.tags
    });
    upsertNode(nodeId(kind, name), kind, name, filePath, metadata);
  }

  const metadataByPath = new Map<string, RelationMetadata>(
    await Promise.all(
      [...modelFiles, ...snapshotFiles, ...seedFiles].map(async (uri) => [uri.fsPath, await readRelationMetadata(uri.fsPath, nodeKindFromPath(uri.fsPath))] as const)
    )
  );

  for (const uri of modelFiles) {
    registerRelation(relationNameFromPath(uri.fsPath), 'model', uri.fsPath, metadataByPath.get(uri.fsPath));
  }
  for (const uri of snapshotFiles) {
    registerRelation(relationNameFromPath(uri.fsPath), 'snapshot', uri.fsPath, metadataByPath.get(uri.fsPath));
  }
  for (const uri of seedFiles) {
    registerRelation(relationNameFromPath(uri.fsPath), 'seed', uri.fsPath, metadataByPath.get(uri.fsPath));
  }

  const parsedFiles = await Promise.all(
    sqlFiles.map(async (uri) => {
      const filePath = uri.fsPath;
      const relation = relationNameFromPath(filePath);
      const kind = nodeKindFromPath(filePath);
      const fromId = nodeId(kind, relation);
      let text = '';
      try {
        text = await readWorkspaceText(uri);
      } catch {
        return null;
      }
      return { fromId, parsed: parseDbtRefs(text) };
    })
  );

  for (const file of parsedFiles) {
    if (!file) continue;
    for (const ref of file.parsed.refs) {
      const target = relations.get(ref.model) ?? {
        kind: 'model' as NodeKind,
        materialization: fallbackMaterialization('model', ref.model),
        tags: []
      };
      const toId = nodeId(target.kind, ref.model);
      upsertNode(toId, target.kind, ref.model, target.filePath, target);
      edges.push({ from: file.fromId, to: toId });
      addToMapSet(deps, file.fromId, toId);
      addToMapSet(rdeps, toId, file.fromId);
    }

    for (const source of file.parsed.sources) {
      const label = `${source.source}.${source.table}`;
      const toId = nodeId('source', label);
      upsertNode(toId, 'source', label, undefined, { materialization: 'source', tags: [source.source] });
      edges.push({ from: file.fromId, to: toId });
      addToMapSet(deps, file.fromId, toId);
      addToMapSet(rdeps, toId, file.fromId);
    }
  }

  return {
    graph: { nodes, edges, deps, rdeps },
    refreshedAtMs: Date.now(),
    durationMs: Date.now() - startedAt,
    dbtRootHint: dbtRoot?.fsPath ?? null
  };
}

function walkDirection(graph: LineageGraph, start: LineageNodeId, direction: LineageDirection, depth: number, keep: Set<LineageNodeId>) {
  if (depth <= 0) return;
  const adjacency = direction === 'upstream' ? graph.deps : graph.rdeps;
  const queue: { id: LineageNodeId; d: number }[] = [{ id: start, d: 0 }];
  const seen = new Map<LineageNodeId, number>([[start, 0]]);

  while (queue.length) {
    const current = queue.shift();
    if (!current || current.d >= depth) continue;
    for (const next of adjacency.get(current.id) || []) {
      const nextDepth = current.d + 1;
      const seenDepth = seen.get(next);
      if (seenDepth !== undefined && seenDepth <= nextDepth) continue;
      seen.set(next, nextDepth);
      keep.add(next);
      queue.push({ id: next, d: nextDepth });
    }
  }
}

export function computeSubgraph(
  graph: LineageGraph,
  focus: LineageNodeId | null,
  upstreamDepth: number,
  downstreamDepth: number,
  expansions: Map<LineageNodeId, NodeExpansion> = new Map()
) {
  if (!focus || !graph.nodes.has(focus)) {
    return { nodes: [] as LineageNode[], edges: [] as LineageEdge[] };
  }

  const keep = new Set<LineageNodeId>([focus]);
  walkDirection(graph, focus, 'upstream', upstreamDepth, keep);
  walkDirection(graph, focus, 'downstream', downstreamDepth, keep);

  let changed = true;
  while (changed) {
    changed = false;
    for (const [origin, expansion] of expansions) {
      if (!keep.has(origin)) continue;
      const before = keep.size;
      walkDirection(graph, origin, 'upstream', expansion.upstream, keep);
      walkDirection(graph, origin, 'downstream', expansion.downstream, keep);
      if (keep.size !== before) changed = true;
    }
  }

  const nodes = Array.from(keep)
    .map((id) => {
      const node = graph.nodes.get(id);
      if (!node) return null;
      const canExpandUpstream = Array.from(graph.deps.get(id) || []).some((dep) => !keep.has(dep));
      const canExpandDownstream = Array.from(graph.rdeps.get(id) || []).some((dep) => !keep.has(dep));
      const viewNode: LineageNode = { ...node, canExpandUpstream, canExpandDownstream };
      return viewNode;
    })
    .filter((node): node is LineageNode => !!node);

  const keptEdges = graph.edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to));
  return { nodes, edges: keptEdges };
}
