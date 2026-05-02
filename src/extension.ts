import * as vscode from 'vscode';
import {
  DbtProjectConfig,
  EXCLUDE_GLOB,
  findFilesInProjectPaths,
  isDbtLineageDocumentPath,
  lineageNodeIdFromPath,
  sameFilePath
} from './dbt';
import {
  BuildResult,
  buildGraphFromWorkspace,
  computeSubgraph,
  EXPANSION_VISIBLE_LIMIT,
  graphStats,
  NodeExpansion
} from './lineage';
import { LineageDirection, LineageGraph, LineageNodeId, NodeKind, RefreshStage, WebviewState } from './types';

type WebviewInbound =
  | { type: 'refresh' }
  | { type: 'openNode'; id: LineageNodeId }
  | { type: 'focusNode'; id: LineageNodeId }
  | { type: 'selectNode'; id: LineageNodeId }
  | { type: 'expandNode'; id: LineageNodeId; direction: LineageDirection }
  | { type: 'showMoreExpansion'; id: LineageNodeId; direction: LineageDirection }
  | { type: 'showAllExpansion'; id: LineageNodeId; direction: LineageDirection }
  | { type: 'collapseNode'; id: LineageNodeId; direction: LineageDirection }
  | { type: 'hideNode'; id: LineageNodeId }
  | { type: 'setDepth'; direction: LineageDirection; depth: number }
  | { type: 'revealActive' };

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
    vscode.workspace.onDidSaveTextDocument((doc) => provider.onLineageDocumentChanged(doc)),
    vscode.workspace.onDidChangeTextDocument((event) => provider.onLineageDocumentChanged(event.document))
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
  private dbtProject: DbtProjectConfig | null = null;
  private focusId: LineageNodeId | null = null;
  private selectedId: LineageNodeId | null = null;
  private upstreamDepth = 1;
  private downstreamDepth = 1;
  private nodeExpansions = new Map<LineageNodeId, NodeExpansion>();
  private hiddenNodeIds = new Set<LineageNodeId>();
  private dirtySinceRefresh = false;
  private refreshInFlight: Promise<void> | null = null;
  private refreshStage: RefreshStage = 'idle';

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
    void this.revealActiveModel(false);
  }

  async refresh(userInitiated: boolean) {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        const activePath = this.activeEditorPath();
        this.refreshStage = 'active-project';
        this.postState();

        const primaryResult = await buildGraphFromWorkspace(activePath, { scope: 'primary' });
        this.applyBuildResult(primaryResult);
        this.refreshStage = 'workspace';
        this.postState();
        if (userInitiated) {
          void vscode.window.setStatusBarMessage('FastLineage: active project loaded, building workspace...', 2500);
        }

        try {
          const workspaceResult = await buildGraphFromWorkspace(activePath, { scope: 'workspace' });
          this.applyBuildResult(workspaceResult);
          if (userInitiated) {
            void vscode.window.setStatusBarMessage('FastLineage: refreshed', 1500);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          void vscode.window.showWarningMessage(`FastLineage workspace refresh failed: ${message}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`FastLineage refresh failed: ${message}`);
      } finally {
        this.refreshStage = 'idle';
        this.postState();
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  private applyBuildResult(result: BuildResult) {
    this.graph = result.graph;
    this.refreshedAtMs = result.refreshedAtMs;
    this.durationMs = result.durationMs;
    this.dbtRootHint = result.dbtRootHint;
    this.dbtProject = result.project;
    this.dirtySinceRefresh = false;
    if (!this.focusId || !this.graph.nodes.has(this.focusId)) {
      this.focusActiveEditorDocument(false);
    }
  }

  onLineageDocumentChanged(doc: vscode.TextDocument) {
    if (!this.graph || this.dirtySinceRefresh) return;
    if (!this.nodeIdForDocument(doc.uri) && !isDbtLineageDocumentPath(doc.uri.fsPath, this.dbtProject)) return;

    this.dirtySinceRefresh = true;
    this.postState();
  }

  async revealActiveModel(forceFocus = true) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    if (this.focusActiveEditorDocument(forceFocus)) return;

    await this.refresh(false);
    this.focusActiveEditorDocument(forceFocus);
  }

  private focusActiveEditorDocument(forceFocus = true): boolean {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return false;

    const id = this.nodeIdForDocument(editor.document.uri);
    if (!id) return false;
    if (!forceFocus && this.focusId === id && this.selectedId === id) return true;
    this.setFocus(id);
    return true;
  }

  private activeEditorPath(): string | undefined {
    return vscode.window.activeTextEditor?.document.uri.fsPath;
  }

  private nodeIdForDocument(uri: vscode.Uri): LineageNodeId | null {
    if (this.graph) {
      for (const node of this.graph.nodes.values()) {
        if (node.filePath && sameFilePath(node.filePath, uri.fsPath)) return node.id;
      }
    }

    return lineageNodeIdFromPath(uri.fsPath, this.dbtProject);
  }

  private async onMessage(msg: WebviewInbound) {
    switch (msg.type) {
      case 'refresh':
        await this.refresh(true);
        return;
      case 'setDepth':
        this.setDirectionalDepth(msg.direction, msg.depth);
        return;
      case 'revealActive':
        await this.revealActiveModel(true);
        return;
      case 'selectNode':
        this.selectNode(msg.id);
        return;
      case 'expandNode':
        this.expandNode(msg.id, msg.direction);
        return;
      case 'showMoreExpansion':
        this.showMoreExpansion(msg.id, msg.direction);
        return;
      case 'showAllExpansion':
        this.showAllExpansion(msg.id, msg.direction);
        return;
      case 'collapseNode':
        this.collapseNode(msg.id, msg.direction);
        return;
      case 'hideNode':
        this.hideNode(msg.id);
        return;
      case 'openNode':
        await this.openNode(msg.id);
        return;
      case 'focusNode':
        this.focusNode(msg.id);
        return;
    }
  }

  private setFocus(id: LineageNodeId) {
    this.focusId = id;
    this.selectedId = id;
    this.nodeExpansions.clear();
    this.hiddenNodeIds.clear();
    this.postState();
  }

  private setDirectionalDepth(direction: LineageDirection, depth: number) {
    const next = Math.max(0, Math.min(8, Math.floor(depth)));
    if (direction === 'upstream') this.upstreamDepth = next;
    else this.downstreamDepth = next;
    this.postState();
  }

  private selectNode(id: LineageNodeId) {
    if (!this.graph?.nodes.has(id)) return;
    this.selectedId = id;
    this.postState();
  }

  private focusNode(id: LineageNodeId) {
    if (!this.graph?.nodes.has(id)) return;
    this.setFocus(id);
  }

  private expandNode(id: LineageNodeId, direction: LineageDirection) {
    if (!this.graph?.nodes.has(id)) return;
    const existing = this.nodeExpansions.get(id) ?? { upstream: 0, downstream: 0 };
    const next: NodeExpansion = { ...existing };
    if (direction === 'upstream') {
      next.upstream += 1;
      next.upstreamLimit ??= EXPANSION_VISIBLE_LIMIT;
    } else {
      next.downstream += 1;
      next.downstreamLimit ??= EXPANSION_VISIBLE_LIMIT;
    }

    this.storeNodeExpansion(id, next);
    this.selectedId = this.focusId;
    this.postState();
  }

  private showMoreExpansion(id: LineageNodeId, direction: LineageDirection) {
    if (!this.graph?.nodes.has(id)) return;
    const existing = this.nodeExpansions.get(id) ?? { upstream: 0, downstream: 0 };
    const next: NodeExpansion = { ...existing };

    if (direction === 'upstream') {
      if (next.upstream <= 0) next.upstream = 1;
      next.upstreamLimit = (next.upstreamLimit ?? EXPANSION_VISIBLE_LIMIT) + EXPANSION_VISIBLE_LIMIT;
    } else {
      if (next.downstream <= 0) next.downstream = 1;
      next.downstreamLimit = (next.downstreamLimit ?? EXPANSION_VISIBLE_LIMIT) + EXPANSION_VISIBLE_LIMIT;
    }

    this.storeNodeExpansion(id, next);
    this.selectedId = this.focusId;
    this.postState();
  }

  private showAllExpansion(id: LineageNodeId, direction: LineageDirection) {
    if (!this.graph?.nodes.has(id)) return;
    const existing = this.nodeExpansions.get(id) ?? { upstream: 0, downstream: 0 };
    const next: NodeExpansion = { ...existing };
    const adjacency = direction === 'upstream' ? this.graph.deps : this.graph.rdeps;
    const visibleLimit = Math.max(EXPANSION_VISIBLE_LIMIT, adjacency.get(id)?.size ?? 0);

    if (direction === 'upstream') {
      if (next.upstream <= 0) next.upstream = 1;
      next.upstreamLimit = visibleLimit;
    } else {
      if (next.downstream <= 0) next.downstream = 1;
      next.downstreamLimit = visibleLimit;
    }

    this.storeNodeExpansion(id, next);
    this.selectedId = this.focusId;
    this.postState();
  }

  private collapseNode(id: LineageNodeId, direction: LineageDirection) {
    if (!this.graph?.nodes.has(id)) return;
    const existing = this.nodeExpansions.get(id) ?? { upstream: 0, downstream: 0 };
    const next: NodeExpansion = { ...existing };

    if (direction === 'upstream') {
      if (next.upstream > 0) next.upstream -= 1;
      if (next.upstream === 0) delete next.upstreamLimit;
    } else if (next.downstream > 0) {
      next.downstream -= 1;
      if (next.downstream === 0) delete next.downstreamLimit;
    }

    this.storeNodeExpansion(id, next);
    this.selectedId = this.focusId;
    this.postState();
  }

  private storeNodeExpansion(id: LineageNodeId, expansion: NodeExpansion) {
    if (expansion.upstream === 0 && expansion.downstream === 0) {
      this.nodeExpansions.delete(id);
      return;
    }
    this.nodeExpansions.set(id, expansion);
  }

  private hideNode(id: LineageNodeId) {
    if (!this.graph?.nodes.has(id)) return;
    this.hiddenNodeIds.add(id);
    if (this.selectedId === id) this.selectedId = null;
    this.postState();
  }

  private async openNode(id: LineageNodeId) {
    if (!this.graph) return;
    const node = this.graph.nodes.get(id);
    if (!node) return;

    if (node.kind === 'source') {
      this.selectedId = id;
      this.postState();
      void vscode.window.setStatusBarMessage(`FastLineage: source ${node.label} has no SQL file`, 1500);
      return;
    }

    const openUri = await this.resolveNodeUri(node.kind, node.label, node.filePath);
    if (!openUri) {
      void vscode.window.showWarningMessage(`FastLineage: relation not found on disk: ${node.label}`);
      return;
    }

    const doc = await vscode.workspace.openTextDocument(openUri);
    await vscode.window.showTextDocument(doc, { preview: false });
    this.selectedId = id;
    this.postState();
  }

  private async resolveNodeUri(kind: NodeKind, relation: string, hintedPath?: string): Promise<vscode.Uri | null> {
    if (hintedPath) return vscode.Uri.file(hintedPath);

    const globs =
      kind === 'snapshot'
        ? [`**/snapshots/**/${relation}.sql`]
        : kind === 'seed'
          ? [`**/seeds/**/${relation}.csv`, `**/seeds/**/${relation}.tsv`]
          : kind === 'analysis'
            ? [`**/analyses/**/${relation}.sql`]
            : [`**/models/**/${relation}.sql`];

    if (this.dbtProject) {
      const projectPaths =
        kind === 'snapshot'
          ? this.dbtProject.snapshotPaths
          : kind === 'seed'
            ? this.dbtProject.seedPaths
            : kind === 'analysis'
              ? this.dbtProject.analysisPaths
              : this.dbtProject.modelPaths;
      const projectGlobs =
        kind === 'seed' ? [`**/${relation}.csv`, `**/${relation}.tsv`] : [`**/${relation}.sql`];

      for (const glob of projectGlobs) {
        const matches = await findFilesInProjectPaths(this.dbtProject, projectPaths, glob);
        if (matches[0]) return matches[0];
      }
    }

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
        refresh: {
          stage: this.refreshStage,
          isRefreshing: this.refreshStage !== 'idle'
        },
        graphStats: {
          models: 0,
          sources: 0,
          seeds: 0,
          snapshots: 0,
          analyses: 0,
          exposures: 0,
          semanticModels: 0,
          metrics: 0,
          savedQueries: 0,
          edges: 0
        },
        focus: {
          focusId: this.focusId,
          selectedId: this.selectedId ?? this.focusId,
          upstreamDepth: this.upstreamDepth,
          downstreamDepth: this.downstreamDepth
        },
        subgraph: { nodes: [], edges: [] },
        dirtySinceRefresh: this.dirtySinceRefresh
      };
      this.view?.webview.postMessage({ type: 'state', state });
      return;
    }

    const subgraph = computeSubgraph(
      this.graph,
      this.focusId,
      this.upstreamDepth,
      this.downstreamDepth,
      this.nodeExpansions
    );
    const nodes = subgraph.nodes.map((node) => ({
      ...node,
      hidden: this.hiddenNodeIds.has(node.id)
    }));
    const visibleIds = new Set(nodes.filter((node) => !node.hidden).map((node) => node.id));
    const fallbackSelectedId = this.focusId && visibleIds.has(this.focusId) ? this.focusId : null;
    const selectedId = this.selectedId && visibleIds.has(this.selectedId) ? this.selectedId : fallbackSelectedId;

    const state: WebviewState = {
      refreshedAtMs: this.refreshedAtMs,
      durationMs: this.durationMs,
      workspaceName: vscode.workspace.name ?? 'workspace',
      dbtRootHint: this.dbtRootHint,
      refresh: {
        stage: this.refreshStage,
        isRefreshing: this.refreshStage !== 'idle'
      },
      graphStats: graphStats(this.graph),
      focus: {
        focusId: this.focusId,
        selectedId,
        upstreamDepth: this.upstreamDepth,
        downstreamDepth: this.downstreamDepth
      },
      subgraph: { nodes, edges: subgraph.edges },
      dirtySinceRefresh: this.dirtySinceRefresh
    };
    this.view.webview.postMessage({ type: 'state', state });
  }

  private getHtml(webview: vscode.Webview) {
    const assetVersion = String(Date.now());
    const dagreUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'dagre.min.js'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview.css'));
    const nonce = assetVersion;
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${cssUri}?v=${assetVersion}">
    <title>FastLineage</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${dagreUri}?v=${assetVersion}"></script>
    <script nonce="${nonce}" src="${jsUri}?v=${assetVersion}"></script>
  </body>
</html>`;
  }
}
