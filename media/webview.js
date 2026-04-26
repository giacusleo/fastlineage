(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const NODE_W = 232;
  const NODE_H = 78;
  const COL_GAP = 136;
  const ROW_GAP = 22;
  const PAD = 48;
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
      return { chip: 'SRC', tone: 'source', subtitle: 'raw source' };
    }
    if (node.kind === 'seed') {
      return { chip: 'SEED', tone: 'seed', subtitle: 'seed dataset' };
    }
    if (node.kind === 'snapshot') {
      return { chip: 'SNAP', tone: 'snapshot', subtitle: 'snapshot relation' };
    }
    if (node.label.startsWith('stg_')) {
      return { chip: 'STG', tone: 'stage', subtitle: 'staging model' };
    }
    if (node.label.startsWith('int_')) {
      return { chip: 'INT', tone: 'intermediate', subtitle: 'transform layer' };
    }
    if (node.label.startsWith('dim_')) {
      return { chip: 'DIM', tone: 'dimension', subtitle: 'dimension model' };
    }
    if (node.label.startsWith('fct_')) {
      return { chip: 'FACT', tone: 'fact', subtitle: 'fact model' };
    }
    if (node.label.startsWith('mart_')) {
      return { chip: 'MART', tone: 'mart', subtitle: 'mart output' };
    }
    return { chip: 'MODEL', tone: 'model', subtitle: 'dbt model' };
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

  function computeBoardSize(nodes, positions, nodeW, nodeH) {
    let maxX = PAD;
    let maxY = PAD;
    for (const node of nodes) {
      const pos = positions.get(node.id);
      if (!pos) continue;
      maxX = Math.max(maxX, pos.x + nodeW);
      maxY = Math.max(maxY, pos.y + nodeH);
    }
    return {
      w: Math.max(maxX + PAD, 1200),
      h: Math.max(maxY + PAD, 640)
    };
  }

  function layout(subgraph, focusId) {
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
        nodeW: NODE_W,
        nodeH: NODE_H,
        size: { w: 1200, h: 640 }
      };
    }

    const columns = new Map([[focusId, 0]]);
    const bestDepth = new Map([[focusId, 0]]);
    const queue = [];

    function enqueue(id, side, depth) {
      queue.push({ id, side, depth });
    }

    for (const dep of deps.get(focusId) || []) {
      enqueue(dep, -1, 1);
    }
    for (const dep of rdeps.get(focusId) || []) {
      enqueue(dep, 1, 1);
    }

    while (queue.length) {
      const current = queue.shift();
      if (!current || !byId.has(current.id) || current.id === focusId) continue;

      const seenDepth = bestDepth.get(current.id);
      if (seenDepth !== undefined && seenDepth <= current.depth) continue;

      bestDepth.set(current.id, current.depth);
      columns.set(current.id, current.side * current.depth);

      const nextDepth = current.depth + 1;
      for (const neighbor of deps.get(current.id) || []) {
        if (neighbor !== focusId) enqueue(neighbor, current.side, nextDepth);
      }
      for (const neighbor of rdeps.get(current.id) || []) {
        if (neighbor !== focusId) enqueue(neighbor, current.side, nextDepth);
      }
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
    const minKey = Math.min(...keys, 0);
    const maxKey = Math.max(...keys, 0);
    const step = NODE_W + COL_GAP;
    const positions = new Map();
    const maxRows = Math.max(1, ...Array.from(grouped.values(), (group) => group.length));
    const maxColumnHeight = maxRows * NODE_H + Math.max(0, maxRows - 1) * ROW_GAP;

    for (const key of keys) {
      const group = grouped.get(key) || [];
      const x = PAD + (key - minKey) * step;
      const groupHeight = group.length * NODE_H + Math.max(0, group.length - 1) * ROW_GAP;
      const startY = PAD + (maxColumnHeight - groupHeight) / 2;
      for (let index = 0; index < group.length; index += 1) {
        positions.set(group[index].id, {
          x,
          y: startY + index * (NODE_H + ROW_GAP)
        });
      }
    }

    return {
      positions,
      nodeW: NODE_W,
      nodeH: NODE_H,
      size: {
        w: PAD * 2 + (maxKey - minKey + 1) * NODE_W + Math.max(0, maxKey - minKey) * COL_GAP,
        h: PAD * 2 + maxColumnHeight
      }
    };
  }

  function computeScene(currentState) {
    const base = layout(currentState.subgraph, currentState.focus.focusId);
    const key = scopeKey(currentState);
    const saved = ensureScopeUi(key);
    const positions = new Map(base.positions);

    for (const [nodeId, pos] of Object.entries(saved.positions || {})) {
      if (!positions.has(nodeId) || nodeId === currentState.focus.focusId) continue;
      positions.set(nodeId, { x: pos.x, y: pos.y });
    }

    const viewport = saved.viewport || {};
    return {
      key,
      nodes: [...currentState.subgraph.nodes],
      edges: currentState.subgraph.edges,
      focusId: currentState.focus.focusId,
      selectedId: currentState.focus.selectedId || currentState.focus.focusId,
      nodeW: base.nodeW,
      nodeH: base.nodeH,
      positions,
      size: computeBoardSize(currentState.subgraph.nodes, positions, base.nodeW, base.nodeH),
      scale: clamp(viewport.scale ?? 1, MIN_SCALE, MAX_SCALE),
      panX: viewport.panX ?? 0,
      panY: viewport.panY ?? 0,
      hasViewport: Number.isFinite(viewport.panX) && Number.isFinite(viewport.panY)
    };
  }

  function saveSceneViewport(scene) {
    const saved = ensureScopeUi(scene.key);
    saved.viewport = {
      scale: scene.scale,
      panX: scene.panX,
      panY: scene.panY
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
    const pos = scene.positions.get(nodeId);
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
    scene.size = computeBoardSize(scene.nodes, scene.positions, scene.nodeW, scene.nodeH);
    scene.board.style.width = `${scene.size.w}px`;
    scene.board.style.height = `${scene.size.h}px`;
    scene.svgLayer.setAttribute('width', String(scene.size.w));
    scene.svgLayer.setAttribute('height', String(scene.size.h));
    scene.svgLayer.setAttribute('viewBox', `0 0 ${scene.size.w} ${scene.size.h}`);
  }

  function centerFocus(scene) {
    const focusPos = scene.positions.get(scene.focusId);
    if (!focusPos) return;
    const rect = scene.viewport.getBoundingClientRect();
    const viewportWidth = rect.width || scene.viewport.clientWidth || 1200;
    const viewportHeight = rect.height || scene.viewport.clientHeight || 720;
    scene.panX = viewportWidth / 2 - (focusPos.x + scene.nodeW / 2) * scene.scale;
    scene.panY = viewportHeight / 2 - (focusPos.y + scene.nodeH / 2) * scene.scale;
    applyViewport(scene);
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

  function edgePath(scene, edge) {
    const upstream = scene.positions.get(edge.to);
    const downstream = scene.positions.get(edge.from);
    if (!upstream || !downstream) return null;

    const startX = upstream.x + scene.nodeW + 10;
    const startY = upstream.y + scene.nodeH / 2;
    const endX = downstream.x - 16;
    const endY = downstream.y + scene.nodeH / 2;
    const travel = endX - startX;

    if (travel >= 64) {
      const curve = Math.max(56, Math.min(190, travel * 0.46));
      return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
    }

    const laneY = startY <= endY ? Math.min(startY, endY) - 44 : Math.max(startY, endY) + 44;
    const laneX = startX + Math.max(60, Math.abs(travel) * 0.55 + 36);
    return [
      `M ${startX} ${startY}`,
      `C ${laneX} ${startY}, ${laneX} ${laneY}, ${laneX + 18} ${laneY}`,
      `L ${endX - 18} ${laneY}`,
      `C ${endX - 44} ${laneY}, ${endX - 44} ${endY}, ${endX} ${endY}`
    ].join(' ');
  }

  function drawEdges(scene) {
    const defs = svg('defs');
    const marker = svg('marker', {
      id: 'fastlineage-arrow',
      viewBox: '0 0 10 10',
      refX: 9,
      refY: 5,
      markerWidth: 8,
      markerHeight: 8,
      orient: 'auto-start-reverse'
    });
    marker.appendChild(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'currentColor' }));
    defs.appendChild(marker);

    const fragment = document.createDocumentFragment();
    fragment.appendChild(defs);

    for (const edge of scene.edges) {
      const path = edgePath(scene, edge);
      if (!path) continue;
      const highlightId = scene.selectedId || scene.focusId;
      const edgeNode = svg('path', {
        class: edge.from === highlightId || edge.to === highlightId ? 'edge focus' : 'edge',
        d: path,
        'marker-end': 'url(#fastlineage-arrow)'
      });
      fragment.appendChild(edgeNode);
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
          x: Math.max(PAD * 0.25, startPos.x + dx),
          y: Math.max(PAD * 0.25, startPos.y + dy)
        };

        scene.positions.set(node.id, next);
        positionCard(scene, node.id);
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
    const isFocus = node.id === scene.focusId;
    const isSelected = node.id === scene.selectedId;
    const card = el('div', {
      className: `nodeCard tone-${role.tone}${isFocus ? ' anchor' : ''}${isSelected ? ' selected' : ''}`,
      role: 'button',
      tabindex: '0',
      title: node.label
    });

    const header = el('div', { className: 'nodeHeader' });
    header.appendChild(el('span', { className: 'nodeChip', text: role.chip }));
    header.appendChild(el('div', { className: 'nodeName', text: node.label }));

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

    card.appendChild(header);
    card.appendChild(actions);
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
      width: scene.size.w,
      height: scene.size.h,
      viewBox: `0 0 ${scene.size.w} ${scene.size.h}`
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
        centerFocus(activeScene);
        saveSceneViewport(activeScene);
      } else {
        applyViewport(activeScene);
      }
    });
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg?.type === 'state') {
      state = msg.state;
      render();
    }
  });
})();
