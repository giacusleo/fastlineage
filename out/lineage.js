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
    function upsertNode(id, kind, label, filePath) {
        const existing = nodes.get(id);
        if (existing) {
            if (filePath && !existing.filePath)
                existing.filePath = filePath;
            return;
        }
        nodes.set(id, { id, kind, label, filePath });
    }
    function registerRelation(name, kind, filePath) {
        if (!relations.has(name))
            relations.set(name, { kind, filePath });
        upsertNode(nodeId(kind, name), kind, name, filePath);
    }
    for (const uri of modelFiles) {
        registerRelation(relationNameFromPath(uri.fsPath), 'model', uri.fsPath);
    }
    for (const uri of snapshotFiles) {
        registerRelation(relationNameFromPath(uri.fsPath), 'snapshot', uri.fsPath);
    }
    for (const uri of seedFiles) {
        registerRelation(relationNameFromPath(uri.fsPath), 'seed', uri.fsPath);
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
            const target = relations.get(ref.model) ?? { kind: 'model' };
            const toId = nodeId(target.kind, ref.model);
            upsertNode(toId, target.kind, ref.model, target.filePath);
            edges.push({ from: file.fromId, to: toId });
            addToMapSet(deps, file.fromId, toId);
            addToMapSet(rdeps, toId, file.fromId);
        }
        for (const source of file.parsed.sources) {
            const label = `${source.source}.${source.table}`;
            const toId = nodeId('source', label);
            upsertNode(toId, 'source', label);
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
function computeSubgraph(graph, focus, depth) {
    if (!focus || !graph.nodes.has(focus)) {
        return { nodes: [], edges: [] };
    }
    const keep = new Set([focus]);
    const queue = [{ id: focus, d: 0 }];
    while (queue.length) {
        const { id, d } = queue.shift();
        if (d >= depth)
            continue;
        const up = graph.deps.get(id);
        if (up) {
            for (const next of up) {
                if (!keep.has(next)) {
                    keep.add(next);
                    queue.push({ id: next, d: d + 1 });
                }
            }
        }
        const down = graph.rdeps.get(id);
        if (down) {
            for (const next of down) {
                if (!keep.has(next)) {
                    keep.add(next);
                    queue.push({ id: next, d: d + 1 });
                }
            }
        }
    }
    const nodes = Array.from(keep)
        .map((id) => graph.nodes.get(id))
        .filter((node) => !!node);
    const keptEdges = graph.edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to));
    return { nodes, edges: keptEdges };
}
//# sourceMappingURL=lineage.js.map