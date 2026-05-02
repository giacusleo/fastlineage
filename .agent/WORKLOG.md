# Work log

## 2026-04-26

- Added agent notes to keep context, decisions, and logs in one place.
- Implemented webview UX updates (depth controls + node card styling + conditional expand visibility).
- Combined upstream/downstream depth into a single toolbar control with “Depth” centered.
- Restructured the dbt fixture into per-model folders with `.sql`, `.yml`, and `.md` docs blocks.
- Restructured seeds and snapshots into per-asset folders with matching config/docs files.
- Rewrote generated doc blocks to reduce repeated boilerplate across column docs.
- Added shared `common_docs` anchors and rewired repeated column descriptions to them.
- Refreshed lineage card design with db-style glyphs, materialization labels, cleaner edge routing, freer drag bounds, and default downstream depth of 1.
- Made lineage layout responsive to narrower VS Code panes with adaptive sizing, board bounds, and resize refitting.
- Changed the default upstream depth from 2 to 1.
- Reworked lineage layering from shortest-hop placement to dependency-depth placement and simplified routing around target-side trunks for better scalability.
- Refined edge styling with smaller card-touching arrowheads and smoother fan-in curves.
- Replaced faux fan-in edge endings with true bundled-trunk routing so multiple inbound dependencies share one final arrow into each target card.
- Refined the bundled trunk geometry again to remove the clunky target-side vertical rail and converge branches into a smoother shared horizontal stub.

## 2026-04-28

- Performed a project review for the VS Code/Cursor extension architecture.
- Added `src/dbt.ts` to centralize dbt path classification, node IDs, metadata sidecar reads, dirty-document detection, and deterministic URI sorting.
- Simplified `src/extension.ts` by reusing dbt helpers for active-file focus, dirty detection, and shared exclude globs.
- Added graph stat calculation to `src/lineage.ts` and adjusted package-qualified refs to render as external `package.model` nodes.
- Restored `npm run lint` for ESLint 9 by adding `eslint.config.mjs` and the `typescript-eslint` dev dependency.
- Added `npm run typecheck` and `npm run check` for a single local verification command.
- Removed tracked generated `out/` files and added `out/` to `.gitignore`.
- Removed stale `scripts/generateFixture.js`; it no longer matched the current per-relation fixture layout and was not referenced by package scripts or docs.
- Tightened `.vscodeignore` so `.github/` and ESLint config files are not bundled into the VSIX.
- Captured current npm audit finding: 4 moderate advisories flow through `@vscode/vsce`'s Azure dependency chain to `uuid <14.0.0`; no force fix applied because npm proposes a breaking `@vscode/vsce` change.
- Verified `npm run check` and `npm run package`; packaging still warns that no license file exists.

## 2026-04-28 generic dbt readiness pass

- Replaced hardcoded `models/`, `seeds/`, and `snapshots/` discovery with `dbt_project.yml` parsing for `model-paths`, `seed-paths`, and `snapshot-paths`.
- Added schema YAML scanning across configured dbt resource paths so metadata can come from standard multi-model files, not only one sidecar file per relation.
- Added source table metadata parsing from schema YAML; referenced `source()` nodes now pick up source/table tags when available.
- Changed active-file focus and dirty detection to use graph file paths and configured dbt paths, so custom project layouts still work.
- Removed name-based materialization guesses such as treating `int_*_hub` as incremental; model fallback is now dbt's generic `view` default unless YAML metadata says otherwise.
- Kept optional package refs external unless `ref('package', 'model')` names the current dbt project.
- Updated README compatibility notes and re-verified `npm run check` plus `npm run package`.

## 2026-04-28 graph visual polish

- Made edge direction clearer by anchoring every outgoing edge at the center-right of its upstream card and every incoming edge at the center-left of its downstream card.
- Increased SVG arrowhead size.
- Made cards wider and lower-profile with smaller radius so they read as more rectangular while keeping proportions balanced.
- Removed domain/subtitle text from cards and allowed model names to wrap instead of being line-clamped.
- Treated labels beginning with `fact` as fact nodes in addition to `fct_`.
- Moved node-local lineage controls to lower-left and lower-right corners and added `-` collapse toggles after a node-local expansion.
- Verified `npm run check` and `npm run package`; removed generated `out/` and VSIX artifacts afterward.
- Fixed QA issue where expanding upstream from a downstream card placed the new dependencies in the same downstream column. Unclassified expanded nodes now infer their column from visible dependency/dependent neighbors.
- Removed short bundled edge trunks so fan-in lines terminate at the target arrow point instead of merging before it.
- Lowered the minimum zoom from 55% to 25%.
- Changed graph layout to reserve per-node vertical space based on wrapped label length and keyed saved manual positions by the visible node set, preventing expand/collapse states from reusing stale coordinates and overlapping cards.
- Added small count badges to `+` expand buttons showing how many currently hidden immediate cards that click will reveal; collapse buttons remain plain `-` controls.
- Added per-card removal from the current view. Hidden cards retain their reserved layout positions, hide their incident edges, and are cleared when the graph is refocused.
- Added `Delete` / `Backspace` keyboard removal for the selected visible card using the same hide path as the card `×` control.
- Reworked edge anchoring to use rendered card dimensions and place SVG arrowheads from their base, so resized cards keep lines and arrowheads connected.
- Added active-selection dimming: selecting the focus keeps all cards active, while selecting another visible card mutes cards and edges outside that node's downstream continuation and any focus-to-selected bridge.
- Reorganized card headers so the type chip sits above the icon on the left rail, enlarged model names, kept sources out of automatic upstream depth, and allowed `-` to collapse automatically visible branches.
- Fixed branch collapse when the collapsed side contains the original focus: the clicked node becomes the temporary layout anchor and disconnected siblings are removed from the visible component.
- Adjusted active-selection dimming so every active bridge/highlighted node also keeps its downstream continuation visible.
- Preserved user-selected zoom during window resize by applying saved scale immediately and keeping saved viewport scale valid across layout breakpoint changes.
- Added explicit active-path classes for cards and edges so downstream nodes selected by the grey-out logic render clearly non-grey rather than only relying on absence of dimming.
- Simplified active-selection dimming to use the selected card's full visible upstream and downstream lineage, while comparing against the original graph focus instead of the temporary layout anchor.
- Made active-selection traversal explicit as dependencies/dependents, applied selection state immediately in the webview before extension round-trips, and cache-busted webview assets to avoid stale QA renders.

## 2026-05-02 graph interaction and agent maintenance

- Changed double-click card behavior so opening the backing SQL/seed/analysis file no longer calls graph refocus or resets the visual layout.
- Replaced the old top-right card remove `x` with an explicit target/focus control; card removal remains available through `Delete` / `Backspace`.
- Added capped manual card expansion: first reveal shows the top 9 hidden direct cards, ranked by hidden downstream dependency count.
- Added overflow cards for large expansions with `Show N more` and `Show all N` actions, and renamed their title pattern to `+N <model_name> deps`.
- Forced overflow cards to stay at the bottom of their visual column after layout, collision handling, saved-position reuse, and incremental batch reveals.
- Isolated VS Code F5 launch configs with `--disable-extensions` to suppress unrelated Copilot, SQLFluff, Datamate, and other extension-host noise while debugging FastLineage.
- Added root `agent.md` with required end-of-turn maintenance: update `.agent/CONTEXT.md` and append `.agent/WORKLOG.md` after meaningful repo work.
- Verified the code changes during the session with `npm run typecheck` and `npm run lint`; verified `.vscode/launch.json` parses as JSON after the launch-config edit.

## 2026-05-02 Dagre layout experiment

- Added `@dagrejs/dagre` as a dev dependency and vendored its browser bundle into `media/vendor/` with MIT license/legal notice files.
- Loaded the Dagre bundle in the VS Code webview before `media/webview.js`.
- Initially wrapped the existing webview layout behind a small strategy function, then after manual smoke testing removed the old custom column/reachable/scoring/sweep positioning code and made Dagre the only layout engine.
- Kept FastLineage rendering, edge drawing, dragging, pan/zoom, saved manual positions, hidden-card handling, and overflow-card positioning in the existing webview code.
- Excluded `media/vendor/**` from ESLint and excluded root `agent.md` from VSIX packaging.
- Verified with `npm run check`, `npm audit --omit=dev`, `npm ls --omit=dev --depth=0`, `node --check media/webview.js`, `node --check media/vendor/dagre.min.js`, `npx vsce package --out /private/tmp/fastlineage-dagre.vsix`, and `npx vsce package --out /private/tmp/fastlineage-dagre-only.vsix`. Packaging still warns that the project has no root `LICENSE` file.
- Preserved the removed custom layout algorithm in `graveyard/webview-custom-layout-2026-05-02.md` and excluded `graveyard/**` from lint and VSIX packaging.

## 2026-05-02 source expansion fallback

- Audited a missing upstream `+` on visible `stg_*` cards: button visibility is driven by `computeSubgraph` hidden upstream dependency flags, not Dagre layout.
- Added a conservative fallback for models named `stg_<source>_<table>`: when parsed SQL dependencies contain no direct `source()` calls, infer a source dependency only if that exact source/table exists in dbt schema YAML metadata.
- This keeps source nodes out of automatic upstream depth while still making them available through the bottom-left upstream `+`.
- Verified with `npm run check`, `npm audit --omit=dev`, and `npx vsce package --out /private/tmp/fastlineage-source-expand.vsix`. Packaging still warns that the project has no root `LICENSE` file.

## 2026-05-02 package ref source expansion fix

- Removed the name-derived staging source fallback after checking the concrete `stg_delivery_store_pim_product.sql`; the SQL already has `source("delivery", "delivery_store_pim_product")`.
- Found the real bug: `delivery.dim_pim_catalog_sku` referenced `stg_delivery_store_pim_product` unqualified, but the model is defined in the local `common` package. FastLineage was creating a phantom `delivery.stg_delivery_store_pim_product` node, so the visible card had no real upstream source dependency.
- Added local package dependency reading from `packages.yml` / `dependencies.yml` and changed unqualified `ref()` resolution to prefer the current project only when the relation exists, then declared local package projects.
- Verified with `npm run check`, `npm run compile`, and a mocked VS Code workspace build proving `model:delivery.dim_pim_catalog_sku` now depends on `model:common.stg_delivery_store_pim_product`, that the phantom delivery node is absent, and that the visible common staging node has `canExpandUpstream: true` / `expandUpstreamCount: 1`.

## 2026-05-02 dbt generality audit

- Audited remaining assumptions after the phantom-node fix. No hardcoded `delivery`/`common` project names remain in graph construction, but several generic dbt behaviors are still approximated.
- Identified the main commercialization risk: graph construction is still based on custom file/YAML/Jinja parsing. This misses some real dbt semantics, including Python models, snapshot names declared inside snapshot blocks, disabled resources, `.dbtignore`, installed package models in `dbt_packages`, dynamic refs/macros, and richer YAML constructs.
- Recommended architectural direction: prefer `target/manifest.json` as the authoritative source of actual dbt nodes and dependencies when present, then keep the current parser as a fast no-manifest fallback.
- Recommended unresolved-ref handling change: unresolved refs should no longer render as normal model cards. They should either be hidden by default or shown with an explicit unresolved kind/badge so users do not confuse them with actual dbt nodes.

## 2026-05-02 manifest-first correction

- User clarified that avoiding `target/manifest.json` latency on large projects is the core product point, so manifest-first is not the desired architecture.
- Updated the current handoff context: FastLineage should stay filesystem/static-parser first, with optional manifest support only if it does not become the core dependency.
- Refocused the generality backlog on strengthening the fast path: Python models, snapshot block names, disabled resources, installed package models, `.dbtignore`, and exact alias/version behavior.

## 2026-05-02 secondary-project badge classification

- Fixed a UI regression from secondary-project labels: cards like `delivery.dim_pim_catalog_sku` were classified as generic `MODEL` because the webview naming-convention checks ran against the fully qualified display label.
- Added an unqualified dbt resource `name` field to graph nodes and preserved the existing project-qualified display `label`.
- Updated webview role classification to use `node.name || node.label`, so secondary project cards can keep visible prefixes while still receiving `STG` / `INT` / `DIM` / `FACT` / `MART` badges by convention.
- Verified with `npm run check`, `npm run compile`, and a mocked workspace build confirming `model:delivery.dim_pim_catalog_sku` has label `delivery.dim_pim_catalog_sku` and name `dim_pim_catalog_sku`.

## 2026-05-02 SQL config materialization parsing

- Investigated cards showing `VIEW` for table models. Existing behavior only used schema YAML materialization metadata and otherwise fell back all models to `view`.
- Confirmed `delivery.dim_provider_v2` declares `materialized="table"` in its SQL `config()` block while its YAML does not declare materialization.
- Added static parsing for `config(materialized=...)` in SQL and applied that materialization to the registered graph node/relation before dependency edges are added.
- Verified with `npm run check`, `npm run compile`, and a mocked delivery project build showing `model:delivery.dim_provider_v2` now has materialization `table`.

## 2026-05-02 refresh recommended stale-state indicator

- Fixed misleading stale-state behavior: saving a lineage-relevant file no longer clears the refresh warning just because the editor is no longer dirty.
- Changed the extension-side state to mark the graph stale whenever a lineage-relevant document changes or saves after the last graph build, and to clear that state only when a build result is applied.
- Moved the warning into the refreshed timestamp pill as `Refreshed: <time> (refresh recommended)` instead of a separate `Unsaved changes` pill.
- Verified with `npm run check`, `npm run compile`, and `npx vsce package --out /private/tmp/fastlineage-refresh-recommended.vsix`.

## 2026-05-02 product viability guardrail

- User clarified the standing concern is broader than incremental refresh: future changes should be challenged when they could hurt commercial viability, permissive licensing, dependency control, a future `dbt-fast` CLI, shared local/online architecture, or monetization options.
- Added a `Product Viability Guardrails` section to root `agent.md` instructing future agents to proactively call out these risks before adding dependencies, coupling parser logic to VS Code-only surfaces, relying on slow dbt artifacts as the core path, or introducing repo-specific guesses.
- No code verification was run; this was a documentation/instruction-only update.

## 2026-05-02 card context menu and toolbar titles

- Added native hover titles to the Refresh, Use Open File, Reset Layout, and Depth toolbar controls.
- Replaced the browser default context menu on normal lineage cards with a FastLineage menu containing `Open File` and `Focus and Reset Layout`.
- Wired the context menu actions to the existing open-node and focus-node behavior; no new external dependencies were added.
- Verified with `npm run check`, `npm run compile`, and `npx vsce package --out /private/tmp/fastlineage-card-context-menu.vsix`.

## 2026-05-02 focus-tooltip-only revert

- Reverted the native tooltip/title additions on toolbar controls, depth controls, graph cards, context-menu actions, expand/overflow controls, and zoom controls.
- Kept the right-click card context menu itself.
- Confirmed the only remaining `title` attribute in `media/webview.js` is the card focus button.
- Verified with `npm run check`, `npm run compile`, and `npx vsce package --out /private/tmp/fastlineage-focus-tooltip-only.vsix`.

## 2026-05-02 deprecation date graph states

- Added fast schema-YAML parsing for dbt `deprecation_date` metadata and carried it through `LineageNode.deprecation` as `upcoming` or `deprecated`.
- Interpreted dbt-supported date-only and timestamp formats using the local timezone when no offset is provided, matching dbt documentation semantics.
- Updated the webview so deprecated/deprecating nodes use warning colors, a left warning rail, `DEPR` / `SOON` top chips instead of naming-convention chips, and an in-card deprecation pill.
- Also preserved real source-level deprecation metadata when it exists in YAML; no phantom nodes or repo-specific naming guesses were introduced.
- Verified with `npm run check`, `npm run compile`, mocked workspace builds against real local `delivery` and `commerce_billing` projects for past/future deprecation dates, and `npx vsce package --out /private/tmp/fastlineage-deprecation-colors.vsix`.

## 2026-05-02 cleaner legacy deprecation tags

- Simplified the deprecation card UI after visual review: both past and future deprecation states now use a `LEGACY` top chip.
- Removed the extra footer deprecation pill text (`DEPRECATED ...` / `DEPRECATES ...`) while keeping the amber/red card colors and warning rail.
- Verified with `npm run check` and `npm run compile`.

## 2026-05-02 metric count investigation

- Traced the toolbar metric count to `graphStats`, which counts every graph node whose kind is `metric`.
- Confirmed metric nodes are created from parsed top-level `metrics:` YAML resources plus referenced metric names from SQL/macros, saved queries, exposures, and metric input dependencies.
- A local mocked full-workspace build produced 7,349 metric nodes: 6,999 with definition files and 350 referenced-only metric nodes. Counts can differ slightly from the live VS Code build based on workspace roots and active files.

## 2026-05-02 hide metric toolbar count only

- Corrected scope after user clarification: metric graph nodes, metric references, metric input dependencies, saved-query metric dependencies, and exposure metric dependencies must remain active.
- Removed only the toolbar/header display of the metric count, so metrics can still appear in the graph but are no longer shown in the blue stats pill.
- Kept the hidden toolbar metric count as a commented-out line in `toolbarStats()` so it is easy to restore.
- Removed the temporary metric-graph-support graveyard note because metric support was not intentionally retired.

## 2026-05-02 local patch handoff

- Created `copy.md` as a transfer-only handoff for another machine/agent to reproduce the current local branch changes exactly from a clean copy of the same base commit.
- The handoff embeds a full `git diff --binary HEAD` patch excluding `copy.md` itself, plus strict instructions to apply the patch without improvising.
- Verified the embedded staged and unstaged patches apply cleanly against an archived clean copy of `HEAD` in `/private/tmp`.
- No commit was made.

## 2026-05-02 generalization cleanup handoff

- Created `copy_2.md` as a transfer-only handoff instructing another agent to remove or anonymize Bolt/private dbt project references and fixture-as-default assumptions.
- Included explicit cleanup targets for `.vscode/launch.json`, `.agent/CONTEXT.md`, `.agent/WORKLOG.md`, private local paths, and real model/project names.
- Included required `rg` scans and verification commands so the cleanup can be checked mechanically.
- No commit was made.

## 2026-05-03 private worklog

- Added `.agent/WORKLOG.md` to `.gitignore`.
- Removed `.agent/WORKLOG.md` from the Git index with `git rm --cached -f` while keeping the local file on disk.
- Confirmed `git check-ignore -v .agent/WORKLOG.md` points at the new `.gitignore` rule.
- No commit was made.

## 2026-05-03 refreshed transfer handoff

- Overwrote `copy.md` with a fresh transfer handoff generated from the current staged diff, excluding `copy.md` itself.
- The handoff explicitly preserves the `.agent/WORKLOG.md` index removal and `.gitignore` rule without embedding the local worklog contents.
- Verified the embedded patch applies cleanly with `git apply --index` in a clean temporary clone at the expected base commit.
- No commit was made.

## 2026-05-03 private agent notes

- Added `agent.md` and `.agent/CONTEXT.md` to `.gitignore` alongside `.agent/WORKLOG.md`.
- Removed `agent.md` and `.agent/CONTEXT.md` from the Git index with `git rm --cached -f` while keeping local files on disk.
- Confirmed `git check-ignore -v` reports ignore rules for `agent.md`, `.agent/CONTEXT.md`, and `.agent/WORKLOG.md`.
- Regenerated `copy.md` after the ignore/index changes.
- No commit was made.
