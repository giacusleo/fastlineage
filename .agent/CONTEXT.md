# FastLineage context (current handoff)

Repo: `/Users/giacomoleo/Documents/GitHub/fastlineage`

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
  - Double click opens the backing file without re-rooting or resetting the layout.
  - The top-right target control on a card explicitly re-roots the graph around that card.
  - “Use Open File” is manual only
  - Upstream/downstream depth tracked separately
  - Per-node expand controls exist
  - Per-node expand controls are lower-corner toggles: left for upstream, right for downstream. `+` expands one node-local layer; `-` collapses that node-local layer.
  - Manual per-card expansion reveals the top 9 hidden direct cards ranked by hidden downstream dependency count, then uses a bottom-of-column overflow card named `+N <model_name> deps`.
  - Overflow cards expose `Show N more` and `Show all N` actions; they are not normal model cards and should remain visually below the real cards in their stack.
  - Sources are excluded from automatic upstream depth and are revealed only through upstream `+` controls.
  - A visible automatic branch can also be collapsed from its origin card with `-`; the next `+` reopens that branch.
  - Cards can be removed from the current view with `Delete` / `Backspace` on the selected card. Hidden cards keep their layout slots and suppress incident edges; refocusing clears hidden-card state.
  - Selecting a non-focus card gently dims cards and edges outside that selected node's visible upstream/downstream lineage; selecting the focus card keeps the full graph active.
  - Edges are drawn dependency-to-dependent from the rendered center-right of the upstream card into the target card, with arrowheads attached from their base so resized cards keep lines connected.
  - Right-clicking a normal card opens a FastLineage context menu with `Open File` and `Focus and Reset Layout`, replacing the browser cut/copy/paste menu.
  - Native hover tooltips are intentionally kept only on the card focus button.

## Current architecture

- Extension controller: `src/extension.ts`
- dbt file/path/metadata helpers: `src/dbt.ts`
- SQL `ref()` / `source()` parsing: `src/parser.ts`
- Graph build, stats, and subgraph expansion: `src/lineage.ts`
- Webview runtime assets: `media/webview.js` and `media/webview.css`
- Webview layout uses vendored Dagre (`media/vendor/dagre.min.js`) for initial positions; the prior custom column/sweep layout was removed during the Dagre-only experiment.
- Removed layout logic is preserved for reference in `graveyard/webview-custom-layout-2026-05-02.md`; `graveyard/**` is excluded from lint/package output.
- Generated `out/` files are intentionally ignored; run `npm run compile` before local extension debugging or packaging.
- F5 launch configs pass `--disable-extensions` so the Extension Development Host does not activate unrelated installed extensions such as Copilot, SQLFluff, or Datamate while debugging FastLineage.
- Project discovery reads `dbt_project.yml` and respects configured `model-paths`, `seed-paths`, and `snapshot-paths`.
- dbt schema YAML metadata is parsed from standard multi-resource `.yml` / `.yaml` files under configured resource paths, not just sidecar files.
- Unqualified `ref()` resolution checks the current project first, then local packages declared in `packages.yml` / `dependencies.yml`; this avoids phantom current-project nodes when a dbt package model is referenced without package qualification.
- Nodes now carry both a display `label` and an unqualified dbt resource `name`; secondary-project labels can stay prefixed like `delivery.dim_model`, while webview convention badges classify against `dim_model`.
- Model materialization comes from schema YAML when available and now also from static SQL `config(materialized=...)`; fallback remains `view` only when no materialization is found.
- dbt schema YAML `deprecation_date` is parsed for models and carried into graph nodes. Past/current dates render as red legacy cards; future dates render as amber legacy cards; the naming-convention badge is replaced by `LEGACY`.
- Metric graph support remains active for dependencies, including declared top-level `metrics:` YAML resources and referenced-only metric nodes created from metric references without parsed definitions. The toolbar/header intentionally hides the metric count with a commented-out line because that inventory is noisy and not core right now.
- The toolbar's refreshed timestamp shows `(refresh recommended)` after any lineage-relevant document changes or saves after the last graph build. It is cleared only by a refresh/build, not by saving the file.
- Product constraint: do not make `target/manifest.json` the required/primary graph source. The tool is intended to stay fast on large projects by using filesystem/static parsing first; manifest support can be optional, but should not become the core dependency.
- Product viability guardrail in `agent.md`: future agents should proactively flag changes that could hurt commercial use, permissive licensing, dependency control, a future `dbt-fast` CLI, shared core architecture, or a hosted/online product path.
- Current generality work should focus on extending the fast parser/discovery path for dbt semantics: Python models, snapshot block names, disabled resources, installed package models, `.dbtignore`, and alias/version behavior.
- Unresolved refs currently become normal-looking model nodes without a backing file. This should be changed before commercialization: either hide unresolved refs by default or mark them with an explicit unresolved kind/badge.
- Root `agent.md` requires future agents to update `.agent/CONTEXT.md` and `.agent/WORKLOG.md` before final responses after meaningful repo work. `agent.md`, `.agent/CONTEXT.md`, and `.agent/WORKLOG.md` are ignored and removed from the Git index so agent instructions/context/action logs remain local.

## Fixture dbt project

Intentionally large:

- 50 sources
- 100 `int_` models
- 7 `dim_` models
- 16 facts
- 6 marts
- 8 snapshots
- 12 seeds

## Review findings to carry forward

- `npm run check` and `npm run package` are the baseline checks used on 2026-04-28.
- `npm run package` succeeds and now excludes repo-only files from the VSIX. It still warns that no `LICENSE` file exists; maintainer should choose the license before publishing broadly.
- `npm audit --audit-level=moderate` reports 4 moderate findings through `@vscode/vsce -> @azure/identity -> @azure/msal-node -> uuid <14.0.0`. Suggested `npm audit fix --force` would downgrade/install `@vscode/vsce@2.25.0`, so no automatic fix was applied.
- Current graph discovery remains SQL/file-system driven and does not require or parse `manifest.json`.
- Package-qualified refs are represented as external model nodes like `package.model` when encountered.

## Recent agent actions

- 2026-04-26: Added agent notes, implemented depth-control and card/expander UX updates, combined depth into a single "Depth" control, reshaped the fixture into per-model folders with dbt docs files, reduced repeated boilerplate in column docs, added shared `common_docs` anchors, refreshed lineage cards and edges, set default upstream/downstream depth to 1, made the layout more responsive to narrow panes, shifted layering toward dependency depth, and refined bundled edge routing to converge more smoothly into target cards.
- 2026-04-28: Reviewed project structure, restored ESLint 9 support with `typescript-eslint`, added `npm run check`, split dbt path/metadata helpers into `src/dbt.ts`, centralized graph stats, expanded dirty detection to dbt YAML/seed files, removed stale generated/tracked artifacts (`out/`) and the outdated fixture generator, tightened VSIX packaging ignores, and verified check/package flows.
- 2026-04-28: Removed fixture-specific path and materialization assumptions by honoring dbt project paths, parsing generic schema YAML metadata, focusing active files through graph file paths, and preserving package-qualified refs as external unless they target the current project name.
- 2026-04-28: Refined graph visuals: wider rectangular cards, unclamped wrapped model names, removed domain subtitles, recognized `fact*` names as facts, centered edge ports, larger arrowheads, and lower-corner expand/collapse buttons.
- 2026-05-02: Changed double-click to open files without graph refocus, replaced the top-right remove control with an explicit focus target, added ranked/batched expansion overflow cards with `Show N more` and `Show all N`, isolated F5 launches with `--disable-extensions`, and added root `agent.md` requiring agent note maintenance.
- 2026-05-02: Added Dagre as a webview layout experiment using a vendored MIT browser bundle plus license/legal notices, then removed the old custom layout fallback; npm keeps `@dagrejs/dagre` as a dev dependency only, so production `npm ls --omit=dev` remains empty.
- 2026-05-02: Fixed missing source expansion on package-backed staging models by resolving unqualified refs through declared local dbt packages instead of inventing source edges from model names.
- 2026-05-02: Added visual handling for dbt `deprecation_date`: future deprecations and already-deprecated models now carry distinct warning states in the graph without adding dependencies.
