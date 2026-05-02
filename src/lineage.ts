import * as path from 'path';
import * as vscode from 'vscode';
import {
  DbtProjectConfig,
  EXCLUDE_GLOB,
  fallbackMaterialization,
  findFilesInProjectPaths,
  lineageNodeId,
  readDbtProjectConfig,
  readProjectMetadata,
  readWorkspaceText,
  relationNameFromPath,
  RelationMetadata,
  ProjectMetadata,
  sortUris
} from './dbt';
import {
  MacroDependencyRules,
  mergeMacroDependencyRules,
  parseDbtConfigMaterialization,
  parseDbtRefs,
  parseMacroDependencyRules
} from './parser';
import { DeprecationStatus, GraphStats, LineageDirection, LineageEdge, LineageGraph, LineageNode, LineageNodeId, NodeKind } from './types';

type RelationInfo = {
  kind: NodeKind;
  label: string;
  name?: string;
  filePath?: string;
  materialization?: string;
  deprecationDate?: string;
  tags?: string[];
};

type ProjectGraphContext = {
  project: DbtProjectConfig;
  metadata: ProjectMetadata;
  modelFiles: vscode.Uri[];
  snapshotFiles: vscode.Uri[];
  seedFiles: vscode.Uri[];
  analysisFiles: vscode.Uri[];
  macroRules: MacroDependencyRules;
  packageNames: string[];
};

export type NodeExpansion = {
  upstream: number;
  downstream: number;
  upstreamLimit?: number;
  downstreamLimit?: number;
};

export const EXPANSION_VISIBLE_LIMIT = 9;

function addToMapSet<K, V>(map: Map<K, Set<V>>, key: K, value: V) {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
}

function parseDeprecationDateMs(value: string): number | null {
  const trimmed = value.trim();
  const dateOnly = trimmed.match(/^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/);
  if (dateOnly?.groups) {
    const date = new Date(Number(dateOnly.groups.year), Number(dateOnly.groups.month) - 1, Number(dateOnly.groups.day));
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }

  const dateTime = trimmed.match(
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})[ T](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<millisecond>\d+))?(?<offset>Z|[+-]\d{2}:\d{2})?$/
  );
  if (!dateTime?.groups) return null;

  const millisecond = Number((dateTime.groups.millisecond ?? '0').padEnd(3, '0').slice(0, 3));
  if (!dateTime.groups.offset) {
    const localDate = new Date(
      Number(dateTime.groups.year),
      Number(dateTime.groups.month) - 1,
      Number(dateTime.groups.day),
      Number(dateTime.groups.hour),
      Number(dateTime.groups.minute),
      Number(dateTime.groups.second),
      millisecond
    );
    return Number.isNaN(localDate.getTime()) ? null : localDate.getTime();
  }

  const isoDate = `${dateTime.groups.year}-${dateTime.groups.month}-${dateTime.groups.day}T${dateTime.groups.hour}:${dateTime.groups.minute}:${dateTime.groups.second}.${String(millisecond).padStart(3, '0')}${dateTime.groups.offset}`;
  const offsetDate = new Date(isoDate);
  return Number.isNaN(offsetDate.getTime()) ? null : offsetDate.getTime();
}

function deprecationStatus(value: string, nowMs = Date.now()): DeprecationStatus | null {
  const dateMs = parseDeprecationDateMs(value);
  if (dateMs === null) return null;
  return dateMs > nowMs ? 'upcoming' : 'deprecated';
}

function nodeDeprecation(metadata: RelationMetadata) {
  if (!metadata.deprecationDate) return undefined;
  const status = deprecationStatus(metadata.deprecationDate);
  return status ? { date: metadata.deprecationDate, status } : undefined;
}

export type BuildResult = {
  graph: LineageGraph;
  refreshedAtMs: number;
  durationMs: number;
  dbtRootHint: string | null;
  project: DbtProjectConfig | null;
};

export type BuildScope = 'primary' | 'workspace';

export type BuildOptions = {
  scope?: BuildScope;
};

export async function findDbtRoot(preferredFilePath?: string): Promise<vscode.Uri | null> {
  const nearestRoot = await findNearestDbtRoot(preferredFilePath);
  if (nearestRoot) return nearestRoot;

  const matches = await vscode.workspace.findFiles('**/dbt_project.yml', EXCLUDE_GLOB);
  return sortUris(matches)[0] ?? null;
}

async function findDbtRoots(preferredFilePath?: string): Promise<vscode.Uri[]> {
  const nearestRoot = await findNearestDbtRoot(preferredFilePath);
  const matches = sortUris(await vscode.workspace.findFiles('**/dbt_project.yml', EXCLUDE_GLOB));
  if (!nearestRoot) return matches;

  const seen = new Set<string>([nearestRoot.fsPath]);
  return [nearestRoot, ...matches.filter((uri) => !seen.has(uri.fsPath))];
}

async function findPrimaryDbtRoots(preferredFilePath?: string): Promise<vscode.Uri[]> {
  const root = await findDbtRoot(preferredFilePath);
  return root ? [root] : [];
}

async function findNearestDbtRoot(preferredFilePath?: string): Promise<vscode.Uri | null> {
  if (!preferredFilePath) return null;

  let current = path.dirname(preferredFilePath);
  while (true) {
    const candidate = vscode.Uri.file(path.join(current, 'dbt_project.yml'));
    try {
      await vscode.workspace.fs.stat(candidate);
      return candidate;
    } catch {
      // Keep walking upward until we leave the filesystem root.
    }

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export async function buildGraphFromWorkspace(preferredFilePath?: string, options: BuildOptions = {}): Promise<BuildResult> {
  const startedAt = Date.now();
  const dbtProjects =
    options.scope === 'primary' ? await findPrimaryDbtRoots(preferredFilePath) : await findDbtRoots(preferredFilePath);
  const contexts = await readProjectGraphContexts(dbtProjects);
  const primaryContext = contexts[0] ?? null;
  const project = primaryContext?.project ?? null;
  const dbtRoot = project ? vscode.Uri.file(project.rootPath) : null;
  const projectByName = new Map(contexts.map((context) => [context.project.name, context]).filter((entry): entry is [string, ProjectGraphContext] => Boolean(entry[0])));
  const primaryProjectName = primaryContext?.project.name ?? null;
  const usingProjectContexts = contexts.length > 0;

  const fallbackMetadata: ProjectMetadata = {
    relations: new Map<LineageNodeId, RelationMetadata>(),
    sources: new Map<string, RelationMetadata>(),
    relationAliases: new Map<string, { targetName: string; preferFilePath?: boolean }>(),
    versionedRefs: new Map<string, Map<string, string>>(),
    semanticModels: new Map(),
    measureSemanticModels: new Map(),
    metrics: new Map(),
    savedQueries: new Map(),
    exposures: new Map()
  };
  const fallbackContext: ProjectGraphContext | null = usingProjectContexts
    ? null
    : {
        project: {
          rootPath: '',
          name: null,
          modelPaths: ['models'],
          seedPaths: ['seeds'],
          snapshotPaths: ['snapshots'],
          analysisPaths: ['analyses'],
          macroPaths: ['macros'],
          packageInstallPath: 'dbt_packages'
        },
        metadata: fallbackMetadata,
        modelFiles: sortUris(await vscode.workspace.findFiles('models/**/*.sql', EXCLUDE_GLOB)),
        snapshotFiles: sortUris(await vscode.workspace.findFiles('snapshots/**/*.sql', EXCLUDE_GLOB)),
        seedFiles: sortUris(await vscode.workspace.findFiles('seeds/**/*.{csv,tsv}', EXCLUDE_GLOB)),
        analysisFiles: sortUris(await vscode.workspace.findFiles('analyses/**/*.sql', EXCLUDE_GLOB)),
        macroRules: await readMacroDependencyRules(null),
        packageNames: []
      };
  const graphContexts = contexts.length ? contexts : fallbackContext ? [fallbackContext] : [];
  const nodes = new Map<LineageNodeId, LineageNode>();
  const edges: LineageEdge[] = [];
  const edgeKeys = new Set<string>();
  const deps = new Map<LineageNodeId, Set<LineageNodeId>>();
  const rdeps = new Map<LineageNodeId, Set<LineageNodeId>>();
  const relations = new Map<string, RelationInfo>();

  function relationKey(context: ProjectGraphContext | null, name: string): string {
    const namePrefix = context?.project.name;
    return namePrefix ? `${namePrefix}.${name}` : name;
  }

  function nodeId(kind: NodeKind, context: ProjectGraphContext | null, name: string): LineageNodeId {
    return lineageNodeId(kind, relationKey(context, name));
  }

  function displayLabel(context: ProjectGraphContext | null, name: string): string {
    const namePrefix = context?.project.name;
    if (!namePrefix || namePrefix === primaryProjectName) return name;
    return `${namePrefix}.${name}`;
  }

  function upsertNode(
    id: LineageNodeId,
    kind: NodeKind,
    label: string,
    filePath?: string,
    metadata: RelationMetadata = {},
    options: { preferFilePath?: boolean; name?: string } = {}
  ) {
    const existing = nodes.get(id);
    if (existing) {
      if (options.name && !existing.name) existing.name = options.name;
      if (filePath && (options.preferFilePath || !existing.filePath)) existing.filePath = filePath;
      if (metadata.materialization && !existing.materialization) existing.materialization = metadata.materialization;
      if (metadata.deprecationDate) existing.deprecation = nodeDeprecation(metadata);
      if (metadata.tags?.length && !existing.tags?.length) existing.tags = [...metadata.tags];
      return;
    }
    nodes.set(id, {
      id,
      kind,
      label,
      name: options.name ?? label,
      filePath,
      materialization: metadata.materialization ?? fallbackMaterialization(kind),
      deprecation: nodeDeprecation(metadata),
      tags: metadata.tags?.length ? [...metadata.tags] : []
    });
  }

  function registerRelation(
    name: string,
    kind: NodeKind,
    context: ProjectGraphContext | null,
    filePath?: string,
    metadata: RelationMetadata = {},
    options: { preferFilePath?: boolean } = {}
  ) {
    const key = relationKey(context, name);
    const existing = relations.get(key);
    const label = existing?.label ?? displayLabel(context, name);
    relations.set(key, {
      kind: existing?.kind ?? kind,
      label,
      name: existing?.name ?? name,
      filePath: options.preferFilePath ? (filePath ?? existing?.filePath) : (existing?.filePath ?? filePath),
      materialization: existing?.materialization ?? metadata.materialization,
      deprecationDate: existing?.deprecationDate ?? metadata.deprecationDate,
      tags: existing?.tags?.length ? existing.tags : metadata.tags
    });
    upsertNode(lineageNodeId(kind, key), kind, label, filePath, metadata, { ...options, name });
  }

  function resolveRelationName(context: ProjectGraphContext, name: string): string {
    return context.metadata.relationAliases.get(name)?.targetName ?? name;
  }

  function applyMaterialization(kind: NodeKind, context: ProjectGraphContext | null, name: string, materialization: string) {
    const key = relationKey(context, name);
    const node = nodes.get(lineageNodeId(kind, key));
    if (node) node.materialization = materialization;

    const relation = relations.get(key);
    if (relation) relation.materialization = materialization;
  }

  function resolveRefName(context: ProjectGraphContext | null, name: string, version?: string): string {
    if (version) return context?.metadata.versionedRefs.get(name)?.get(version) ?? `${name}.v${version}`;
    return name;
  }

  function addEdge(from: LineageNodeId, to: LineageNodeId) {
    const key = `${from}->${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to });
    addToMapSet(deps, from, to);
    addToMapSet(rdeps, to, from);
  }

  function refTargetForPackage(ref: { model: string; package: string; version?: string }) {
    const targetContext = projectByName.get(ref.package) ?? null;
    const modelName = resolveRefName(targetContext, ref.model, ref.version);
    const key = targetContext ? relationKey(targetContext, modelName) : `${ref.package}.${modelName}`;
    const fallbackLabel = targetContext ? displayLabel(targetContext, modelName) : `${ref.package}.${modelName}`;
    return { context: targetContext, modelName, key, fallbackLabel };
  }

  function refTargetForCurrentOrPackageDependency(
    fromContext: ProjectGraphContext | null,
    ref: { model: string; version?: string }
  ) {
    const candidates: (ProjectGraphContext | null)[] = [fromContext];
    for (const packageName of fromContext?.packageNames ?? []) {
      const packageContext = projectByName.get(packageName);
      if (packageContext && !candidates.includes(packageContext)) candidates.push(packageContext);
    }

    for (const context of candidates) {
      const modelName = resolveRefName(context, ref.model, ref.version);
      const key = relationKey(context, modelName);
      if (relations.has(key)) {
        return { context, modelName, key, fallbackLabel: displayLabel(context, modelName) };
      }
    }

    const modelName = resolveRefName(fromContext, ref.model, ref.version);
    return {
      context: fromContext,
      modelName,
      key: relationKey(fromContext, modelName),
      fallbackLabel: displayLabel(fromContext, modelName)
    };
  }

  function addRefDependency(fromContext: ProjectGraphContext | null, fromId: LineageNodeId, ref: { model: string; package?: string; version?: string }) {
    const resolvedTarget = ref.package
      ? refTargetForPackage({ model: ref.model, package: ref.package, version: ref.version })
      : refTargetForCurrentOrPackageDependency(fromContext, ref);
    const targetRelation: RelationInfo = relations.get(resolvedTarget.key) ?? {
      kind: 'model',
      label: resolvedTarget.fallbackLabel,
      name: resolvedTarget.modelName,
      materialization: fallbackMaterialization('model'),
      tags: ref.package ? [ref.package] : []
    };
    const toId = lineageNodeId(targetRelation.kind, resolvedTarget.key);
    upsertNode(toId, targetRelation.kind, targetRelation.label, targetRelation.filePath, targetRelation, {
      name: targetRelation.name ?? resolvedTarget.modelName
    });
    addEdge(fromId, toId);
  }

  function addSourceDependency(fromContext: ProjectGraphContext | null, fromId: LineageNodeId, source: { source: string; table: string }) {
    const sourceName = `${source.source}.${source.table}`;
    const key = relationKey(fromContext, sourceName);
    const label = displayLabel(fromContext, sourceName);
    const toId = lineageNodeId('source', key);
    const metadata = fromContext?.metadata.sources.get(sourceName);
    upsertNode(toId, 'source', label, undefined, {
      materialization: 'source',
      deprecationDate: metadata?.deprecationDate,
      tags: metadata?.tags?.length ? metadata.tags : [source.source],
      definitionPath: metadata?.definitionPath
    }, { name: sourceName });
    addEdge(fromId, toId);
  }

  function addMetricDependency(fromContext: ProjectGraphContext | null, fromId: LineageNodeId, metric: string) {
    const key = relationKey(fromContext, metric);
    const metadata = fromContext?.metadata.metrics.get(metric);
    upsertNode(lineageNodeId('metric', key), 'metric', displayLabel(fromContext, metric), metadata?.definitionPath, {
      materialization: fallbackMaterialization('metric'),
      tags: metadata?.tags
    }, { name: metric });
    addEdge(fromId, lineageNodeId('metric', key));
  }

  for (const context of graphContexts) {
    for (const uri of context.modelFiles) {
      const fileName = relationNameFromPath(uri.fsPath);
      const alias = context.metadata.relationAliases.get(fileName);
      const name = alias?.targetName ?? fileName;
      registerRelation(name, 'model', context, uri.fsPath, context.metadata.relations.get(lineageNodeId('model', name)), {
        preferFilePath: alias?.preferFilePath
      });
    }
    for (const uri of context.snapshotFiles) {
      const name = relationNameFromPath(uri.fsPath);
      registerRelation(name, 'snapshot', context, uri.fsPath, context.metadata.relations.get(lineageNodeId('snapshot', name)));
    }
    for (const uri of context.seedFiles) {
      const name = relationNameFromPath(uri.fsPath);
      registerRelation(name, 'seed', context, uri.fsPath, context.metadata.relations.get(lineageNodeId('seed', name)));
    }
    for (const uri of context.analysisFiles) {
      const name = relationNameFromPath(uri.fsPath);
      upsertNode(nodeId('analysis', context, name), 'analysis', displayLabel(context, name), uri.fsPath, {
        materialization: fallbackMaterialization('analysis')
      }, { name });
    }
    for (const [name, metadata] of context.metadata.semanticModels) {
      upsertNode(nodeId('semantic_model', context, name), 'semantic_model', displayLabel(context, name), metadata.definitionPath, metadata, { name });
    }
    for (const [name, metadata] of context.metadata.metrics) {
      upsertNode(nodeId('metric', context, name), 'metric', displayLabel(context, name), metadata.definitionPath, metadata, { name });
    }
    for (const [name, metadata] of context.metadata.savedQueries) {
      upsertNode(nodeId('saved_query', context, name), 'saved_query', displayLabel(context, name), metadata.definitionPath, metadata, { name });
    }
    for (const [name, metadata] of context.metadata.exposures) {
      upsertNode(nodeId('exposure', context, name), 'exposure', displayLabel(context, name), metadata.definitionPath, metadata, { name });
    }
  }

  const parsedFiles = await Promise.all(
    graphContexts.flatMap((context) => {
      const snapshotPathSet = new Set(context.snapshotFiles.map((uri) => uri.fsPath));
      const analysisPathSet = new Set(context.analysisFiles.map((uri) => uri.fsPath));
      const sqlFiles = [...sortUris(context.modelFiles), ...sortUris(context.snapshotFiles), ...sortUris(context.analysisFiles)];
      return sqlFiles.map(async (uri) => {
        const filePath = uri.fsPath;
        const kind: NodeKind = snapshotPathSet.has(filePath) ? 'snapshot' : analysisPathSet.has(filePath) ? 'analysis' : 'model';
        const relation = kind === 'model' ? resolveRelationName(context, relationNameFromPath(filePath)) : relationNameFromPath(filePath);
        const fromId = nodeId(kind, context, relation);
        let text = '';
        try {
          text = await readWorkspaceText(uri);
        } catch {
          return null;
        }
        const materialization = kind === 'model' ? parseDbtConfigMaterialization(text) : null;
        return { context, fromId, kind, relation, materialization, parsed: parseDbtRefs(text, context.macroRules) };
      });
    })
  );

  for (const file of parsedFiles) {
    if (!file) continue;
    if (file.materialization) applyMaterialization(file.kind, file.context, file.relation, file.materialization);

    for (const ref of file.parsed.refs) {
      addRefDependency(file.context, file.fromId, ref);
    }

    for (const source of file.parsed.sources) {
      addSourceDependency(file.context, file.fromId, source);
    }

    for (const metric of file.parsed.metrics) {
      addMetricDependency(file.context, file.fromId, metric);
    }
  }

  for (const context of graphContexts) {
    for (const [name, metadata] of context.metadata.semanticModels) {
      if (metadata.modelRef) addRefDependency(context, nodeId('semantic_model', context, name), metadata.modelRef);
      if (metadata.modelSource) addSourceDependency(context, nodeId('semantic_model', context, name), metadata.modelSource);
    }

    for (const [name, metadata] of context.metadata.metrics) {
      const metricId = nodeId('metric', context, name);
      if (metadata.measure) {
        const semanticModelName = context.metadata.measureSemanticModels.get(metadata.measure);
        if (semanticModelName) addEdge(metricId, nodeId('semantic_model', context, semanticModelName));
      }
      for (const inputMetric of metadata.inputMetrics) addMetricDependency(context, metricId, inputMetric);
    }

    for (const [name, metadata] of context.metadata.savedQueries) {
      const savedQueryId = nodeId('saved_query', context, name);
      for (const metric of metadata.metrics) addMetricDependency(context, savedQueryId, metric);
    }

    for (const [name, metadata] of context.metadata.exposures) {
      const exposureId = nodeId('exposure', context, name);
      for (const ref of metadata.refs) addRefDependency(context, exposureId, ref);
      for (const source of metadata.sources) addSourceDependency(context, exposureId, source);
      for (const metric of metadata.metrics) addMetricDependency(context, exposureId, metric);
    }
  }

  return {
    graph: { nodes, edges, deps, rdeps },
    refreshedAtMs: Date.now(),
    durationMs: Date.now() - startedAt,
    dbtRootHint: dbtRoot?.fsPath ?? null,
    project
  };
}

async function readMacroDependencyRules(project: DbtProjectConfig | null): Promise<MacroDependencyRules> {
  const macroFiles = project
    ? [...(await findPackageMacroFiles(project)), ...(await findFilesInProjectPaths(project, project.macroPaths, '**/*.sql'))]
    : [
        ...(await vscode.workspace.findFiles('dbt_packages/**/macros/**/*.sql', '**/{target,node_modules}/**')),
        ...(await vscode.workspace.findFiles('macros/**/*.sql', EXCLUDE_GLOB))
      ];

  const ruleSets = await Promise.all(
    macroFiles.map(async (uri) => {
      try {
        return parseMacroDependencyRules(await readWorkspaceText(uri));
      } catch {
        return new Map();
      }
    })
  );

  return mergeMacroDependencyRules(ruleSets);
}

async function readLocalPackageDependencyNames(project: DbtProjectConfig): Promise<string[]> {
  const packageFiles = ['packages.yml', 'dependencies.yml'];
  const packageNames: string[] = [];

  for (const packageFile of packageFiles) {
    let text = '';
    try {
      text = await readWorkspaceText(vscode.Uri.file(path.join(project.rootPath, packageFile)));
    } catch {
      continue;
    }

    for (const localPath of parseLocalPackagePaths(text)) {
      try {
        const packageProject = await readDbtProjectConfig(vscode.Uri.file(path.resolve(project.rootPath, localPath, 'dbt_project.yml')));
        if (packageProject.name) packageNames.push(packageProject.name);
      } catch {
        // Ignore package entries that are not checked out in this workspace.
      }
    }
  }

  return [...new Set(packageNames)];
}

function parseLocalPackagePaths(text: string): string[] {
  const paths: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = stripInlineYamlComment(line).trim();
    const match = trimmed.match(/^(?:-\s*)?local:\s*(?<path>.+)$/);
    const localPath = match?.groups?.path ? cleanInlineYamlScalar(match.groups.path) : null;
    if (localPath) paths.push(localPath);
  }
  return paths;
}

function stripInlineYamlComment(value: string): string {
  let quote: string | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === '"' || char === "'") && value[index - 1] !== '\\') {
      quote = quote === char ? null : quote ?? char;
      continue;
    }
    if (char === '#' && !quote) return value.slice(0, index);
  }
  return value;
}

function cleanInlineYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) return trimmed.slice(1, -1);
  return trimmed;
}

async function readProjectGraphContexts(dbtProjectUris: readonly vscode.Uri[]): Promise<ProjectGraphContext[]> {
  const contexts = await Promise.all(
    dbtProjectUris.map(async (uri) => {
      const project = await readDbtProjectConfig(uri);
      const [modelFiles, snapshotFiles, seedFiles, analysisFiles, metadata, macroRules, packageNames] = await Promise.all([
        findFilesInProjectPaths(project, project.modelPaths, '**/*.sql'),
        findFilesInProjectPaths(project, project.snapshotPaths, '**/*.sql'),
        findFilesInProjectPaths(project, project.seedPaths, '**/*.{csv,tsv}'),
        findFilesInProjectPaths(project, project.analysisPaths, '**/*.sql'),
        readProjectMetadata(project),
        readMacroDependencyRules(project),
        readLocalPackageDependencyNames(project)
      ]);

      return {
        project,
        metadata,
        modelFiles,
        snapshotFiles,
        seedFiles,
        analysisFiles,
        macroRules,
        packageNames
      };
    })
  );

  const seenNames = new Set<string>();
  return contexts.filter((context) => {
    if (!context.project.name) return true;
    if (seenNames.has(context.project.name)) return false;
    seenNames.add(context.project.name);
    return true;
  });
}

async function findPackageMacroFiles(project: DbtProjectConfig): Promise<vscode.Uri[]> {
  return sortUris(
    await vscode.workspace.findFiles(
      new vscode.RelativePattern(path.join(project.rootPath, project.packageInstallPath), '**/macros/**/*.sql'),
      '**/{target,node_modules}/**'
    )
  );
}

export function graphStats(graph: LineageGraph): GraphStats {
  const stats: GraphStats = {
    models: 0,
    sources: 0,
    seeds: 0,
    snapshots: 0,
    analyses: 0,
    exposures: 0,
    semanticModels: 0,
    metrics: 0,
    savedQueries: 0,
    edges: graph.edges.length
  };

  for (const node of graph.nodes.values()) {
    switch (node.kind) {
      case 'model':
        stats.models += 1;
        break;
      case 'source':
        stats.sources += 1;
        break;
      case 'seed':
        stats.seeds += 1;
        break;
      case 'snapshot':
        stats.snapshots += 1;
        break;
      case 'analysis':
        stats.analyses += 1;
        break;
      case 'exposure':
        stats.exposures += 1;
        break;
      case 'semantic_model':
        stats.semanticModels += 1;
        break;
      case 'metric':
        stats.metrics += 1;
        break;
      case 'saved_query':
        stats.savedQueries += 1;
        break;
    }
  }

  return stats;
}

function walkDirection(
  graph: LineageGraph,
  start: LineageNodeId,
  direction: LineageDirection,
  depth: number,
  keep: Set<LineageNodeId>,
  options: { includeSources?: boolean } = {}
) {
  if (depth <= 0) return;
  const adjacency = direction === 'upstream' ? graph.deps : graph.rdeps;
  const queue: { id: LineageNodeId; d: number }[] = [{ id: start, d: 0 }];
  const seen = new Map<LineageNodeId, number>([[start, 0]]);
  const includeSources = options.includeSources ?? true;

  while (queue.length) {
    const current = queue.shift();
    if (!current || current.d >= depth) continue;
    for (const next of adjacency.get(current.id) || []) {
      const nextNode = graph.nodes.get(next);
      if (!nextNode) continue;
      const nextDepth = current.d + 1;
      const seenDepth = seen.get(next);
      if (seenDepth !== undefined && seenDepth <= nextDepth) continue;
      seen.set(next, nextDepth);
      if (direction === 'upstream' && nextNode.kind === 'source' && !includeSources) continue;
      keep.add(next);
      queue.push({ id: next, d: nextDepth });
    }
  }
}

function expansionKey(id: LineageNodeId, direction: LineageDirection): string {
  return `${id}:${direction}`;
}

function overflowNodeId(id: LineageNodeId, direction: LineageDirection): LineageNodeId {
  return `overflow:${direction}:${encodeURIComponent(id)}` as LineageNodeId;
}

function downstreamRank(graph: LineageGraph, id: LineageNodeId, keep: Set<LineageNodeId>): number {
  return Array.from(graph.rdeps.get(id) || []).filter((downstreamId) => !keep.has(downstreamId)).length;
}

function sortExpansionCandidates(
  graph: LineageGraph,
  candidates: LineageNodeId[],
  keep: Set<LineageNodeId>
): LineageNodeId[] {
  return [...candidates].sort((left, right) => {
    const rankDelta = downstreamRank(graph, right, keep) - downstreamRank(graph, left, keep);
    if (rankDelta !== 0) return rankDelta;
    const leftLabel = graph.nodes.get(left)?.label ?? left;
    const rightLabel = graph.nodes.get(right)?.label ?? right;
    return leftLabel.localeCompare(rightLabel) || left.localeCompare(right);
  });
}

function walkLimitedExpansion(
  graph: LineageGraph,
  origin: LineageNodeId,
  direction: LineageDirection,
  depth: number,
  visibleLimit: number,
  keep: Set<LineageNodeId>,
  cappedExpansions: Map<string, { ownerId: LineageNodeId; direction: LineageDirection; visibleLimit: number }>
) {
  if (depth <= 0) return;
  const limit = Math.max(EXPANSION_VISIBLE_LIMIT, visibleLimit);
  const adjacency = direction === 'upstream' ? graph.deps : graph.rdeps;
  const directNeighbors = Array.from(adjacency.get(origin) || []).filter((id) => graph.nodes.has(id));
  const alreadyVisible = directNeighbors.filter((id) => keep.has(id));
  const hidden = sortExpansionCandidates(
    graph,
    directNeighbors.filter((id) => !keep.has(id)),
    keep
  );
  const selected = hidden.slice(0, limit);

  if (hidden.length > limit) {
    cappedExpansions.set(expansionKey(origin, direction), { ownerId: origin, direction, visibleLimit: limit });
  }

  for (const id of selected) keep.add(id);
  if (depth <= 1) return;

  const queue: { id: LineageNodeId; d: number }[] = [...new Set([...alreadyVisible, ...selected])].map((id) => ({
    id,
    d: 1
  }));
  const seen = new Map<LineageNodeId, number>([[origin, 0]]);
  for (const id of alreadyVisible) seen.set(id, 1);
  for (const id of selected) seen.set(id, 1);

  while (queue.length) {
    const current = queue.shift();
    if (!current || current.d >= depth) continue;
    for (const next of adjacency.get(current.id) || []) {
      const nextNode = graph.nodes.get(next);
      if (!nextNode) continue;
      const nextDepth = current.d + 1;
      const seenDepth = seen.get(next);
      if (seenDepth !== undefined && seenDepth <= nextDepth) continue;
      seen.set(next, nextDepth);
      keep.add(next);
      queue.push({ id: next, d: nextDepth });
    }
  }
}

function overflowLabel(graph: LineageGraph, count: number, ownerId: LineageNodeId): string {
  const ownerLabel = graph.nodes.get(ownerId)?.label ?? ownerId.replace(/^[^:]+:/, '');
  return `+${count} ${ownerLabel} deps`;
}

function expansionOverflowNode(
  graph: LineageGraph,
  ownerId: LineageNodeId,
  direction: LineageDirection,
  visibleLimit: number,
  keep: Set<LineageNodeId>
): { node: LineageNode; edge: LineageEdge } | null {
  const adjacency = direction === 'upstream' ? graph.deps : graph.rdeps;
  const hiddenCount = Array.from(adjacency.get(ownerId) || []).filter(
    (id) => graph.nodes.has(id) && !keep.has(id)
  ).length;
  if (!hiddenCount) return null;

  const id = overflowNodeId(ownerId, direction);
  const node: LineageNode = {
    id,
    kind: 'overflow',
    label: overflowLabel(graph, hiddenCount, ownerId),
    materialization: `top ${visibleLimit} shown`,
    overflow: {
      ownerId,
      direction,
      hiddenCount,
      revealCount: Math.min(EXPANSION_VISIBLE_LIMIT, hiddenCount)
    }
  };
  const edge = direction === 'upstream' ? { from: ownerId, to: id } : { from: id, to: ownerId };
  return { node, edge };
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
  walkDirection(graph, focus, 'upstream', upstreamDepth, keep, { includeSources: false });
  walkDirection(graph, focus, 'downstream', downstreamDepth, keep);

  const appliedExpansions = new Set<string>();
  const cappedExpansions = new Map<string, { ownerId: LineageNodeId; direction: LineageDirection; visibleLimit: number }>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [origin, expansion] of expansions) {
      if (!keep.has(origin)) continue;
      if (expansion.upstream > 0 && !appliedExpansions.has(expansionKey(origin, 'upstream'))) {
        const before = keep.size;
        walkLimitedExpansion(
          graph,
          origin,
          'upstream',
          expansion.upstream,
          expansion.upstreamLimit ?? EXPANSION_VISIBLE_LIMIT,
          keep,
          cappedExpansions
        );
        appliedExpansions.add(expansionKey(origin, 'upstream'));
        if (keep.size !== before) changed = true;
      }
      if (expansion.downstream > 0 && !appliedExpansions.has(expansionKey(origin, 'downstream'))) {
        const before = keep.size;
        walkLimitedExpansion(
          graph,
          origin,
          'downstream',
          expansion.downstream,
          expansion.downstreamLimit ?? EXPANSION_VISIBLE_LIMIT,
          keep,
          cappedExpansions
        );
        appliedExpansions.add(expansionKey(origin, 'downstream'));
        if (keep.size !== before) changed = true;
      }
    }
  }

  const overflowEntries = Array.from(cappedExpansions.values())
    .filter(({ ownerId }) => keep.has(ownerId))
    .map(({ ownerId, direction, visibleLimit }) => expansionOverflowNode(graph, ownerId, direction, visibleLimit, keep))
    .filter((entry): entry is { node: LineageNode; edge: LineageEdge } => !!entry);

  const nodes = Array.from(keep)
    .map((id) => {
      const node = graph.nodes.get(id);
      if (!node) return null;
      const hiddenUpstream = Array.from(graph.deps.get(id) || []).filter((dep) => !keep.has(dep));
      const hiddenDownstream = Array.from(graph.rdeps.get(id) || []).filter((dep) => !keep.has(dep));
      const expansion = expansions.get(id);
      const viewNode: LineageNode = {
        ...node,
        canExpandUpstream: hiddenUpstream.length > 0,
        canExpandDownstream: hiddenDownstream.length > 0,
        canCollapseUpstream: Boolean(expansion?.upstream),
        canCollapseDownstream: Boolean(expansion?.downstream),
        expandUpstreamCount: hiddenUpstream.length,
        expandDownstreamCount: hiddenDownstream.length
      };
      return viewNode;
    })
    .filter((node): node is LineageNode => !!node)
    .concat(overflowEntries.map((entry) => entry.node));

  const keptEdges = graph.edges
    .filter((edge) => keep.has(edge.from) && keep.has(edge.to))
    .concat(overflowEntries.map((entry) => entry.edge));
  return { nodes, edges: keptEdges };
}
