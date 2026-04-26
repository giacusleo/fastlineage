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

- 2026-04-26: Added `notes/` folder + implemented depth-control + card/expander UX updates; combined depth into single “Depth” control; reshaped fixture into per-model folders with dbt docs files; reshaped seeds and snapshots too; reduced repeated boilerplate in column docs; added shared `common_docs` anchors and rewired repeated columns to them; refreshed lineage cards/edges, set default upstream/downstream depth to 1, made the layout responsive to narrower panes, and shifted layering/routing toward a more scalable dependency-depth view.
