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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const lineage_1 = require("./lineage");
const EXCLUDE_GLOB = '**/{target,dbt_packages,node_modules}/**';
function activate(context) {
    const provider = new FastLineageViewProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(FastLineageViewProvider.viewType, provider, {
        webviewOptions: { retainContextWhenHidden: true }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('fastlineage.refresh', () => provider.refresh(true)), vscode.commands.registerCommand('fastlineage.revealActive', () => provider.revealActiveModel()));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => provider.revealActiveModel(false)), vscode.workspace.onDidSaveTextDocument(() => provider.onMaybeDirtyChanged()), vscode.workspace.onDidChangeTextDocument(() => provider.onMaybeDirtyChanged()));
}
function deactivate() { }
class FastLineageViewProvider {
    context;
    static viewType = 'fastlineageView';
    view = null;
    graph = null;
    refreshedAtMs = null;
    durationMs = 0;
    dbtRootHint = null;
    focusId = null;
    depth = 2;
    dirtySinceRefresh = false;
    refreshInFlight = null;
    constructor(context) {
        this.context = context;
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };
        webviewView.webview.html = this.getHtml(webviewView.webview);
        webviewView.webview.onDidReceiveMessage((msg) => {
            void this.onMessage(msg);
        });
        void this.refresh(false);
        this.revealActiveModel(false);
    }
    async refresh(userInitiated) {
        if (this.refreshInFlight)
            return this.refreshInFlight;
        this.refreshInFlight = (async () => {
            try {
                const result = await (0, lineage_1.buildGraphFromWorkspace)();
                this.graph = result.graph;
                this.refreshedAtMs = result.refreshedAtMs;
                this.durationMs = result.durationMs;
                this.dbtRootHint = result.dbtRootHint;
                this.onMaybeDirtyChanged();
                this.postState();
                if (userInitiated) {
                    void vscode.window.setStatusBarMessage('FastLineage: refreshed', 1500);
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                void vscode.window.showErrorMessage(`FastLineage refresh failed: ${message}`);
            }
            finally {
                this.refreshInFlight = null;
            }
        })();
        return this.refreshInFlight;
    }
    onMaybeDirtyChanged() {
        const prev = this.dirtySinceRefresh;
        this.dirtySinceRefresh = vscode.workspace.textDocuments.some((doc) => {
            if (!doc.isDirty)
                return false;
            const normalized = doc.uri.fsPath.replace(/\\/g, '/');
            return normalized.endsWith('.sql') && (normalized.includes('/models/') || normalized.includes('/snapshots/'));
        });
        if (prev !== this.dirtySinceRefresh)
            this.postState();
    }
    revealActiveModel(forceFocus = true) {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const normalized = editor.document.uri.fsPath.replace(/\\/g, '/');
        let kind = null;
        if (normalized.endsWith('.sql') && normalized.includes('/models/'))
            kind = 'model';
        else if (normalized.endsWith('.sql') && normalized.includes('/snapshots/'))
            kind = 'snapshot';
        else if ((normalized.endsWith('.csv') || normalized.endsWith('.tsv')) && normalized.includes('/seeds/'))
            kind = 'seed';
        if (!kind)
            return;
        const relation = (0, lineage_1.relationNameFromPath)(editor.document.uri.fsPath);
        const id = `${kind}:${relation}`;
        if (!forceFocus && this.focusId === id)
            return;
        this.focusId = id;
        this.postState();
    }
    async onMessage(msg) {
        switch (msg.type) {
            case 'refresh':
                await this.refresh(true);
                return;
            case 'setDepth':
                this.depth = Math.max(1, Math.min(8, Math.floor(msg.depth)));
                this.postState();
                return;
            case 'revealActive':
                this.revealActiveModel(true);
                return;
            case 'openNode':
                await this.openNode(msg.id);
                return;
        }
    }
    async openNode(id) {
        if (!this.graph)
            return;
        const node = this.graph.nodes.get(id);
        if (!node)
            return;
        if (node.kind === 'source') {
            this.focusId = id;
            this.postState();
            void vscode.window.setStatusBarMessage(`FastLineage: source ${node.label}`, 1500);
            return;
        }
        const openUri = await this.resolveNodeUri(node.kind, node.label, node.filePath);
        if (!openUri) {
            void vscode.window.showWarningMessage(`FastLineage: relation not found on disk: ${node.label}`);
            return;
        }
        const doc = await vscode.workspace.openTextDocument(openUri);
        await vscode.window.showTextDocument(doc, { preview: false });
        this.focusId = id;
        this.postState();
    }
    async resolveNodeUri(kind, relation, hintedPath) {
        if (hintedPath)
            return vscode.Uri.file(hintedPath);
        const globs = kind === 'snapshot'
            ? [`**/snapshots/**/${relation}.sql`]
            : kind === 'seed'
                ? [`**/seeds/**/${relation}.csv`, `**/seeds/**/${relation}.tsv`]
                : [`**/models/**/${relation}.sql`];
        for (const glob of globs) {
            const matches = await vscode.workspace.findFiles(glob, EXCLUDE_GLOB, 10);
            if (matches[0])
                return matches[0];
        }
        return null;
    }
    postState() {
        if (!this.view || !this.graph) {
            const state = {
                refreshedAtMs: this.refreshedAtMs,
                durationMs: this.durationMs,
                workspaceName: vscode.workspace.name ?? 'workspace',
                dbtRootHint: this.dbtRootHint,
                graphStats: { models: 0, sources: 0, seeds: 0, snapshots: 0, edges: 0 },
                focus: { focusId: this.focusId, depth: this.depth },
                subgraph: { nodes: [], edges: [] },
                dirtySinceRefresh: this.dirtySinceRefresh
            };
            this.view?.webview.postMessage({ type: 'state', state });
            return;
        }
        const { nodes, edges } = (0, lineage_1.computeSubgraph)(this.graph, this.focusId, this.depth);
        let models = 0;
        let sources = 0;
        let seeds = 0;
        let snapshots = 0;
        for (const node of this.graph.nodes.values()) {
            switch (node.kind) {
                case 'model':
                    models += 1;
                    break;
                case 'source':
                    sources += 1;
                    break;
                case 'seed':
                    seeds += 1;
                    break;
                case 'snapshot':
                    snapshots += 1;
                    break;
            }
        }
        const state = {
            refreshedAtMs: this.refreshedAtMs,
            durationMs: this.durationMs,
            workspaceName: vscode.workspace.name ?? 'workspace',
            dbtRootHint: this.dbtRootHint,
            graphStats: { models, sources, seeds, snapshots, edges: this.graph.edges.length },
            focus: { focusId: this.focusId, depth: this.depth },
            subgraph: { nodes, edges },
            dirtySinceRefresh: this.dirtySinceRefresh
        };
        this.view.webview.postMessage({ type: 'state', state });
    }
    getHtml(webview) {
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview.js'));
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview.css'));
        const nonce = String(Date.now());
        return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${cssUri}">
    <title>FastLineage</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${jsUri}"></script>
  </body>
</html>`;
    }
}
//# sourceMappingURL=extension.js.map