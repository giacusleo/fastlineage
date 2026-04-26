# FastLineage context (current handoff)

Repo: `/Users/giacomoleo/Github/fastlineage`

## What this is

This file stays **short and current** so any agent can pick up work fast. It is not a history log.

## Product shape

- VS Code extension runs in an Extension Development Host.
- The FastLineage panel is a **webview graph** (not a tree view).
- Core UX already exists:
  - Manual refresh
  - Build timing + counts (models/sources/edges, etc.)
  - Drag / pan / zoom
  - Focus behavior
  - Single click selects a node
  - Double click re-roots/opens
  - “Use Open File” is manual only
  - Upstream/downstream depth tracked separately
- Per-node expand controls exist

## Fixture dbt project

Intentionally large:

- 50 sources
- 100 `int_` models
- 7 `dim_` models
- 16 facts
- 6 marts
- 8 snapshots
- 12 seeds

## Active UX requests

- Redesign top depth controls: compact per-direction `- [value] +`.
- Remove redundant subtype text inside cards (e.g. “transform layer”, “fact model”, “mart output”).
- Make cards sleeker / less cartoonish.
- Shrink in-card `+` buttons.
- Hide left `+` unless there are hidden upstream deps.
- Hide right `+` unless there are hidden downstream deps.

## Recent agent actions

- 2026-04-26: Added agent notes, implemented depth-control and card/expander UX updates, combined depth into a single "Depth" control, reshaped the fixture into per-model folders with dbt docs files, reduced repeated boilerplate in column docs, added shared `common_docs` anchors, refreshed lineage cards and edges, set default upstream/downstream depth to 1, made the layout more responsive to narrow panes, shifted layering toward dependency depth, and refined bundled edge routing to converge more smoothly into target cards.
