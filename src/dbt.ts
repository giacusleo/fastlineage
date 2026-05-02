import * as path from 'path';
import * as vscode from 'vscode';
import { ParsedRef, ParsedSource, parseDbtRefs } from './parser';
import { LineageNodeId, NodeKind } from './types';

export const EXCLUDE_GLOB = '**/{target,dbt_packages,node_modules}/**';

const TEXT_DECODER = new TextDecoder('utf-8');
const DEFAULT_MODEL_PATHS = ['models'];
const DEFAULT_SEED_PATHS = ['seeds'];
const DEFAULT_SNAPSHOT_PATHS = ['snapshots'];
const DEFAULT_ANALYSIS_PATHS = ['analyses'];
const DEFAULT_MACRO_PATHS = ['macros'];
const DEFAULT_PACKAGE_INSTALL_PATH = 'dbt_packages';

export type DbtProjectConfig = {
  rootPath: string;
  name: string | null;
  modelPaths: string[];
  seedPaths: string[];
  snapshotPaths: string[];
  analysisPaths: string[];
  macroPaths: string[];
  packageInstallPath: string;
};

export type RelationMetadata = {
  materialization?: string;
  deprecationDate?: string;
  tags?: string[];
  definitionPath?: string;
};

export type ProjectMetadata = {
  relations: Map<LineageNodeId, RelationMetadata>;
  sources: Map<string, RelationMetadata>;
  relationAliases: Map<string, { targetName: string; preferFilePath?: boolean }>;
  versionedRefs: Map<string, Map<string, string>>;
  semanticModels: Map<string, SemanticModelMetadata>;
  measureSemanticModels: Map<string, string>;
  metrics: Map<string, MetricMetadata>;
  savedQueries: Map<string, SavedQueryMetadata>;
  exposures: Map<string, ExposureMetadata>;
};

export type SemanticModelMetadata = RelationMetadata & {
  modelRef?: ParsedRef;
  modelSource?: ParsedSource;
  measures: string[];
};

export type MetricMetadata = RelationMetadata & {
  measure?: string;
  inputMetrics: string[];
};

export type SavedQueryMetadata = RelationMetadata & {
  metrics: string[];
};

export type ExposureMetadata = RelationMetadata & {
  refs: ParsedRef[];
  sources: ParsedSource[];
  metrics: string[];
};

type NamedBlock = {
  name: string;
  block: string;
};

export function lineageNodeId(kind: NodeKind, name: string): LineageNodeId {
  return `${kind}:${name}` as const;
}

export function relationNameFromPath(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

export function nodeKindFromPath(filePath: string, project?: DbtProjectConfig | null): NodeKind {
  return nodeKindForPath(filePath, project) ?? 'model';
}

export function nodeKindForPath(filePath: string, project?: DbtProjectConfig | null): NodeKind | null {
  if (project) {
    if (isProjectFileInPaths(filePath, project, project.seedPaths) && isSeedFile(filePath)) return 'seed';
    if (isProjectFileInPaths(filePath, project, project.snapshotPaths) && isSqlFile(filePath)) return 'snapshot';
    if (isProjectFileInPaths(filePath, project, project.analysisPaths) && isSqlFile(filePath)) return 'analysis';
    if (isProjectFileInPaths(filePath, project, project.modelPaths) && isSqlFile(filePath)) return 'model';
    return null;
  }

  const normalized = normalizePath(filePath);
  if (normalized.includes('/snapshots/') && isSqlFile(filePath)) return 'snapshot';
  if (normalized.includes('/seeds/') && isSeedFile(filePath)) return 'seed';
  if (normalized.includes('/analyses/') && isSqlFile(filePath)) return 'analysis';
  if (normalized.includes('/models/') && isSqlFile(filePath)) return 'model';
  return null;
}

export function lineageNodeIdFromPath(filePath: string, project?: DbtProjectConfig | null): LineageNodeId | null {
  const kind = nodeKindForPath(filePath, project);
  return kind ? lineageNodeId(kind, relationNameFromPath(filePath)) : null;
}

export function isDbtLineageDocumentPath(filePath: string, project?: DbtProjectConfig | null): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const isLineageExt = ext === '.sql' || ext === '.csv' || ext === '.tsv' || ext === '.yml' || ext === '.yaml';
  if (!isLineageExt) return false;

  if (project) {
    if (sameFilePath(filePath, path.join(project.rootPath, 'dbt_project.yml'))) return true;
    const resourcePaths = uniqueStrings([
      ...project.modelPaths,
      ...project.seedPaths,
      ...project.snapshotPaths,
      ...project.analysisPaths,
      ...project.macroPaths
    ]);
    return resourcePaths.some((resourcePath) => isProjectFileInPath(filePath, project, resourcePath));
  }

  const normalized = normalizePath(filePath);
  return (
    normalized.includes('/models/') ||
    normalized.includes('/snapshots/') ||
    normalized.includes('/seeds/') ||
    normalized.includes('/analyses/')
  );
}

export function fallbackMaterialization(kind: NodeKind): string {
  if (kind === 'source') return 'source';
  if (kind === 'seed') return 'seed';
  if (kind === 'snapshot') return 'snapshot';
  if (kind === 'analysis') return 'analysis';
  if (kind === 'exposure') return 'exposure';
  if (kind === 'semantic_model') return 'semantic model';
  if (kind === 'metric') return 'metric';
  if (kind === 'saved_query') return 'saved query';
  return 'view';
}

export async function readWorkspaceText(uri: vscode.Uri): Promise<string> {
  const openDoc = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
  if (openDoc) return openDoc.getText();
  const bytes = await vscode.workspace.fs.readFile(uri);
  return TEXT_DECODER.decode(bytes);
}

export async function readDbtProjectConfig(dbtProjectUri: vscode.Uri): Promise<DbtProjectConfig> {
  const text = await readWorkspaceText(dbtProjectUri);
  const rootPath = path.dirname(dbtProjectUri.fsPath);

  return {
    rootPath,
    name: parseTopLevelScalar(text, 'name'),
    modelPaths: parseTopLevelStringList(text, ['model-paths', 'source-paths'], DEFAULT_MODEL_PATHS),
    seedPaths: parseTopLevelStringList(text, ['seed-paths'], DEFAULT_SEED_PATHS),
    snapshotPaths: parseTopLevelStringList(text, ['snapshot-paths'], DEFAULT_SNAPSHOT_PATHS),
    analysisPaths: parseTopLevelStringList(text, ['analysis-paths'], DEFAULT_ANALYSIS_PATHS),
    macroPaths: parseTopLevelStringList(text, ['macro-paths'], DEFAULT_MACRO_PATHS),
    packageInstallPath: normalizeProjectPath(parseTopLevelScalar(text, 'packages-install-path') ?? DEFAULT_PACKAGE_INSTALL_PATH)
  };
}

export async function findFilesInProjectPaths(
  project: DbtProjectConfig,
  projectPaths: readonly string[],
  fileGlob: string
): Promise<vscode.Uri[]> {
  const results = await Promise.all(
    uniqueStrings(projectPaths).map((projectPath) =>
      vscode.workspace.findFiles(new vscode.RelativePattern(resolveProjectPath(project, projectPath), fileGlob), EXCLUDE_GLOB)
    )
  );

  return sortUris(uniqueUris(results.flat()));
}

export async function readProjectMetadata(project: DbtProjectConfig): Promise<ProjectMetadata> {
  const resourcePaths = uniqueStrings([...project.modelPaths, ...project.seedPaths, ...project.snapshotPaths, ...project.analysisPaths]);
  const yamlFiles = await findFilesInProjectPaths(project, resourcePaths, '**/*.{yml,yaml}');
  const metadata: ProjectMetadata = {
    relations: new Map(),
    sources: new Map(),
    relationAliases: new Map(),
    versionedRefs: new Map(),
    semanticModels: new Map(),
    measureSemanticModels: new Map(),
    metrics: new Map(),
    savedQueries: new Map(),
    exposures: new Map()
  };

  await Promise.all(
    yamlFiles.map(async (uri) => {
      let text = '';
      try {
        text = await readWorkspaceText(uri);
      } catch {
        return;
      }

      collectRelationMetadata(metadata.relations, text, uri.fsPath, 'models', 'model');
      collectVersionedModelMetadata(metadata, text, uri.fsPath);
      collectRelationMetadata(metadata.relations, text, uri.fsPath, 'seeds', 'seed');
      collectRelationMetadata(metadata.relations, text, uri.fsPath, 'snapshots', 'snapshot');
      collectSourceMetadata(metadata.sources, text, uri.fsPath);
      collectSemanticModelMetadata(metadata, text, uri.fsPath);
      collectMetricMetadata(metadata, text, uri.fsPath);
      collectSavedQueryMetadata(metadata, text, uri.fsPath);
      collectExposureMetadata(metadata, text, uri.fsPath);
    })
  );

  return metadata;
}

export function sortUris(uris: readonly vscode.Uri[]): vscode.Uri[] {
  return [...uris].sort((a, b) => a.fsPath.localeCompare(b.fsPath));
}

export function sameFilePath(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right);
}

function collectRelationMetadata(
  metadata: Map<LineageNodeId, RelationMetadata>,
  text: string,
  definitionPath: string,
  section: string,
  kind: NodeKind
) {
  for (const block of extractNamedBlocks(text, section)) {
    metadata.set(lineageNodeId(kind, block.name), {
      ...parseRelationMetadataBlock(block.block, kind),
      definitionPath
    });
  }
}

function collectVersionedModelMetadata(metadata: ProjectMetadata, text: string, definitionPath: string) {
  for (const block of extractNamedBlocks(text, 'models')) {
    const latestVersion = parseBlockScalar(block.block, 'latest_version');
    if (!latestVersion) continue;

    const baseMetadata = metadata.relations.get(lineageNodeId('model', block.name)) ?? {};
    const versionMap = metadata.versionedRefs.get(block.name) ?? new Map<string, string>();
    metadata.versionedRefs.set(block.name, versionMap);

    for (const versionBlock of extractVersionBlocks(block.block)) {
      const definedIn = parseBlockScalar(versionBlock.block, 'defined_in');
      const targetName = versionBlock.version === latestVersion ? block.name : versionedModelName(block.name, versionBlock.version);
      const versionMetadata = parseRelationMetadataBlock(versionBlock.block, 'model');

      versionMap.set(versionBlock.version, targetName);
      metadata.relations.set(lineageNodeId('model', targetName), {
        ...(targetName === block.name ? baseMetadata : {}),
        ...versionMetadata,
        tags: uniqueStrings([...(targetName === block.name ? (baseMetadata.tags ?? []) : []), ...(versionMetadata.tags ?? [])]),
        definitionPath
      });

      if (definedIn && definedIn !== targetName) {
        metadata.relationAliases.set(definedIn, { targetName, preferFilePath: true });
      }
    }
  }
}

function collectSourceMetadata(metadata: Map<string, RelationMetadata>, text: string, definitionPath: string) {
  for (const sourceBlock of extractNamedBlocks(text, 'sources')) {
    const sourceTags = parseYamlStringList(sourceBlock.block, 'tags');
    for (const tableBlock of extractTableBlocks(sourceBlock.block)) {
      const tableTags = parseYamlStringList(tableBlock.block, 'tags');
      metadata.set(`${sourceBlock.name}.${tableBlock.name}`, {
        materialization: 'source',
        deprecationDate: parseBlockScalar(tableBlock.block, 'deprecation_date') ?? parseBlockScalar(sourceBlock.block, 'deprecation_date') ?? undefined,
        tags: uniqueStrings([sourceBlock.name, ...sourceTags, ...tableTags]),
        definitionPath
      });
    }
  }
}

function collectSemanticModelMetadata(metadata: ProjectMetadata, text: string, definitionPath: string) {
  for (const block of extractNamedBlocks(text, 'semantic_models')) {
    const modelValue = parseBlockScalar(block.block, 'model');
    const parsedModel = parseDbtRefs(modelValue ?? block.block);
    const modelRef = parsedModel.refs[0];
    const modelSource = parsedModel.sources[0];
    const measures = extractNestedNamedBlocks(block.block, 'measures').map((measure) => measure.name);
    metadata.semanticModels.set(block.name, {
      materialization: 'semantic model',
      tags: parseYamlStringList(block.block, 'tags'),
      definitionPath,
      ...(modelRef ? { modelRef } : {}),
      ...(modelSource ? { modelSource } : {}),
      measures
    });

    for (const measure of measures) {
      if (!metadata.measureSemanticModels.has(measure)) {
        metadata.measureSemanticModels.set(measure, block.name);
      }
    }
  }
}

function collectMetricMetadata(metadata: ProjectMetadata, text: string, definitionPath: string) {
  for (const block of extractNamedBlocks(text, 'metrics')) {
    const inputMetrics = uniqueStrings([
      ...parseMetricInputScalars(block.block),
      ...extractNestedNamedBlocks(block.block, 'input_metrics').map((input) => input.name),
      ...extractNestedNamedBlocks(block.block, 'metrics').map((input) => input.name),
      ...parseMetricFilterDependencies(block.block)
    ]).filter((name) => name !== block.name);

    metadata.metrics.set(block.name, {
      materialization: 'metric',
      tags: parseYamlStringList(block.block, 'tags'),
      definitionPath,
      measure: parseBlockScalar(block.block, 'measure') ?? undefined,
      inputMetrics
    });
  }
}

function collectSavedQueryMetadata(metadata: ProjectMetadata, text: string, definitionPath: string) {
  for (const block of extractNamedBlocks(text, 'saved_queries')) {
    metadata.savedQueries.set(block.name, {
      materialization: 'saved query',
      tags: parseYamlStringList(block.block, 'tags'),
      definitionPath,
      metrics: parseNamedOrScalarList(block.block, 'metrics')
    });
  }
}

function collectExposureMetadata(metadata: ProjectMetadata, text: string, definitionPath: string) {
  for (const block of extractNamedBlocks(text, 'exposures')) {
    const parsed = parseDbtRefs(block.block);
    metadata.exposures.set(block.name, {
      materialization: parseBlockScalar(block.block, 'type') ?? 'exposure',
      tags: parseYamlStringList(block.block, 'tags'),
      definitionPath,
      refs: parsed.refs,
      sources: parsed.sources,
      metrics: uniqueStrings([...parsed.metrics, ...parseNamedOrScalarList(block.block, 'metrics')])
    });
  }
}

function parseMetricInputScalars(block: string): string[] {
  const inputs = ['input_metric', 'numerator', 'denominator', 'base_metric', 'conversion_metric']
    .map((key) => parseBlockScalar(block, key))
    .filter((value): value is string => Boolean(value));

  for (const key of ['input_metrics']) {
    inputs.push(...parseYamlStringList(block, key));
  }

  return inputs;
}

function parseMetricFilterDependencies(block: string): string[] {
  const deps: string[] = [];
  const metricRe = /\bMetric\s*\(\s*(['"])(?<name>[^'"]+)\1/g;
  for (const match of block.matchAll(metricRe)) {
    const name = match.groups?.name;
    if (name) deps.push(name);
  }
  return deps;
}

function parseRelationMetadataBlock(text: string, kind: NodeKind): RelationMetadata {
  const materializedMatch = text.match(/^\s*\+?materialized:\s*([A-Za-z0-9_-]+)/m);
  return {
    materialization: materializedMatch?.[1] ?? fallbackMaterialization(kind),
    deprecationDate: parseBlockScalar(text, 'deprecation_date') ?? undefined,
    tags: parseYamlStringList(text, 'tags')
  };
}

function versionedModelName(name: string, version: string): string {
  return `${name}.v${version}`;
}

function extractNestedNamedBlocks(text: string, section: string): NamedBlock[] {
  return extractNamedBlocks(text, section, undefined);
}

function extractNamedBlocks(text: string, section: string, requiredIndent: number | undefined = 0): NamedBlock[] {
  const lines = text.split(/\r?\n/);
  const sectionStart = findSectionStart(lines, section, requiredIndent);
  if (!sectionStart) return [];

  const blocks: NamedBlock[] = [];
  for (let index = sectionStart.index + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = lineIndent(line);
    if (indent <= sectionStart.indent) break;

    const name = parseNamedListItem(trimmed);
    if (!name) continue;

    const itemIndent = indent;
    const blockLines = [line];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index];
      const nextTrimmed = nextLine.trim();
      const nextIndent = lineIndent(nextLine);
      if (nextTrimmed && nextIndent <= sectionStart.indent) {
        index -= 1;
        break;
      }
      if (nextIndent === itemIndent && parseNamedListItem(nextTrimmed)) {
        index -= 1;
        break;
      }
      blockLines.push(nextLine);
      index += 1;
    }

    blocks.push({ name, block: blockLines.join('\n') });
  }

  return blocks;
}

function parseNamedOrScalarList(text: string, key: string): string[] {
  return uniqueStrings([
    ...parseYamlStringList(text, key).map((item) => {
      const named = item.match(/^name:\s*(.+)$/);
      return named ? cleanYamlScalar(named[1]) : item;
    }),
    ...extractNestedNamedBlocks(text, key).map((item) => item.name)
  ]);
}

function extractVersionBlocks(modelBlock: string): { version: string; block: string }[] {
  const lines = modelBlock.split(/\r?\n/);
  const versionsStart = findSectionStart(lines, 'versions');
  if (!versionsStart) return [];

  const blocks: { version: string; block: string }[] = [];
  for (let index = versionsStart.index + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = lineIndent(line);
    if (indent <= versionsStart.indent) break;

    const version = parseVersionListItem(trimmed);
    if (!version) continue;

    const itemIndent = indent;
    const blockLines = [line];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index];
      const nextTrimmed = nextLine.trim();
      const nextIndent = lineIndent(nextLine);
      if (nextTrimmed && nextIndent <= versionsStart.indent) {
        index -= 1;
        break;
      }
      if (nextIndent === itemIndent && parseVersionListItem(nextTrimmed)) {
        index -= 1;
        break;
      }
      blockLines.push(nextLine);
      index += 1;
    }

    blocks.push({ version, block: blockLines.join('\n') });
  }

  return blocks;
}

function extractTableBlocks(sourceBlock: string): NamedBlock[] {
  const lines = sourceBlock.split(/\r?\n/);
  const tablesStart = findSectionStart(lines, 'tables');
  if (!tablesStart) return [];

  const blocks: NamedBlock[] = [];
  for (let index = tablesStart.index + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = lineIndent(line);
    if (indent <= tablesStart.indent) break;

    const name = parseNamedListItem(trimmed);
    if (!name) continue;

    const itemIndent = indent;
    const blockLines = [line];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index];
      const nextTrimmed = nextLine.trim();
      const nextIndent = lineIndent(nextLine);
      if (nextTrimmed && nextIndent <= tablesStart.indent) {
        index -= 1;
        break;
      }
      if (nextIndent === itemIndent && parseNamedListItem(nextTrimmed)) {
        index -= 1;
        break;
      }
      blockLines.push(nextLine);
      index += 1;
    }

    blocks.push({ name, block: blockLines.join('\n') });
  }

  return blocks;
}

function findSectionStart(
  lines: readonly string[],
  section: string,
  requiredIndent?: number
): { index: number; indent: number } | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const indent = lineIndent(line);
    if (requiredIndent !== undefined && indent !== requiredIndent) continue;
    const trimmed = stripYamlComment(line).trim();
    if (trimmed === `${section}:`) {
      return { index, indent };
    }
  }

  return null;
}

function parseTopLevelScalar(text: string, key: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    if (lineIndent(line) !== 0) continue;
    const match = stripYamlComment(line).trim().match(new RegExp(`^${escapeRegExp(key)}:\\s*(.+)$`));
    if (!match) continue;
    const value = cleanYamlScalar(match[1]);
    return value || null;
  }

  return null;
}

function parseBlockScalar(text: string, key: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const match = stripYamlComment(line).trim().match(new RegExp(`^${escapeRegExp(key)}:\\s*(.+)$`));
    if (!match) continue;
    const value = cleanYamlScalar(match[1]);
    return value || null;
  }

  return null;
}

function parseTopLevelStringList(text: string, keys: readonly string[], fallback: readonly string[]): string[] {
  for (const key of keys) {
    const parsed = parseYamlStringList(text, key, 0);
    if (parsed.length > 0) return normalizeProjectPaths(parsed);
  }

  return [...fallback];
}

function parseYamlStringList(text: string, key: string, requiredIndent?: number): string[] {
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const indent = lineIndent(line);
    if (requiredIndent !== undefined && indent !== requiredIndent) continue;

    const trimmed = stripYamlComment(line).trim();
    const match = trimmed.match(new RegExp(`^\\+?${escapeRegExp(key)}:\\s*(.*)$`));
    if (!match) continue;

    const inlineValue = match[1].trim();
    if (inlineValue) return parseYamlInlineList(inlineValue);

    const values: string[] = [];
    for (let listIndex = index + 1; listIndex < lines.length; listIndex += 1) {
      const listLine = lines[listIndex];
      const listTrimmed = stripYamlComment(listLine).trim();
      if (!listTrimmed) continue;
      if (lineIndent(listLine) <= indent) break;

      const item = listTrimmed.match(/^-\s+(.+)$/);
      if (!item) break;
      values.push(cleanYamlScalar(item[1]));
    }

    return values.filter(Boolean);
  }

  return [];
}

function parseYamlInlineList(value: string): string[] {
  const cleaned = stripYamlComment(value).trim();
  if (!cleaned) return [];

  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    return cleaned
      .slice(1, -1)
      .split(',')
      .map((item) => cleanYamlScalar(item))
      .filter(Boolean);
  }

  return [cleanYamlScalar(cleaned)].filter(Boolean);
}

function parseNamedListItem(trimmedLine: string): string | null {
  const match = stripYamlComment(trimmedLine).trim().match(/^-\s+name:\s*(.+)$/);
  return match ? cleanYamlScalar(match[1]) : null;
}

function parseVersionListItem(trimmedLine: string): string | null {
  const match = stripYamlComment(trimmedLine).trim().match(/^-\s+v:\s*(.+)$/);
  return match ? cleanYamlScalar(match[1]) : null;
}

function normalizeProjectPaths(paths: readonly string[]): string[] {
  const normalized = paths
    .map((projectPath) => normalizeProjectPath(projectPath))
    .filter((projectPath) => projectPath && !projectPath.includes('{{'));

  return uniqueStrings(normalized);
}

function normalizeProjectPath(projectPath: string): string {
  return projectPath.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '');
}

function resolveProjectPath(project: DbtProjectConfig, projectPath: string): string {
  return path.isAbsolute(projectPath) ? projectPath : path.join(project.rootPath, projectPath);
}

function isProjectFileInPaths(filePath: string, project: DbtProjectConfig, projectPaths: readonly string[]): boolean {
  return projectPaths.some((projectPath) => isProjectFileInPath(filePath, project, projectPath));
}

function isProjectFileInPath(filePath: string, project: DbtProjectConfig, projectPath: string): boolean {
  const relative = path.relative(resolveProjectPath(project, projectPath), filePath);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function uniqueUris(uris: readonly vscode.Uri[]): vscode.Uri[] {
  const seen = new Set<string>();
  const unique: vscode.Uri[] = [];

  for (const uri of uris) {
    if (seen.has(uri.fsPath)) continue;
    seen.add(uri.fsPath);
    unique.push(uri);
  }

  return unique;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function cleanYamlScalar(value: string): string {
  return stripYamlComment(value).trim().replace(/^['"]|['"]$/g, '');
}

function stripYamlComment(value: string): string {
  let quote: string | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index).trimEnd();
    }
  }

  return value;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function isSqlFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.sql';
}

function isSeedFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.csv' || ext === '.tsv';
}

function lineIndent(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
