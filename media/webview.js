(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const BASE_NODE_W = 272;
  const BASE_NODE_H = 108;
  const BASE_COL_GAP = 164;
  const BASE_ROW_GAP = 28;
  const BASE_PAD = 72;
  const MIN_SCALE = 0.55;
  const MAX_SCALE = 2.25;

  let state = null;
  let activeScene = null;
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
    if (node.kind === 'source') {
      return { chip: 'SRC', tone: 'source' };
    }
    if (node.kind === 'seed') {
      return { chip: 'SEED', tone: 'seed' };
    }
    if (node.kind === 'snapshot') {
      return { chip: 'SNAP', tone: 'snapshot' };
    }
    if (node.label.startsWith('stg_')) {
      return { chip: 'STG', tone: 'stage' };
    }
    if (node.label.startsWith('int_')) {
      return { chip: 'INT', tone: 'intermediate' };
    }
    if (node.label.startsWith('dim_')) {
      return { chip: 'DIM', tone: 'dimension' };
    }
    if (node.label.startsWith('fct_')) {
      return { chip: 'FACT', tone: 'fact' };
    }
    if (node.label.startsWith('mart_')) {
      return { chip: 'MART', tone: 'mart' };
    }
    return { chip: 'MODEL', tone: 'model' };
  }

  function roleWeight(node) {
    const weights = {
      source: 0,
      seed: 1,
      snapshot: 2,
      stage: 3,
      intermediate: 4,
      dimension: 5,
      fact: 6,
      mart: 7,
      model: 8
    };
    return weights[roleForNode(node).tone] ?? 99;
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

    const nodeW = Math.round(224 + density * (BASE_NODE_W - 224));
    const nodeH = Math.round(92 + density * (BASE_NODE_H - 92));
    const colGap = Math.round(92 + density * (BASE_COL_GAP - 92));
    const rowGap = Math.round(18 + density * (BASE_ROW_GAP - 18));
    const pad = Math.round(44 + density * (BASE_PAD - 44));
    const portSpacing = Math.round(8 + density * 4);
    const key = usableWidth < 620 ? 'compact' : usableWidth < 940 ? 'cozy' : 'wide';

    return {
      key,
      nodeW,
      nodeH,
      colGap,
      rowGap,
      pad,
      portSpacing,
      minBoardW: Math.max(usableWidth - 8, 420),
      minBoardH: Math.max(height - 164, 360),
      graphPad: key === 'compact' ? 12 : key === 'cozy' ? 14 : 18,
      titleSize: key === 'compact' ? '14px' : '15px',
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
    if (node.kind === 'source') return 'source';
    if (node.kind === 'seed') return 'seed';
    if (node.kind === 'snapshot') return 'snapshot';
    if (node.label.startsWith('stg_')) return 'view';
    if (node.label.startsWith('int_') && node.label.endsWith('_hub')) return 'incremental';
    if (node.label.startsWith('mart_')) return 'view';
    return 'table';
  }

  function semanticTagForNode(node) {
    const structuralTags = new Set([
      'staging',
      'intermediate',
      'marts',
      'dimension',
      'fact',
      'presentation',
      'source-aligned',
      'hub',
      'rollup',
      'fact-model',
      'dimension-model',
      'semantic'
    ]);
    const domainTag = (node.tags || []).find((tag) => !structuralTags.has(tag) && tag !== node.label);
    if (domainTag) return domainTag.replace(/_/g, ' ');
    if (node.kind === 'source') return node.label.split('.')[0];
    const parts = node.label.split('_');
    return parts[1] || node.kind;
  }

  function formatMaterialization(materialization) {
    return materialization.replace(/_/g, ' ');
  }

  function materializationClass(materialization) {
    return materialization.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  }

  function computeBoardBounds(nodes, positions, nodeW, nodeH, metrics) {
    let minX = 0;
    let minY = 0;
    let maxX = nodeW;
    let maxY = nodeH;
    let seeded = false;

    for (const node of nodes) {
      const pos = positions.get(node.id);
      if (!pos) continue;

      if (!seeded) {
        minX = pos.x;
        minY = pos.y;
        maxX = pos.x + nodeW;
        maxY = pos.y + nodeH;
        seeded = true;
        continue;
      }

      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + nodeW);
      maxY = Math.max(maxY, pos.y + nodeH);
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

  function layout(subgraph, focusId, metrics) {
    const nodes = subgraph.nodes;
    const edges = subgraph.edges;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const deps = new Map();
    const rdeps = new Map();

    function addRelation(map, key, value) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(value);
    }

    for (const edge of edges) {
      addRelation(deps, edge.from, edge.to);
      addRelation(rdeps, edge.to, edge.from);
    }

    if (!focusId || !byId.has(focusId)) {
      return {
        positions: new Map(),
        columns: new Map(),
        nodeW: metrics.nodeW,
        nodeH: metrics.nodeH,
        size: { w: metrics.minBoardW, h: metrics.minBoardH }
      };
    }

    function collectReachable(startId, adjacency) {
      const seen = new Set();
      const queue = [...(adjacency.get(startId) || [])];
      while (queue.length) {
        const current = queue.shift();
        if (!current || seen.has(current) || !byId.has(current)) continue;
        seen.add(current);
        for (const next of adjacency.get(current) || []) {
          if (!seen.has(next)) queue.push(next);
        }
      }
      return seen;
    }

    const upstreamSet = collectReachable(focusId, deps);
    const downstreamSet = collectReachable(focusId, rdeps);
    const columns = new Map([[focusId, 0]]);
    const upstreamMemo = new Map();
    const downstreamMemo = new Map();

    function upstreamColumn(nodeId, visiting = new Set()) {
      if (upstreamMemo.has(nodeId)) return upstreamMemo.get(nodeId);
      if (visiting.has(nodeId)) return -1;
      visiting.add(nodeId);
      const successors = (rdeps.get(nodeId) || []).filter((next) => next === focusId || upstreamSet.has(next));
      const nextColumn =
        successors.length === 0 ? -1 : Math.min(...successors.map((next) => (next === focusId ? 0 : upstreamColumn(next, visiting)))) - 1;
      visiting.delete(nodeId);
      upstreamMemo.set(nodeId, nextColumn);
      return nextColumn;
    }

    function downstreamColumn(nodeId, visiting = new Set()) {
      if (downstreamMemo.has(nodeId)) return downstreamMemo.get(nodeId);
      if (visiting.has(nodeId)) return 1;
      visiting.add(nodeId);
      const predecessors = (deps.get(nodeId) || []).filter((next) => next === focusId || downstreamSet.has(next));
      const nextColumn =
        predecessors.length === 0 ? 1 : Math.max(...predecessors.map((next) => (next === focusId ? 0 : downstreamColumn(next, visiting)))) + 1;
      visiting.delete(nodeId);
      downstreamMemo.set(nodeId, nextColumn);
      return nextColumn;
    }

    for (const nodeId of upstreamSet) {
      columns.set(nodeId, upstreamColumn(nodeId));
    }
    for (const nodeId of downstreamSet) {
      columns.set(nodeId, downstreamColumn(nodeId));
    }

    const grouped = new Map();
    for (const node of nodes) {
      const column = columns.get(node.id) ?? (node.id === focusId ? 0 : 1);
      if (!grouped.has(column)) grouped.set(column, []);
      grouped.get(column).push(node);
    }

    for (const group of grouped.values()) {
      group.sort((a, b) => {
        const byRole = roleWeight(a) - roleWeight(b);
        return byRole !== 0 ? byRole : a.label.localeCompare(b.label);
      });
    }

    const keys = Array.from(grouped.keys()).sort((a, b) => a - b);
    const initialOrder = new Map();
    for (const key of keys) {
      for (const node of grouped.get(key) || []) {
        initialOrder.set(node.id, initialOrder.size);
      }
    }

    const scoreNode = (node, columnKey, rowById) => {
      let total = 0;
      let weight = 0;
      for (const neighbor of [...(deps.get(node.id) || []), ...(rdeps.get(node.id) || [])]) {
        const neighborColumn = columns.get(neighbor) ?? (neighbor === focusId ? 0 : null);
        const neighborRow = rowById.get(neighbor);
        if (neighborColumn == null || neighborColumn === columnKey || neighborRow == null) continue;
        const edgeWeight = 1 / Math.max(1, Math.abs(neighborColumn - columnKey));
        total += neighborRow * edgeWeight;
        weight += edgeWeight;
      }
      return weight ? total / weight : Number.POSITIVE_INFINITY;
    };

    for (let pass = 0; pass < 4; pass += 1) {
      for (const sweep of [keys, [...keys].reverse()]) {
        const rowById = new Map();
        for (const key of keys) {
          for (const [index, node] of (grouped.get(key) || []).entries()) {
            rowById.set(node.id, index);
          }
        }

        for (const key of sweep) {
          const group = grouped.get(key) || [];
          group.sort((a, b) => {
            const aScore = scoreNode(a, key, rowById);
            const bScore = scoreNode(b, key, rowById);
            if (Number.isFinite(aScore) || Number.isFinite(bScore)) {
              if (!Number.isFinite(aScore)) return 1;
              if (!Number.isFinite(bScore)) return -1;
              if (aScore !== bScore) return aScore - bScore;
            }
            const byRole = roleWeight(a) - roleWeight(b);
            if (byRole !== 0) return byRole;
            const byName = a.label.localeCompare(b.label);
            if (byName !== 0) return byName;
            return (initialOrder.get(a.id) ?? 0) - (initialOrder.get(b.id) ?? 0);
          });
        }
      }
    }

    const minKey = Math.min(...keys, 0);
    const maxKey = Math.max(...keys, 0);
    const step = metrics.nodeW + metrics.colGap;
    const positions = new Map();
    const maxRows = Math.max(1, ...Array.from(grouped.values(), (group) => group.length));
    const maxColumnHeight = maxRows * metrics.nodeH + Math.max(0, maxRows - 1) * metrics.rowGap;

    for (const key of keys) {
      const group = grouped.get(key) || [];
      const x = metrics.pad + (key - minKey) * step;
      const groupHeight = group.length * metrics.nodeH + Math.max(0, group.length - 1) * metrics.rowGap;
      const startY = metrics.pad + (maxColumnHeight - groupHeight) / 2;
      for (let index = 0; index < group.length; index += 1) {
        positions.set(group[index].id, {
          x,
          y: startY + index * (metrics.nodeH + metrics.rowGap)
        });
      }
    }

    return {
      positions,
      columns,
      nodeW: metrics.nodeW,
      nodeH: metrics.nodeH,
      size: {
        w: metrics.pad * 2 + (maxKey - minKey + 1) * metrics.nodeW + Math.max(0, maxKey - minKey) * metrics.colGap,
        h: metrics.pad * 2 + maxColumnHeight
      }
    };
  }

  function computeScene(currentState) {
    const layoutMetrics = getLayoutMetrics();
    applyLayoutTheme(layoutMetrics);
    const base = layout(currentState.subgraph, currentState.focus.focusId, layoutMetrics);
    const key = scopeKey(currentState);
    const saved = ensureScopeUi(key);
    const positions = new Map(base.positions);
    const savedLayoutMetrics = saved.layoutMetrics || null;

    for (const [nodeId, pos] of Object.entries(saved.positions || {})) {
      if (!positions.has(nodeId) || nodeId === currentState.focus.focusId) continue;
      positions.set(nodeId, scaleSavedPosition(pos, savedLayoutMetrics, layoutMetrics));
    }

    const viewport = saved.viewport || {};
    return {
      key,
      nodes: [...currentState.subgraph.nodes],
      edges: currentState.subgraph.edges,
      focusId: currentState.focus.focusId,
      selectedId: currentState.focus.selectedId || currentState.focus.focusId,
      columns: base.columns,
      nodeW: base.nodeW,
      nodeH: base.nodeH,
      layoutMetrics,
      positions,
      bounds: computeBoardBounds(currentState.subgraph.nodes, positions, base.nodeW, base.nodeH, layoutMetrics),
      scale: clamp(viewport.scale ?? 1, MIN_SCALE, MAX_SCALE),
      panX: viewport.panX ?? 0,
      panY: viewport.panY ?? 0,
      hasViewport:
        Number.isFinite(viewport.panX) &&
        Number.isFinite(viewport.panY) &&
        viewport.layoutKey === layoutMetrics.key
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
    persistUiState();
    render();
  }

  function positionCard(scene, nodeId) {
    const card = scene.cards.get(nodeId);
    const pos = boardPosition(scene, nodeId);
    if (!card || !pos) return;
    card.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  }

  function applyViewport(scene) {
    scene.board.style.transform = `translate(${scene.panX}px, ${scene.panY}px) scale(${scene.scale})`;
    if (scene.zoomValue) {
      scene.zoomValue.textContent = `${Math.round(scene.scale * 100)}%`;
    }
  }

  function refreshSceneBounds(scene) {
    const previous = scene.bounds;
    scene.bounds = computeBoardBounds(scene.nodes, scene.positions, scene.nodeW, scene.nodeH, scene.layoutMetrics);
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

  function centerFocus(scene) {
    const focusPos = boardPosition(scene, scene.focusId);
    if (!focusPos) return;
    const rect = scene.viewport.getBoundingClientRect();
    const viewportWidth = rect.width || scene.viewport.clientWidth || 1200;
    const viewportHeight = rect.height || scene.viewport.clientHeight || 720;
    scene.panX = viewportWidth / 2 - (focusPos.x + scene.nodeW / 2) * scene.scale;
    scene.panY = viewportHeight / 2 - (focusPos.y + scene.nodeH / 2) * scene.scale;
    applyViewport(scene);
  }

  function fitScaleForScene(scene) {
    const rect = scene.viewport.getBoundingClientRect();
    const viewportWidth = rect.width || scene.viewport.clientWidth || 1200;
    const viewportHeight = rect.height || scene.viewport.clientHeight || 720;
    const fitX = (viewportWidth - 56) / Math.max(scene.bounds.w, 1);
    const fitY = (viewportHeight - 56) / Math.max(scene.bounds.h, 1);
    return clamp(Math.min(1, fitX, fitY), MIN_SCALE, MAX_SCALE);
  }

  function fitAndCenterScene(scene) {
    scene.scale = fitScaleForScene(scene);
    centerFocus(scene);
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

  function spreadOffsets(count, gap) {
    const center = (count - 1) / 2;
    return Array.from({ length: count }, (_, index) => (index - center) * gap);
  }

  function edgeAnchorPoints(scene, edge, metrics, index) {
    const upstream = boardPosition(scene, edge.to);
    const downstream = boardPosition(scene, edge.from);
    if (!upstream || !downstream) return null;

    const key = edgeKey(edge, index);
    return {
      key,
      sourceId: edge.to,
      targetId: edge.from,
      startX: upstream.x + scene.nodeW + 2,
      startY: upstream.y + scene.nodeH / 2 + (metrics.startOffsets.get(key) ?? 0),
      endX: downstream.x + 1,
      endY: downstream.y + scene.nodeH / 2
    };
  }

  function buildEdgeMetrics(scene) {
    const outgoing = new Map();
    const bundleEntries = new Map();

    scene.edges.forEach((edge, index) => {
      const key = edgeKey(edge, index);
      const sourceId = edge.to;
      const targetId = edge.from;

      if (!outgoing.has(sourceId)) outgoing.set(sourceId, []);
      outgoing.get(sourceId).push({ key, neighborId: targetId });

      if (!bundleEntries.has(targetId)) bundleEntries.set(targetId, []);
      bundleEntries.get(targetId).push({ key, edge, index });
    });

    const startOffsets = new Map();
    const bundleByEdge = new Map();
    const bundleGroups = new Map();

    for (const edges of outgoing.values()) {
      edges.sort((left, right) => (boardPosition(scene, left.neighborId)?.y ?? 0) - (boardPosition(scene, right.neighborId)?.y ?? 0));
      const offsets = spreadOffsets(edges.length, scene.layoutMetrics.portSpacing);
      edges.forEach((entry, index) => startOffsets.set(entry.key, offsets[index]));
    }

    for (const [targetId, edges] of bundleEntries.entries()) {
      const groupsBySide = new Map();

      for (const entry of edges) {
        const anchors = edgeAnchorPoints(scene, entry.edge, { startOffsets }, entry.index);
        if (!anchors) continue;
        const side = anchors.startX <= anchors.endX ? 'left' : 'right';
        if (!groupsBySide.has(side)) groupsBySide.set(side, []);
        groupsBySide.get(side).push({ ...entry, anchors });
      }

      for (const [side, entries] of groupsBySide.entries()) {
        entries.sort((left, right) => left.anchors.startY - right.anchors.startY);
        const targetY = entries[0]?.anchors.endY ?? 0;
        const endX = entries[0]?.anchors.endX ?? 0;
        const minStartX = Math.min(...entries.map((entry) => entry.anchors.startX));
        const maxStartX = Math.max(...entries.map((entry) => entry.anchors.startX));
        const trunkInset = clamp(26 + Math.min(entries.length - 1, 5) * 3, 26, 42);
        const mergeX =
          side === 'left'
            ? clamp(endX - trunkInset, minStartX + 28, endX - 12)
            : clamp(endX + trunkInset, endX + 12, maxStartX - 28);
        const canBundle = entries.length > 1 && (side === 'left' ? mergeX < endX - 8 : mergeX > endX + 8);

        entries.forEach((entry) => {
          bundleByEdge.set(entry.key, `${targetId}:${side}`);
        });

        bundleGroups.set(`${targetId}:${side}`, {
          id: `${targetId}:${side}`,
          targetId,
          side,
          endX,
          endY: targetY,
          mergeX,
          canBundle,
          entries
        });
      }
    }

    return { startOffsets, bundleByEdge, bundleGroups };
  }

  function simpleEdgePath(scene, edge, metrics, index) {
    const anchors = edgeAnchorPoints(scene, edge, metrics, index);
    if (!anchors) return null;

    const travel = anchors.endX - anchors.startX;
    const direction = travel >= 0 ? 1 : -1;
    const curve = clamp(Math.abs(travel) * 0.34, 22, 60);
    return [
      `M ${anchors.startX} ${anchors.startY}`,
      `C ${anchors.startX + curve * direction} ${anchors.startY}, ${anchors.endX - curve * direction} ${anchors.endY}, ${anchors.endX} ${anchors.endY}`
    ].join(' ');
  }

  function bundledBranchPath(scene, edge, metrics, index) {
    const anchors = edgeAnchorPoints(scene, edge, metrics, index);
    if (!anchors) return null;

    const groupId = metrics.bundleByEdge.get(anchors.key);
    const group = groupId ? metrics.bundleGroups.get(groupId) : null;
    if (!group || !group.canBundle) {
      return { path: simpleEdgePath(scene, edge, metrics, index), bundled: false };
    }

    const travel = group.mergeX - anchors.startX;
    if (Math.abs(travel) <= 18) {
      return { path: simpleEdgePath(scene, edge, metrics, index), bundled: false };
    }

    const direction = travel >= 0 ? 1 : -1;
    const sourceLead = clamp(Math.abs(travel) * 0.4, 22, 68);
    const targetLead = clamp(16 + Math.abs(group.endY - anchors.startY) * 0.08, 16, 34);
    return {
      bundled: true,
      groupId,
      path: [
        `M ${anchors.startX} ${anchors.startY}`,
        `C ${anchors.startX + sourceLead * direction} ${anchors.startY}, ${group.mergeX - targetLead * direction} ${group.endY}, ${group.mergeX} ${group.endY}`
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
      viewBox: '0 0 5 5',
      refX: 4.85,
      refY: 2.5,
      markerWidth: 3.8,
      markerHeight: 3.8,
      orient: 'auto-start-reverse'
    });
    marker.appendChild(svg('path', { d: 'M 0 0 L 5 2.5 L 0 5 z', fill: 'currentColor' }));
    defs.appendChild(marker);

    const fragment = document.createDocumentFragment();
    fragment.appendChild(defs);

    const metrics = buildEdgeMetrics(scene);
    const highlightId = scene.selectedId || scene.focusId;

    scene.edges.forEach((edge, index) => {
      const branch = bundledBranchPath(scene, edge, metrics, index);
      const path = branch?.path;
      if (!path) return;
      const edgeNode = svg('path', {
        class: edge.from === highlightId || edge.to === highlightId ? 'edge focus' : 'edge',
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

  function makeNodeSelectHandler(node) {
    return () => vscode.postMessage({ type: 'selectNode', id: node.id });
  }

  function makeNodeExpandHandler(node, direction) {
    return () => vscode.postMessage({ type: 'expandNode', id: node.id, direction });
  }

  function shouldSuppressCardClick(card) {
    const until = Number(card.dataset.dragSuppressUntil || 0);
    if (!until || until <= Date.now()) return false;
    delete card.dataset.dragSuppressUntil;
    return true;
  }

  function appendDatabaseBase(iconSvg) {
    iconSvg.appendChild(svg('ellipse', { cx: 12, cy: 6.5, rx: 6.5, ry: 2.6, fill: 'none' }));
    iconSvg.appendChild(
      svg('path', {
        d: 'M 5.5 6.5 V 14.2 C 5.5 15.8 8.4 17 12 17 C 15.6 17 18.5 15.8 18.5 14.2 V 6.5',
        fill: 'none'
      })
    );
    iconSvg.appendChild(svg('path', { d: 'M 5.5 10.3 C 5.5 11.9 8.4 13.1 12 13.1 C 15.6 13.1 18.5 11.9 18.5 10.3', fill: 'none' }));
  }

  function renderNodeIcon(node) {
    const materialization = materializationForNode(node);
    const icon = el('div', { className: `nodeIcon material-${materializationClass(materialization)}` });
    const iconSvg = svg('svg', { viewBox: '0 0 24 24', class: 'nodeIconGlyph', 'aria-hidden': 'true' });
    appendDatabaseBase(iconSvg);

    if (node.kind === 'source') {
      iconSvg.appendChild(svg('path', { d: 'M 8 4.8 H 4.2 V 8.6', fill: 'none' }));
      iconSvg.appendChild(svg('path', { d: 'M 4.2 8.6 L 8.2 12.2', fill: 'none' }));
    } else if (node.kind === 'snapshot') {
      iconSvg.appendChild(svg('circle', { cx: 17.4, cy: 17.2, r: 3.1, fill: 'none' }));
      iconSvg.appendChild(svg('path', { d: 'M 17.4 15.4 V 17.4 L 18.8 18.4', fill: 'none' }));
    } else if (node.kind === 'seed') {
      iconSvg.appendChild(svg('circle', { cx: 17.2, cy: 16.7, r: 2.4, fill: 'none' }));
      iconSvg.appendChild(svg('path', { d: 'M 17.2 14.3 V 19.1 M 14.8 16.7 H 19.6', fill: 'none' }));
    } else if (materialization === 'incremental') {
      iconSvg.appendChild(svg('path', { d: 'M 15.8 15.2 A 3.1 3.1 0 0 1 11.5 18', fill: 'none' }));
      iconSvg.appendChild(svg('path', { d: 'M 11.6 18 L 12.7 16.6 M 11.6 18 L 13.5 18', fill: 'none' }));
    } else if (materialization === 'view') {
      iconSvg.appendChild(svg('path', { d: 'M 14.5 16.9 C 15.7 15.4 16.9 14.7 18.4 14.7 C 16.9 14.7 15.7 13.9 14.5 12.5', fill: 'none' }));
      iconSvg.appendChild(svg('circle', { cx: 17.4, cy: 14.7, r: 0.8 }));
    } else if (materialization === 'ephemeral') {
      iconSvg.appendChild(svg('path', { d: 'M 15.3 12.8 L 17.2 15.5 L 15.5 15.5 L 17 18.2', fill: 'none' }));
    } else {
      iconSvg.appendChild(svg('rect', { x: 15.1, y: 13.1, width: 4.6, height: 4.2, rx: 0.7, fill: 'none' }));
      iconSvg.appendChild(svg('path', { d: 'M 17.4 13.1 V 17.3 M 15.1 15.2 H 19.7', fill: 'none' }));
    }

    icon.appendChild(iconSvg);
    return icon;
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
    const isFocus = node.id === scene.focusId;
    const isSelected = node.id === scene.selectedId;
    const card = el('div', {
      className: `nodeCard tone-${role.tone}${isFocus ? ' anchor' : ''}${isSelected ? ' selected' : ''}`,
      role: 'button',
      tabindex: '0',
      title: `${node.label} • ${formatMaterialization(materialization)}`
    });

    const identity = el('div', { className: 'nodeIdentity' });
    identity.appendChild(renderNodeIcon(node));

    const titleWrap = el('div', { className: 'nodeTitleWrap' });
    const titleMeta = el('div', { className: 'nodeTitleMeta' });
    titleMeta.appendChild(el('span', { className: 'nodeChip', text: role.chip }));
    titleMeta.appendChild(el('span', { className: 'nodeDomain', text: semanticTagForNode(node) }));
    titleWrap.appendChild(titleMeta);
    titleWrap.appendChild(el('div', { className: 'nodeName', text: node.label }));
    identity.appendChild(titleWrap);

    const actions = el('div', { className: 'nodeActions' });
    const upstreamButton = el('button', {
      className: 'nodeExpander upstream',
      text: '+',
      title: 'Show one more upstream layer from this node'
    });
    const downstreamButton = el('button', {
      className: 'nodeExpander downstream',
      text: '+',
      title: 'Show one more downstream layer from this node'
    });
    if (!node.canExpandUpstream) upstreamButton.classList.add('isHidden');
    if (!node.canExpandDownstream) downstreamButton.classList.add('isHidden');

    const consume = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    upstreamButton.addEventListener('pointerdown', consume);
    downstreamButton.addEventListener('pointerdown', consume);
    upstreamButton.addEventListener('click', (event) => {
      consume(event);
      makeNodeSelectHandler(node)();
      makeNodeExpandHandler(node, 'upstream')();
    });
    downstreamButton.addEventListener('click', (event) => {
      consume(event);
      makeNodeSelectHandler(node)();
      makeNodeExpandHandler(node, 'downstream')();
    });

    actions.appendChild(upstreamButton);
    actions.appendChild(downstreamButton);

    const footer = el('div', { className: 'nodeFooter' });
    const facts = el('div', { className: 'nodeFacts' });
    facts.appendChild(
      el('span', {
        className: `nodeMaterial material-${materializationClass(materialization)}`,
        text: formatMaterialization(materialization)
      })
    );
    footer.appendChild(facts);
    footer.appendChild(actions);

    card.appendChild(identity);
    card.appendChild(footer);
    card.addEventListener('click', () => {
      if (shouldSuppressCardClick(card)) return;
      makeNodeSelectHandler(node)();
    });
    card.addEventListener('dblclick', (event) => {
      event.preventDefault();
      makeNodeOpenHandler(node)();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === ' ') {
        event.preventDefault();
        makeNodeSelectHandler(node)();
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

    const mounted = { ...scene, viewport, board, svgLayer, cards, zoomValue: null };
    for (const node of orderedNodes) {
      const card = renderNodeCard(mounted, node);
      board.appendChild(card);
      cards.set(node.id, card);
    }

    for (const node of mounted.nodes) {
      positionCard(mounted, node.id);
    }

    refreshSceneBounds(mounted);
    drawEdges(mounted);
    enableViewportPan(mounted);
    return mounted;
  }

  function toolbarStats(currentState) {
    const parts = [];
    if (currentState.graphStats.models) parts.push(`${currentState.graphStats.models} models`);
    if (currentState.graphStats.snapshots) parts.push(`${currentState.graphStats.snapshots} snapshots`);
    if (currentState.graphStats.seeds) parts.push(`${currentState.graphStats.seeds} seeds`);
    if (currentState.graphStats.sources) parts.push(`${currentState.graphStats.sources} sources`);
    parts.push(`${currentState.graphStats.edges} edges`);
    return parts.join(' • ');
  }

  function renderToolbar(currentState) {
    const toolbar = el('div', { className: 'toolbar' });
    const actions = el('div', { className: 'toolbarGroup' });
    const stats = el('div', { className: 'statsGroup' });

    const refresh = el('button', { className: 'primary', text: 'Refresh' });
    refresh.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));

    const focusEditor = el('button', {
      className: 'subtle',
      text: 'Use Open File',
      title: 'Focus the graph on the file currently open in the editor.'
    });
    focusEditor.addEventListener('click', () => vscode.postMessage({ type: 'revealActive' }));

    const resetLayout = el('button', {
      className: 'subtle',
      text: 'Reset Layout',
      title: 'Clear manual positions and center the graph again.'
    });
    resetLayout.addEventListener('click', () => {
      if (activeScene) resetSceneLayout(activeScene);
    });

    const depthControl = el('div', { className: 'depthControl depthCombo', title: 'Depth' });

    const upstreamMinus = el('button', { text: '−', title: 'Reduce upstream depth' });
    upstreamMinus.addEventListener('click', () =>
      vscode.postMessage({ type: 'setDepth', direction: 'upstream', depth: Math.max(0, currentState.focus.upstreamDepth - 1) })
    );
    const upstreamValue = el('span', { className: 'depthValue', text: `↑ ${currentState.focus.upstreamDepth}` });
    const upstreamPlus = el('button', { text: '+', title: 'Increase upstream depth' });
    upstreamPlus.addEventListener('click', () =>
      vscode.postMessage({ type: 'setDepth', direction: 'upstream', depth: Math.min(8, currentState.focus.upstreamDepth + 1) })
    );

    const depthLabel = el('span', { className: 'depthLabel', text: 'Depth' });

    const downstreamMinus = el('button', { text: '−', title: 'Reduce downstream depth' });
    downstreamMinus.addEventListener('click', () =>
      vscode.postMessage({ type: 'setDepth', direction: 'downstream', depth: Math.max(0, currentState.focus.downstreamDepth - 1) })
    );
    const downstreamValue = el('span', { className: 'depthValue', text: `↓ ${currentState.focus.downstreamDepth}` });
    const downstreamPlus = el('button', { text: '+', title: 'Increase downstream depth' });
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
    const zoomOut = el('button', { text: '−', title: 'Zoom out' });
    zoomOut.addEventListener('click', () => {
      if (activeScene) zoomTo(activeScene, activeScene.scale * 0.9);
    });
    const zoomValue = el('span', { className: 'depthValue', text: '100%' });
    const zoomIn = el('button', { text: '+', title: 'Zoom in' });
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
    stats.appendChild(el('span', { className: 'pill', text: `Refreshed: ${fmtTime(currentState.refreshedAtMs)}` }));

    if (currentState.dirtySinceRefresh) {
      stats.appendChild(el('span', { className: 'pill warn', text: 'Unsaved changes (refresh recommended)' }));
    }

    toolbar.appendChild(actions);
    toolbar.appendChild(stats);
    return { toolbar, zoomValue };
  }

  function render() {
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
          text: "Open a model, snapshot, or seed in the editor and FastLineage will focus on it. 'Use Open File' pulls the graph back to whatever file is currently open."
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

    activeScene = mountScene(graphWrap, computeScene(state));
    activeScene.zoomValue = toolbarParts.zoomValue;

    requestAnimationFrame(() => {
      if (!activeScene) return;
      applyViewport(activeScene);
      if (!activeScene.hasViewport) {
        fitAndCenterScene(activeScene);
        saveSceneViewport(activeScene);
      } else {
        applyViewport(activeScene);
      }
    });
  }

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (!state) return;
      render();
    });
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg?.type === 'state') {
      state = msg.state;
      render();
    }
  });
})();
