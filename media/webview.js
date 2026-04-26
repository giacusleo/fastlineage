(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const NODE_W = 232;
  const NODE_H = 78;
  const COL_GAP = 136;
  const ROW_GAP = 22;
  const PAD = 36;

  let state = null;
  let activeScene = null;
  const persisted = vscode.getState() || {};
  const positionsByScope = persisted.positionsByScope || {};

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
    return `${currentState.workspaceName}:${currentState.focus.focusId || 'none'}`;
  }

  function saveUiState() {
    vscode.setState({ positionsByScope });
  }

  function layout(subgraph, focusId) {
    const nodes = subgraph.nodes;
    const edges = subgraph.edges;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const out = new Map();
    const into = new Map();

    for (const edge of edges) {
      if (!out.has(edge.from)) out.set(edge.from, []);
      out.get(edge.from).push(edge.to);
      if (!into.has(edge.to)) into.set(edge.to, []);
      into.get(edge.to).push(edge.from);
    }

    if (!focusId || !byId.has(focusId)) {
      return { positions: new Map(), nodeW: NODE_W, nodeH: NODE_H };
    }

    const columns = new Map();
    columns.set(focusId, 0);
    const queue = [focusId];

    while (queue.length) {
      const id = queue.shift();
      const column = columns.get(id);
      for (const upstream of out.get(id) || []) {
        if (!columns.has(upstream)) {
          columns.set(upstream, column - 1);
          queue.push(upstream);
        }
      }
      for (const downstream of into.get(id) || []) {
        if (!columns.has(downstream)) {
          columns.set(downstream, column + 1);
          queue.push(downstream);
        }
      }
    }

    const grouped = new Map();
    for (const node of nodes) {
      const column = columns.get(node.id) ?? 0;
      if (!grouped.has(column)) grouped.set(column, []);
      grouped.get(column).push(node);
    }

    for (const group of grouped.values()) {
      group.sort((a, b) => {
        const byRole = roleWeight(a) - roleWeight(b);
        return byRole !== 0 ? byRole : a.label.localeCompare(b.label);
      });
    }

    const positions = new Map();
    const keys = Array.from(grouped.keys()).sort((a, b) => a - b);
    const minKey = keys[0] ?? 0;

    for (const key of keys) {
      const group = grouped.get(key) || [];
      const x = PAD + (key - minKey) * (NODE_W + COL_GAP);
      for (let index = 0; index < group.length; index += 1) {
        const y = PAD + index * (NODE_H + ROW_GAP);
        positions.set(group[index].id, { x, y });
      }
    }

    return { positions, nodeW: NODE_W, nodeH: NODE_H };
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
      w: Math.max(maxX + PAD, 960),
      h: Math.max(maxY + PAD, 420)
    };
  }

  function computeScene(currentState) {
    const base = layout(currentState.subgraph, currentState.focus.focusId);
    const key = scopeKey(currentState);
    const saved = positionsByScope[key] || {};
    const positions = new Map(base.positions);

    for (const [nodeId, pos] of Object.entries(saved)) {
      if (positions.has(nodeId)) positions.set(nodeId, { x: pos.x, y: pos.y });
    }

    return {
      key,
      nodes: [...currentState.subgraph.nodes],
      edges: currentState.subgraph.edges,
      focusId: currentState.focus.focusId,
      nodeW: base.nodeW,
      nodeH: base.nodeH,
      positions,
      size: computeBoardSize(currentState.subgraph.nodes, positions, base.nodeW, base.nodeH)
    };
  }

  function ensureScopePositions(scene) {
    if (!positionsByScope[scene.key]) positionsByScope[scene.key] = {};
    return positionsByScope[scene.key];
  }

  function setManualPosition(scene, nodeId, position) {
    ensureScopePositions(scene)[nodeId] = position;
  }

  function clearManualPositions() {
    if (!state) return;
    delete positionsByScope[scopeKey(state)];
    saveUiState();
    render();
  }

  function positionCard(scene, nodeId) {
    const card = scene.cards.get(nodeId);
    const pos = scene.positions.get(nodeId);
    if (!card || !pos) return;
    card.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  }

  function refreshSceneBounds(scene) {
    scene.size = computeBoardSize(scene.nodes, scene.positions, scene.nodeW, scene.nodeH);
    scene.board.style.width = `${scene.size.w}px`;
    scene.board.style.height = `${scene.size.h}px`;
    scene.svgLayer.setAttribute('width', String(scene.size.w));
    scene.svgLayer.setAttribute('height', String(scene.size.h));
    scene.svgLayer.setAttribute('viewBox', `0 0 ${scene.size.w} ${scene.size.h}`);
  }

  function edgePath(scene, edge) {
    const upstream = scene.positions.get(edge.to);
    const downstream = scene.positions.get(edge.from);
    if (!upstream || !downstream) return null;

    const startX = upstream.x + scene.nodeW + 8;
    const startY = upstream.y + scene.nodeH / 2;
    const endX = downstream.x - 14;
    const endY = downstream.y + scene.nodeH / 2;
    const travel = endX - startX;

    if (travel >= 60) {
      const curve = Math.max(48, Math.min(180, travel * 0.45));
      return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
    }

    const laneY = startY <= endY ? Math.min(startY, endY) - 42 : Math.max(startY, endY) + 42;
    const laneX = startX + Math.max(56, Math.abs(travel) * 0.5 + 32);
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
    const arrow = svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'currentColor' });
    marker.appendChild(arrow);
    defs.appendChild(marker);

    const fragment = document.createDocumentFragment();
    fragment.appendChild(defs);

    for (const edge of scene.edges) {
      const path = edgePath(scene, edge);
      if (!path) continue;
      const focusClass = edge.from === scene.focusId || edge.to === scene.focusId ? 'edge focus' : 'edge';
      const edgeNode = svg('path', {
        class: focusClass,
        d: path,
        'marker-end': 'url(#fastlineage-arrow)'
      });
      fragment.appendChild(edgeNode);
    }

    scene.svgLayer.replaceChildren(fragment);
  }

  function renderNodeCard(scene, node) {
    const role = roleForNode(node);
    const card = el('div', {
      className: `nodeCard tone-${role.tone}${node.id === scene.focusId ? ' focus' : ''}`,
      role: 'button',
      tabindex: '0',
      title: node.label
    });

    const header = el('div', { className: 'nodeHeader' });
    header.appendChild(el('span', { className: 'nodeChip', text: role.chip }));
    header.appendChild(el('div', { className: 'nodeName', text: node.label }));

    const meta = el('div', { className: 'nodeMeta' });
    meta.appendChild(el('span', { text: role.subtitle }));
    meta.appendChild(el('span', { className: 'nodeHint', text: 'drag / open' }));

    card.appendChild(header);
    card.appendChild(meta);

    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      vscode.postMessage({ type: 'openNode', id: node.id });
    });

    card.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();

      const startPos = scene.positions.get(node.id);
      if (!startPos) return;

      const originX = event.clientX;
      const originY = event.clientY;
      let moved = false;
      card.classList.add('dragging');

      const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - originX;
        const dy = moveEvent.clientY - originY;
        if (!moved && Math.abs(dx) + Math.abs(dy) > 3) moved = true;

        const next = {
          x: Math.max(PAD * 0.5, startPos.x + dx),
          y: Math.max(PAD * 0.5, startPos.y + dy)
        };

        scene.positions.set(node.id, next);
        setManualPosition(scene, node.id, next);
        positionCard(scene, node.id);
        refreshSceneBounds(scene);
        drawEdges(scene);
      };

      const onEnd = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        card.classList.remove('dragging');
        saveUiState();
        if (!moved) {
          vscode.postMessage({ type: 'openNode', id: node.id });
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    });

    return card;
  }

  function mountScene(container, scene) {
    const board = el('div', { className: 'graphBoard' });
    const svgLayer = svg('svg', {
      class: 'edgeLayer',
      width: scene.size.w,
      height: scene.size.h,
      viewBox: `0 0 ${scene.size.w} ${scene.size.h}`
    });

    board.appendChild(svgLayer);
    const cards = new Map();

    const orderedNodes = [...scene.nodes].sort((a, b) => {
      if (a.id === scene.focusId) return 1;
      if (b.id === scene.focusId) return -1;
      const left = scene.positions.get(a.id)?.x ?? 0;
      const right = scene.positions.get(b.id)?.x ?? 0;
      if (left !== right) return left - right;
      return (scene.positions.get(a.id)?.y ?? 0) - (scene.positions.get(b.id)?.y ?? 0);
    });

    for (const node of orderedNodes) {
      const card = renderNodeCard(scene, node);
      board.appendChild(card);
      cards.set(node.id, card);
    }

    container.appendChild(board);
    const mounted = { ...scene, board, svgLayer, cards };

    for (const node of mounted.nodes) {
      positionCard(mounted, node.id);
    }

    refreshSceneBounds(mounted);
    drawEdges(mounted);
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
      text: 'Auto Layout',
      title: 'Clear manual card positions for the current focus.'
    });
    resetLayout.addEventListener('click', () => clearManualPositions());

    const depthControl = el('div', { className: 'depthControl' });
    const depthDown = el('button', { text: '−', title: 'Reduce lineage depth' });
    depthDown.addEventListener('click', () =>
      vscode.postMessage({ type: 'setDepth', depth: Math.max(1, currentState.focus.depth - 1) })
    );
    const depthValue = el('span', { className: 'depthValue', text: `Depth: ${currentState.focus.depth}` });
    const depthUp = el('button', { text: '+', title: 'Increase lineage depth' });
    depthUp.addEventListener('click', () =>
      vscode.postMessage({ type: 'setDepth', depth: Math.min(8, currentState.focus.depth + 1) })
    );
    depthControl.appendChild(depthDown);
    depthControl.appendChild(depthValue);
    depthControl.appendChild(depthUp);

    actions.appendChild(refresh);
    actions.appendChild(focusEditor);
    actions.appendChild(resetLayout);
    actions.appendChild(depthControl);

    stats.appendChild(el('span', { className: 'pill', text: toolbarStats(currentState) }));
    stats.appendChild(el('span', { className: 'pill', text: `Build: ${fmtDuration(currentState.durationMs)}` }));
    stats.appendChild(el('span', { className: 'pill', text: `Refreshed: ${fmtTime(currentState.refreshedAtMs)}` }));
    stats.appendChild(el('span', { className: 'pill muted', text: 'Drag cards to arrange' }));

    if (currentState.dirtySinceRefresh) {
      stats.appendChild(el('span', { className: 'pill warn', text: 'Unsaved changes (refresh recommended)' }));
    }

    toolbar.appendChild(actions);
    toolbar.appendChild(stats);
    return toolbar;
  }

  function render() {
    root.innerHTML = '';
    if (!state) return;

    root.appendChild(renderToolbar(state));
    const graphWrap = el('div', { className: 'graphWrap' });

    if (!state.focus.focusId) {
      graphWrap.appendChild(
        el('div', {
          className: 'emptyState',
          text: "Open a model, snapshot, or seed in the editor and FastLineage will focus on it. 'Use Open File' pulls the graph back to whatever file is currently open."
        })
      );
      root.appendChild(graphWrap);
      activeScene = null;
      return;
    }

    if (state.subgraph.nodes.length === 0) {
      graphWrap.appendChild(
        el('div', {
          className: 'emptyState',
          text: 'No lineage is visible at this depth yet. Increase depth or choose another focused relation.'
        })
      );
      root.appendChild(graphWrap);
      activeScene = null;
      return;
    }

    activeScene = mountScene(graphWrap, computeScene(state));
    root.appendChild(graphWrap);
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg?.type === 'state') {
      state = msg.state;
      render();
    }
  });
})();
