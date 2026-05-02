(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const BASE_NODE_W = 310;
  const BASE_NODE_H = 84;
  const BASE_COL_GAP = 172;
  const BASE_ROW_GAP = 28;
  const BASE_PAD = 72;
  const ARROW_HEAD_LENGTH = 8;
  const MIN_SCALE = 0.25;
  const MAX_SCALE = 2.25;

  let state = null;
  let activeScene = null;
  let activeContextMenu = null;
  let suppressNextSceneReuse = false;
  const persisted = vscode.getState() || {};
  const uiStateByScope = persisted.uiStateByScope || {};

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else node.setAttribute(key, value);
    }
    for (const child of children) node.appendChild(child);
    return node;
  }

  function svg(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, String(value));
    }
    return node;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function fmtTime(ms) {
    if (!ms) return 'never';
    try {
      return new Date(ms).toLocaleTimeString();
    } catch {
      return 'never';
    }
  }

  function fmtDuration(ms) {
    if (!ms) return '0 ms';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    if (ms < 10000) return `${(ms / 1000).toFixed(2)} s`;
    return `${(ms / 1000).toFixed(1)} s`;
  }

  function roleForNode(node) {
    const resourceName = node.name || node.label;
    if (node.kind === 'overflow') {
      return { chip: '', tone: 'overflow' };
    }
    if (node.deprecation?.status === 'deprecated') {
      return { chip: 'LEGACY', tone: 'deprecated' };
    }
    if (node.deprecation?.status === 'upcoming') {
      return { chip: 'LEGACY', tone: 'deprecating' };
    }
    if (node.kind === 'source') {
      return { chip: 'SRC', tone: 'source' };
    }
    if (node.kind === 'seed') {
      return { chip: 'SEED', tone: 'seed' };
    }
    if (node.kind === 'snapshot') {
      return { chip: 'SNAP', tone: 'snapshot' };
    }
    if (node.kind === 'analysis') {
      return { chip: 'ANA', tone: 'analysis' };
    }
    if (node.kind === 'exposure') {
      return { chip: 'EXP', tone: 'exposure' };
    }
    if (node.kind === 'semantic_model') {
      return { chip: 'SEM', tone: 'semantic' };
    }
    if (node.kind === 'metric') {
      return { chip: 'MET', tone: 'metric' };
    }
    if (node.kind === 'saved_query') {
      return { chip: 'SQ', tone: 'saved' };
    }
    if (resourceName.startsWith('stg_')) {
      return { chip: 'STG', tone: 'stage' };
    }
    if (resourceName.startsWith('int_')) {
      return { chip: 'INT', tone: 'intermediate' };
    }
    if (resourceName.startsWith('dim_')) {
      return { chip: 'DIM', tone: 'dimension' };
    }
    if (resourceName.startsWith('fct_') || resourceName.startsWith('fact_') || resourceName.startsWith('fact')) {
      return { chip: 'FACT', tone: 'fact' };
    }
    if (resourceName.startsWith('mart_')) {
      return { chip: 'MART', tone: 'mart' };
    }
    return { chip: 'MODEL', tone: 'model' };
  }

  function isOverflowNode(node) {
    return Boolean(node.overflow);
  }

  function scopeKey(currentState) {
    return `${currentState.workspaceName}:${currentState.focus.focusId || 'none'}:${currentState.focus.upstreamDepth}:${currentState.focus.downstreamDepth}`;
  }

  function ensureScopeUi(key) {
    if (!uiStateByScope[key]) {
      uiStateByScope[key] = { positions: {}, viewport: null };
    }
    return uiStateByScope[key];
  }

  function persistUiState() {
    vscode.setState({ uiStateByScope });
  }

  function getViewportDimensions() {
    const width = Math.max(360, root?.clientWidth || window.innerWidth || 1200);
    const height = Math.max(360, root?.clientHeight || window.innerHeight || 720);
    return { width, height };
  }

  function getLayoutMetrics() {
    const { width, height } = getViewportDimensions();
    const usableWidth = Math.max(340, width - 36);
    const density = clamp((usableWidth - 420) / 780, 0, 1);

    const nodeW = Math.round(248 + density * (BASE_NODE_W - 248));
    const nodeH = Math.round(78 + density * (BASE_NODE_H - 78));
    const colGap = Math.round(92 + density * (BASE_COL_GAP - 92));
    const rowGap = Math.round(18 + density * (BASE_ROW_GAP - 18));
    const pad = Math.round(44 + density * (BASE_PAD - 44));
    const key = usableWidth < 620 ? 'compact' : usableWidth < 940 ? 'cozy' : 'wide';

    return {
      key,
      nodeW,
      nodeH,
      colGap,
      rowGap,
      pad,
      minBoardW: Math.max(usableWidth - 8, 420),
      minBoardH: Math.max(height - 164, 360),
      graphPad: key === 'compact' ? 12 : key === 'cozy' ? 14 : 18,
      titleSize: key === 'compact' ? '16px' : key === 'cozy' ? '17px' : '18px',
      domainSize: key === 'compact' ? '9px' : '10px'
    };
  }

  function applyLayoutTheme(metrics) {
    root.style.setProperty('--graph-wrap-pad', `${metrics.graphPad}px`);
    root.style.setProperty('--node-w', `${metrics.nodeW}px`);
    root.style.setProperty('--node-min-h', `${metrics.nodeH}px`);
    root.style.setProperty('--node-title-size', metrics.titleSize);
    root.style.setProperty('--node-domain-size', metrics.domainSize);
  }

  function scaleSavedPosition(pos, fromMetrics, toMetrics) {
    if (!fromMetrics) return { x: pos.x, y: pos.y };
    const fromStepX = (fromMetrics.nodeW || BASE_NODE_W) + (fromMetrics.colGap || BASE_COL_GAP);
    const toStepX = toMetrics.nodeW + toMetrics.colGap;
    const fromStepY = (fromMetrics.nodeH || BASE_NODE_H) + (fromMetrics.rowGap || BASE_ROW_GAP);
    const toStepY = toMetrics.nodeH + toMetrics.rowGap;
    return {
      x: pos.x * (toStepX / Math.max(fromStepX, 1)),
      y: pos.y * (toStepY / Math.max(fromStepY, 1))
    };
  }

  function materializationForNode(node) {
    if (node.materialization) return node.materialization;
    if (node.kind === 'overflow') return 'ranked overflow';
    if (node.kind === 'source') return 'source';
    if (node.kind === 'seed') return 'seed';
    if (node.kind === 'snapshot') return 'snapshot';
    if (node.kind === 'analysis') return 'analysis';
    if (node.kind === 'exposure') return 'exposure';
    if (node.kind === 'semantic_model') return 'semantic model';
    if (node.kind === 'metric') return 'metric';
    if (node.kind === 'saved_query') return 'saved query';
    return 'view';
  }

  function formatMaterialization(materialization) {
    return materialization.replace(/_/g, ' ');
  }

  function materializationClass(materialization) {
    return materialization.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  }

  function estimatedNodeHeight(_node, metrics) {
    return metrics.nodeH;
  }

  function nodeHeightFor(scene, nodeId) {
    return scene.nodeHeights?.get(nodeId) ?? scene.nodeH;
  }

  function nodeBoxFor(scene, nodeId) {
    const position = boardPosition(scene, nodeId);
    if (!position) return null;

    const card = scene.cards?.get(nodeId);
    const rendered = scene.renderedNodeSizes?.get(nodeId);
    return {
      x: position.x,
      y: position.y,
      w: card?.offsetWidth || rendered?.w || scene.nodeW,
      h: card?.offsetHeight || rendered?.h || nodeHeightFor(scene, nodeId)
    };
  }

  function computeBoardBounds(nodes, positions, nodeW, nodeH, metrics, nodeHeights = new Map()) {
    let minX = 0;
    let minY = 0;
    let maxX = nodeW;
    let maxY = nodeH;
    let seeded = false;

    for (const node of nodes) {
      const pos = positions.get(node.id);
      if (!pos) continue;
      const height = nodeHeights.get(node.id) ?? nodeH;

      if (!seeded) {
        minX = pos.x;
        minY = pos.y;
        maxX = pos.x + nodeW;
        maxY = pos.y + height;
        seeded = true;
        continue;
      }

      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + nodeW);
      maxY = Math.max(maxY, pos.y + height);
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      originX: metrics.pad - minX,
      originY: metrics.pad - minY,
      w: Math.max(maxX - minX + metrics.pad * 2, metrics.minBoardW),
      h: Math.max(maxY - minY + metrics.pad * 2, metrics.minBoardH)
    };
  }

  function contentBoxForScene(scene) {
    let minX = 0;
    let minY = 0;
    let maxX = scene.nodeW;
    let maxY = scene.nodeH;
    let seeded = false;

    for (const node of scene.nodes) {
      if (node.hidden || scene.hiddenIds?.has(node.id)) continue;
      const box = nodeBoxFor(scene, node.id);
      if (!box) continue;

      if (!seeded) {
        minX = box.x;
        minY = box.y;
        maxX = box.x + box.w;
        maxY = box.y + box.h;
        seeded = true;
        continue;
      }

      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.w);
      maxY = Math.max(maxY, box.y + box.h);
    }

    return {
      x: minX,
      y: minY,
      w: Math.max(1, maxX - minX),
      h: Math.max(1, maxY - minY)
    };
  }

  function boardPoint(scene, point) {
    return {
      x: point.x + scene.bounds.originX,
      y: point.y + scene.bounds.originY
    };
  }

  function boardPosition(scene, nodeId) {
    const pos = scene.positions.get(nodeId);
    if (!pos) return null;
    return boardPoint(scene, pos);
  }

  function nodeScreenCenter(scene, nodeId) {
    const pos = boardPosition(scene, nodeId);
    if (!pos) return null;
    return {
      x: scene.panX + (pos.x + scene.nodeW / 2) * scene.scale,
      y: scene.panY + (pos.y + nodeHeightFor(scene, nodeId) / 2) * scene.scale
    };
  }

  function preservePreviousFocusPosition(scene, previousScene) {
    if (!previousScene || previousScene.key !== scene.key) return false;
    const anchorId = scene.graphFocusId || scene.focusId;
    if (!anchorId || scene.hiddenIds?.has(anchorId) || previousScene.hiddenIds?.has(anchorId)) return false;

    const previousCenter = nodeScreenCenter(previousScene, anchorId);
    const nextPosition = boardPosition(scene, anchorId);
    if (!previousCenter || !nextPosition) return false;

    scene.panX = previousCenter.x - (nextPosition.x + scene.nodeW / 2) * scene.scale;
    scene.panY = previousCenter.y - (nextPosition.y + nodeHeightFor(scene, anchorId) / 2) * scene.scale;
    return true;
  }

  function layout(subgraph, focusId, metrics) {
    return dagreLayout(subgraph, focusId, metrics);
  }

  function dagreLayout(subgraph, focusId, metrics) {
    const dagreLib = window.dagre;
    const nodes = subgraph.nodes;
    const edges = subgraph.edges;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const nodeHeights = new Map(nodes.map((node) => [node.id, estimatedNodeHeight(node, metrics)]));
    const emptyLayout = {
      positions: new Map(),
      columns: new Map(),
      nodeW: metrics.nodeW,
      nodeH: metrics.nodeH,
      nodeHeights,
      size: { w: metrics.minBoardW, h: metrics.minBoardH },
      engine: 'dagre'
    };

    if (!dagreLib?.graphlib?.Graph || !dagreLib.layout) return emptyLayout;
    if (!focusId || !byId.has(focusId)) {
      return emptyLayout;
    }

    try {
      const graph = new dagreLib.graphlib.Graph({ multigraph: true });
      graph.setGraph({
        rankdir: 'LR',
        acyclicer: 'greedy',
        ranker: 'network-simplex',
        marginx: metrics.pad,
        marginy: metrics.pad,
        ranksep: metrics.colGap,
        nodesep: metrics.rowGap,
        edgesep: Math.max(16, Math.round(metrics.rowGap * 0.75))
      });
      graph.setDefaultEdgeLabel(() => ({ weight: 1, minlen: 1 }));

      for (const node of nodes) {
        graph.setNode(node.id, {
          width: metrics.nodeW,
          height: nodeHeights.get(node.id) ?? metrics.nodeH
        });
      }

      edges.forEach((edge, index) => {
        if (!byId.has(edge.from) || !byId.has(edge.to)) return;
        const touchesFocus = edge.from === focusId || edge.to === focusId;
        graph.setEdge(edge.to, edge.from, { weight: touchesFocus ? 2 : 1, minlen: 1 }, String(index));
      });

      dagreLib.layout(graph);

      const positions = new Map();
      const columns = new Map();
      for (const node of nodes) {
        const layoutNode = graph.node(node.id);
        if (!layoutNode) continue;
        positions.set(node.id, {
          x: layoutNode.x - metrics.nodeW / 2,
          y: layoutNode.y - (nodeHeights.get(node.id) ?? metrics.nodeH) / 2
        });
        if (Number.isFinite(layoutNode.rank)) columns.set(node.id, layoutNode.rank);
      }

      return {
        positions,
        columns,
        nodeW: metrics.nodeW,
        nodeH: metrics.nodeH,
        nodeHeights,
        size: { w: graph.graph().width ?? metrics.minBoardW, h: graph.graph().height ?? metrics.minBoardH },
        engine: 'dagre'
      };
    } catch {
      return emptyLayout;
    }
  }

  function boxesOverlap(left, right, gap) {
    return !(
      left.x + left.w + gap <= right.x ||
      right.x + right.w + gap <= left.x ||
      left.y + left.h + gap <= right.y ||
      right.y + right.h + gap <= left.y
    );
  }

  function settleNewNodePositions(nodes, edges, positions, stableNodeIds, nodeHeights, metrics) {
    const occupied = [];
    const visibleNodes = nodes.filter((node) => !node.hidden);
    const stepX = metrics.nodeW + metrics.colGap;

    function boxFor(node, pos) {
      return {
        x: pos.x,
        y: pos.y,
        w: metrics.nodeW,
        h: nodeHeights.get(node.id) ?? metrics.nodeH
      };
    }

    for (const node of visibleNodes) {
      if (!stableNodeIds.has(node.id)) continue;
      const pos = positions.get(node.id);
      if (pos) occupied.push(boxFor(node, pos));
    }

    function average(values) {
      if (!values.length) return 0;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    function preferredPosition(node, original) {
      const upstreamAnchors = [];
      const downstreamAnchors = [];

      for (const edge of edges) {
        if (edge.to === node.id && stableNodeIds.has(edge.from)) {
          const pos = positions.get(edge.from);
          if (pos) upstreamAnchors.push(pos);
        } else if (edge.from === node.id && stableNodeIds.has(edge.to)) {
          const pos = positions.get(edge.to);
          if (pos) downstreamAnchors.push(pos);
        }
      }

      if (upstreamAnchors.length >= downstreamAnchors.length && upstreamAnchors.length) {
        return {
          x: Math.min(...upstreamAnchors.map((pos) => pos.x)) - stepX,
          y: average(upstreamAnchors.map((pos) => pos.y))
        };
      }

      if (downstreamAnchors.length) {
        return {
          x: Math.max(...downstreamAnchors.map((pos) => pos.x)) + stepX,
          y: average(downstreamAnchors.map((pos) => pos.y))
        };
      }

      return original;
    }

    const newNodes = visibleNodes
      .filter((node) => !stableNodeIds.has(node.id))
      .sort((a, b) => {
        const aPos = positions.get(a.id) ?? { x: 0, y: 0 };
        const bPos = positions.get(b.id) ?? { x: 0, y: 0 };
        return aPos.x === bPos.x ? aPos.y - bPos.y : aPos.x - bPos.x;
      });

    for (const node of newNodes) {
      const original = positions.get(node.id);
      if (!original) continue;
      let pos = { ...preferredPosition(node, original) };
      let box = boxFor(node, pos);
      let attempts = 0;

      while (occupied.some((used) => boxesOverlap(box, used, Math.max(8, metrics.rowGap / 2))) && attempts < 80) {
        pos = { x: pos.x, y: pos.y + box.h + metrics.rowGap };
        box = boxFor(node, pos);
        attempts += 1;
      }

      positions.set(node.id, pos);
      occupied.push(box);
    }
  }

  function positionOverflowNodesAtColumnBottom(nodes, positions, nodeHeights, metrics) {
    const visibleNodes = nodes.filter((node) => !node.hidden);
    const overflowNodes = visibleNodes
      .filter(isOverflowNode)
      .sort((a, b) => {
        const aPos = positions.get(a.id) ?? { x: 0, y: 0 };
        const bPos = positions.get(b.id) ?? { x: 0, y: 0 };
        const aOwnerY = positions.get(a.overflow.ownerId)?.y ?? aPos.y;
        const bOwnerY = positions.get(b.overflow.ownerId)?.y ?? bPos.y;
        if (aPos.x !== bPos.x) return aPos.x - bPos.x;
        if (aOwnerY !== bOwnerY) return aOwnerY - bOwnerY;
        return a.label.localeCompare(b.label);
      });
    const columnBottoms = new Map();

    function columnKey(x) {
      return String(Math.round(x));
    }

    for (const node of visibleNodes) {
      if (isOverflowNode(node)) continue;
      const pos = positions.get(node.id);
      if (!pos) continue;
      const key = columnKey(pos.x);
      const bottom = pos.y + (nodeHeights.get(node.id) ?? metrics.nodeH);
      columnBottoms.set(key, Math.max(columnBottoms.get(key) ?? Number.NEGATIVE_INFINITY, bottom));
    }

    for (const node of overflowNodes) {
      const current = positions.get(node.id);
      if (!current) continue;
      const key = columnKey(current.x);
      const bottom = columnBottoms.get(key);
      if (!Number.isFinite(bottom)) continue;
      const y = bottom + metrics.rowGap;
      positions.set(node.id, { x: current.x, y });
      columnBottoms.set(key, y + (nodeHeights.get(node.id) ?? metrics.nodeH));
    }
  }

  function computeScene(currentState, previousScene = null) {
    const layoutMetrics = getLayoutMetrics();
    applyLayoutTheme(layoutMetrics);
    const nodeIds = new Set(currentState.subgraph.nodes.map((node) => node.id));
    const layoutFocusId = nodeIds.has(currentState.focus.focusId)
      ? currentState.focus.focusId
      : nodeIds.has(currentState.focus.selectedId)
        ? currentState.focus.selectedId
        : currentState.subgraph.nodes[0]?.id || null;
    const base = layout(currentState.subgraph, layoutFocusId, layoutMetrics);
    const key = scopeKey(currentState);
    const saved = ensureScopeUi(key);
    const positions = new Map(base.positions);
    const savedLayoutMetrics = saved.layoutMetrics || null;
    const stableNodeIds = new Set();

    for (const [nodeId, pos] of Object.entries(saved.positions || {})) {
      if (!positions.has(nodeId) || nodeId === layoutFocusId) continue;
      if (currentState.subgraph.nodes.find((node) => node.id === nodeId)?.overflow) continue;
      positions.set(nodeId, scaleSavedPosition(pos, savedLayoutMetrics, layoutMetrics));
      stableNodeIds.add(nodeId);
    }

    if (previousScene?.key === key) {
      for (const node of currentState.subgraph.nodes) {
        if (isOverflowNode(node)) continue;
        const previous = previousScene.positions.get(node.id);
        if (!previous) continue;
        positions.set(node.id, scaleSavedPosition(previous, previousScene.layoutMetrics, layoutMetrics));
        stableNodeIds.add(node.id);
      }
    }

    const hiddenIds = new Set(currentState.subgraph.nodes.filter((node) => node.hidden).map((node) => node.id));
    settleNewNodePositions(currentState.subgraph.nodes, currentState.subgraph.edges, positions, stableNodeIds, base.nodeHeights, layoutMetrics);
    positionOverflowNodesAtColumnBottom(currentState.subgraph.nodes, positions, base.nodeHeights, layoutMetrics);
    const bounds = computeBoardBounds(currentState.subgraph.nodes, positions, base.nodeW, base.nodeH, layoutMetrics, base.nodeHeights);
    const savedViewport = saved.viewport || {};
    const hasSavedViewport =
      Number.isFinite(savedViewport.panX) &&
      Number.isFinite(savedViewport.panY);
    const reusingPreviousViewport = previousScene?.key === key && Number.isFinite(previousScene.panX) && Number.isFinite(previousScene.panY);
    const scale = reusingPreviousViewport
      ? clamp(previousScene.scale, MIN_SCALE, MAX_SCALE)
      : clamp(savedViewport.scale ?? 1, MIN_SCALE, MAX_SCALE);
    const viewport = reusingPreviousViewport
      ? {
          scale,
          panX: previousScene.panX - (bounds.originX - previousScene.bounds.originX) * scale,
          panY: previousScene.panY - (bounds.originY - previousScene.bounds.originY) * scale
        }
      : savedViewport;

    return {
      key,
      nodes: [...currentState.subgraph.nodes],
      edges: currentState.subgraph.edges,
      focusId: layoutFocusId,
      graphFocusId: currentState.focus.focusId,
      selectedId: currentState.focus.selectedId,
      hiddenIds,
      layoutEngine: base.engine || 'custom',
      columns: base.columns,
      nodeW: base.nodeW,
      nodeH: base.nodeH,
      nodeHeights: base.nodeHeights,
      layoutMetrics,
      positions,
      bounds,
      scale,
      panX: viewport.panX ?? 0,
      panY: viewport.panY ?? 0,
      viewportSource: reusingPreviousViewport ? 'previous' : hasSavedViewport ? 'saved' : 'new',
      hasViewport: reusingPreviousViewport || hasSavedViewport
    };
  }

  function saveSceneViewport(scene) {
    const saved = ensureScopeUi(scene.key);
    saved.viewport = {
      scale: scene.scale,
      panX: scene.panX,
      panY: scene.panY,
      layoutKey: scene.layoutMetrics.key
    };
    persistUiState();
  }

  function saveScenePositions(scene) {
    const saved = ensureScopeUi(scene.key);
    const positions = {};
    for (const node of scene.nodes) {
      if (node.id === scene.focusId) continue;
      if (isOverflowNode(node)) continue;
      const pos = scene.positions.get(node.id);
      if (pos) positions[node.id] = { x: pos.x, y: pos.y };
    }
    saved.positions = positions;
    saved.layoutMetrics = {
      key: scene.layoutMetrics.key,
      nodeW: scene.layoutMetrics.nodeW,
      nodeH: scene.layoutMetrics.nodeH,
      colGap: scene.layoutMetrics.colGap,
      rowGap: scene.layoutMetrics.rowGap
    };
    persistUiState();
  }

  function resetSceneLayout(scene) {
    const saved = ensureScopeUi(scene.key);
    saved.positions = {};
    saved.viewport = null;
    suppressNextSceneReuse = true;
    persistUiState();
    render();
  }

  function positionCard(scene, nodeId) {
    const card = scene.cards.get(nodeId);
    const pos = boardPosition(scene, nodeId);
    if (!card || !pos) return;
    card.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  }

  function syncRenderedNodeSizes(scene) {
    if (!scene.cards) return false;
    if (!scene.renderedNodeSizes) scene.renderedNodeSizes = new Map();

    let changed = false;
    for (const [nodeId, card] of scene.cards.entries()) {
      const width = card.offsetWidth || scene.nodeW;
      const height = card.offsetHeight || nodeHeightFor(scene, nodeId);
      const previous = scene.renderedNodeSizes.get(nodeId);
      if (!previous || Math.abs(previous.w - width) > 0.5 || Math.abs(previous.h - height) > 0.5) {
        scene.renderedNodeSizes.set(nodeId, { w: width, h: height });
        changed = true;
      }
      if (height && Math.abs((scene.nodeHeights.get(nodeId) ?? scene.nodeH) - height) > 0.5) {
        scene.nodeHeights.set(nodeId, height);
        changed = true;
      }
    }

    return changed;
  }

  function observeCardSizes(scene) {
    if (typeof ResizeObserver === 'undefined' || !scene.cards) return;
    const observer = new ResizeObserver(() => {
      if (activeScene !== scene) return;
      refreshSceneBounds(scene);
      drawEdges(scene);
    });
    for (const card of scene.cards.values()) {
      observer.observe(card);
    }
    scene.cardResizeObserver = observer;
  }

  function applyViewport(scene) {
    scene.board.style.transform = `translate(${scene.panX}px, ${scene.panY}px) scale(${scene.scale})`;
    if (scene.zoomValue) {
      scene.zoomValue.textContent = `${Math.round(scene.scale * 100)}%`;
    }
  }

  function refreshSceneBounds(scene) {
    const previous = scene.bounds;
    syncRenderedNodeSizes(scene);
    scene.bounds = computeBoardBounds(scene.nodes, scene.positions, scene.nodeW, scene.nodeH, scene.layoutMetrics, scene.nodeHeights);
    scene.board.style.width = `${scene.bounds.w}px`;
    scene.board.style.height = `${scene.bounds.h}px`;
    scene.svgLayer.setAttribute('width', String(scene.bounds.w));
    scene.svgLayer.setAttribute('height', String(scene.bounds.h));
    scene.svgLayer.setAttribute('viewBox', `0 0 ${scene.bounds.w} ${scene.bounds.h}`);

    if (previous) {
      const deltaX = scene.bounds.originX - previous.originX;
      const deltaY = scene.bounds.originY - previous.originY;
      if (deltaX || deltaY) {
        scene.panX -= deltaX * scene.scale;
        scene.panY -= deltaY * scene.scale;
        applyViewport(scene);
      }
    }

    if (scene.cards) {
      for (const node of scene.nodes) {
        positionCard(scene, node.id);
      }
    }
  }

  function centerContent(scene) {
    const box = contentBoxForScene(scene);
    const rect = scene.viewport.getBoundingClientRect();
    const viewportWidth = rect.width || scene.viewport.clientWidth || 1200;
    const viewportHeight = rect.height || scene.viewport.clientHeight || 720;
    scene.panX = (viewportWidth - box.w * scene.scale) / 2 - box.x * scene.scale;
    scene.panY = (viewportHeight - box.h * scene.scale) / 2 - box.y * scene.scale;
    applyViewport(scene);
  }

  function fitScaleForScene(scene) {
    const box = contentBoxForScene(scene);
    const rect = scene.viewport.getBoundingClientRect();
    const viewportWidth = rect.width || scene.viewport.clientWidth || 1200;
    const viewportHeight = rect.height || scene.viewport.clientHeight || 720;
    const fitX = (viewportWidth - 72) / Math.max(box.w, 1);
    const fitY = (viewportHeight - 72) / Math.max(box.h, 1);
    return clamp(Math.min(1, fitX, fitY), MIN_SCALE, MAX_SCALE);
  }

  function fitAndCenterScene(scene) {
    scene.scale = fitScaleForScene(scene);
    centerContent(scene);
  }

  function zoomTo(scene, nextScale, clientX, clientY) {
    const targetScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    if (targetScale === scene.scale) return;

    const rect = scene.viewport.getBoundingClientRect();
    const anchorX = clientX == null ? rect.width / 2 : clientX - rect.left;
    const anchorY = clientY == null ? rect.height / 2 : clientY - rect.top;
    const worldX = (anchorX - scene.panX) / scene.scale;
    const worldY = (anchorY - scene.panY) / scene.scale;

    scene.scale = targetScale;
    scene.panX = anchorX - worldX * scene.scale;
    scene.panY = anchorY - worldY * scene.scale;
    applyViewport(scene);
    saveSceneViewport(scene);
  }

  function edgeKey(edge, index) {
    return `${index}:${edge.from}->${edge.to}`;
  }

  function relationMaps(scene) {
    const dependenciesByNode = new Map();
    const dependentsByNode = new Map();
    const visibleIds = new Set(scene.nodes.filter((node) => !node.hidden).map((node) => node.id));

    function add(map, key, value) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(value);
    }

    for (const edge of scene.edges) {
      if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) continue;
      if (scene.hiddenIds?.has(edge.from) || scene.hiddenIds?.has(edge.to)) continue;
      add(dependenciesByNode, edge.from, edge.to);
      add(dependentsByNode, edge.to, edge.from);
    }

    return { dependenciesByNode, dependentsByNode, visibleIds };
  }

  function collectReachable(startId, adjacency, visibleIds) {
    const visited = new Set();
    const queue = [startId];

    while (queue.length) {
      const current = queue.shift();
      if (!current || visited.has(current) || !visibleIds.has(current)) continue;
      visited.add(current);
      for (const next of adjacency.get(current) || []) {
        if (!visited.has(next)) queue.push(next);
      }
    }

    return visited;
  }

  function computeActiveSelectionIds(scene) {
    if (!scene.selectedId || scene.selectedId === scene.graphFocusId || scene.hiddenIds?.has(scene.selectedId)) return null;

    const { dependenciesByNode, dependentsByNode, visibleIds } = relationMaps(scene);
    if (!visibleIds.has(scene.selectedId)) return null;

    const active = collectReachable(scene.selectedId, dependenciesByNode, visibleIds);
    for (const nodeId of collectReachable(scene.selectedId, dependentsByNode, visibleIds)) active.add(nodeId);

    active.add(scene.selectedId);
    return active;
  }

  function isNodeActive(scene, nodeId) {
    return !scene.activeSelectionIds || scene.activeSelectionIds.has(nodeId);
  }

  function isEdgeActive(scene, edge) {
    return isNodeActive(scene, edge.from) && isNodeActive(scene, edge.to);
  }

  function activeClass(scene, nodeId) {
    return isNodeActive(scene, nodeId) && scene.activeSelectionIds ? ' activePath' : '';
  }

  function edgeAnchorPoints(scene, edge, index) {
    const upstream = nodeBoxFor(scene, edge.to);
    const downstream = nodeBoxFor(scene, edge.from);
    if (!upstream || !downstream) return null;

    const startX = upstream.x + upstream.w + 2;
    const targetTipX = downstream.x + 1;
    const endX = targetTipX - ARROW_HEAD_LENGTH;
    const key = edgeKey(edge, index);
    return {
      key,
      sourceId: edge.to,
      targetId: edge.from,
      startX,
      startY: upstream.y + upstream.h / 2,
      endX,
      endY: downstream.y + downstream.h / 2
    };
  }

  function buildEdgeMetrics() {
    return { bundleByEdge: new Map(), bundleGroups: new Map() };
  }

  function simpleEdgePath(scene, edge, index) {
    const anchors = edgeAnchorPoints(scene, edge, index);
    if (!anchors) return null;

    const travel = anchors.endX - anchors.startX;
    if (travel <= 28) return detourEdgePath(anchors);

    const curve = clamp(Math.abs(travel) * 0.34, 22, 60);
    return [
      `M ${anchors.startX} ${anchors.startY}`,
      `C ${anchors.startX + curve} ${anchors.startY}, ${anchors.endX - curve} ${anchors.endY}, ${anchors.endX} ${anchors.endY}`
    ].join(' ');
  }

  function detourEdgePath(anchors) {
    const sourceExitX = anchors.startX + 44;
    const targetApproachX = anchors.endX - 44;
    const midY = anchors.startY + (anchors.endY - anchors.startY) / 2;

    return [
      `M ${anchors.startX} ${anchors.startY}`,
      `L ${sourceExitX} ${anchors.startY}`,
      `L ${sourceExitX} ${midY}`,
      `L ${targetApproachX} ${midY}`,
      `L ${targetApproachX} ${anchors.endY}`,
      `L ${anchors.endX} ${anchors.endY}`
    ].join(' ');
  }

  function bundledBranchPath(scene, edge, metrics, index) {
    const anchors = edgeAnchorPoints(scene, edge, index);
    if (!anchors) return null;

    const groupId = metrics.bundleByEdge.get(anchors.key);
    const group = groupId ? metrics.bundleGroups.get(groupId) : null;
    if (!group || !group.canBundle) {
      return { path: simpleEdgePath(scene, edge, index), bundled: false };
    }

    const travel = group.mergeX - anchors.startX;
    if (Math.abs(travel) <= 18) {
      return { path: simpleEdgePath(scene, edge, index), bundled: false };
    }

    const sourceLead = clamp(Math.abs(travel) * 0.4, 22, 68);
    const targetLead = clamp(16 + Math.abs(group.endY - anchors.startY) * 0.08, 16, 34);
    return {
      bundled: true,
      groupId,
      path: [
        `M ${anchors.startX} ${anchors.startY}`,
        `C ${anchors.startX + sourceLead} ${anchors.startY}, ${group.mergeX - targetLead} ${group.endY}, ${group.mergeX} ${group.endY}`
      ].join(' ')
    };
  }

  function bundleTrunkPath(group) {
    if (!group.canBundle) return null;
    return `M ${group.mergeX} ${group.endY} L ${group.endX} ${group.endY}`;
  }

  function drawEdges(scene) {
    const defs = svg('defs');
    const marker = svg('marker', {
      id: 'fastlineage-arrow',
      viewBox: '0 0 8 8',
      refX: 0,
      refY: 4,
      markerWidth: ARROW_HEAD_LENGTH,
      markerHeight: ARROW_HEAD_LENGTH,
      markerUnits: 'userSpaceOnUse',
      orient: 'auto-start-reverse'
    });
    marker.appendChild(svg('path', { d: 'M 0 0 L 8 4 L 0 8 z', fill: 'currentColor' }));
    defs.appendChild(marker);

    const fragment = document.createDocumentFragment();
    fragment.appendChild(defs);

    const metrics = buildEdgeMetrics();
    const highlightId = scene.selectedId || scene.focusId;

    scene.edges.forEach((edge, index) => {
      if (scene.hiddenIds?.has(edge.from) || scene.hiddenIds?.has(edge.to)) return;
      const active = isEdgeActive(scene, edge);
      const branch = bundledBranchPath(scene, edge, metrics, index);
      const path = branch?.path;
      if (!path) return;
      const edgeNode = svg('path', {
        class: [
          'edge',
          active && scene.activeSelectionIds ? 'activePath' : '',
          active && (edge.from === highlightId || edge.to === highlightId) ? 'focus' : '',
          active ? '' : 'dimmed'
        ]
          .filter(Boolean)
          .join(' '),
        d: path
      });
      if (!branch?.bundled) edgeNode.setAttribute('marker-end', 'url(#fastlineage-arrow)');
      fragment.appendChild(edgeNode);
    });

    for (const group of metrics.bundleGroups.values()) {
      if (!group.canBundle) continue;
      const highlight = group.targetId === highlightId || group.entries.some((entry) => entry.edge.to === highlightId);
      const trunkPath = bundleTrunkPath(group);
      if (trunkPath) {
        fragment.appendChild(
          svg('path', {
            class: highlight ? 'edge focus' : 'edge',
            d: trunkPath,
            'marker-end': 'url(#fastlineage-arrow)'
          })
        );
      }
    }

    scene.svgLayer.replaceChildren(fragment);
  }

  function makeNodeOpenHandler(node) {
    return () => vscode.postMessage({ type: 'openNode', id: node.id });
  }

  function makeNodeFocusHandler(node) {
    return () => vscode.postMessage({ type: 'focusNode', id: node.id });
  }

  function makeNodeSelectHandler(node) {
    return () => vscode.postMessage({ type: 'selectNode', id: node.id });
  }

  function makeNodeExpandHandler(node, direction) {
    return () => vscode.postMessage({ type: 'expandNode', id: node.id, direction });
  }

  function makeShowMoreExpansionHandler(node) {
    return () =>
      vscode.postMessage({
        type: 'showMoreExpansion',
        id: node.overflow.ownerId,
        direction: node.overflow.direction
      });
  }

  function makeShowAllExpansionHandler(node) {
    return () =>
      vscode.postMessage({
        type: 'showAllExpansion',
        id: node.overflow.ownerId,
        direction: node.overflow.direction
      });
  }

  function makeNodeCollapseHandler(node, direction) {
    return () => vscode.postMessage({ type: 'collapseNode', id: node.id, direction });
  }

  function makeNodeHideHandler(node) {
    return () => vscode.postMessage({ type: 'hideNode', id: node.id });
  }

  function closeContextMenu() {
    if (!activeContextMenu) return;
    activeContextMenu.remove();
    activeContextMenu = null;
  }

  function showNodeContextMenu(node, event) {
    event.preventDefault();
    event.stopPropagation();
    closeContextMenu();

    const menu = el('div', {
      className: 'nodeContextMenu',
      role: 'menu',
      'aria-label': `${node.label} actions`
    });

    const openAction = el('button', {
      className: 'nodeContextMenuItem',
      role: 'menuitem',
      text: 'Open File'
    });
    openAction.addEventListener('click', () => {
      closeContextMenu();
      makeNodeOpenHandler(node)();
    });

    const focusAction = el('button', {
      className: 'nodeContextMenuItem',
      role: 'menuitem',
      text: 'Focus and Reset Layout'
    });
    focusAction.addEventListener('click', () => {
      closeContextMenu();
      makeNodeFocusHandler(node)();
    });

    menu.appendChild(openAction);
    menu.appendChild(focusAction);
    document.body.appendChild(menu);

    const margin = 8;
    const rect = menu.getBoundingClientRect();
    const x = Math.min(event.clientX, window.innerWidth - rect.width - margin);
    const y = Math.min(event.clientY, window.innerHeight - rect.height - margin);
    menu.style.left = `${Math.max(margin, x)}px`;
    menu.style.top = `${Math.max(margin, y)}px`;
    activeContextMenu = menu;
  }

  function isCardDeleteKey(event) {
    return event.key === 'Delete' || event.key === 'Backspace';
  }

  function isEditableKeyTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]'));
  }

  function shouldIgnoreGraphDeleteShortcut(event) {
    if (event.defaultPrevented || !isCardDeleteKey(event)) return true;
    const target = event.target;
    if (!(target instanceof Element)) return false;
    if (target.closest('.toolbar')) return true;
    return isEditableKeyTarget(target);
  }

  function visibleNodeById(scene, nodeId) {
    if (!scene || !nodeId) return null;
    return scene.nodes.find((node) => node.id === nodeId && !node.hidden) || null;
  }

  function shouldSuppressCardClick(card) {
    const until = Number(card.dataset.dragSuppressUntil || 0);
    if (!until || until <= Date.now()) return false;
    delete card.dataset.dragSuppressUntil;
    return true;
  }

  function enableCardDrag(scene, node, card) {
    card.classList.add('draggable');
    card.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const pointerId = event.pointerId;
      const startPos = scene.positions.get(node.id);
      if (!startPos) return;

      const originX = event.clientX;
      const originY = event.clientY;
      let moved = false;
      card.classList.add('dragging');
      if (card.setPointerCapture) {
        card.setPointerCapture(pointerId);
      }

      const onMove = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const dx = (moveEvent.clientX - originX) / scene.scale;
        const dy = (moveEvent.clientY - originY) / scene.scale;
        if (!moved && Math.abs(dx) + Math.abs(dy) > 2) moved = true;

        const next = {
          x: startPos.x + dx,
          y: startPos.y + dy
        };

        scene.positions.set(node.id, next);
        refreshSceneBounds(scene);
        drawEdges(scene);
      };

      const onEnd = (endEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        card.removeEventListener('pointermove', onMove);
        card.removeEventListener('pointerup', onEnd);
        card.removeEventListener('pointercancel', onEnd);
        if (card.releasePointerCapture && (!card.hasPointerCapture || card.hasPointerCapture(pointerId))) {
          card.releasePointerCapture(pointerId);
        }
        card.classList.remove('dragging');
        if (moved) {
          card.dataset.dragSuppressUntil = String(Date.now() + 220);
          saveScenePositions(scene);
        }
      };

      card.addEventListener('pointermove', onMove);
      card.addEventListener('pointerup', onEnd);
      card.addEventListener('pointercancel', onEnd);
    });
  }

  function renderNodeCard(scene, node) {
    const role = roleForNode(node);
    const materialization = materializationForNode(node);
    const isOverflow = isOverflowNode(node);
    const isFocus = node.id === scene.focusId;
    const isSelected = node.id === scene.selectedId;
    const isDimmed = !isNodeActive(scene, node.id);
    const cardAttrs = {
      className: `nodeCard tone-${role.tone}${isFocus ? ' anchor' : ''}${isSelected ? ' selected' : ''}${activeClass(scene, node.id)}${isDimmed ? ' dimmed' : ''}${isOverflow ? ' overflow' : ''}`,
      role: isOverflow ? 'status' : 'button'
    };
    if (!isOverflow) cardAttrs.tabindex = '0';
    const card = el('div', {
      ...cardAttrs
    });

    const identity = el('div', { className: 'nodeIdentity' });
    if (!isOverflow) {
      const nodeMark = el('div', { className: 'nodeMark' });
      nodeMark.appendChild(el('span', { className: 'nodeChip', text: role.chip }));
      identity.appendChild(nodeMark);
    }

    const titleWrap = el('div', { className: 'nodeTitleWrap' });
    titleWrap.appendChild(el('div', { className: 'nodeName', text: node.label }));
    identity.appendChild(titleWrap);

    const consume = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    function makeExpansionButton(direction) {
      const isUpstream = direction === 'upstream';
      const canCollapse = isUpstream ? node.canCollapseUpstream : node.canCollapseDownstream;
      const canExpand = isUpstream ? node.canExpandUpstream : node.canExpandDownstream;
      const expandCount = isUpstream ? node.expandUpstreamCount || 0 : node.expandDownstreamCount || 0;
      const button = el('button', {
        className: `nodeExpander ${direction}${canCollapse ? ' isCollapse' : ''}`,
        text: canCollapse ? '−' : '+'
      });

      if (!canCollapse && !canExpand) button.classList.add('isHidden');
      if (!canCollapse && expandCount > 0) {
        button.appendChild(el('span', { className: 'nodeExpandCount', text: String(expandCount) }));
      }
      button.addEventListener('pointerdown', consume);
      button.addEventListener('click', (event) => {
        consume(event);
        scene.selectedId = scene.graphFocusId || scene.focusId;
        syncActiveSelection(scene);
        if (canCollapse) makeNodeCollapseHandler(node, direction)();
        else makeNodeExpandHandler(node, direction)();
      });

      return button;
    }

    const upstreamButton = makeExpansionButton('upstream');
    const downstreamButton = makeExpansionButton('downstream');
    const focusButton = isOverflow
      ? null
      : el('button', {
          className: 'nodeFocus',
          'aria-label': 'Focus graph on this card',
          title: 'Focus graph here and rebuild the lineage around this card'
        });
    if (focusButton) {
      focusButton.addEventListener('pointerdown', consume);
      focusButton.addEventListener('click', (event) => {
        consume(event);
        makeNodeFocusHandler(node)();
      });
    }

    const footer = el('div', { className: 'nodeFooter' });
    const facts = el('div', { className: 'nodeFacts' });
    if (isOverflow) {
      const revealCount = node.overflow.revealCount;
      footer.classList.add('overflowActions');
      const overflowAction = el('button', {
        className: 'nodeOverflowAction',
        text: `Show ${revealCount} more`
      });
      overflowAction.addEventListener('pointerdown', consume);
      overflowAction.addEventListener('click', (event) => {
        consume(event);
        makeShowMoreExpansionHandler(node)();
      });
      const overflowAllAction = el('button', {
        className: 'nodeOverflowAction',
        text: `Show all ${node.overflow.hiddenCount}`
      });
      overflowAllAction.addEventListener('pointerdown', consume);
      overflowAllAction.addEventListener('click', (event) => {
        consume(event);
        makeShowAllExpansionHandler(node)();
      });
      footer.appendChild(overflowAction);
      footer.appendChild(overflowAllAction);
    } else {
      facts.appendChild(
        el('span', {
          className: `nodeMaterial material-${materializationClass(materialization)}`,
          text: formatMaterialization(materialization)
        })
      );
      footer.appendChild(facts);
    }

    card.appendChild(identity);
    card.appendChild(footer);
    if (focusButton) card.appendChild(focusButton);
    if (!isOverflow) {
      card.appendChild(upstreamButton);
      card.appendChild(downstreamButton);
    }
    if (isOverflow) return card;

    card.addEventListener('click', () => {
      if (shouldSuppressCardClick(card)) return;
      card.focus({ preventScroll: true });
      selectNodeInScene(scene, node);
    });
    card.addEventListener('dblclick', (event) => {
      event.preventDefault();
      makeNodeOpenHandler(node)();
    });
    card.addEventListener('contextmenu', (event) => {
      showNodeContextMenu(node, event);
    });
    card.addEventListener('keydown', (event) => {
      if (isCardDeleteKey(event)) {
        consume(event);
        makeNodeHideHandler(node)();
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        selectNodeInScene(scene, node);
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      makeNodeOpenHandler(node)();
    });

    if (!isFocus) {
      enableCardDrag(scene, node, card);
    }

    return card;
  }

  function syncActiveSelection(scene) {
    scene.activeSelectionIds = computeActiveSelectionIds(scene);

    for (const node of scene.nodes) {
      const card = scene.cards?.get(node.id);
      if (!card) continue;
      const active = isNodeActive(scene, node.id);
      card.classList.toggle('selected', node.id === scene.selectedId);
      card.classList.toggle('activePath', active && Boolean(scene.activeSelectionIds));
      card.classList.toggle('dimmed', !active);
    }

    drawEdges(scene);
  }

  function selectNodeInScene(scene, node) {
    scene.selectedId = node.id;
    syncActiveSelection(scene);
    makeNodeSelectHandler(node)();
  }

  function enableViewportPan(scene) {
    scene.viewport.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('.nodeCard')) return;
      event.preventDefault();

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      const startPanX = scene.panX;
      const startPanY = scene.panY;
      scene.viewport.classList.add('panning');
      if (scene.viewport.setPointerCapture) {
        scene.viewport.setPointerCapture(pointerId);
      }

      const onMove = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        scene.panX = startPanX + (moveEvent.clientX - startX);
        scene.panY = startPanY + (moveEvent.clientY - startY);
        applyViewport(scene);
      };

      const onEnd = (endEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        scene.viewport.removeEventListener('pointermove', onMove);
        scene.viewport.removeEventListener('pointerup', onEnd);
        scene.viewport.removeEventListener('pointercancel', onEnd);
        if (scene.viewport.releasePointerCapture && (!scene.viewport.hasPointerCapture || scene.viewport.hasPointerCapture(pointerId))) {
          scene.viewport.releasePointerCapture(pointerId);
        }
        scene.viewport.classList.remove('panning');
        saveSceneViewport(scene);
      };

      scene.viewport.addEventListener('pointermove', onMove);
      scene.viewport.addEventListener('pointerup', onEnd);
      scene.viewport.addEventListener('pointercancel', onEnd);
    });

    scene.viewport.addEventListener(
      'wheel',
      (event) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        const factor = event.deltaY < 0 ? 1.08 : 0.92;
        zoomTo(scene, scene.scale * factor, event.clientX, event.clientY);
      },
      { passive: false }
    );
  }

  function mountScene(container, scene) {
    const viewport = el('div', { className: 'graphViewport' });
    const board = el('div', { className: 'graphBoard' });
    const svgLayer = svg('svg', {
      class: 'edgeLayer',
      width: scene.bounds.w,
      height: scene.bounds.h,
      viewBox: `0 0 ${scene.bounds.w} ${scene.bounds.h}`
    });

    board.appendChild(svgLayer);
    viewport.appendChild(board);
    container.appendChild(viewport);

    const cards = new Map();
    const orderedNodes = [...scene.nodes].sort((a, b) => {
      if (a.id === scene.focusId) return 1;
      if (b.id === scene.focusId) return -1;
      const left = scene.positions.get(a.id)?.x ?? 0;
      const right = scene.positions.get(b.id)?.x ?? 0;
      if (left !== right) return left - right;
      return (scene.positions.get(a.id)?.y ?? 0) - (scene.positions.get(b.id)?.y ?? 0);
    });

    const mounted = {
      ...scene,
      viewport,
      board,
      svgLayer,
      cards,
      renderedNodeSizes: new Map(),
      activeSelectionIds: computeActiveSelectionIds(scene),
      zoomValue: null
    };
    for (const node of orderedNodes) {
      if (node.hidden) continue;
      const card = renderNodeCard(mounted, node);
      card.style.minHeight = `${nodeHeightFor(mounted, node.id)}px`;
      board.appendChild(card);
      cards.set(node.id, card);
    }

    for (const node of mounted.nodes) {
      positionCard(mounted, node.id);
    }

    refreshSceneBounds(mounted);
    drawEdges(mounted);
    observeCardSizes(mounted);
    enableViewportPan(mounted);
    return mounted;
  }

  function toolbarStats(currentState) {
    const parts = [];
    if (currentState.graphStats.models) parts.push(`${currentState.graphStats.models} models`);
    if (currentState.graphStats.snapshots) parts.push(`${currentState.graphStats.snapshots} snapshots`);
    if (currentState.graphStats.seeds) parts.push(`${currentState.graphStats.seeds} seeds`);
    if (currentState.graphStats.sources) parts.push(`${currentState.graphStats.sources} sources`);
    if (currentState.graphStats.analyses) parts.push(`${currentState.graphStats.analyses} analyses`);
    if (currentState.graphStats.exposures) parts.push(`${currentState.graphStats.exposures} exposures`);
    if (currentState.graphStats.semanticModels) parts.push(`${currentState.graphStats.semanticModels} semantic models`);
    // Metrics still exist in graphStats and the graph; keep the header count hidden for now
    // if (currentState.graphStats.metrics) parts.push(`${currentState.graphStats.metrics} metrics`);
    if (currentState.graphStats.savedQueries) parts.push(`${currentState.graphStats.savedQueries} saved queries`);
    parts.push(`${currentState.graphStats.edges} edges`);
    return parts.join(' • ');
  }

  function refreshStatusText(refresh) {
    if (!refresh?.isRefreshing) return null;
    if (refresh.stage === 'workspace') return 'Building full workspace...';
    return 'Building active project...';
  }

  function renderToolbar(currentState) {
    const toolbar = el('div', { className: 'toolbar' });
    const actions = el('div', { className: 'toolbarGroup' });
    const stats = el('div', { className: 'statsGroup' });
    const refreshText = refreshStatusText(currentState.refresh);

    const refresh = el('button', { className: 'primary', text: refreshText ? 'Refreshing...' : 'Refresh' });
    if (refreshText) refresh.setAttribute('disabled', 'true');
    refresh.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));

    const focusEditor = el('button', {
      className: 'subtle',
      text: 'Use Open File'
    });
    focusEditor.addEventListener('click', () => vscode.postMessage({ type: 'revealActive' }));

    const resetLayout = el('button', {
      className: 'subtle',
      text: 'Reset Layout'
    });
    resetLayout.addEventListener('click', () => {
      if (activeScene) resetSceneLayout(activeScene);
    });

    const depthControl = el('div', { className: 'depthControl depthCombo' });

    const upstreamMinus = el('button', { text: '−' });
    upstreamMinus.addEventListener('click', () =>
      vscode.postMessage({ type: 'setDepth', direction: 'upstream', depth: Math.max(0, currentState.focus.upstreamDepth - 1) })
    );
    const upstreamValue = el('span', { className: 'depthValue', text: `↑ ${currentState.focus.upstreamDepth}` });
    const upstreamPlus = el('button', { text: '+' });
    upstreamPlus.addEventListener('click', () =>
      vscode.postMessage({ type: 'setDepth', direction: 'upstream', depth: Math.min(8, currentState.focus.upstreamDepth + 1) })
    );

    const depthLabel = el('span', { className: 'depthLabel', text: 'Depth' });

    const downstreamMinus = el('button', { text: '−' });
    downstreamMinus.addEventListener('click', () =>
      vscode.postMessage({ type: 'setDepth', direction: 'downstream', depth: Math.max(0, currentState.focus.downstreamDepth - 1) })
    );
    const downstreamValue = el('span', { className: 'depthValue', text: `↓ ${currentState.focus.downstreamDepth}` });
    const downstreamPlus = el('button', { text: '+' });
    downstreamPlus.addEventListener('click', () =>
      vscode.postMessage({ type: 'setDepth', direction: 'downstream', depth: Math.min(8, currentState.focus.downstreamDepth + 1) })
    );

    depthControl.appendChild(upstreamMinus);
    depthControl.appendChild(upstreamValue);
    depthControl.appendChild(upstreamPlus);
    depthControl.appendChild(depthLabel);
    depthControl.appendChild(downstreamMinus);
    depthControl.appendChild(downstreamValue);
    depthControl.appendChild(downstreamPlus);

    const zoomControl = el('div', { className: 'depthControl' });
    const zoomOut = el('button', { text: '−' });
    zoomOut.addEventListener('click', () => {
      if (activeScene) zoomTo(activeScene, activeScene.scale * 0.9);
    });
    const zoomValue = el('span', { className: 'depthValue', text: '100%' });
    const zoomIn = el('button', { text: '+' });
    zoomIn.addEventListener('click', () => {
      if (activeScene) zoomTo(activeScene, activeScene.scale * 1.1);
    });
    zoomControl.appendChild(zoomOut);
    zoomControl.appendChild(zoomValue);
    zoomControl.appendChild(zoomIn);

    actions.appendChild(refresh);
    actions.appendChild(focusEditor);
    actions.appendChild(resetLayout);
    actions.appendChild(depthControl);
    actions.appendChild(zoomControl);

    stats.appendChild(el('span', { className: 'pill', text: toolbarStats(currentState) }));
    stats.appendChild(el('span', { className: 'pill', text: `Build: ${fmtDuration(currentState.durationMs)}` }));
    const refreshedText = currentState.dirtySinceRefresh
      ? `Refreshed: ${fmtTime(currentState.refreshedAtMs)} (refresh recommended)`
      : `Refreshed: ${fmtTime(currentState.refreshedAtMs)}`;
    stats.appendChild(el('span', { className: `pill${currentState.dirtySinceRefresh ? ' warn' : ''}`, text: refreshedText }));
    if (refreshText) {
      stats.appendChild(el('span', { className: 'pill loading', text: refreshText }));
    }

    toolbar.appendChild(actions);
    toolbar.appendChild(stats);
    return { toolbar, zoomValue };
  }

  function render() {
    closeContextMenu();
    const previousScene = suppressNextSceneReuse ? null : activeScene;
    suppressNextSceneReuse = false;
    if (activeScene?.cardResizeObserver) {
      activeScene.cardResizeObserver.disconnect();
    }
    root.innerHTML = '';
    activeScene = null;
    if (!state) return;

    const toolbarParts = renderToolbar(state);
    root.appendChild(toolbarParts.toolbar);
    const graphWrap = el('div', { className: 'graphWrap' });
    root.appendChild(graphWrap);

    if (!state.focus.focusId) {
      graphWrap.appendChild(
        el('div', {
          className: 'emptyState',
          text:
            refreshStatusText(state.refresh) ??
            "Open a model, snapshot, or seed in the editor and FastLineage will focus on it. 'Use Open File' pulls the graph back to whatever file is currently open."
        })
      );
      return;
    }

    if (state.subgraph.nodes.length === 0) {
      graphWrap.appendChild(
        el('div', {
          className: 'emptyState',
          text: 'No lineage is visible at this depth yet. Increase depth or choose another focused relation.'
        })
      );
      return;
    }

    activeScene = mountScene(graphWrap, computeScene(state, previousScene));
    activeScene.zoomValue = toolbarParts.zoomValue;
    applyViewport(activeScene);

    requestAnimationFrame(() => {
      if (!activeScene) return;
      if (!activeScene.hasViewport) {
        fitAndCenterScene(activeScene);
        saveSceneViewport(activeScene);
      } else {
        preservePreviousFocusPosition(activeScene, previousScene);
        applyViewport(activeScene);
      }
    });
  }

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    closeContextMenu();
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (!state) return;
      if (activeScene) saveSceneViewport(activeScene);
      render();
    });
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeContextMenu();
      return;
    }
    if (shouldIgnoreGraphDeleteShortcut(event)) return;
    const node = visibleNodeById(activeScene, activeScene?.selectedId);
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    makeNodeHideHandler(node)();
  });

  window.addEventListener('pointerdown', (event) => {
    if (activeContextMenu && !event.target.closest('.nodeContextMenu')) closeContextMenu();
  });

  window.addEventListener('blur', closeContextMenu);

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg?.type === 'state') {
      state = msg.state;
      render();
    }
  });
})();
