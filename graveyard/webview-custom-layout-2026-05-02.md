# Webview Custom Layout Graveyard

This file preserves the custom FastLineage layout logic removed during the Dagre-only experiment on 2026-05-02.

It is intentionally stored as markdown so it cannot execute, be imported, or affect the extension. If needed later, copy the logic back into `media/webview.js` and adapt it against the current webview helpers.

## Removed Role Ordering Helpers

```js
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
    semantic: 8,
    metric: 9,
    saved: 10,
    exposure: 11,
    analysis: 12,
    model: 13,
    overflow: 14
  };
  return weights[roleForNode(node).tone] ?? 99;
}

function compareOverflowLast(a, b) {
  if (isOverflowNode(a) && !isOverflowNode(b)) return 1;
  if (!isOverflowNode(a) && isOverflowNode(b)) return -1;
  return 0;
}
```

## Removed Custom Layout

```js
function customLayout(subgraph, focusId, metrics) {
  const nodes = subgraph.nodes;
  const edges = subgraph.edges;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const nodeHeights = new Map(nodes.map((node) => [node.id, estimatedNodeHeight(node, metrics)]));
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
      nodeHeights,
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

  let assigned = true;
  while (assigned) {
    assigned = false;
    for (const node of nodes) {
      if (columns.has(node.id)) continue;

      const dependencyColumns = (deps.get(node.id) || [])
        .map((dependency) => columns.get(dependency))
        .filter((column) => column != null);
      const dependentColumns = (rdeps.get(node.id) || [])
        .map((dependent) => columns.get(dependent))
        .filter((column) => column != null);

      const lowerBound = dependencyColumns.length ? Math.max(...dependencyColumns) + 1 : null;
      const upperBound = dependentColumns.length ? Math.min(...dependentColumns) - 1 : null;
      let column = null;

      if (lowerBound != null && upperBound != null) {
        column = lowerBound <= upperBound ? lowerBound : Math.min(lowerBound, upperBound);
      } else if (lowerBound != null) {
        column = lowerBound;
      } else if (upperBound != null) {
        column = upperBound;
      }

      if (column != null) {
        columns.set(node.id, column);
        assigned = true;
      }
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
      const byOverflow = compareOverflowLast(a, b);
      if (byOverflow !== 0) return byOverflow;
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
          const byOverflow = compareOverflowLast(a, b);
          if (byOverflow !== 0) return byOverflow;
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
  const columnHeight = (group) =>
    group.reduce((height, node) => height + (nodeHeights.get(node.id) ?? metrics.nodeH), 0) +
    Math.max(0, group.length - 1) * metrics.rowGap;
  const maxColumnHeight = Math.max(1, ...Array.from(grouped.values(), columnHeight));

  for (const key of keys) {
    const group = grouped.get(key) || [];
    const x = metrics.pad + (key - minKey) * step;
    const groupHeight = columnHeight(group);
    const startY = metrics.pad + (maxColumnHeight - groupHeight) / 2;
    let y = startY;
    for (let index = 0; index < group.length; index += 1) {
      const node = group[index];
      positions.set(group[index].id, {
        x,
        y
      });
      y += (nodeHeights.get(node.id) ?? metrics.nodeH) + metrics.rowGap;
    }
  }

  return {
    positions,
    columns,
    nodeW: metrics.nodeW,
    nodeH: metrics.nodeH,
    nodeHeights,
    size: {
      w: metrics.pad * 2 + (maxKey - minKey + 1) * metrics.nodeW + Math.max(0, maxKey - minKey) * metrics.colGap,
      h: metrics.pad * 2 + maxColumnHeight
    }
  };
}
```
