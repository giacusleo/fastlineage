"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.relationNameFromPath = relationNameFromPath;
exports.modelNameFromPath = modelNameFromPath;
exports.nodeKindFromPath = nodeKindFromPath;
exports.findDbtRoot = findDbtRoot;
exports.buildGraphFromWorkspace = buildGraphFromWorkspace;
exports.computeSubgraph = computeSubgraph;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const parser_1 = require("./parser");
const TEXT_DECODER = new TextDecoder('utf-8');
const EXCLUDE_GLOB = '**/{target,dbt_packages,node_modules}/**';
function nodeId(kind, name) {
    return `${kind}:${name}`;
}
function addToMapSet(map, key, value) {
    const set = map.get(key);
    if (set)
        set.add(value);
    else
        map.set(key, new Set([value]));
}
function fallbackMaterialization(kind, relation) {
    if (kind === 'source')
        return 'source';
    if (kind === 'seed')
        return 'seed';
    if (kind === 'snapshot')
        return 'snapshot';
    if (relation.startsWith('stg_'))
        return 'view';
    if (relation.startsWith('int_') && relation.endsWith('_hub'))
        return 'incremental';
    if (relation.startsWith('int_'))
        return 'table';
    if (relation.startsWith('mart_'))
        return 'view';
    return 'table';
}
function parseYamlList(text, key) {
    const lines = text.split(/\r?\n/);
    const values = [];
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
        if (!trimmed)
            continue;
        if (indent <= baseIndent)
            break;
        const item = trimmed.match(/^-\s+(.+)$/);
        if (!item)
            break;
        values.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
    }
    return values;
}
function parseRelationMetadata(text, kind, relation) {
    const materializedMatch = text.match(/^\s*materialized:\s*([A-Za-z0-9_-]+)/m);
    return {
        materialization: materializedMatch?.[1] ?? fallbackMaterialization(kind, relation),
        tags: parseYamlList(text, 'tags')
    };
}
async function readRelationMetadata(filePath, kind) {
    if (kind === 'source') {
        return { materialization: 'source', tags: [] };
    }
    const relation = relationNameFromPath(filePath);
    const sidecarUri = vscode.Uri.file(path.join(path.dirname(filePath), `${relation}.yml`));
    try {
        const text = await readWorkspaceText(sidecarUri);
        return parseRelationMetadata(text, kind, relation);
    }
    catch {
        return { materialization: fallbackMaterialization(kind, relation), tags: [] };
    }
}
function relationNameFromPath(filePath) {
    return path.basename(filePath, path.extname(filePath));
}
function modelNameFromPath(filePath) {
    return relationNameFromPath(filePath);
}
function nodeKindFromPath(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.includes('/snapshots/'))
        return 'snapshot';
    if (normalized.includes('/seeds/'))
        return 'seed';
    return 'model';
}
async function findDbtRoot() {
    const matches = await vscode.workspace.findFiles('**/dbt_project.yml', EXCLUDE_GLOB, 10);
    if (matches.length === 0)
        return null;
    return matches[0];
}
async function readWorkspaceText(uri) {
    const openDoc = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
    if (openDoc)
        return openDoc.getText();
    const bytes = await vscode.workspace.fs.readFile(uri);
    return TEXT_DECODER.decode(bytes);
}
function sortUris(uris) {
    return [...uris].sort((a, b) => a.fsPath.localeCompare(b.fsPath));
}
async function buildGraphFromWorkspace() {
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
    const nodes = new Map();
    const edges = [];
    const deps = new Map();
    const rdeps = new Map();
    const relations = new Map();
    function upsertNode(id, kind, label, filePath, metadata = {}) {
        const existing = nodes.get(id);
        if (existing) {
            if (filePath && !existing.filePath)
                existing.filePath = filePath;
            if (metadata.materialization && !existing.materialization)
                existing.materialization = metadata.materialization;
            if (metadata.tags?.length && !existing.tags?.length)
                existing.tags = [...metadata.tags];
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
    function registerRelation(name, kind, filePath, metadata = {}) {
        const existing = relations.get(name);
        relations.set(name, {
            kind: existing?.kind ?? kind,
            filePath: existing?.filePath ?? filePath,
            materialization: existing?.materialization ?? metadata.materialization,
            tags: existing?.tags?.length ? existing.tags : metadata.tags
        });
        upsertNode(nodeId(kind, name), kind, name, filePath, metadata);
    }
    const metadataByPath = new Map(await Promise.all([...modelFiles, ...snapshotFiles, ...seedFiles].map(async (uri) => [uri.fsPath, await readRelationMetadata(uri.fsPath, nodeKindFromPath(uri.fsPath))])));
    for (const uri of modelFiles) {
        registerRelation(relationNameFromPath(uri.fsPath), 'model', uri.fsPath, metadataByPath.get(uri.fsPath));
    }
    for (const uri of snapshotFiles) {
        registerRelation(relationNameFromPath(uri.fsPath), 'snapshot', uri.fsPath, metadataByPath.get(uri.fsPath));
    }
    for (const uri of seedFiles) {
        registerRelation(relationNameFromPath(uri.fsPath), 'seed', uri.fsPath, metadataByPath.get(uri.fsPath));
    }
    const parsedFiles = await Promise.all(sqlFiles.map(async (uri) => {
        const filePath = uri.fsPath;
        const relation = relationNameFromPath(filePath);
        const kind = nodeKindFromPath(filePath);
        const fromId = nodeId(kind, relation);
        let text = '';
        try {
            text = await readWorkspaceText(uri);
        }
        catch {
            return null;
        }
        return { fromId, parsed: (0, parser_1.parseDbtRefs)(text) };
    }));
    for (const file of parsedFiles) {
        if (!file)
            continue;
        for (const ref of file.parsed.refs) {
            const target = relations.get(ref.model) ?? {
                kind: 'model',
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
function walkDirection(graph, start, direction, depth, keep) {
    if (depth <= 0)
        return;
    const adjacency = direction === 'upstream' ? graph.deps : graph.rdeps;
    const queue = [{ id: start, d: 0 }];
    const seen = new Map([[start, 0]]);
    while (queue.length) {
        const current = queue.shift();
        if (!current || current.d >= depth)
            continue;
        for (const next of adjacency.get(current.id) || []) {
            const nextDepth = current.d + 1;
            const seenDepth = seen.get(next);
            if (seenDepth !== undefined && seenDepth <= nextDepth)
                continue;
            seen.set(next, nextDepth);
            keep.add(next);
            queue.push({ id: next, d: nextDepth });
        }
    }
}
function computeSubgraph(graph, focus, upstreamDepth, downstreamDepth, expansions = new Map()) {
    if (!focus || !graph.nodes.has(focus)) {
        return { nodes: [], edges: [] };
    }
    const keep = new Set([focus]);
    walkDirection(graph, focus, 'upstream', upstreamDepth, keep);
    walkDirection(graph, focus, 'downstream', downstreamDepth, keep);
    let changed = true;
    while (changed) {
        changed = false;
        for (const [origin, expansion] of expansions) {
            if (!keep.has(origin))
                continue;
            const before = keep.size;
            walkDirection(graph, origin, 'upstream', expansion.upstream, keep);
            walkDirection(graph, origin, 'downstream', expansion.downstream, keep);
            if (keep.size !== before)
                changed = true;
        }
    }
    const nodes = Array.from(keep)
        .map((id) => {
        const node = graph.nodes.get(id);
        if (!node)
            return null;
        const canExpandUpstream = Array.from(graph.deps.get(id) || []).some((dep) => !keep.has(dep));
        const canExpandDownstream = Array.from(graph.rdeps.get(id) || []).some((dep) => !keep.has(dep));
        const viewNode = { ...node, canExpandUpstream, canExpandDownstream };
        return viewNode;
    })
        .filter((node) => !!node);
    const keptEdges = graph.edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to));
    return { nodes, edges: keptEdges };
}
//# sourceMappingURL=lineage.js.map