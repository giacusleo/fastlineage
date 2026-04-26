import * as vscode from 'vscode';
import {
  buildGraphFromWorkspace,
  computeSubgraph,
  nodeKindFromPath,
  relationNameFromPath
} from './lineage';
import { LineageGraph, LineageNodeId, NodeKind, WebviewState } from './types';

type WebviewInbound =
  | { type: 'refresh' }
  | { type: 'openNode'; id: LineageNodeId }
  | { type: 'setDepth'; depth: number }
  | { type: 'revealActive' };

const EXCLUDE_GLOB = '**/{target,dbt_packages,node_modules}/**';

export function activate(context: vscode.ExtensionContext) {
  const provider = new FastLineageViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(FastLineageViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('fastlineage.refresh', () => provider.refresh(true)),
    vscode.commands.registerCommand('fastlineage.revealActive', () => provider.revealActiveModel())
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => provider.revealActiveModel(false)),
    vscode.workspace.onDidSaveTextDocument(() => provider.onMaybeDirtyChanged()),
    vscode.workspace.onDidChangeTextDocument(() => provider.onMaybeDirtyChanged())
  );
}

export function deactivate() {}

class FastLineageViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'fastlineageView';

  private view: vscode.WebviewView | null = null;
  private graph: LineageGraph | null = null;
  private refreshedAtMs: number | null = null;
  private durationMs = 0;
  private dbtRootHint: string | null = null;
  private focusId: LineageNodeId | null = null;
  private depth = 2;
  private dirtySinceRefresh = false;
  private refreshInFlight: Promise<void> | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: WebviewInbound) => {
      void this.onMessage(msg);
    });

    void this.refresh(false);
    this.revealActiveModel(false);
  }

  async refresh(userInitiated: boolean) {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        const result = await buildGraphFromWorkspace();
        this.graph = result.graph;
        this.refreshedAtMs = result.refreshedAtMs;
        this.durationMs = result.durationMs;
        this.dbtRootHint = result.dbtRootHint;
        this.onMaybeDirtyChanged();
        this.postState();
        if (userInitiated) {
          void vscode.window.setStatusBarMessage('FastLineage: refreshed', 1500);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`FastLineage refresh failed: ${message}`);
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  onMaybeDirtyChanged() {
    const prev = this.dirtySinceRefresh;
    this.dirtySinceRefresh = vscode.workspace.textDocuments.some((doc) => {
      if (!doc.isDirty) return false;
      const normalized = doc.uri.fsPath.replace(/\\/g, '/');
      return normalized.endsWith('.sql') && (normalized.includes('/models/') || normalized.includes('/snapshots/'));
    });
    if (prev !== this.dirtySinceRefresh) this.postState();
  }

  revealActiveModel(forceFocus = true) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const normalized = editor.document.uri.fsPath.replace(/\\/g, '/');
    let kind: NodeKind | null = null;
    if (normalized.endsWith('.sql') && normalized.includes('/models/')) kind = 'model';
    else if (normalized.endsWith('.sql') && normalized.includes('/snapshots/')) kind = 'snapshot';
    else if ((normalized.endsWith('.csv') || normalized.endsWith('.tsv')) && normalized.includes('/seeds/')) kind = 'seed';

    if (!kind) return;

    const relation = relationNameFromPath(editor.document.uri.fsPath);
    const id = `${kind}:${relation}` as LineageNodeId;
    if (!forceFocus && this.focusId === id) return;
    this.focusId = id;
    this.postState();
  }

  private async onMessage(msg: WebviewInbound) {
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

  private async openNode(id: LineageNodeId) {
    if (!this.graph) return;
    const node = this.graph.nodes.get(id);
    if (!node) return;

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

  private async resolveNodeUri(kind: NodeKind, relation: string, hintedPath?: string): Promise<vscode.Uri | null> {
    if (hintedPath) return vscode.Uri.file(hintedPath);

    const globs =
      kind === 'snapshot'
        ? [`**/snapshots/**/${relation}.sql`]
        : kind === 'seed'
          ? [`**/seeds/**/${relation}.csv`, `**/seeds/**/${relation}.tsv`]
          : [`**/models/**/${relation}.sql`];

    for (const glob of globs) {
      const matches = await vscode.workspace.findFiles(glob, EXCLUDE_GLOB, 10);
      if (matches[0]) return matches[0];
    }

    return null;
  }

  private postState() {
    if (!this.view || !this.graph) {
      const state: WebviewState = {
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

    const { nodes, edges } = computeSubgraph(this.graph, this.focusId, this.depth);
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

    const state: WebviewState = {
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

  private getHtml(webview: vscode.Webview) {
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
