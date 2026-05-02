# FastLineage

FastLineage is a VS Code extension for exploring dbt lineage directly inside the editor.

It builds a graph from the files already in your workspace, opens inside a panel, and lets you move from a model card back to the underlying file without leaving the editor flow.

## What It Does

- Scans dbt projects from `dbt_project.yml` and respects configured `model-paths`, `seed-paths`, `snapshot-paths`, and analysis paths.
- Builds lineage from static parsing of SQL and dbt metadata instead of requiring `manifest.json`.
- Reads `ref()`, `source()`, metric references, and selected macro-driven dependency patterns.
- Parses schema YAML metadata for models, seeds, snapshots, sources, semantic models, metrics, saved queries, and exposures.
- Supports multi-project workspaces and local package resolution when sibling dbt projects are present.
- Focuses the graph around the active file, with separate upstream and downstream depth controls.
- Lets you pan, zoom, drag cards, re-root the graph, expand hidden neighbors, and open the backing file from a node.
- Highlights deprecated models from dbt `deprecation_date` metadata.

## Current Shape

FastLineage is intentionally file-system-first and lightweight.

- The extension runs as a VS Code webview panel.
- Graph rendering lives in the editor, with a custom UI layer and a vendored Dagre layout bundle for initial positioning.
- Refresh is explicit, with stale-state feedback when lineage-relevant files change after the last build.
- The current implementation is best described as a fast static lineage browser for dbt workspaces.

## Install

FastLineage is packaged as a VS Code extension.

1. Download the latest `fastlineage-*.vsix` from the repository releases.
2. In VS Code, open Extensions.
3. Run `Extensions: Install from VSIX...` and select the file.

If you want to produce a package from source:

```bash
npm install
npm run package
```

## Develop

```bash
npm install
npm run compile
```

Then press `F5` to launch a VS Code Extension Development Host and open a dbt workspace there.

Useful commands:

- `npm run compile` compiles TypeScript to `out/`
- `npm run watch` runs the compiler in watch mode
- `npm run check` runs type-checking and ESLint
- `npm run package` creates a `.vsix` extension package

## Repository Layout

- `src/` contains the extension logic:
  - `extension.ts` wires VS Code events, refresh behavior, and webview messaging.
  - `dbt.ts` handles project discovery, path classification, and metadata loading.
  - `parser.ts` extracts dbt dependencies from SQL and macros.
  - `lineage.ts` builds the graph and subgraph views used by the panel.
- `media/` contains the webview JavaScript, CSS, icon, and vendored Dagre bundle.
- `fixtures/dbt_project/` is a large sample dbt project used to exercise graph behavior across staging, intermediate, marts, seeds, and snapshots.
- `docs/` contains maintainer docs such as publishing notes.
- `.github/workflows/release-vsix.yml` packages the extension on version-tag pushes and attaches the VSIX to a GitHub release.

## Fixture Project

The repo includes a sizeable dbt fixture to test the extension against something closer to a real workspace:

- 179 SQL models
- 12 seeds
- 8 snapshots
- Staging and intermediate layers split across 10 subject areas each

This makes it easier to validate graph behavior, metadata parsing, and UI scaling without needing an external dbt repo.

## Notes

- Generated build output in `out/` is ignored and should be recreated with `npm run compile`.
- Packaging and publishing are handled with `@vscode/vsce`; maintainer notes live in [docs/publishing.md](/Users/giacomoleo/Github/fastlineage/docs/publishing.md).
